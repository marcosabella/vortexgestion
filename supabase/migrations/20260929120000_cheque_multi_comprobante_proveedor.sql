-- Permite imputar un mismo cheque a varios comprobantes pendientes de un proveedor.
-- La identidad y el importe del cheque se conservan una sola vez; cada imputacion
-- se registra como un movimiento separado en la cuenta corriente.

DROP INDEX IF EXISTS public.cuenta_proveedor_cheque_unico;

CREATE INDEX IF NOT EXISTS cuenta_proveedor_cheque_idx
ON public.cuenta_corriente_proveedores(cheque_id)
WHERE cheque_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.registrar_pagos_proveedor_multi_documento(
  p_proveedor_id uuid,
  p_fecha date,
  p_observaciones text,
  p_documentos jsonb,
  p_pagos jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_comercio uuid;
  v_documento jsonb;
  v_pago jsonb;
  v_factura public.compras_facturas;
  v_gasto public.gastos_egresos;
  v_cheque public.cheques;
  v_movimiento public.cuenta_corriente_proveedores;
  v_primer_movimiento_id uuid;
  v_tipo text;
  v_monto numeric;
  v_total_documentos numeric := 0;
  v_total_pagos numeric := 0;
  v_saldo_documento numeric := 0;
  v_restante numeric;
  v_imputacion numeric;
  v_indice integer := 0;
  v_cantidad_documentos integer;
  v_factura_id uuid;
  v_gasto_id uuid;
  v_fecha date := coalesce(p_fecha, current_date);
BEGIN
  SELECT comercio_id INTO v_comercio
  FROM public.proveedores
  WHERE id = p_proveedor_id;

  IF v_comercio IS NULL OR NOT public.user_belongs_to_comercio(v_comercio)
     OR p_documentos IS NULL
     OR jsonb_typeof(p_documentos) <> 'array'
     OR jsonb_array_length(p_documentos) = 0
     OR p_pagos IS NULL
     OR jsonb_typeof(p_pagos) <> 'array'
     OR jsonb_array_length(p_pagos) = 0 THEN
    RAISE EXCEPTION 'pago_proveedor_multi_documento_invalido';
  END IF;

  v_cantidad_documentos := jsonb_array_length(p_documentos);

  -- Evita imputar dos veces el mismo comprobante dentro de la operacion.
  IF (
    SELECT count(*)
    FROM (
      SELECT DISTINCT
        coalesce(documento->>'factura_id', '') || ':' ||
        coalesce(documento->>'gasto_id', '') AS clave
      FROM jsonb_array_elements(p_documentos) AS documento
    ) AS documentos_unicos
  ) <> v_cantidad_documentos THEN
    RAISE EXCEPTION 'pago_proveedor_documento_duplicado';
  END IF;

  -- Bloquea y valida todos los documentos antes de registrar algun movimiento.
  FOR v_documento IN SELECT value FROM jsonb_array_elements(p_documentos) LOOP
    IF jsonb_typeof(v_documento) <> 'object'
       OR ((v_documento ? 'factura_id') = (v_documento ? 'gasto_id')) THEN
      RAISE EXCEPTION 'pago_proveedor_documento_invalido';
    END IF;

    IF v_documento ? 'factura_id' THEN
      SELECT * INTO v_factura
      FROM public.compras_facturas
      WHERE id = (v_documento->>'factura_id')::uuid
      FOR UPDATE;

      IF NOT FOUND OR v_factura.comercio_id <> v_comercio
         OR v_factura.proveedor_id <> p_proveedor_id THEN
        RAISE EXCEPTION 'factura_compra_no_disponible';
      END IF;

      SELECT coalesce(sum(CASE WHEN tipo = 'deuda' THEN monto ELSE -monto END), 0)
      INTO v_saldo_documento
      FROM public.cuenta_corriente_proveedores
      WHERE factura_id = v_factura.id;
    ELSE
      SELECT * INTO v_gasto
      FROM public.gastos_egresos
      WHERE id = (v_documento->>'gasto_id')::uuid
      FOR UPDATE;

      IF NOT FOUND OR v_gasto.comercio_id <> v_comercio
         OR v_gasto.proveedor_id <> p_proveedor_id
         OR v_gasto.medio_pago <> 'cuenta_corriente' THEN
        RAISE EXCEPTION 'gasto_cuenta_corriente_no_disponible';
      END IF;

      SELECT coalesce(sum(CASE WHEN tipo = 'deuda' THEN monto ELSE -monto END), 0)
      INTO v_saldo_documento
      FROM public.cuenta_corriente_proveedores
      WHERE gasto_egreso_id = v_gasto.id;
    END IF;

    IF v_saldo_documento <= 0 THEN
      RAISE EXCEPTION 'pago_proveedor_documento_sin_saldo';
    END IF;
    v_total_documentos := v_total_documentos + v_saldo_documento;
  END LOOP;

  FOR v_pago IN SELECT value FROM jsonb_array_elements(p_pagos) LOOP
    v_tipo := v_pago->>'tipo';
    v_monto := coalesce((v_pago->>'monto')::numeric, 0);
    IF v_tipo NOT IN ('contado', 'transferencia', 'tarjeta', 'cheque') OR v_monto <= 0 THEN
      RAISE EXCEPTION 'pago_proveedor_mixto_item_invalido';
    END IF;
    IF v_tipo = 'cheque' AND ((v_pago ? 'cheque_id') = (v_pago ? 'cheque_propio')) THEN
      RAISE EXCEPTION 'pago_proveedor_mixto_cheque_invalido';
    END IF;
    v_total_pagos := v_total_pagos + v_monto;
  END LOOP;

  IF v_total_pagos > v_total_documentos THEN
    RAISE EXCEPTION 'pagos_proveedor_superan_saldo';
  END IF;

  -- Los pagos se distribuyen en el orden de los comprobantes seleccionados.
  v_indice := 0;
  v_saldo_documento := 0;
  FOR v_pago IN SELECT value FROM jsonb_array_elements(p_pagos) LOOP
    v_tipo := v_pago->>'tipo';
    v_monto := (v_pago->>'monto')::numeric;
    v_restante := v_monto;
    v_primer_movimiento_id := NULL;

    IF v_tipo = 'cheque' AND v_pago ? 'cheque_id' THEN
      SELECT * INTO v_cheque
      FROM public.cheques
      WHERE id = (v_pago->>'cheque_id')::uuid
      FOR UPDATE;

      IF NOT FOUND OR v_cheque.comercio_id <> v_comercio
         OR v_cheque.tipo_cheque <> 'tercero'
         OR v_cheque.estado <> 'en_cartera'
         OR v_cheque.movimiento_proveedor_id IS NOT NULL THEN
        RAISE EXCEPTION 'cheque_cartera_no_disponible';
      END IF;
      IF v_cheque.monto <> v_monto THEN
        RAISE EXCEPTION 'cheque_monto_pago_diferente';
      END IF;
    ELSIF v_tipo = 'cheque' THEN
      IF jsonb_typeof(v_pago->'cheque_propio') <> 'object'
         OR nullif(trim(v_pago->'cheque_propio'->>'numero_cheque'), '') IS NULL
         OR nullif(trim(v_pago->'cheque_propio'->>'banco_emisor'), '') IS NULL
         OR nullif(trim(v_pago->'cheque_propio'->>'emisor_nombre'), '') IS NULL
         OR nullif(v_pago->'cheque_propio'->>'fecha_emision', '') IS NULL
         OR nullif(v_pago->'cheque_propio'->>'fecha_vencimiento', '') IS NULL THEN
        RAISE EXCEPTION 'datos_cheque_propio_incompletos';
      END IF;

      INSERT INTO public.cheques(
        comercio_id, numero_cheque, banco_emisor, monto, fecha_emision,
        fecha_vencimiento, emisor_nombre, emisor_cuit, estado, observaciones,
        tipo_cheque, proveedor_id
      ) VALUES (
        v_comercio, trim(v_pago->'cheque_propio'->>'numero_cheque'),
        trim(v_pago->'cheque_propio'->>'banco_emisor'), v_monto,
        (v_pago->'cheque_propio'->>'fecha_emision')::date,
        (v_pago->'cheque_propio'->>'fecha_vencimiento')::date,
        trim(v_pago->'cheque_propio'->>'emisor_nombre'),
        nullif(trim(v_pago->'cheque_propio'->>'emisor_cuit'), ''), 'emitido',
        nullif(trim(v_pago->'cheque_propio'->>'observaciones'), ''),
        'propio', p_proveedor_id
      ) RETURNING * INTO v_cheque;
    END IF;

    WHILE v_restante > 0 LOOP
      IF v_saldo_documento <= 0 THEN
        v_indice := v_indice + 1;
        IF v_indice > v_cantidad_documentos THEN
          RAISE EXCEPTION 'pagos_proveedor_superan_saldo';
        END IF;

        v_documento := p_documentos->(v_indice - 1);
        v_factura_id := CASE WHEN v_documento ? 'factura_id' THEN (v_documento->>'factura_id')::uuid ELSE NULL END;
        v_gasto_id := CASE WHEN v_documento ? 'gasto_id' THEN (v_documento->>'gasto_id')::uuid ELSE NULL END;

        IF v_factura_id IS NOT NULL THEN
          SELECT coalesce(sum(CASE WHEN tipo = 'deuda' THEN monto ELSE -monto END), 0)
          INTO v_saldo_documento
          FROM public.cuenta_corriente_proveedores
          WHERE factura_id = v_factura_id;
        ELSE
          SELECT coalesce(sum(CASE WHEN tipo = 'deuda' THEN monto ELSE -monto END), 0)
          INTO v_saldo_documento
          FROM public.cuenta_corriente_proveedores
          WHERE gasto_egreso_id = v_gasto_id;
        END IF;
      END IF;

      v_imputacion := least(v_restante, v_saldo_documento);

      IF v_tipo = 'cheque' THEN
        INSERT INTO public.cuenta_corriente_proveedores(
          comercio_id, proveedor_id, factura_id, gasto_egreso_id, tipo, monto,
          fecha, medio_pago, observaciones, cheque_id
        ) VALUES (
          v_comercio, p_proveedor_id, v_factura_id, v_gasto_id, 'pago', v_imputacion,
          v_fecha, 'cheque',
          coalesce(nullif(trim(v_pago->>'observaciones'), ''), nullif(trim(p_observaciones), '')),
          v_cheque.id
        ) RETURNING * INTO v_movimiento;
        v_primer_movimiento_id := coalesce(v_primer_movimiento_id, v_movimiento.id);

        IF v_gasto_id IS NOT NULL AND v_imputacion = v_saldo_documento THEN
          UPDATE public.gastos_egresos SET estado = 'pagado' WHERE id = v_gasto_id;
        END IF;
      ELSIF v_factura_id IS NOT NULL THEN
        PERFORM public.registrar_pago_factura_compra(
          v_factura_id, v_imputacion, v_fecha, v_tipo,
          coalesce(nullif(trim(v_pago->>'observaciones'), ''), nullif(trim(p_observaciones), ''))
        );
      ELSE
        PERFORM public.registrar_pago_gasto_egreso(
          v_gasto_id, v_imputacion, v_fecha, v_tipo,
          coalesce(nullif(trim(v_pago->>'observaciones'), ''), nullif(trim(p_observaciones), ''))
        );
      END IF;

      v_restante := v_restante - v_imputacion;
      v_saldo_documento := v_saldo_documento - v_imputacion;
    END LOOP;

    IF v_tipo = 'cheque' THEN
      UPDATE public.cheques
      SET estado = CASE WHEN tipo_cheque = 'tercero'
            THEN 'endosado'::public.estado_cheque
            ELSE 'emitido'::public.estado_cheque END,
          proveedor_id = p_proveedor_id,
          movimiento_proveedor_id = v_primer_movimiento_id,
          observaciones = coalesce(observaciones || E'\n', '') ||
            'Entregado en pago a proveedor el ' || to_char(v_fecha, 'DD/MM/YYYY')
      WHERE id = v_cheque.id;
    END IF;
  END LOOP;
END;
$$;

-- Al borrar una imputacion con cheque se revierte el cheque completo y todas sus
-- imputaciones. Un cheque fisico no puede volver parcialmente a cartera.
CREATE OR REPLACE FUNCTION public.eliminar_pago_proveedor_con_cheque(p_movimiento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_movimiento public.cuenta_corriente_proveedores;
  v_cheque public.cheques;
  v_gasto_id uuid;
BEGIN
  SELECT * INTO v_movimiento
  FROM public.cuenta_corriente_proveedores
  WHERE id = p_movimiento_id AND tipo = 'pago' AND cheque_id IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND OR NOT public.user_belongs_to_comercio(v_movimiento.comercio_id) THEN
    RAISE EXCEPTION 'pago_cheque_proveedor_no_disponible';
  END IF;

  SELECT * INTO v_cheque
  FROM public.cheques
  WHERE id = v_movimiento.cheque_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pago_cheque_proveedor_no_disponible';
  END IF;

  FOR v_gasto_id IN
    SELECT DISTINCT gasto_egreso_id
    FROM public.cuenta_corriente_proveedores
    WHERE cheque_id = v_cheque.id AND gasto_egreso_id IS NOT NULL
  LOOP
    UPDATE public.gastos_egresos SET estado = 'pendiente' WHERE id = v_gasto_id;
  END LOOP;

  DELETE FROM public.pagos_compra
  WHERE movimiento_id IN (
    SELECT id FROM public.cuenta_corriente_proveedores WHERE cheque_id = v_cheque.id
  );
  DELETE FROM public.cuenta_corriente_proveedores WHERE cheque_id = v_cheque.id;

  IF v_cheque.tipo_cheque = 'propio' THEN
    DELETE FROM public.cheques WHERE id = v_cheque.id;
  ELSE
    UPDATE public.cheques
    SET estado = 'en_cartera', proveedor_id = NULL, movimiento_proveedor_id = NULL
    WHERE id = v_cheque.id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pagos_proveedor_multi_documento(uuid,date,text,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pagos_proveedor_multi_documento(uuid,date,text,jsonb,jsonb) TO authenticated;

COMMENT ON FUNCTION public.registrar_pagos_proveedor_multi_documento(uuid,date,text,jsonb,jsonb)
IS 'Distribuye atomicamente uno o varios medios de pago entre varios comprobantes pendientes del mismo proveedor.';
