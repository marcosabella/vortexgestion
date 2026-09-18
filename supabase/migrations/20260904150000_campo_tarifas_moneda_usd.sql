-- Amplia las monedas comerciales sin modificar registros existentes.
-- ARS y USD son las unicas monedas admitidas actualmente.
-- La UI puede mostrar USD como "U$S", pero siempre debe persistir USD.
-- Nunca deben sumarse importes de monedas diferentes.
-- Los snapshots conservan la moneda historica aunque cambie la tarifa.
-- No se implementan conversiones monetarias ni tipos de cambio.
-- Los UPDATE del cuerpo de la RPC se ejecutan solo al invocarla,
-- nunca al aplicar esta migracion. No hay DML ni backfill de datos aqui.

BEGIN;

ALTER TABLE public.campo_tarifas
  DROP CONSTRAINT campo_tarifas_moneda_ars,
  ADD CONSTRAINT campo_tarifas_moneda_valida
    CHECK (moneda IN ('ARS', 'USD'));

ALTER TABLE public.campo_orden_labores
  DROP CONSTRAINT campo_orden_labores_moneda_snapshot_valida,
  DROP CONSTRAINT campo_orden_labores_facturacion_coherente,
  ADD CONSTRAINT campo_orden_labores_moneda_snapshot_valida
    CHECK (moneda_snapshot IS NULL OR moneda_snapshot IN ('ARS', 'USD')),
  ADD CONSTRAINT campo_orden_labores_facturacion_coherente CHECK (
    (NOT facturable
      AND tarifa_id IS NULL
      AND precio_unitario_snapshot IS NULL
      AND porcentaje_iva_snapshot IS NULL
      AND moneda_snapshot IS NULL
      AND precio_origen IS NULL)
    OR (
      facturable
      AND precio_unitario_snapshot IS NOT NULL
      AND porcentaje_iva_snapshot IS NOT NULL
      AND moneda_snapshot IS NOT NULL
      AND moneda_snapshot IN ('ARS', 'USD')
      AND precio_origen IS NOT NULL
      AND (
        (precio_origen IN ('general', 'cliente', 'establecimiento') AND tarifa_id IS NOT NULL)
        OR (precio_origen = 'manual' AND tarifa_id IS NULL)
      )
    )
  );

-- Reemplazo exacto, sin CASCADE ni overload de cinco parametros.
-- El sexto parametro opcional mantiene compatibles las llamadas actuales.
DROP FUNCTION public.campo_configurar_precio_labor(uuid, uuid, numeric, numeric, boolean);

CREATE FUNCTION public.campo_configurar_precio_labor(
  p_orden_labor_id uuid,
  p_tarifa_id uuid DEFAULT NULL,
  p_precio_manual numeric DEFAULT NULL,
  p_porcentaje_iva_manual numeric DEFAULT NULL,
  p_facturable boolean DEFAULT true,
  p_moneda_manual text DEFAULT NULL
)
RETURNS public.campo_orden_labores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_pre record;
  v_orden public.campo_ordenes_trabajo;
  v_labor public.campo_orden_labores;
  v_tarifa public.campo_tarifas;
  v_hoy date := CURRENT_DATE;
  v_moneda_manual text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF p_facturable IS NULL THEN RAISE EXCEPTION 'campo_labor_facturable_requiere_precio'; END IF;

  SELECT l.orden_id, l.comercio_id INTO v_pre
  FROM public.campo_orden_labores AS l WHERE l.id = p_orden_labor_id;
  IF v_pre.orden_id IS NULL THEN RAISE EXCEPTION 'campo_labor_no_disponible'; END IF;

  SELECT o.* INTO v_orden
  FROM public.campo_ordenes_trabajo AS o
  WHERE o.id = v_pre.orden_id AND o.comercio_id = v_pre.comercio_id
  FOR UPDATE;
  SELECT l.* INTO v_labor
  FROM public.campo_orden_labores AS l
  WHERE l.id = p_orden_labor_id
    AND l.orden_id = v_orden.id
    AND l.comercio_id = v_orden.comercio_id
  FOR UPDATE;

  IF v_labor.id IS NULL OR public.user_is_comercio_admin(v_labor.comercio_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'campo_labor_no_disponible';
  END IF;
  IF v_orden.estado <> 'borrador' THEN RAISE EXCEPTION 'campo_orden_no_editable'; END IF;

  -- Regla compatible con la version anterior: no facturable ignora todos
  -- los parametros comerciales, incluida moneda manual, aun si son invalidos.
  -- Autenticacion, administrador y borrador se verifican antes de limpiar.
  IF NOT p_facturable THEN
    UPDATE public.campo_orden_labores
    SET facturable = false, tarifa_id = NULL, precio_unitario_snapshot = NULL,
        porcentaje_iva_snapshot = NULL, moneda_snapshot = NULL, precio_origen = NULL
    WHERE id = v_labor.id AND comercio_id = v_labor.comercio_id
    RETURNING * INTO v_labor;
    RETURN v_labor;
  END IF;

  IF p_tarifa_id IS NOT NULL THEN
    IF p_precio_manual IS NOT NULL OR p_porcentaje_iva_manual IS NOT NULL OR p_moneda_manual IS NOT NULL THEN
      RAISE EXCEPTION 'campo_precio_manual_invalido';
    END IF;
    SELECT t.* INTO v_tarifa FROM public.campo_tarifas AS t
    WHERE t.id = p_tarifa_id AND t.comercio_id = v_labor.comercio_id;
    IF v_tarifa.id IS NULL THEN RAISE EXCEPTION 'campo_tarifa_no_disponible'; END IF;
    IF NOT v_tarifa.activo THEN RAISE EXCEPTION 'campo_tarifa_no_disponible'; END IF;
    IF v_tarifa.vigente_desde > v_hoy OR (v_tarifa.vigente_hasta IS NOT NULL AND v_tarifa.vigente_hasta < v_hoy) THEN
      RAISE EXCEPTION 'campo_tarifa_fuera_vigencia';
    END IF;
    IF v_tarifa.unidad IS DISTINCT FROM v_labor.unidad THEN RAISE EXCEPTION 'campo_tarifa_unidad_incompatible'; END IF;
    IF NOT (
      (v_tarifa.nivel = 'general' AND v_tarifa.cliente_id IS NULL AND v_tarifa.establecimiento_id IS NULL)
      OR (v_tarifa.nivel = 'cliente' AND v_tarifa.cliente_id = v_orden.cliente_id AND v_tarifa.establecimiento_id IS NULL)
      OR (v_tarifa.nivel = 'establecimiento' AND v_tarifa.cliente_id = v_orden.cliente_id AND v_tarifa.establecimiento_id = v_orden.establecimiento_id)
    ) THEN RAISE EXCEPTION 'campo_tarifa_alcance_incompatible'; END IF;

    UPDATE public.campo_orden_labores
    SET facturable = true, tarifa_id = v_tarifa.id,
        precio_unitario_snapshot = v_tarifa.precio_unitario,
        porcentaje_iva_snapshot = v_tarifa.porcentaje_iva,
        moneda_snapshot = v_tarifa.moneda, precio_origen = v_tarifa.nivel
    WHERE id = v_labor.id AND comercio_id = v_labor.comercio_id
    RETURNING * INTO v_labor;
  ELSE
    IF p_precio_manual IS NULL
       OR p_precio_manual = 'NaN'::numeric
       OR p_precio_manual < 0 THEN
      RAISE EXCEPTION 'campo_precio_manual_invalido';
    END IF;
    IF p_porcentaje_iva_manual IS NULL OR p_porcentaje_iva_manual = 'NaN'::numeric OR p_porcentaje_iva_manual < 0 OR p_porcentaje_iva_manual > 100 THEN
      RAISE EXCEPTION 'campo_iva_invalido';
    END IF;
    -- Sin moneda explicita, las llamadas del frontend actual conservan ARS.
    -- No se normalizan variantes visuales: solo se aceptan codigos ISO exactos.
    v_moneda_manual := COALESCE(p_moneda_manual, 'ARS');
    IF v_moneda_manual NOT IN ('ARS', 'USD') THEN
      RAISE EXCEPTION 'campo_moneda_manual_invalida';
    END IF;
    UPDATE public.campo_orden_labores
    SET facturable = true, tarifa_id = NULL,
        precio_unitario_snapshot = p_precio_manual,
        porcentaje_iva_snapshot = p_porcentaje_iva_manual,
        moneda_snapshot = v_moneda_manual, precio_origen = 'manual'
    WHERE id = v_labor.id AND comercio_id = v_labor.comercio_id
    RETURNING * INTO v_labor;
  END IF;
  RETURN v_labor;
END;
$function$;

REVOKE ALL ON FUNCTION public.campo_configurar_precio_labor(uuid, uuid, numeric, numeric, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campo_configurar_precio_labor(uuid, uuid, numeric, numeric, boolean, text) TO authenticated;

COMMENT ON FUNCTION public.campo_configurar_precio_labor(uuid, uuid, numeric, numeric, boolean, text) IS
  'Configura o limpia snapshots comerciales; solo administradores y orden en borrador. Tarifa copia su moneda; manual admite ARS o USD y omitir moneda mantiene ARS. No facturable ignora parametros comerciales y limpia todos los snapshots. No suma ni convierte monedas.';
COMMENT ON COLUMN public.campo_tarifas.moneda IS
  'Codigo ISO: solo ARS o USD. La UI puede mostrar USD como U$S, pero persiste USD. Nunca sumar importes de monedas diferentes.';
COMMENT ON COLUMN public.campo_orden_labores.moneda_snapshot IS
  'Moneda historica ARS o USD de la labor facturable; NULL si no facturable. Se conserva aunque cambie la tarifa. Nunca sumar importes de monedas diferentes ni convertirlos implicitamente.';

COMMIT;
