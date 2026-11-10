-- Permite recibir cheques completos y conservar el excedente como crédito general.
-- No modifica cobros históricos ni datos de clientes.
BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_pagos_cliente_multi_documento(
  p_cliente_id uuid,
  p_venta_ids uuid[],
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
  v_cliente public.clientes;
  v_venta public.ventas;
  v_venta_id uuid;
  v_pago jsonb;
  v_cheque jsonb;
  v_cheque_id uuid;
  v_primer_movimiento_id uuid;
  v_movimiento_id uuid;
  v_tipo text;
  v_monto numeric;
  v_total numeric := 0;
  v_total_cheques numeric := 0;
  v_disponible numeric;
  v_saldo numeric;
  v_saldos numeric[] := ARRAY[]::numeric[];
  v_total_documentos numeric := 0;
  v_saldo_cliente numeric;
  v_moneda text;
  v_concepto text;
  v_observacion text;
  v_restante numeric;
  v_imputacion numeric;
  v_indice integer := 1;
  v_fecha date := coalesce(p_fecha, current_date);
BEGIN
  IF p_cliente_id IS NULL OR p_venta_ids IS NULL
     OR coalesce(array_ndims(p_venta_ids), 0) <> 1
     OR array_lower(p_venta_ids, 1) <> 1
     OR cardinality(p_venta_ids) = 0
     OR EXISTS (SELECT 1 FROM unnest(p_venta_ids) AS id WHERE id IS NULL)
     OR (SELECT count(DISTINCT id) FROM unnest(p_venta_ids) AS id) <> cardinality(p_venta_ids) THEN
    RAISE EXCEPTION 'comprobantes_cliente_invalidos';
  END IF;
  IF p_pagos IS NULL OR jsonb_typeof(p_pagos) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'pagos_cliente_mixtos_invalidos';
  END IF;
  IF jsonb_array_length(p_pagos) = 0 THEN
    RAISE EXCEPTION 'pagos_cliente_mixtos_invalidos';
  END IF;

  SELECT * INTO v_cliente FROM public.clientes WHERE id = p_cliente_id;
  IF NOT FOUND OR NOT public.user_belongs_to_comercio(v_cliente.comercio_id) THEN
    RAISE EXCEPTION 'cliente_no_disponible';
  END IF;

  -- Serializa los cobros de un cliente, incluso cuando seleccionan ventas distintas.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'cuenta-cliente:pago:' || v_cliente.comercio_id::text || ':' || p_cliente_id::text, 0
  ));
  PERFORM 1 FROM public.clientes WHERE id = p_cliente_id FOR UPDATE;

  -- Orden estable de bloqueo para evitar interbloqueos con otra selección.
  PERFORM 1 FROM public.ventas WHERE id = ANY(p_venta_ids) ORDER BY id FOR UPDATE;
  FOREACH v_venta_id IN ARRAY p_venta_ids LOOP
    SELECT * INTO v_venta FROM public.ventas WHERE id = v_venta_id;
    IF NOT FOUND OR v_venta.comercio_id IS DISTINCT FROM v_cliente.comercio_id
       OR v_venta.cliente_id IS DISTINCT FROM p_cliente_id THEN
      RAISE EXCEPTION 'venta_cliente_no_disponible';
    END IF;
    IF v_moneda IS NOT NULL AND v_moneda <> coalesce(v_venta.moneda, 'ARS') THEN
      RAISE EXCEPTION 'comprobantes_cliente_moneda_distinta';
    END IF;
    v_moneda := coalesce(v_venta.moneda, 'ARS');

    SELECT coalesce(sum(CASE WHEN tipo_movimiento = 'debito' THEN monto ELSE -monto END), 0)
    INTO v_saldo FROM public.cuenta_corriente
    WHERE comercio_id = v_cliente.comercio_id AND cliente_id = p_cliente_id AND venta_id = v_venta_id;
    IF v_saldo <= 0 THEN RAISE EXCEPTION 'comprobante_cliente_sin_saldo'; END IF;
    v_saldos := array_append(v_saldos, v_saldo);
    v_total_documentos := v_total_documentos + v_saldo;
  END LOOP;

  SELECT coalesce(sum(CASE WHEN tipo_movimiento = 'debito' THEN monto ELSE -monto END), 0)
  INTO v_saldo_cliente FROM public.cuenta_corriente
  WHERE comercio_id = v_cliente.comercio_id AND cliente_id = p_cliente_id;
  IF v_saldo_cliente <= 0 THEN RAISE EXCEPTION 'comprobante_cliente_sin_saldo'; END IF;

  FOR v_pago IN SELECT value FROM jsonb_array_elements(p_pagos) LOOP
    IF jsonb_typeof(v_pago) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'pago_cliente_mixto_item_invalido';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_pago) AS k WHERE k NOT IN ('tipo','monto','cheque','observaciones'))
       OR jsonb_typeof(v_pago->'monto') IS DISTINCT FROM 'number'
       OR coalesce(v_pago->>'tipo', '') NOT IN ('contado', 'transferencia', 'tarjeta', 'cheque') THEN
      RAISE EXCEPTION 'pago_cliente_mixto_item_invalido';
    END IF;
    v_tipo := v_pago->>'tipo';
    v_monto := (v_pago->>'monto')::numeric;
    IF v_monto <= 0 OR v_monto <> round(v_monto, 2) THEN
      RAISE EXCEPTION 'pago_cliente_mixto_item_invalido';
    END IF;
    IF (v_tipo = 'cheque') <> (v_pago ? 'cheque') THEN
      RAISE EXCEPTION 'pago_cliente_mixto_cheque_invalido';
    END IF;
    v_total := v_total + v_monto;
    IF v_tipo = 'cheque' THEN v_total_cheques := v_total_cheques + v_monto; END IF;
  END LOOP;
  v_disponible := least(v_total_documentos, v_saldo_cliente);
  -- El excedente se admite para cheques recibidos completos. Los demás
  -- medios mantienen el límite de la deuda imputable.
  IF v_total - v_total_cheques > v_disponible THEN
    RAISE EXCEPTION 'pagos_cliente_superan_saldo';
  END IF;

  -- Imputa primero los otros medios para que todo excedente conserve
  -- el cheque que lo originó, independientemente del orden del formulario.
  FOR v_pago IN SELECT value FROM jsonb_array_elements(p_pagos) WITH ORDINALITY AS p(value,orden)
    ORDER BY CASE WHEN value->>'tipo'='cheque' THEN 1 ELSE 0 END,orden LOOP
    v_tipo := v_pago->>'tipo';
    v_monto := (v_pago->>'monto')::numeric;
    v_restante := v_monto;
    v_cheque_id := NULL;
    v_primer_movimiento_id := NULL;
    v_concepto := CASE v_tipo WHEN 'contado' THEN 'pago_efectivo'
      WHEN 'transferencia' THEN 'pago_transferencia' WHEN 'tarjeta' THEN 'pago_tarjeta' ELSE 'pago_cheque' END;
    v_observacion := coalesce(nullif(trim(v_pago->>'observaciones'), ''), nullif(trim(p_observaciones), ''));

    IF v_tipo = 'cheque' THEN
      v_cheque := v_pago->'cheque';
      IF jsonb_typeof(v_cheque) IS DISTINCT FROM 'object'
         OR nullif(trim(v_cheque->>'numero_cheque'), '') IS NULL
         OR nullif(trim(v_cheque->>'banco_emisor'), '') IS NULL
         OR nullif(trim(v_cheque->>'emisor_nombre'), '') IS NULL
         OR nullif(v_cheque->>'fecha_emision', '') IS NULL
         OR nullif(v_cheque->>'fecha_vencimiento', '') IS NULL THEN
        RAISE EXCEPTION 'datos_cheque_cliente_incompletos';
      END IF;
      v_observacion := concat_ws(' | ', v_observacion,
        'Cheque N° ' || trim(v_cheque->>'numero_cheque') || ' - ' || trim(v_cheque->>'banco_emisor'));

      INSERT INTO public.cheques(
        comercio_id, numero_cheque, banco_emisor, monto, fecha_emision,
        fecha_vencimiento, emisor_nombre, emisor_cuit, cliente_id,
        estado, observaciones, tipo_cheque
      ) VALUES (
        v_cliente.comercio_id, trim(v_cheque->>'numero_cheque'), trim(v_cheque->>'banco_emisor'),
        v_monto, (v_cheque->>'fecha_emision')::date, (v_cheque->>'fecha_vencimiento')::date,
        trim(v_cheque->>'emisor_nombre'), nullif(trim(v_cheque->>'emisor_cuit'), ''), p_cliente_id,
        'en_cartera', nullif(trim(v_cheque->>'observaciones'), ''), 'tercero'
      ) RETURNING id INTO v_cheque_id;
    END IF;

    WHILE v_restante > 0 AND v_disponible > 0 LOOP
      IF v_indice > cardinality(p_venta_ids) THEN RAISE EXCEPTION 'pagos_cliente_superan_saldo'; END IF;
      IF v_saldos[v_indice] <= 0 THEN
        v_indice := v_indice + 1;
        CONTINUE;
      END IF;
      v_imputacion := least(v_restante, v_saldos[v_indice], v_disponible);
      INSERT INTO public.cuenta_corriente(
        comercio_id, cliente_id, tipo_movimiento, monto, concepto,
        venta_id, fecha_movimiento, observaciones, moneda, cheque_id
      ) VALUES (
        v_cliente.comercio_id, p_cliente_id, 'credito', v_imputacion, v_concepto,
        p_venta_ids[v_indice], v_fecha::timestamp, v_observacion, v_moneda, v_cheque_id
      ) RETURNING id INTO v_movimiento_id;
      v_primer_movimiento_id := coalesce(v_primer_movimiento_id, v_movimiento_id);
      v_restante := v_restante - v_imputacion;
      v_disponible := v_disponible - v_imputacion;
      v_saldos[v_indice] := v_saldos[v_indice] - v_imputacion;
    END LOOP;

    IF v_restante > 0 THEN
      -- Crédito general: nunca deja un comprobante con saldo negativo.
      -- Comparte cheque_id para que la reversión incluya también el excedente.
      INSERT INTO public.cuenta_corriente(
        comercio_id, cliente_id, tipo_movimiento, monto, concepto,
        venta_id, fecha_movimiento, observaciones, moneda, cheque_id
      ) VALUES (
        v_cliente.comercio_id, p_cliente_id, 'credito', v_restante, v_concepto,
        NULL, v_fecha::timestamp, concat_ws(' | ',v_observacion,'Excedente de cheque a cuenta del cliente'),
        v_moneda, v_cheque_id
      ) RETURNING id INTO v_movimiento_id;
      v_primer_movimiento_id := coalesce(v_primer_movimiento_id,v_movimiento_id);
    END IF;

    IF v_cheque_id IS NOT NULL THEN
      -- Mantiene la referencia histórica al primer movimiento. Para un cheque
      -- aplicado a varias ventas, la relación completa está en cuenta_corriente.
      UPDATE public.cheques SET cuenta_corriente_id = v_primer_movimiento_id,
        venta_id = CASE WHEN (SELECT count(*) FROM public.cuenta_corriente WHERE cheque_id = v_cheque_id) = 1
          THEN (SELECT venta_id FROM public.cuenta_corriente WHERE id = v_primer_movimiento_id) ELSE NULL END
      WHERE id = v_cheque_id;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pagos_cliente_multi_documento(uuid,uuid[],date,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pagos_cliente_multi_documento(uuid,uuid[],date,text,jsonb) TO authenticated;

COMMENT ON FUNCTION public.registrar_pagos_cliente_multi_documento(uuid,uuid[],date,text,jsonb)
IS 'Imputa cobros a comprobantes pendientes. Los cheques ingresan completos una sola vez a cartera; su excedente queda como crédito sin venta, reversible junto con el cheque.';

COMMIT;
