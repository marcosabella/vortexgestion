-- Privacidad de costos: solo DDL, permisos y lecturas administrativas.
-- Esquema inspeccionado: 20260902130000 y alteraciones hasta 20260904160000.
-- Las listas incluyen TODAS las columnas operativas, incluida auditoria.
BEGIN;

REVOKE SELECT ON TABLE public.campo_operarios, public.campo_maquinarias,
  public.campo_insumos, public.campo_parte_operarios,
  public.campo_parte_maquinarias, public.campo_parte_insumos
FROM PUBLIC, anon, authenticated;
-- Revocar tambien eventuales permisos monetarios por columna.
REVOKE SELECT (costo_hora, moneda_costo) ON public.campo_operarios FROM PUBLIC, anon, authenticated;
REVOKE SELECT (costo_hora, moneda_costo) ON public.campo_maquinarias FROM PUBLIC, anon, authenticated;
REVOKE SELECT (costo_unitario, moneda_costo) ON public.campo_insumos FROM PUBLIC, anon, authenticated;
REVOKE SELECT (costo_hora_snapshot, moneda_costo_snapshot) ON public.campo_parte_operarios FROM PUBLIC, anon, authenticated;
REVOKE SELECT (costo_hora_snapshot, moneda_costo_snapshot) ON public.campo_parte_maquinarias FROM PUBLIC, anon, authenticated;
REVOKE SELECT (costo_unitario_snapshot, moneda_costo_snapshot) ON public.campo_parte_insumos FROM PUBLIC, anon, authenticated;

GRANT SELECT (id, comercio_id, nombre, codigo_interno, documento, telefono,
  user_id, observaciones, activo, created_by, updated_by, created_at, updated_at)
ON public.campo_operarios TO authenticated;
GRANT SELECT (id, comercio_id, nombre, codigo_interno, tipo, marca, modelo,
  identificacion, anio, observaciones, activo, created_by, updated_by, created_at, updated_at)
ON public.campo_maquinarias TO authenticated;
GRANT SELECT (id, comercio_id, nombre, codigo_interno, unidad, observaciones,
  activo, created_by, updated_by, created_at, updated_at)
ON public.campo_insumos TO authenticated;
GRANT SELECT (id, comercio_id, parte_id, operario_id, funcion, horas_trabajadas,
  observaciones, activo, created_by, updated_by, created_at, updated_at)
ON public.campo_parte_operarios TO authenticated;
GRANT SELECT (id, comercio_id, parte_id, maquinaria_id, horas_uso, lectura_inicial,
  lectura_final, unidad_lectura, observaciones, activo, created_by, updated_by, created_at, updated_at)
ON public.campo_parte_maquinarias TO authenticated;
GRANT SELECT (id, comercio_id, parte_id, insumo_id, cantidad, unidad,
  observaciones, activo, created_by, updated_by, created_at, updated_at)
ON public.campo_parte_insumos TO authenticated;
-- Sin cambios a UPDATE ni a las politicas administrativas de catalogos.
-- SELECT * queda prohibido; el frontend actual usa proyecciones operativas.

DROP POLICY campo_parte_otros_costos_select_miembros ON public.campo_parte_otros_costos;
DROP POLICY campo_parte_otros_costos_insert_editor ON public.campo_parte_otros_costos;
DROP POLICY campo_parte_otros_costos_update_editor ON public.campo_parte_otros_costos;
CREATE POLICY campo_parte_otros_costos_select_admin
ON public.campo_parte_otros_costos FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL AND public.user_is_comercio_admin(comercio_id));
CREATE POLICY campo_parte_otros_costos_insert_admin
ON public.campo_parte_otros_costos FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND public.user_is_comercio_admin(comercio_id));
CREATE POLICY campo_parte_otros_costos_update_admin
ON public.campo_parte_otros_costos FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL AND public.user_is_comercio_admin(comercio_id))
WITH CHECK (auth.uid() IS NOT NULL AND public.user_is_comercio_admin(comercio_id));
-- Los grants limitados de INSERT/UPDATE y el trigger de borrador siguen vigentes.
-- No existe politica ni permiso DELETE. Helpers solo internos.
REVOKE ALL ON FUNCTION public.campo_puede_editar_parte(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campo_parte_costo_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campo_validate_parte_otro_costo() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.campo_costos_operarios(p_comercio_id uuid)
RETURNS TABLE (id uuid, costo numeric, moneda text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'campo_costos_no_disponibles' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT c.id, c.costo_hora, c.moneda_costo::text
  FROM public.campo_operarios AS c WHERE c.comercio_id = p_comercio_id ORDER BY c.id;
END;
$function$;

CREATE FUNCTION public.campo_costos_maquinarias(p_comercio_id uuid)
RETURNS TABLE (id uuid, costo numeric, moneda text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'campo_costos_no_disponibles' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT c.id, c.costo_hora, c.moneda_costo::text
  FROM public.campo_maquinarias AS c WHERE c.comercio_id = p_comercio_id ORDER BY c.id;
END;
$function$;

CREATE FUNCTION public.campo_costos_insumos(p_comercio_id uuid)
RETURNS TABLE (id uuid, costo numeric, moneda text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'campo_costos_no_disponibles' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT c.id, c.costo_unitario, c.moneda_costo::text
  FROM public.campo_insumos AS c WHERE c.comercio_id = p_comercio_id ORDER BY c.id;
END;
$function$;

-- Contrato JSONB v1:
-- parte_id, comercio_id, orden_id, estado, incluido_en_totales_efectivos;
-- detalles[]: categoria, id (detalle), recurso_id (NULL en otros), concepto,
-- cantidad (horas en operarios/maquinarias), unidad, costo, moneda,
-- costo_desconocido, motivos_desconocido[], subtotal (NULL si desconocido).
-- subtotales[]: categoria + moneda (NULL = sin snapshot), subtotal_conocido,
-- total_efectivo_conocido, cantidad_desconocidos. Solo grupos presentes.
-- totales[]: ARS y USD siempre, subtotal_conocido, total_efectivo_conocido,
-- cantidad_desconocidos (con moneda conocida).
-- cantidad_desconocidos y cantidad_desconocidos_sin_moneda globales evitan
-- interpretar sumas parciales como completas. Cero conocido no implica costo cero.
-- Sólo partes confirmados integran costos efectivos; los demás estados conservan costos cargados como información provisional o histórica.
-- Solo filas activas; snapshots exclusivamente, sin consultar costos de catalogo.
CREATE FUNCTION public.campo_costos_parte(p_parte_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_comercio_id uuid;
  v_orden_id uuid;
  v_estado text;
  v_incluido boolean;
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'campo_costos_no_disponibles' USING ERRCODE = '42501';
  END IF;
  SELECT p.comercio_id, p.orden_id, p.estado
  INTO v_comercio_id, v_orden_id, v_estado
  FROM public.campo_partes_trabajo AS p WHERE p.id = p_parte_id;
  IF NOT FOUND OR public.user_is_comercio_admin(v_comercio_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'campo_costos_no_disponibles' USING ERRCODE = '42501';
  END IF;
  v_incluido := v_estado = 'confirmado';

  WITH base AS (
    SELECT 'operarios'::text AS categoria, d.id, d.operario_id AS recurso_id,
      NULL::text AS concepto, d.horas_trabajadas AS cantidad, 'hora'::text AS unidad,
      d.costo_hora_snapshot AS costo, d.moneda_costo_snapshot::text AS moneda
    FROM public.campo_parte_operarios AS d
    WHERE d.parte_id = p_parte_id AND d.comercio_id = v_comercio_id AND d.activo
    UNION ALL
    SELECT 'maquinarias', d.id, d.maquinaria_id, NULL::text, d.horas_uso, 'hora',
      d.costo_hora_snapshot, d.moneda_costo_snapshot::text
    FROM public.campo_parte_maquinarias AS d
    WHERE d.parte_id = p_parte_id AND d.comercio_id = v_comercio_id AND d.activo
    UNION ALL
    SELECT 'insumos', d.id, d.insumo_id, NULL::text, d.cantidad, d.unidad,
      d.costo_unitario_snapshot, d.moneda_costo_snapshot::text
    FROM public.campo_parte_insumos AS d
    WHERE d.parte_id = p_parte_id AND d.comercio_id = v_comercio_id AND d.activo
    UNION ALL
    SELECT 'otros', d.id, NULL::uuid, d.concepto, d.cantidad, NULL::text,
      d.costo_unitario, d.moneda::text
    FROM public.campo_parte_otros_costos AS d
    WHERE d.parte_id = p_parte_id AND d.comercio_id = v_comercio_id AND d.activo
  ), detalles AS (
    SELECT b.*,
      (cantidad IS NULL OR cantidad = 'NaN'::numeric OR costo IS NULL OR moneda IS NULL) AS costo_desconocido,
      array_remove(ARRAY[
        CASE WHEN cantidad IS NULL THEN 'faltan_horas' END,
        CASE WHEN cantidad = 'NaN'::numeric THEN 'cantidad_invalida' END,
        CASE WHEN costo IS NULL OR moneda IS NULL THEN 'falta_snapshot' END
      ], NULL) AS motivos_desconocido,
      CASE WHEN cantidad IS NOT NULL AND cantidad <> 'NaN'::numeric
        AND costo IS NOT NULL AND moneda IS NOT NULL THEN cantidad * costo END AS subtotal
    FROM base AS b
  ), grupos AS (
    SELECT categoria, moneda, coalesce(sum(subtotal), 0) AS subtotal_conocido,
      CASE WHEN v_incluido THEN coalesce(sum(subtotal), 0) ELSE 0 END AS total_efectivo_conocido,
      count(*) FILTER (WHERE costo_desconocido) AS cantidad_desconocidos
    FROM detalles GROUP BY categoria, moneda
  ), totales AS (
    SELECT m.moneda, coalesce(sum(d.subtotal), 0) AS subtotal_conocido,
      CASE WHEN v_incluido THEN coalesce(sum(d.subtotal), 0) ELSE 0 END AS total_efectivo_conocido,
      count(*) FILTER (WHERE d.costo_desconocido) AS cantidad_desconocidos
    FROM (VALUES ('ARS'::text), ('USD'::text)) AS m(moneda)
    LEFT JOIN detalles AS d ON d.moneda = m.moneda GROUP BY m.moneda
  )
  SELECT jsonb_build_object(
    'version', 1, 'parte_id', p_parte_id, 'comercio_id', v_comercio_id,
    'orden_id', v_orden_id, 'estado', v_estado,
    'incluido_en_totales_efectivos', v_incluido,
    'detalles', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.categoria, d.moneda, d.id) FROM detalles AS d), '[]'::jsonb),
    'subtotales', coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.categoria, g.moneda) FROM grupos AS g), '[]'::jsonb),
    'totales', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.moneda) FROM totales AS t),
    'cantidad_desconocidos', (SELECT count(*) FROM detalles WHERE costo_desconocido),
    'cantidad_desconocidos_sin_moneda', (SELECT count(*) FROM detalles WHERE costo_desconocido AND moneda IS NULL)
  ) INTO v_resultado;
  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.campo_costos_operarios(uuid),
  public.campo_costos_maquinarias(uuid), public.campo_costos_insumos(uuid),
  public.campo_costos_parte(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campo_costos_operarios(uuid),
  public.campo_costos_maquinarias(uuid), public.campo_costos_insumos(uuid),
  public.campo_costos_parte(uuid) TO authenticated;

COMMENT ON FUNCTION public.campo_costos_operarios(uuid) IS
  'Solo admin del comercio: id, costo, moneda; incluye activos e inactivos. NULL = desconocido.';
COMMENT ON FUNCTION public.campo_costos_maquinarias(uuid) IS
  'Solo admin del comercio: id, costo, moneda; incluye activos e inactivos. NULL = desconocido.';
COMMENT ON FUNCTION public.campo_costos_insumos(uuid) IS
  'Solo admin del comercio: id, costo, moneda; incluye activos e inactivos. NULL = desconocido.';
COMMENT ON FUNCTION public.campo_costos_parte(uuid) IS
  'JSONB v1 documentado en la migracion: detalles activos historicos, subtotales por categoria/moneda y totales ARS/USD sin conversion. Sumas conocidas parciales con contadores de desconocidos. Sólo partes confirmados integran costos efectivos; los demás estados conservan costos cargados como información provisional o histórica. Solo admin del tenant derivado del parte. Sin escrituras.';

COMMIT;
