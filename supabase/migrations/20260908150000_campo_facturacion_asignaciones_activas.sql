-- Vortex Campo: excluye asignaciones planificadas inactivas al facturar.
BEGIN;

CREATE OR REPLACE FUNCTION public.campo_facturar_orden(
  p_orden_id uuid, p_moneda text, p_tipo_comprobante public.tipo_comprobante,
  p_punto_venta integer, p_modalidad text, p_idempotency_key uuid
)
RETURNS TABLE (
  venta public.ventas, comprobante public.campo_orden_comprobantes,
  moneda character(3), subtotal numeric, total_iva numeric, total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_orden public.campo_ordenes_trabajo;
  v_comprobante public.campo_orden_comprobantes;
  v_venta public.ventas;
  v_items jsonb;
  v_pagos jsonb;
  v_huella character(64);
  v_payload jsonb;
  v_total_estimado numeric;
  v_cliente_nombre text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'campo_auth_requerida' USING ERRCODE = '42501';
  END IF;
  IF p_orden_id IS NULL OR p_idempotency_key IS NULL
     OR p_moneda NOT IN ('ARS', 'USD')
     OR p_tipo_comprobante IS NULL
     OR p_punto_venta IS NULL OR p_punto_venta <= 0
     OR p_modalidad NOT IN ('transferencia', 'cta_cte') THEN
    RAISE EXCEPTION 'campo_facturacion_parametros_invalidos' USING ERRCODE = '22023';
  END IF;

  SELECT o.* INTO v_orden
  FROM public.campo_ordenes_trabajo AS o
  WHERE o.id = p_orden_id
  FOR UPDATE;

  IF v_orden.id IS NULL
     OR public.user_is_comercio_admin(v_orden.comercio_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'campo_orden_no_disponible' USING ERRCODE = '42501';
  END IF;
  IF v_orden.estado <> 'finalizada' THEN
    RAISE EXCEPTION 'campo_orden_no_finalizada' USING ERRCODE = '22023';
  END IF;
  SELECT NULLIF(btrim(concat_ws(' ', c.nombre, c.apellido)), '')
  INTO v_cliente_nombre
  FROM public.clientes AS c
  WHERE c.id = v_orden.cliente_id
    AND c.comercio_id = v_orden.comercio_id;
  IF v_cliente_nombre IS NULL THEN
    RAISE EXCEPTION 'campo_cliente_invalido' USING ERRCODE = '23514';
  END IF;

  v_payload := jsonb_build_object(
    'orden_id', p_orden_id, 'moneda', p_moneda,
    'tipo_comprobante', p_tipo_comprobante::text,
    'punto_venta', p_punto_venta, 'modalidad', p_modalidad
  );
  v_huella := encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'campo:facturacion:idempotency:' || v_orden.comercio_id::text || ':' || p_idempotency_key::text, 0
  ));

  SELECT c.* INTO v_comprobante
  FROM public.campo_orden_comprobantes AS c
  WHERE c.comercio_id = v_orden.comercio_id AND c.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF v_comprobante.id IS NOT NULL THEN
    IF v_comprobante.huella_pedido IS DISTINCT FROM v_huella THEN
      RAISE EXCEPTION 'campo_idempotency_conflicto' USING ERRCODE = '22023';
    END IF;
    SELECT v.* INTO v_venta FROM public.ventas AS v
    WHERE v.id = v_comprobante.venta_id AND v.comercio_id = v_comprobante.comercio_id;
    IF v_venta.id IS NULL THEN
      RAISE EXCEPTION 'campo_comprobante_venta_invalida' USING ERRCODE = '23514';
    END IF;
    RETURN QUERY SELECT v_venta, v_comprobante, v_venta.moneda, v_venta.subtotal, v_venta.total_iva, v_venta.total;
    RETURN;
  END IF;

  SELECT c.* INTO v_comprobante
  FROM public.campo_orden_comprobantes AS c
  WHERE c.comercio_id = v_orden.comercio_id
    AND c.orden_id = v_orden.id AND c.moneda = p_moneda
  FOR UPDATE;
  IF v_comprobante.id IS NOT NULL THEN
    RAISE EXCEPTION 'campo_orden_moneda_ya_facturada' USING ERRCODE = '23505';
  END IF;

  WITH ejecuciones AS (
    SELECT l.id, l.nombre, l.codigo_interno, l.unidad, l.posicion,
      l.precio_unitario_snapshot, l.porcentaje_iva_snapshot,
      CASE WHEN l.unidad = 'fijo' THEN 1::numeric
           ELSE round(sum(pl.cantidad_ejecutada), 4) END AS cantidad
    FROM public.campo_orden_labores AS l
    JOIN public.campo_partes_trabajo AS p
      ON p.comercio_id = l.comercio_id
     AND p.orden_id = l.orden_id
     AND p.orden_labor_id = l.id
     AND p.estado = 'confirmado'
    JOIN public.campo_parte_lotes AS pl
      ON pl.comercio_id = p.comercio_id
     AND pl.parte_id = p.id
     AND pl.activo
    JOIN public.campo_orden_labor_lotes AS oll
      ON oll.comercio_id = l.comercio_id
     AND oll.id = pl.orden_labor_lote_id
     AND oll.orden_labor_id = l.id
     AND oll.activo IS TRUE
    WHERE l.comercio_id = v_orden.comercio_id
      AND l.orden_id = v_orden.id
      AND l.activo
      AND l.facturable
      AND l.moneda_snapshot = p_moneda
    GROUP BY l.id, l.nombre, l.codigo_interno, l.unidad, l.posicion,
      l.precio_unitario_snapshot, l.porcentaje_iva_snapshot
    HAVING (l.unidad = 'fijo' AND count(pl.id) > 0)
      OR (l.unidad <> 'fijo' AND coalesce(sum(pl.cantidad_ejecutada), 0) > 0)
  ), lineas AS (
    SELECT e.*, round(e.cantidad * e.precio_unitario_snapshot, 2) AS total_linea
    FROM ejecuciones AS e
  )
  SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'descripcion_manual', nombre, 'codigo_manual', codigo_interno,
      'cantidad', cantidad, 'precio_unitario', precio_unitario_snapshot,
      'porcentaje_iva', porcentaje_iva_snapshot, 'afecta_stock', false
    )) ORDER BY posicion, id), round(sum(total_linea), 2)
  INTO v_items, v_total_estimado
  FROM lineas;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0
     OR v_total_estimado IS NULL OR v_total_estimado <= 0 THEN
    RAISE EXCEPTION 'campo_orden_sin_ejecucion_facturable' USING ERRCODE = '22023';
  END IF;
  IF p_modalidad = 'transferencia' THEN
    v_pagos := jsonb_build_array(jsonb_build_object('tipo_pago', 'transferencia', 'monto', v_total_estimado));
  ELSE
    v_pagos := '[]'::jsonb;
  END IF;

  SELECT * INTO v_venta
  FROM public.registrar_venta_transaccional(
    v_orden.comercio_id, p_tipo_comprobante, p_punto_venta,
    v_orden.cliente_id, v_cliente_nombre, p_moneda,
    CASE WHEN p_modalidad = 'transferencia' THEN 'contado' ELSE 'cta_cte' END,
    v_items, v_pagos, p_idempotency_key, now(),
    'Generada desde orden Campo ' || v_orden.numero::text
  );

  INSERT INTO public.campo_orden_comprobantes (
    comercio_id, orden_id, venta_id, moneda, idempotency_key, huella_pedido,
    estado, created_by
  ) VALUES (
    v_orden.comercio_id, v_orden.id, v_venta.id, p_moneda, p_idempotency_key,
    v_huella, 'vigente', auth.uid()
  ) RETURNING * INTO v_comprobante;

  RETURN QUERY SELECT v_venta, v_comprobante, v_venta.moneda,
    v_venta.subtotal, v_venta.total_iva, v_venta.total;
END;
$function$;

REVOKE ALL ON FUNCTION public.campo_facturar_orden(uuid, text, public.tipo_comprobante, integer, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campo_facturar_orden(uuid, text, public.tipo_comprobante, integer, text, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.campo_facturar_orden(uuid, text, public.tipo_comprobante, integer, text, uuid) IS
  'Factura labores Campo confirmadas y facturables por moneda, reutilizando registrar_venta_transaccional. Solo administradores; transferencia genera un unico pago transferencia y cta_cte un unico debito. Excluye asignaciones planificadas inactivas. Sin caja, stock, Mercado Pago ni CAE/ARCA.';

COMMIT;
