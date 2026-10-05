-- Cambio estructural exclusivamente. No repara ventas existentes.
BEGIN;

CREATE OR REPLACE FUNCTION public.actualizar_venta_transaccional(
  p_comercio_id uuid, p_venta_id uuid, p_venta jsonb, p_items jsonb, p_pagos jsonb
)
RETURNS public.ventas
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_venta public.ventas;
  v_cabecera public.ventas;
  v_item public.venta_items;
  v_pago public.pagos_venta;
  v_json jsonb;
  v_importe numeric;
  v_items_total numeric := 0;
  v_items_subtotal numeric := 0;
  v_total_base numeric;
  v_total numeric := 0;
  v_pagos_base numeric := 0;
  v_subtotal numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ventas_auth_requerida' USING ERRCODE = '42501';
  END IF;
  IF p_comercio_id IS NULL OR NOT public.user_is_comercio_admin(p_comercio_id) THEN
    RAISE EXCEPTION 'ventas_no_disponible' USING ERRCODE = '42501';
  END IF;

  -- Serializa ediciones de esta venta y la autorización de CAE.
  SELECT * INTO v_venta FROM public.ventas
  WHERE id = p_venta_id AND comercio_id = p_comercio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ventas_no_disponible' USING ERRCODE = '42501'; END IF;
  IF NULLIF(btrim(v_venta.cae), '') IS NOT NULL THEN
    RAISE EXCEPTION 'La venta tiene CAE y no puede editarse ni eliminarse';
  END IF;
  IF COALESCE(jsonb_typeof(p_venta), '') <> 'object'
     OR COALESCE(jsonb_typeof(p_items), '') <> 'array'
     OR COALESCE(jsonb_typeof(p_pagos), '') <> 'array' THEN
    RAISE EXCEPTION 'ventas_json_invalido' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_pagos) = 0 THEN
    RAISE EXCEPTION 'ventas_detalle_requerido' USING ERRCODE = '22023';
  END IF;

  v_cabecera := jsonb_populate_record(NULL::public.ventas, p_venta);
  IF NULLIF(btrim(v_cabecera.numero_comprobante), '') IS NULL
     OR v_cabecera.fecha_venta IS NULL OR NOT isfinite(v_cabecera.fecha_venta)
     OR v_cabecera.tipo_comprobante IS NULL THEN
    RAISE EXCEPTION 'ventas_cabecera_invalida' USING ERRCODE = '22023';
  END IF;
  FOREACH v_importe IN ARRAY ARRAY[
    COALESCE(v_cabecera.porcentaje_descuento, 0), COALESCE(v_cabecera.monto_descuento, 0),
    COALESCE(v_cabecera.porcentaje_recargo, 0), COALESCE(v_cabecera.monto_recargo, 0)
  ] LOOP
    IF v_importe < 0 OR v_importe::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'ventas_cabecera_invalida' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF v_cabecera.cliente_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clientes WHERE id = v_cabecera.cliente_id AND comercio_id = p_comercio_id
  ) THEN RAISE EXCEPTION 'ventas_cliente_no_disponible' USING ERRCODE = '42501'; END IF;

  -- Los importes de descuento/recargo del detalle ya son importes calculados
  -- por VentaForm, no montos fijos a los que volver a sumar el porcentaje.
  FOR v_json IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_json) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'ventas_item_invalido' USING ERRCODE = '22023';
    END IF;
    v_item := jsonb_populate_record(NULL::public.venta_items, v_json);
    FOREACH v_importe IN ARRAY ARRAY[
      v_item.cantidad, v_item.precio_unitario, v_item.porcentaje_iva, v_item.subtotal, v_item.total, v_item.monto_iva,
      COALESCE(v_item.porcentaje_descuento, 0), COALESCE(v_item.monto_descuento, 0),
      COALESCE(v_item.porcentaje_recargo, 0), COALESCE(v_item.monto_recargo, 0)
    ] LOOP
      IF v_importe IS NULL OR v_importe < 0 OR v_importe::text IN ('NaN', 'Infinity', '-Infinity') THEN
        RAISE EXCEPTION 'ventas_item_invalido' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF v_item.cantidad <= 0 OR v_item.porcentaje_iva > 100
       OR (v_item.producto_id IS NULL AND NULLIF(btrim(v_item.descripcion_manual), '') IS NULL)
       OR (v_item.producto_id IS NOT NULL AND v_item.cantidad <> trunc(v_item.cantidad))
       OR abs(v_item.total - round(greatest(v_item.cantidad * v_item.precio_unitario
           - COALESCE(v_item.monto_descuento, 0) + COALESCE(v_item.monto_recargo, 0), 0), 2)) > 0.01
       OR abs(v_item.subtotal - round(v_item.total / (1 + v_item.porcentaje_iva / 100), 2)) > 0.01
       OR abs(v_item.monto_iva - (v_item.total - v_item.subtotal)) > 0.01 THEN
      RAISE EXCEPTION 'ventas_item_invalido' USING ERRCODE = '22023';
    END IF;
    IF v_item.producto_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.productos WHERE id = v_item.producto_id AND comercio_id = p_comercio_id
    ) THEN RAISE EXCEPTION 'ventas_producto_no_disponible' USING ERRCODE = '42501'; END IF;
    IF v_item.producto_variante_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.producto_variantes
      WHERE id = v_item.producto_variante_id AND producto_id = v_item.producto_id
    ) THEN RAISE EXCEPTION 'ventas_producto_no_disponible' USING ERRCODE = '42501'; END IF;
    v_items_total := v_items_total + v_item.total;
    v_items_subtotal := v_items_subtotal + v_item.subtotal;
  END LOOP;

  v_total_base := round(greatest(v_items_total
    - least(round(v_items_total * COALESCE(v_cabecera.porcentaje_descuento, 0) / 100
      + COALESCE(v_cabecera.monto_descuento, 0), 2), v_items_total)
    + round(v_items_total * COALESCE(v_cabecera.porcentaje_recargo, 0) / 100
      + COALESCE(v_cabecera.monto_recargo, 0), 2), 0), 2);
  IF v_total_base <= 0 THEN RAISE EXCEPTION 'ventas_total_invalido' USING ERRCODE = '22023'; END IF;
  FOR v_json IN SELECT value FROM jsonb_array_elements(p_pagos) LOOP
    IF jsonb_typeof(v_json) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'ventas_pago_invalido' USING ERRCODE = '22023';
    END IF;
    v_pago := jsonb_populate_record(NULL::public.pagos_venta, v_json);
    IF v_pago.tipo_pago IS NULL OR v_pago.monto IS NULL OR v_pago.monto <= 0
       OR v_pago.monto::text IN ('NaN', 'Infinity', '-Infinity')
       OR COALESCE(v_pago.recargo_cuotas, 0)::text IN ('NaN', 'Infinity', '-Infinity')
       OR COALESCE(v_pago.recargo_cuotas, 0) < 0 OR COALESCE(v_pago.recargo_cuotas, 0) > v_pago.monto
       OR COALESCE(v_pago.cuotas, 1) < 1
       OR (v_pago.tipo_pago = 'cta_cte' AND v_cabecera.cliente_id IS NULL) THEN
      RAISE EXCEPTION 'ventas_pago_invalido' USING ERRCODE = '22023';
    END IF;
    IF (v_pago.banco_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bancos WHERE id = v_pago.banco_id AND comercio_id = p_comercio_id))
       OR (v_pago.tarjeta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tarjetas_credito WHERE id = v_pago.tarjeta_id AND comercio_id = p_comercio_id))
       OR (v_pago.cheque_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cheques WHERE id = v_pago.cheque_id AND comercio_id = p_comercio_id)) THEN
      RAISE EXCEPTION 'ventas_pago_invalido' USING ERRCODE = '42501';
    END IF;
    v_pagos_base := v_pagos_base + v_pago.monto - COALESCE(v_pago.recargo_cuotas, 0);
    v_total := v_total + v_pago.monto;
  END LOOP;
  IF abs(round(v_pagos_base, 2) - v_total_base) > 0.01 THEN
    RAISE EXCEPTION 'ventas_pagos_no_coinciden' USING ERRCODE = '22023';
  END IF;
  v_subtotal := round(v_items_subtotal * v_total / v_items_total, 2);

  -- Solo campos editables. Se conservan tenant, CAE, moneda, origen e idempotencia.
  UPDATE public.ventas SET
    numero_comprobante = v_cabecera.numero_comprobante, fecha_venta = v_cabecera.fecha_venta,
    tipo_comprobante = v_cabecera.tipo_comprobante, tipo_pago = (p_pagos->0->>'tipo_pago')::public.tipo_pago,
    cliente_id = v_cabecera.cliente_id, cliente_nombre = COALESCE(NULLIF(btrim(v_cabecera.cliente_nombre), ''), 'Consumidor Final'),
    porcentaje_descuento = COALESCE(v_cabecera.porcentaje_descuento, 0), monto_descuento = COALESCE(v_cabecera.monto_descuento, 0),
    porcentaje_recargo = COALESCE(v_cabecera.porcentaje_recargo, 0), monto_recargo = COALESCE(v_cabecera.monto_recargo, 0),
    subtotal = v_subtotal, total_iva = round(v_total - v_subtotal, 2), total = round(v_total, 2),
    observaciones = v_cabecera.observaciones
  WHERE id = p_venta_id AND comercio_id = p_comercio_id RETURNING * INTO v_venta;
  IF NOT FOUND THEN RAISE EXCEPTION 'ventas_no_disponible' USING ERRCODE = '42501'; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'ventas_no_disponible' USING ERRCODE = '42501'; END IF;

  DELETE FROM public.venta_items WHERE venta_id = p_venta_id AND comercio_id = p_comercio_id;
  FOR v_json IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_item := jsonb_populate_record(NULL::public.venta_items, v_json);
    INSERT INTO public.venta_items (
      venta_id, comercio_id, producto_id, producto_variante_id, descripcion_manual, codigo_manual,
      cantidad, precio_unitario, porcentaje_iva, porcentaje_descuento, monto_descuento,
      porcentaje_recargo, monto_recargo, monto_iva, subtotal, total, afecta_stock
    ) VALUES (
      p_venta_id, p_comercio_id, v_item.producto_id, v_item.producto_variante_id, v_item.descripcion_manual, v_item.codigo_manual,
      v_item.cantidad, v_item.precio_unitario, v_item.porcentaje_iva, COALESCE(v_item.porcentaje_descuento, 0), COALESCE(v_item.monto_descuento, 0),
      COALESCE(v_item.porcentaje_recargo, 0), COALESCE(v_item.monto_recargo, 0), v_item.monto_iva, v_item.subtotal, v_item.total,
      v_item.producto_id IS NOT NULL
    );
  END LOOP;
  -- Conserva créditos/cobros ya imputados; reemplaza únicamente los débitos
  -- generados por los medios de pago de esta venta.
  DELETE FROM public.cuenta_corriente WHERE venta_id = p_venta_id AND comercio_id = p_comercio_id
    AND tipo_movimiento = 'debito' AND concepto = 'pago_cuenta_corriente';
  DELETE FROM public.pagos_venta WHERE venta_id = p_venta_id AND comercio_id = p_comercio_id;
  FOR v_json IN SELECT value FROM jsonb_array_elements(p_pagos) LOOP
    v_pago := jsonb_populate_record(NULL::public.pagos_venta, v_json);
    INSERT INTO public.pagos_venta (venta_id, comercio_id, tipo_pago, monto, banco_id, tarjeta_id, cuotas, recargo_cuotas, cheque_id, moneda)
    VALUES (p_venta_id, p_comercio_id, v_pago.tipo_pago, v_pago.monto, v_pago.banco_id, v_pago.tarjeta_id,
      COALESCE(v_pago.cuotas, 1), COALESCE(v_pago.recargo_cuotas, 0), v_pago.cheque_id, v_venta.moneda);
    IF v_pago.tipo_pago = 'cta_cte' THEN
      INSERT INTO public.cuenta_corriente (comercio_id, cliente_id, tipo_movimiento, monto, concepto, venta_id, fecha_movimiento, moneda)
      VALUES (p_comercio_id, v_cabecera.cliente_id, 'debito', v_pago.monto, 'pago_cuenta_corriente', p_venta_id, v_cabecera.fecha_venta, v_venta.moneda);
    END IF;
  END LOOP;
  RETURN v_venta;
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_venta_transaccional(uuid, uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_venta_transaccional(uuid, uuid, jsonb, jsonb, jsonb) TO authenticated;
COMMENT ON FUNCTION public.actualizar_venta_transaccional(uuid, uuid, jsonb, jsonb, jsonb)
IS 'Edicion atomica con RLS y permiso admin. Un error revierte detalle, stock, pagos y cabecera.';

COMMIT;
