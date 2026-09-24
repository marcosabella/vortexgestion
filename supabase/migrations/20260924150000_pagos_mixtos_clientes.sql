BEGIN;

CREATE INDEX IF NOT EXISTS cuenta_corriente_cliente_venta_idx
ON public.cuenta_corriente(comercio_id, cliente_id, venta_id)
WHERE venta_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.registrar_pagos_cliente_mixtos(
  p_cliente_id uuid,
  p_venta_id uuid,
  p_fecha date,
  p_observaciones text,
  p_pagos jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_venta public.ventas;
  v_cliente public.clientes;
  v_movimiento public.cuenta_corriente;
  v_pago jsonb;
  v_tipo text;
  v_monto numeric;
  v_total numeric := 0;
  v_saldo_comprobante numeric;
  v_saldo_cliente numeric;
  v_concepto text;
  v_observacion text;
  v_cheque jsonb;
  v_fecha date := coalesce(p_fecha, current_date);
BEGIN
  IF p_cliente_id IS NULL OR p_venta_id IS NULL
     OR jsonb_typeof(p_pagos) <> 'array' OR jsonb_array_length(p_pagos) = 0 THEN
    RAISE EXCEPTION 'pagos_cliente_mixtos_invalidos';
  END IF;

  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id FOR UPDATE;
  IF NOT FOUND OR v_venta.cliente_id IS DISTINCT FROM p_cliente_id
     OR NOT public.user_belongs_to_comercio(v_venta.comercio_id) THEN
    RAISE EXCEPTION 'venta_cliente_no_disponible';
  END IF;

  SELECT * INTO v_cliente
  FROM public.clientes
  WHERE id = p_cliente_id AND comercio_id = v_venta.comercio_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cliente_no_disponible'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'cuenta-cliente:pago:' || v_venta.comercio_id::text || ':' || p_cliente_id::text || ':' || p_venta_id::text,
    0
  ));

  SELECT coalesce(sum(CASE WHEN tipo_movimiento = 'debito' THEN monto ELSE -monto END), 0)
  INTO v_saldo_comprobante
  FROM public.cuenta_corriente
  WHERE comercio_id = v_venta.comercio_id AND cliente_id = p_cliente_id AND venta_id = p_venta_id;

  SELECT coalesce(sum(CASE WHEN tipo_movimiento = 'debito' THEN monto ELSE -monto END), 0)
  INTO v_saldo_cliente
  FROM public.cuenta_corriente
  WHERE comercio_id = v_venta.comercio_id AND cliente_id = p_cliente_id;

  IF v_saldo_comprobante <= 0 OR v_saldo_cliente <= 0 THEN
    RAISE EXCEPTION 'comprobante_cliente_sin_saldo';
  END IF;

  FOR v_pago IN SELECT value FROM jsonb_array_elements(p_pagos) LOOP
    IF jsonb_typeof(v_pago) <> 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_pago) AS k WHERE k NOT IN ('tipo','monto','cheque','observaciones')) THEN
      RAISE EXCEPTION 'pago_cliente_mixto_item_invalido';
    END IF;
    v_tipo := v_pago->>'tipo';
    v_monto := coalesce((v_pago->>'monto')::numeric, 0);
    IF v_tipo NOT IN ('contado', 'transferencia', 'tarjeta', 'cheque') OR v_monto <= 0 THEN
      RAISE EXCEPTION 'pago_cliente_mixto_item_invalido';
    END IF;
    IF (v_tipo = 'cheque') <> (v_pago ? 'cheque') THEN
      RAISE EXCEPTION 'pago_cliente_mixto_cheque_invalido';
    END IF;
    v_total := v_total + v_monto;
  END LOOP;

  IF v_total > least(v_saldo_comprobante, v_saldo_cliente) THEN
    RAISE EXCEPTION 'pagos_cliente_superan_saldo';
  END IF;

  FOR v_pago IN SELECT value FROM jsonb_array_elements(p_pagos) LOOP
    v_tipo := v_pago->>'tipo';
    v_monto := (v_pago->>'monto')::numeric;
    v_concepto := CASE v_tipo
      WHEN 'contado' THEN 'pago_efectivo'
      WHEN 'transferencia' THEN 'pago_transferencia'
      WHEN 'tarjeta' THEN 'pago_tarjeta'
      ELSE 'pago_cheque'
    END;
    v_observacion := coalesce(nullif(trim(v_pago->>'observaciones'), ''), nullif(trim(p_observaciones), ''));

    IF v_tipo = 'cheque' THEN
      v_cheque := v_pago->'cheque';
      IF jsonb_typeof(v_cheque) <> 'object'
         OR nullif(trim(v_cheque->>'numero_cheque'), '') IS NULL
         OR nullif(trim(v_cheque->>'banco_emisor'), '') IS NULL
         OR nullif(trim(v_cheque->>'emisor_nombre'), '') IS NULL
         OR nullif(v_cheque->>'fecha_emision', '') IS NULL
         OR nullif(v_cheque->>'fecha_vencimiento', '') IS NULL THEN
        RAISE EXCEPTION 'datos_cheque_cliente_incompletos';
      END IF;
      v_observacion := concat_ws(
        ' | ',
        v_observacion,
        'Cheque N° ' || trim(v_cheque->>'numero_cheque') || ' - ' || trim(v_cheque->>'banco_emisor')
      );
    END IF;

    INSERT INTO public.cuenta_corriente(
      comercio_id, cliente_id, tipo_movimiento, monto, concepto,
      venta_id, fecha_movimiento, observaciones, moneda
    ) VALUES (
      v_venta.comercio_id, p_cliente_id, 'credito', v_monto, v_concepto,
      p_venta_id, v_fecha::timestamp, v_observacion, coalesce(v_venta.moneda, 'ARS')
    ) RETURNING * INTO v_movimiento;

    IF v_tipo = 'cheque' THEN
      INSERT INTO public.cheques(
        comercio_id, numero_cheque, banco_emisor, monto, fecha_emision,
        fecha_vencimiento, emisor_nombre, emisor_cuit, cliente_id, venta_id,
        cuenta_corriente_id, estado, observaciones, tipo_cheque
      ) VALUES (
        v_venta.comercio_id, trim(v_cheque->>'numero_cheque'), trim(v_cheque->>'banco_emisor'),
        v_monto, (v_cheque->>'fecha_emision')::date, (v_cheque->>'fecha_vencimiento')::date,
        trim(v_cheque->>'emisor_nombre'), nullif(trim(v_cheque->>'emisor_cuit'), ''),
        p_cliente_id, p_venta_id, v_movimiento.id, 'en_cartera',
        nullif(trim(v_cheque->>'observaciones'), ''), 'tercero'
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pagos_cliente_mixtos(uuid,uuid,date,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pagos_cliente_mixtos(uuid,uuid,date,text,jsonb) TO authenticated;

COMMENT ON FUNCTION public.registrar_pagos_cliente_mixtos(uuid,uuid,date,text,jsonb)
IS 'Imputa uno o varios medios de cobro a un comprobante pendiente del cliente. Los cheques recibidos ingresan en cartera.';

CREATE OR REPLACE FUNCTION public.eliminar_pago_cliente(p_movimiento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_movimiento public.cuenta_corriente;
  v_cheque public.cheques;
BEGIN
  SELECT * INTO v_movimiento
  FROM public.cuenta_corriente
  WHERE id = p_movimiento_id AND tipo_movimiento = 'credito'
  FOR UPDATE;

  IF NOT FOUND OR NOT public.user_belongs_to_comercio(v_movimiento.comercio_id) THEN
    RAISE EXCEPTION 'pago_cliente_no_disponible';
  END IF;

  SELECT * INTO v_cheque
  FROM public.cheques
  WHERE cuenta_corriente_id = v_movimiento.id
  FOR UPDATE;

  IF v_cheque.id IS NOT NULL AND v_cheque.estado <> 'en_cartera' THEN
    RAISE EXCEPTION 'cheque_cliente_pago_ya_utilizado';
  END IF;

  IF v_cheque.id IS NOT NULL THEN
    DELETE FROM public.cheques WHERE id = v_cheque.id;
  END IF;
  DELETE FROM public.cuenta_corriente WHERE id = v_movimiento.id;
END;
$$;

REVOKE ALL ON FUNCTION public.eliminar_pago_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_pago_cliente(uuid) TO authenticated;

COMMENT ON FUNCTION public.eliminar_pago_cliente(uuid)
IS 'Revierte un crédito de cliente y elimina el cheque asociado únicamente si todavía permanece en cartera.';

COMMIT;
