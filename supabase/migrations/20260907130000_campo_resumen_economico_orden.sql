-- Resumen economico administrativo por orden. Solo lectura; no persiste totales.
-- ARS y USD se mantienen separados y no se realiza conversion monetaria.

CREATE FUNCTION public.campo_resumen_economico_orden(p_orden_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_comercio_id uuid;
  v_estado text;
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'campo_resumen_no_disponible' USING ERRCODE = '42501';
  END IF;

  SELECT o.comercio_id, o.estado
  INTO v_comercio_id, v_estado
  FROM public.campo_ordenes_trabajo AS o
  WHERE o.id = p_orden_id;

  IF NOT FOUND
    OR public.user_is_comercio_admin(v_comercio_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'campo_resumen_no_disponible' USING ERRCODE = '42501';
  END IF;

  WITH labores AS (
    SELECT l.id, l.nombre, l.codigo_interno, l.unidad, l.posicion,
      l.precio_unitario_snapshot AS precio, l.porcentaje_iva_snapshot AS porcentaje_iva,
      l.moneda_snapshot::text AS moneda
    FROM public.campo_orden_labores AS l
    WHERE l.comercio_id = v_comercio_id
      AND l.orden_id = p_orden_id
      AND l.activo
      AND l.facturable
  ), ingresos_base AS (
    SELECT l.*,
      CASE WHEN l.unidad = 'fijo' THEN l.precio
        ELSE coalesce((
          SELECT sum(a.cantidad_planificada)
          FROM public.campo_orden_labor_lotes AS a
          WHERE a.comercio_id = v_comercio_id
            AND a.orden_labor_id = l.id
            AND a.activo
        ), 0) * l.precio END AS previsto_neto,
      CASE WHEN l.unidad = 'fijo' THEN
        CASE WHEN EXISTS (
          SELECT 1
          FROM public.campo_partes_trabajo AS p
          JOIN public.campo_parte_lotes AS pl
            ON pl.comercio_id = p.comercio_id
            AND pl.parte_id = p.id
            AND pl.activo
          WHERE p.comercio_id = v_comercio_id
            AND p.orden_id = p_orden_id
            AND p.orden_labor_id = l.id
            AND p.estado = 'confirmado'
        ) THEN l.precio ELSE 0 END
        ELSE coalesce((
          SELECT sum(pl.cantidad_ejecutada)
          FROM public.campo_partes_trabajo AS p
          JOIN public.campo_parte_lotes AS pl
            ON pl.comercio_id = p.comercio_id
            AND pl.parte_id = p.id
            AND pl.activo
          WHERE p.comercio_id = v_comercio_id
            AND p.orden_id = p_orden_id
            AND p.orden_labor_id = l.id
            AND p.estado = 'confirmado'
        ), 0) * l.precio END AS efectivo_neto
    FROM labores AS l
  ), ingresos AS (
    SELECT b.*,
      round(b.previsto_neto * b.porcentaje_iva / 100, 2) AS previsto_iva,
      round(b.efectivo_neto * b.porcentaje_iva / 100, 2) AS efectivo_iva
    FROM ingresos_base AS b
  ), costos_base AS (
    SELECT d.horas_trabajadas AS cantidad, d.costo_hora_snapshot AS costo,
      d.moneda_costo_snapshot::text AS moneda
    FROM public.campo_partes_trabajo AS p
    JOIN public.campo_parte_operarios AS d
      ON d.comercio_id = p.comercio_id AND d.parte_id = p.id AND d.activo
    WHERE p.comercio_id = v_comercio_id AND p.orden_id = p_orden_id AND p.estado = 'confirmado'
    UNION ALL
    SELECT d.horas_uso, d.costo_hora_snapshot, d.moneda_costo_snapshot::text
    FROM public.campo_partes_trabajo AS p
    JOIN public.campo_parte_maquinarias AS d
      ON d.comercio_id = p.comercio_id AND d.parte_id = p.id AND d.activo
    WHERE p.comercio_id = v_comercio_id AND p.orden_id = p_orden_id AND p.estado = 'confirmado'
    UNION ALL
    SELECT d.cantidad, d.costo_unitario_snapshot, d.moneda_costo_snapshot::text
    FROM public.campo_partes_trabajo AS p
    JOIN public.campo_parte_insumos AS d
      ON d.comercio_id = p.comercio_id AND d.parte_id = p.id AND d.activo
    WHERE p.comercio_id = v_comercio_id AND p.orden_id = p_orden_id AND p.estado = 'confirmado'
    UNION ALL
    SELECT d.cantidad, d.costo_unitario, d.moneda::text
    FROM public.campo_partes_trabajo AS p
    JOIN public.campo_parte_otros_costos AS d
      ON d.comercio_id = p.comercio_id AND d.parte_id = p.id AND d.activo
    WHERE p.comercio_id = v_comercio_id AND p.orden_id = p_orden_id AND p.estado = 'confirmado'
  ), costos AS (
    SELECT c.*,
      (c.cantidad IS NULL OR c.cantidad = 'NaN'::numeric
        OR c.costo IS NULL OR c.costo = 'NaN'::numeric OR c.moneda IS NULL) AS desconocido,
      CASE WHEN c.cantidad IS NOT NULL AND c.cantidad <> 'NaN'::numeric
        AND c.costo IS NOT NULL AND c.costo <> 'NaN'::numeric AND c.moneda IS NOT NULL
        THEN c.cantidad * c.costo END AS subtotal
    FROM costos_base AS c
  ), ingresos_totales AS (
    SELECT i.moneda, sum(i.previsto_neto) AS previsto_neto,
      sum(i.previsto_iva) AS previsto_iva, sum(i.efectivo_neto) AS efectivo_neto,
      sum(i.efectivo_iva) AS efectivo_iva
    FROM ingresos AS i
    GROUP BY i.moneda
  ), costos_totales AS (
    SELECT c.moneda, sum(c.subtotal) AS costo_efectivo_conocido,
      count(*) FILTER (WHERE c.desconocido) AS cantidad_costos_desconocidos
    FROM costos AS c
    WHERE c.moneda IS NOT NULL
    GROUP BY c.moneda
  ), costos_desconocidos_sin_moneda AS (
    SELECT count(*) AS cantidad
    FROM costos AS c
    WHERE c.desconocido AND c.moneda IS NULL
  ), totales AS (
    SELECT m.moneda,
      coalesce(i.previsto_neto, 0) AS previsto_neto,
      coalesce(i.previsto_iva, 0) AS previsto_iva,
      coalesce(i.efectivo_neto, 0) AS efectivo_neto,
      coalesce(i.efectivo_iva, 0) AS efectivo_iva,
      coalesce(c.costo_efectivo_conocido, 0) AS costo_efectivo_conocido,
      coalesce(c.cantidad_costos_desconocidos, 0) + s.cantidad AS cantidad_costos_desconocidos
    FROM (VALUES ('ARS'::text), ('USD'::text)) AS m(moneda)
    LEFT JOIN ingresos_totales AS i ON i.moneda = m.moneda
    LEFT JOIN costos_totales AS c ON c.moneda = m.moneda
    CROSS JOIN costos_desconocidos_sin_moneda AS s
  )
  SELECT jsonb_build_object(
    'version', 1,
    'orden_id', p_orden_id,
    'comercio_id', v_comercio_id,
    'estado', v_estado,
    'ingresos_por_labor', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'labor_id', i.id, 'nombre', i.nombre, 'codigo_interno', i.codigo_interno,
        'unidad', i.unidad, 'moneda', i.moneda, 'porcentaje_iva', i.porcentaje_iva,
        'neto_previsto', i.previsto_neto, 'iva_previsto', i.previsto_iva,
        'total_previsto', round(i.previsto_neto + i.previsto_iva, 2),
        'neto_efectivo', i.efectivo_neto, 'iva_efectivo', i.efectivo_iva,
        'total_efectivo', round(i.efectivo_neto + i.efectivo_iva, 2)
      ) ORDER BY i.posicion, i.id)
      FROM ingresos AS i
    ), '[]'::jsonb),
    'totales_por_moneda', coalesce((
      SELECT jsonb_object_agg(t.moneda, jsonb_build_object(
        'previsto_neto', t.previsto_neto,
        'previsto_iva', round(t.previsto_iva, 2),
        'previsto_total', round(t.previsto_neto + t.previsto_iva, 2),
        'efectivo_neto', t.efectivo_neto,
        'efectivo_iva', round(t.efectivo_iva, 2),
        'efectivo_total', round(t.efectivo_neto + t.efectivo_iva, 2),
        'costo_efectivo_conocido', t.costo_efectivo_conocido,
        'cantidad_costos_desconocidos', t.cantidad_costos_desconocidos,
        'margen_conocido', t.efectivo_neto - t.costo_efectivo_conocido,
        'margen_completo', t.cantidad_costos_desconocidos = 0
      ))
      FROM totales AS t
    ), '{"ARS": {"previsto_neto": 0, "previsto_iva": 0, "previsto_total": 0, "efectivo_neto": 0, "efectivo_iva": 0, "efectivo_total": 0, "costo_efectivo_conocido": 0, "cantidad_costos_desconocidos": 0, "margen_conocido": 0, "margen_completo": true}, "USD": {"previsto_neto": 0, "previsto_iva": 0, "previsto_total": 0, "efectivo_neto": 0, "efectivo_iva": 0, "efectivo_total": 0, "costo_efectivo_conocido": 0, "cantidad_costos_desconocidos": 0, "margen_conocido": 0, "margen_completo": true}}'::jsonb),
    'advertencias', coalesce((
      SELECT jsonb_agg(a.mensaje ORDER BY a.mensaje)
      FROM (
        SELECT DISTINCT 'Existen costos efectivos con datos incompletos; el margen conocido no representa el margen definitivo.'::text AS mensaje
        FROM costos AS c WHERE c.desconocido
      ) AS a
    ), '[]'::jsonb)
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.campo_resumen_economico_orden(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campo_resumen_economico_orden(uuid) TO authenticated;

COMMENT ON FUNCTION public.campo_resumen_economico_orden(uuid) IS
  'JSONB v1 de solo lectura para administradores: ingresos por labor con snapshots comerciales y costos de partes confirmados con snapshots historicos. ARS y USD separados, sin conversion. El margen usa ingreso neto; costos desconocidos impiden tratarlo como definitivo.';
