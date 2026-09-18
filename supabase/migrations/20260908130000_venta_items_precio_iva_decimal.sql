-- Precio e IVA de linea con hasta cuatro decimales; importes finales a dos.
BEGIN;

ALTER TABLE public.venta_items
  DROP CONSTRAINT IF EXISTS venta_items_precio_unitario_valido,
  DROP CONSTRAINT IF EXISTS venta_items_porcentaje_iva_valido;

ALTER TABLE public.venta_items
  ALTER COLUMN precio_unitario TYPE numeric USING precio_unitario::numeric,
  ALTER COLUMN porcentaje_iva TYPE numeric USING porcentaje_iva::numeric,
  ALTER COLUMN porcentaje_iva SET DEFAULT 0::numeric;

ALTER TABLE public.venta_items
  ADD CONSTRAINT venta_items_precio_unitario_valido CHECK (
    precio_unitario >= 0
    AND precio_unitario::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND scale(precio_unitario) <= 4
    AND precio_unitario <= 999999999999.9999::numeric
  ),
  ADD CONSTRAINT venta_items_porcentaje_iva_valido CHECK (
    porcentaje_iva >= 0 AND porcentaje_iva <= 100
    AND porcentaje_iva::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND scale(porcentaje_iva) <= 4
  );

-- No hay trigger UPDATE OF precio_unitario o porcentaje_iva: el trigger de
-- stock solo observa producto_id, cantidad y afecta_stock, por lo que el ALTER
-- no requiere eliminar ni recrear triggers.
-- Base: 20260907150000, con la adaptacion de cantidad numeric de 20260908120000.
CREATE OR REPLACE FUNCTION public.registrar_venta_transaccional(
  p_comercio_id uuid, p_tipo_comprobante public.tipo_comprobante, p_punto_venta integer,
  p_cliente_id uuid, p_cliente_nombre text, p_moneda text, p_modalidad text,
  p_items jsonb, p_pagos jsonb, p_idempotency_key uuid, p_fecha_venta timestamptz DEFAULT now(),
  p_observaciones text DEFAULT NULL, p_porcentaje_descuento numeric DEFAULT 0,
  p_monto_descuento numeric DEFAULT 0, p_porcentaje_recargo numeric DEFAULT 0,
  p_monto_recargo numeric DEFAULT 0
)
RETURNS public.ventas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_venta public.ventas; v_item jsonb; v_pago jsonb; v_producto_id uuid;
  v_descripcion text; v_codigo text; v_cantidad numeric; v_precio numeric;
  v_iva_pct numeric; v_item_desc_pct numeric; v_item_desc_monto numeric;
  v_item_rec_pct numeric; v_item_rec_monto numeric; v_afecta_stock boolean;
  v_item_bruto numeric; v_item_descuento numeric; v_item_recargo numeric;
  v_item_total numeric; v_item_subtotal numeric; v_item_iva numeric;
  v_items_total numeric := 0; v_items_subtotal numeric := 0;
  v_descuento_venta numeric; v_recargo_venta numeric; v_total_base numeric;
  v_total numeric; v_subtotal numeric; v_total_iva numeric; v_factor numeric;
  v_pago_monto numeric; v_pago_recargo numeric; v_pagos_base numeric := 0;
  v_pagos_total numeric := 0; v_numero bigint; v_numero_texto text;
  v_tipo_pago public.tipo_pago; v_intento integer := 0; v_idempotency_payload jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ventas_auth_requerida' USING ERRCODE = '42501'; END IF;
  IF p_comercio_id IS NULL OR NOT public.user_is_comercio_admin(p_comercio_id) THEN RAISE EXCEPTION 'ventas_no_disponible' USING ERRCODE = '42501'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'ventas_idempotency_requerida' USING ERRCODE = '22023'; END IF;
  IF p_tipo_comprobante IS NULL OR p_punto_venta IS NULL OR p_punto_venta <= 0 THEN RAISE EXCEPTION 'ventas_cabecera_invalida' USING ERRCODE = '22023'; END IF;
  IF p_moneda IS NULL OR p_modalidad IS NULL OR p_moneda NOT IN ('ARS', 'USD') OR p_modalidad NOT IN ('contado', 'cta_cte') THEN RAISE EXCEPTION 'ventas_modalidad_o_moneda_invalida' USING ERRCODE = '22023'; END IF;
  IF p_fecha_venta IS NULL OR NOT isfinite(p_fecha_venta)
     OR COALESCE(p_porcentaje_descuento, 0) < 0 OR COALESCE(p_monto_descuento, 0) < 0
     OR COALESCE(p_porcentaje_recargo, 0) < 0 OR COALESCE(p_monto_recargo, 0) < 0
     OR COALESCE(p_porcentaje_descuento::text, '') IN ('NaN', 'Infinity', '-Infinity')
     OR COALESCE(p_monto_descuento::text, '') IN ('NaN', 'Infinity', '-Infinity')
     OR COALESCE(p_porcentaje_recargo::text, '') IN ('NaN', 'Infinity', '-Infinity')
     OR COALESCE(p_monto_recargo::text, '') IN ('NaN', 'Infinity', '-Infinity')
     OR COALESCE(p_porcentaje_descuento, 0) <> round(COALESCE(p_porcentaje_descuento, 0), 2)
     OR COALESCE(p_monto_descuento, 0) <> round(COALESCE(p_monto_descuento, 0), 2)
     OR COALESCE(p_porcentaje_recargo, 0) <> round(COALESCE(p_porcentaje_recargo, 0), 2)
     OR COALESCE(p_monto_recargo, 0) <> round(COALESCE(p_monto_recargo, 0), 2) THEN RAISE EXCEPTION 'ventas_cabecera_invalida' USING ERRCODE = '22023'; END IF;
  IF COALESCE(jsonb_typeof(p_items), '') <> 'array' OR jsonb_array_length(p_items) = 0 OR COALESCE(jsonb_typeof(p_pagos), '') <> 'array' THEN RAISE EXCEPTION 'ventas_json_invalido' USING ERRCODE = '22023'; END IF;

  v_idempotency_payload := jsonb_build_object(
    'tipo_comprobante', p_tipo_comprobante::text, 'punto_venta', p_punto_venta, 'cliente_id', p_cliente_id,
    'cliente_nombre', p_cliente_nombre, 'moneda', p_moneda, 'modalidad', p_modalidad, 'items', p_items,
    'pagos', p_pagos, 'fecha_venta', p_fecha_venta, 'observaciones', p_observaciones,
    'porcentaje_descuento', p_porcentaje_descuento, 'monto_descuento', p_monto_descuento,
    'porcentaje_recargo', p_porcentaje_recargo, 'monto_recargo', p_monto_recargo
  );
  PERFORM pg_advisory_xact_lock(hashtextextended('ventas:idempotency:' || p_comercio_id::text || ':' || p_idempotency_key::text, 0));
  SELECT * INTO v_venta FROM public.ventas WHERE comercio_id = p_comercio_id AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF v_venta.id IS NOT NULL THEN
    IF v_venta.idempotency_payload IS DISTINCT FROM v_idempotency_payload THEN RAISE EXCEPTION 'ventas_idempotency_conflicto' USING ERRCODE = '22023'; END IF;
    RETURN v_venta;
  END IF;
  IF p_cliente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = p_cliente_id AND c.comercio_id = p_comercio_id) THEN RAISE EXCEPTION 'ventas_cliente_no_disponible' USING ERRCODE = '42501'; END IF;
  IF p_modalidad = 'cta_cte' AND p_cliente_id IS NULL THEN RAISE EXCEPTION 'ventas_cliente_requerido' USING ERRCODE = '22023'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_item) k WHERE k NOT IN ('producto_id','descripcion_manual','codigo_manual','cantidad','precio_unitario','porcentaje_iva','porcentaje_descuento','monto_descuento','porcentaje_recargo','monto_recargo','afecta_stock'))
       OR NOT (v_item ? 'cantidad' AND v_item ? 'precio_unitario' AND v_item ? 'porcentaje_iva' AND v_item ? 'afecta_stock')
       OR jsonb_typeof(v_item->'cantidad') <> 'number' OR jsonb_typeof(v_item->'precio_unitario') <> 'number'
       OR jsonb_typeof(v_item->'porcentaje_iva') <> 'number' OR jsonb_typeof(v_item->'afecta_stock') <> 'boolean'
       OR (v_item ? 'producto_id' AND jsonb_typeof(v_item->'producto_id') <> 'string')
       OR (v_item ? 'descripcion_manual' AND jsonb_typeof(v_item->'descripcion_manual') <> 'string')
       OR (v_item ? 'codigo_manual' AND jsonb_typeof(v_item->'codigo_manual') <> 'string')
       OR COALESCE(v_item->>'cantidad','') !~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,4})?$'
       OR COALESCE(v_item->>'precio_unitario','') !~ '^[0-9]{1,12}(\.[0-9]{1,4})?$'
       OR COALESCE(v_item->>'porcentaje_iva','') !~ '^[0-9]+(\.[0-9]{1,4})?$'
       OR COALESCE(v_item->>'afecta_stock','') NOT IN ('true','false') THEN RAISE EXCEPTION 'ventas_item_invalido' USING ERRCODE = '22023'; END IF;
    IF (v_item ? 'producto_id') = (v_item ? 'descripcion_manual') OR (v_item ? 'descripcion_manual' AND btrim(COALESCE(v_item->>'descripcion_manual','')) = '') THEN RAISE EXCEPTION 'ventas_item_invalido' USING ERRCODE = '22023'; END IF;
    v_afecta_stock := (v_item->>'afecta_stock')::boolean;
    v_cantidad := (v_item->>'cantidad')::numeric;
    IF v_cantidad <= 0 OR (v_afecta_stock AND (NOT (v_item ? 'producto_id') OR v_cantidad <> trunc(v_cantidad))) OR (NOT v_afecta_stock AND (v_item ? 'producto_id')) THEN RAISE EXCEPTION 'ventas_item_invalido' USING ERRCODE = '22023'; END IF;
    FOR v_pago IN SELECT jsonb_build_object('k', k, 'v', v_item->>k) FROM jsonb_object_keys(v_item) k WHERE k IN ('porcentaje_descuento','monto_descuento','porcentaje_recargo','monto_recargo') LOOP
      IF jsonb_typeof(v_item->(v_pago->>'k')) <> 'number' OR COALESCE(v_pago->>'v','') !~ '^[0-9]+(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'ventas_item_invalido' USING ERRCODE = '22023'; END IF;
    END LOOP;
    v_precio := (v_item->>'precio_unitario')::numeric;
    v_iva_pct := (v_item->>'porcentaje_iva')::numeric;
    IF v_precio > 999999999999.9999::numeric OR v_iva_pct > 100 THEN RAISE EXCEPTION 'ventas_item_invalido' USING ERRCODE = '22023'; END IF;
    IF v_item ? 'producto_id' AND NOT EXISTS (SELECT 1 FROM public.productos pr WHERE pr.id = (v_item->>'producto_id')::uuid AND pr.comercio_id = p_comercio_id) THEN RAISE EXCEPTION 'ventas_producto_no_disponible' USING ERRCODE = '42501'; END IF;
    v_item_desc_pct := COALESCE((v_item->>'porcentaje_descuento')::numeric, 0); v_item_desc_monto := COALESCE((v_item->>'monto_descuento')::numeric, 0);
    v_item_rec_pct := COALESCE((v_item->>'porcentaje_recargo')::numeric, 0); v_item_rec_monto := COALESCE((v_item->>'monto_recargo')::numeric, 0);
    v_item_bruto := round(v_cantidad * v_precio, 2); v_item_descuento := least(round(v_item_bruto * v_item_desc_pct / 100 + v_item_desc_monto, 2), v_item_bruto);
    v_item_recargo := round(v_item_bruto * v_item_rec_pct / 100 + v_item_rec_monto, 2); v_item_total := round(greatest(v_item_bruto - v_item_descuento + v_item_recargo, 0), 2);
    v_item_subtotal := round(CASE WHEN v_iva_pct > 0 THEN v_item_total / (1 + v_iva_pct / 100) ELSE v_item_total END, 2);
    v_items_total := v_items_total + v_item_total; v_items_subtotal := v_items_subtotal + v_item_subtotal;
  END LOOP;
  v_descuento_venta := least(round(v_items_total * COALESCE(p_porcentaje_descuento, 0) / 100 + COALESCE(p_monto_descuento, 0), 2), v_items_total);
  v_recargo_venta := round(v_items_total * COALESCE(p_porcentaje_recargo, 0) / 100 + COALESCE(p_monto_recargo, 0), 2);
  v_total_base := round(greatest(v_items_total - v_descuento_venta + v_recargo_venta, 0), 2);
  IF v_total_base <= 0 THEN RAISE EXCEPTION 'ventas_total_invalido' USING ERRCODE = '22023'; END IF;
  IF p_modalidad = 'contado' THEN
    IF jsonb_array_length(p_pagos) = 0 THEN RAISE EXCEPTION 'ventas_pago_requerido' USING ERRCODE = '22023'; END IF;
    FOR v_pago IN SELECT value FROM jsonb_array_elements(p_pagos) LOOP
      IF jsonb_typeof(v_pago) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_pago) k WHERE k NOT IN ('tipo_pago','monto','banco_id','tarjeta_id','cuotas','recargo_cuotas','cheque_id'))
         OR NOT (v_pago ? 'tipo_pago' AND v_pago ? 'monto') OR jsonb_typeof(v_pago->'tipo_pago') <> 'string' OR jsonb_typeof(v_pago->'monto') <> 'number'
         OR (v_pago ? 'banco_id' AND jsonb_typeof(v_pago->'banco_id') <> 'string') OR (v_pago ? 'tarjeta_id' AND jsonb_typeof(v_pago->'tarjeta_id') <> 'string') OR (v_pago ? 'cheque_id' AND jsonb_typeof(v_pago->'cheque_id') <> 'string')
         OR (v_pago ? 'cuotas' AND jsonb_typeof(v_pago->'cuotas') <> 'number') OR (v_pago ? 'recargo_cuotas' AND jsonb_typeof(v_pago->'recargo_cuotas') <> 'number')
         OR COALESCE(v_pago->>'monto','') !~ '^[0-9]+(\.[0-9]{1,2})?$' OR (v_pago ? 'recargo_cuotas' AND COALESCE(v_pago->>'recargo_cuotas','') !~ '^[0-9]+(\.[0-9]{1,2})?$') OR (v_pago ? 'cuotas' AND COALESCE(v_pago->>'cuotas','') !~ '^[1-9][0-9]*$') THEN RAISE EXCEPTION 'ventas_pago_invalido' USING ERRCODE = '22023'; END IF;
      IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::public.tipo_pago)) t WHERE t::text = v_pago->>'tipo_pago') OR v_pago->>'tipo_pago' = 'cta_cte' THEN RAISE EXCEPTION 'ventas_pago_invalido' USING ERRCODE = '22023'; END IF;
      v_pago_monto := (v_pago->>'monto')::numeric; v_pago_recargo := COALESCE((v_pago->>'recargo_cuotas')::numeric, 0);
      IF v_pago_monto <= 0 OR v_pago_recargo > v_pago_monto THEN RAISE EXCEPTION 'ventas_pago_invalido' USING ERRCODE = '22023'; END IF;
      v_pagos_base := v_pagos_base + (v_pago_monto - v_pago_recargo); v_pagos_total := v_pagos_total + v_pago_monto;
    END LOOP;
    IF abs(round(v_pagos_base, 2) - v_total_base) > 0.01 THEN RAISE EXCEPTION 'ventas_pagos_no_coinciden' USING ERRCODE = '22023'; END IF;
    v_total := round(v_pagos_total, 2);
  ELSE
    IF jsonb_array_length(p_pagos) <> 0 THEN RAISE EXCEPTION 'ventas_pago_no_permitido' USING ERRCODE = '22023'; END IF;
    v_total := v_total_base;
  END IF;
  v_factor := CASE WHEN v_total_base > 0 THEN v_total / v_total_base ELSE 1 END; v_subtotal := round(v_items_subtotal * v_factor, 2); v_total_iva := round(v_total - v_subtotal, 2);
  INSERT INTO public.ventas_numeradores(comercio_id, tipo_comprobante, punto_venta, ultimo_numero) VALUES (p_comercio_id, p_tipo_comprobante, p_punto_venta, 0) ON CONFLICT (comercio_id, tipo_comprobante, punto_venta) DO NOTHING;
  LOOP
    v_intento := v_intento + 1; IF v_intento > 100 THEN RAISE EXCEPTION 'ventas_numeracion_no_disponible' USING ERRCODE = '40001'; END IF;
    UPDATE public.ventas_numeradores SET ultimo_numero = ultimo_numero + 1, updated_at = now() WHERE comercio_id = p_comercio_id AND tipo_comprobante = p_tipo_comprobante AND punto_venta = p_punto_venta RETURNING ultimo_numero INTO v_numero;
    v_numero_texto := lpad(p_punto_venta::text, 4, '0') || '-' || lpad(v_numero::text, 8, '0');
    BEGIN
      INSERT INTO public.ventas (comercio_id, numero_comprobante, fecha_venta, tipo_pago, tipo_comprobante, cliente_id, cliente_nombre, moneda, punto_venta, numero_secuencial, idempotency_key, porcentaje_descuento, monto_descuento, idempotency_payload, porcentaje_recargo, monto_recargo, subtotal, total_iva, total, observaciones)
      VALUES (p_comercio_id, v_numero_texto, p_fecha_venta, CASE WHEN p_modalidad = 'cta_cte' THEN 'cta_cte'::public.tipo_pago ELSE (p_pagos->0->>'tipo_pago')::public.tipo_pago END, p_tipo_comprobante, p_cliente_id, COALESCE(NULLIF(btrim(p_cliente_nombre), ''), 'Consumidor Final'), p_moneda, p_punto_venta, v_numero, p_idempotency_key, COALESCE(p_porcentaje_descuento, 0), v_descuento_venta, v_idempotency_payload, COALESCE(p_porcentaje_recargo, 0), v_recargo_venta, v_subtotal, v_total_iva, v_total, NULLIF(btrim(p_observaciones), '')) RETURNING * INTO v_venta;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO v_venta FROM public.ventas WHERE comercio_id = p_comercio_id AND idempotency_key = p_idempotency_key;
      IF v_venta.id IS NOT NULL THEN IF v_venta.idempotency_payload IS DISTINCT FROM v_idempotency_payload THEN RAISE EXCEPTION 'ventas_idempotency_conflicto' USING ERRCODE = '22023'; END IF; RETURN v_venta; END IF;
    END;
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_producto_id := CASE WHEN v_item ? 'producto_id' THEN (v_item->>'producto_id')::uuid ELSE NULL END; v_descripcion := NULLIF(btrim(v_item->>'descripcion_manual'), ''); v_codigo := NULLIF(btrim(v_item->>'codigo_manual'), '');
    v_cantidad := (v_item->>'cantidad')::numeric; v_precio := (v_item->>'precio_unitario')::numeric; v_iva_pct := (v_item->>'porcentaje_iva')::numeric;
    v_item_desc_pct := COALESCE((v_item->>'porcentaje_descuento')::numeric, 0); v_item_desc_monto := COALESCE((v_item->>'monto_descuento')::numeric, 0); v_item_rec_pct := COALESCE((v_item->>'porcentaje_recargo')::numeric, 0); v_item_rec_monto := COALESCE((v_item->>'monto_recargo')::numeric, 0); v_afecta_stock := (v_item->>'afecta_stock')::boolean;
    v_item_bruto := round(v_cantidad * v_precio, 2); v_item_descuento := least(round(v_item_bruto * v_item_desc_pct / 100 + v_item_desc_monto, 2), v_item_bruto); v_item_recargo := round(v_item_bruto * v_item_rec_pct / 100 + v_item_rec_monto, 2); v_item_total := round(greatest(v_item_bruto - v_item_descuento + v_item_recargo, 0), 2); v_item_subtotal := round(CASE WHEN v_iva_pct > 0 THEN v_item_total / (1 + v_iva_pct / 100) ELSE v_item_total END, 2); v_item_iva := round(v_item_total - v_item_subtotal, 2);
    INSERT INTO public.venta_items(venta_id, comercio_id, producto_id, descripcion_manual, codigo_manual, cantidad, precio_unitario, porcentaje_iva, porcentaje_descuento, monto_descuento, porcentaje_recargo, monto_recargo, monto_iva, subtotal, total, afecta_stock)
    VALUES (v_venta.id, p_comercio_id, v_producto_id, v_descripcion, v_codigo, v_cantidad, v_precio, v_iva_pct, v_item_desc_pct, v_item_descuento, v_item_rec_pct, v_item_recargo, v_item_iva, v_item_subtotal, v_item_total, v_afecta_stock);
  END LOOP;
  IF p_modalidad = 'contado' THEN
    FOR v_pago IN SELECT value FROM jsonb_array_elements(p_pagos) LOOP
      INSERT INTO public.pagos_venta(venta_id, comercio_id, tipo_pago, monto, banco_id, tarjeta_id, cuotas, recargo_cuotas, cheque_id, moneda)
      VALUES (v_venta.id, p_comercio_id, (v_pago->>'tipo_pago')::public.tipo_pago, (v_pago->>'monto')::numeric, CASE WHEN v_pago ? 'banco_id' THEN (v_pago->>'banco_id')::uuid ELSE NULL END, CASE WHEN v_pago ? 'tarjeta_id' THEN (v_pago->>'tarjeta_id')::uuid ELSE NULL END, COALESCE((v_pago->>'cuotas')::integer, 1), COALESCE((v_pago->>'recargo_cuotas')::numeric, 0), CASE WHEN v_pago ? 'cheque_id' THEN (v_pago->>'cheque_id')::uuid ELSE NULL END, p_moneda);
    END LOOP;
  ELSE
    INSERT INTO public.pagos_venta(venta_id, comercio_id, tipo_pago, monto, moneda) VALUES (v_venta.id, p_comercio_id, 'cta_cte', v_total, p_moneda);
    INSERT INTO public.cuenta_corriente(comercio_id, cliente_id, tipo_movimiento, monto, concepto, venta_id, fecha_movimiento, moneda) VALUES (p_comercio_id, p_cliente_id, 'debito', v_total, 'pago_cuenta_corriente', v_venta.id, p_fecha_venta, p_moneda);
  END IF;
  RETURN v_venta;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_venta_transaccional(uuid, public.tipo_comprobante, integer, uuid, text, text, text, jsonb, jsonb, uuid, timestamptz, text, numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_venta_transaccional(uuid, public.tipo_comprobante, integer, uuid, text, text, text, jsonb, jsonb, uuid, timestamptz, text, numeric, numeric, numeric, numeric) TO authenticated;

COMMENT ON FUNCTION public.registrar_venta_transaccional(uuid, public.tipo_comprobante, integer, uuid, text, text, text, jsonb, jsonb, uuid, timestamptz, text, numeric, numeric, numeric, numeric)
IS 'Alta administrativa e idempotente. Precio unitario e IVA aceptan hasta cuatro decimales; subtotal, IVA y total por linea se redondean a dos decimales. No crea caja_movimientos.';

COMMIT;
