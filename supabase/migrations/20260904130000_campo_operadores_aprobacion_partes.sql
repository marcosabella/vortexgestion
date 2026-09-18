-- Vortex Campo - operadores propietarios, aprobacion y descarte de partes.
-- No incorpora costos, tarifas, facturacion ni cambios de frontend.

-- ---------------------------------------------------------------------------
-- Autorizacion interna. Estas funciones no se exponen a authenticated.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.campo_operario_actual(p_comercio_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE WHEN count(*) = 1 THEN min(o.id::text)::uuid ELSE NULL END
  FROM public.campo_operarios AS o
  WHERE auth.uid() IS NOT NULL
    AND o.comercio_id = p_comercio_id
    AND o.user_id = auth.uid()
    AND o.activo = true
    AND EXISTS (
      SELECT 1
      FROM public.comercio_usuarios AS cu
      WHERE cu.comercio_id = p_comercio_id
        AND cu.user_id = auth.uid()
        AND cu.activo = true
    )
$function$;

CREATE OR REPLACE FUNCTION public.campo_es_operador_vinculado(p_comercio_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.comercio_usuarios AS cu
      WHERE cu.comercio_id = p_comercio_id
        AND cu.user_id = auth.uid()
        AND cu.rol = 'operador'
        AND cu.activo = true
    )
    AND public.campo_operario_actual(p_comercio_id) IS NOT NULL
$function$;

CREATE OR REPLACE FUNCTION public.campo_puede_crear_parte(p_comercio_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.user_is_comercio_admin(p_comercio_id)
      OR public.campo_es_operador_vinculado(p_comercio_id)
    )
$function$;

CREATE OR REPLACE FUNCTION public.campo_puede_editar_parte(p_parte_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT COALESCE((
    SELECT p.estado = 'borrador'
      AND (
        public.user_is_comercio_admin(p.comercio_id)
        OR (
          p.propietario_user_id = auth.uid()
          AND public.campo_es_operador_vinculado(p.comercio_id)
        )
      )
    FROM public.campo_partes_trabajo AS p
    WHERE p.id = p_parte_id
      AND auth.uid() IS NOT NULL
  ), false)
$function$;

REVOKE ALL ON FUNCTION public.campo_operario_actual(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campo_es_operador_vinculado(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campo_puede_crear_parte(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campo_puede_editar_parte(uuid) FROM PUBLIC, anon, authenticated;

-- El propietario siempre se deriva de la sesion. El cliente no puede elegirlo.
CREATE OR REPLACE FUNCTION public.campo_protect_parte_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'campo_auth_requerida';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.propietario_user_id := v_uid;
    NEW.propietario_operario_id := public.campo_operario_actual(NEW.comercio_id);
    NEW.enviado_by := NULL;
    NEW.enviado_at := NULL;
    NEW.rechazado_by := NULL;
    NEW.rechazado_at := NULL;
    NEW.motivo_rechazo := NULL;
    NEW.descartado_by := NULL;
    NEW.descartado_at := NULL;
    NEW.motivo_descarte := NULL;
  ELSE
    IF NEW.propietario_user_id IS DISTINCT FROM OLD.propietario_user_id THEN
      RAISE EXCEPTION 'campo_propietario_user_inmutable';
    END IF;
    IF NEW.propietario_operario_id IS DISTINCT FROM OLD.propietario_operario_id THEN
      RAISE EXCEPTION 'campo_propietario_operario_inmutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.campo_protect_parte_ownership() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Proteccion de estados. Una transicion solo puede cambiar estado y sus datos
-- propios; updated_by/updated_at siguen siendo administrados por auditoria.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.campo_protect_parte_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.estado := 'borrador';
    NEW.enviado_by := NULL; NEW.enviado_at := NULL;
    NEW.rechazado_by := NULL; NEW.rechazado_at := NULL; NEW.motivo_rechazo := NULL;
    NEW.confirmado_by := NULL; NEW.confirmado_at := NULL;
    NEW.anulado_by := NULL; NEW.anulado_at := NULL; NEW.motivo_anulacion := NULL;
    NEW.descartado_by := NULL; NEW.descartado_at := NULL; NEW.motivo_descarte := NULL;
    RETURN NEW;
  END IF;

  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    IF NEW.enviado_by IS DISTINCT FROM OLD.enviado_by OR NEW.enviado_at IS DISTINCT FROM OLD.enviado_at
      OR NEW.rechazado_by IS DISTINCT FROM OLD.rechazado_by OR NEW.rechazado_at IS DISTINCT FROM OLD.rechazado_at OR NEW.motivo_rechazo IS DISTINCT FROM OLD.motivo_rechazo
      OR NEW.confirmado_by IS DISTINCT FROM OLD.confirmado_by OR NEW.confirmado_at IS DISTINCT FROM OLD.confirmado_at
      OR NEW.anulado_by IS DISTINCT FROM OLD.anulado_by OR NEW.anulado_at IS DISTINCT FROM OLD.anulado_at OR NEW.motivo_anulacion IS DISTINCT FROM OLD.motivo_anulacion
      OR NEW.descartado_by IS DISTINCT FROM OLD.descartado_by OR NEW.descartado_at IS DISTINCT FROM OLD.descartado_at OR NEW.motivo_descarte IS DISTINCT FROM OLD.motivo_descarte
    THEN RAISE EXCEPTION 'campo_fechas_estado_no_editables'; END IF;
    IF OLD.estado <> 'borrador' AND (
      NEW.fecha_trabajo IS DISTINCT FROM OLD.fecha_trabajo OR NEW.hora_inicio IS DISTINCT FROM OLD.hora_inicio OR NEW.hora_fin IS DISTINCT FROM OLD.hora_fin
      OR NEW.descripcion IS DISTINCT FROM OLD.descripcion OR NEW.observaciones IS DISTINCT FROM OLD.observaciones OR NEW.condiciones_climaticas IS DISTINCT FROM OLD.condiciones_climaticas
    ) THEN RAISE EXCEPTION 'campo_parte_congelado'; END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.comercio_id IS DISTINCT FROM OLD.comercio_id
    OR NEW.orden_id IS DISTINCT FROM OLD.orden_id OR NEW.orden_labor_id IS DISTINCT FROM OLD.orden_labor_id OR NEW.numero IS DISTINCT FROM OLD.numero
    OR NEW.fecha_trabajo IS DISTINCT FROM OLD.fecha_trabajo OR NEW.hora_inicio IS DISTINCT FROM OLD.hora_inicio OR NEW.hora_fin IS DISTINCT FROM OLD.hora_fin
    OR NEW.descripcion IS DISTINCT FROM OLD.descripcion OR NEW.observaciones IS DISTINCT FROM OLD.observaciones OR NEW.condiciones_climaticas IS DISTINCT FROM OLD.condiciones_climaticas
    OR NEW.propietario_user_id IS DISTINCT FROM OLD.propietario_user_id OR NEW.propietario_operario_id IS DISTINCT FROM OLD.propietario_operario_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN RAISE EXCEPTION 'campo_transicion_parte_modifica_datos'; END IF;

  IF NOT (
    (OLD.estado = 'borrador' AND NEW.estado IN ('enviado', 'confirmado', 'descartado'))
    OR (OLD.estado = 'enviado' AND NEW.estado IN ('confirmado', 'rechazado'))
    OR (OLD.estado = 'rechazado' AND NEW.estado IN ('borrador', 'descartado'))
    OR (OLD.estado = 'confirmado' AND NEW.estado = 'anulado')
  ) THEN RAISE EXCEPTION 'campo_transicion_parte_no_habilitada'; END IF;

  IF OLD.estado = 'borrador' AND NEW.estado = 'enviado' THEN
    IF NEW.enviado_by IS DISTINCT FROM v_uid OR NEW.enviado_at IS NULL THEN RAISE EXCEPTION 'campo_envio_incompleto'; END IF;
    IF NEW.rechazado_by IS DISTINCT FROM OLD.rechazado_by OR NEW.rechazado_at IS DISTINCT FROM OLD.rechazado_at OR NEW.motivo_rechazo IS DISTINCT FROM OLD.motivo_rechazo
      OR NEW.confirmado_by IS DISTINCT FROM OLD.confirmado_by OR NEW.confirmado_at IS DISTINCT FROM OLD.confirmado_at
      OR NEW.anulado_by IS DISTINCT FROM OLD.anulado_by OR NEW.anulado_at IS DISTINCT FROM OLD.anulado_at OR NEW.motivo_anulacion IS DISTINCT FROM OLD.motivo_anulacion
      OR NEW.descartado_by IS DISTINCT FROM OLD.descartado_by OR NEW.descartado_at IS DISTINCT FROM OLD.descartado_at OR NEW.motivo_descarte IS DISTINCT FROM OLD.motivo_descarte
    THEN RAISE EXCEPTION 'campo_envio_modifica_auditoria'; END IF;
  ELSIF OLD.estado = 'borrador' AND NEW.estado = 'confirmado' THEN
    IF NEW.confirmado_by IS DISTINCT FROM v_uid OR NEW.confirmado_at IS NULL THEN RAISE EXCEPTION 'campo_confirmacion_incompleta'; END IF;
    IF NEW.enviado_by IS DISTINCT FROM OLD.enviado_by OR NEW.enviado_at IS DISTINCT FROM OLD.enviado_at
      OR NEW.rechazado_by IS DISTINCT FROM OLD.rechazado_by OR NEW.rechazado_at IS DISTINCT FROM OLD.rechazado_at OR NEW.motivo_rechazo IS DISTINCT FROM OLD.motivo_rechazo
      OR NEW.anulado_by IS DISTINCT FROM OLD.anulado_by OR NEW.anulado_at IS DISTINCT FROM OLD.anulado_at OR NEW.motivo_anulacion IS DISTINCT FROM OLD.motivo_anulacion
      OR NEW.descartado_by IS DISTINCT FROM OLD.descartado_by OR NEW.descartado_at IS DISTINCT FROM OLD.descartado_at OR NEW.motivo_descarte IS DISTINCT FROM OLD.motivo_descarte
    THEN RAISE EXCEPTION 'campo_confirmacion_modifica_auditoria'; END IF;
  ELSIF OLD.estado = 'borrador' AND NEW.estado = 'descartado' THEN
    IF NEW.descartado_by IS DISTINCT FROM v_uid OR NEW.descartado_at IS NULL OR NEW.motivo_descarte IS NULL OR btrim(NEW.motivo_descarte) = '' THEN RAISE EXCEPTION 'campo_descarte_incompleto'; END IF;
    IF NEW.enviado_by IS DISTINCT FROM OLD.enviado_by OR NEW.enviado_at IS DISTINCT FROM OLD.enviado_at
      OR NEW.rechazado_by IS DISTINCT FROM OLD.rechazado_by OR NEW.rechazado_at IS DISTINCT FROM OLD.rechazado_at OR NEW.motivo_rechazo IS DISTINCT FROM OLD.motivo_rechazo
      OR NEW.confirmado_by IS DISTINCT FROM OLD.confirmado_by OR NEW.confirmado_at IS DISTINCT FROM OLD.confirmado_at
      OR NEW.anulado_by IS DISTINCT FROM OLD.anulado_by OR NEW.anulado_at IS DISTINCT FROM OLD.anulado_at OR NEW.motivo_anulacion IS DISTINCT FROM OLD.motivo_anulacion
    THEN RAISE EXCEPTION 'campo_descarte_modifica_auditoria'; END IF;
  ELSIF OLD.estado = 'enviado' AND NEW.estado = 'confirmado' THEN
    IF NEW.confirmado_by IS DISTINCT FROM v_uid OR NEW.confirmado_at IS NULL THEN RAISE EXCEPTION 'campo_confirmacion_incompleta'; END IF;
    IF NEW.enviado_by IS DISTINCT FROM OLD.enviado_by OR NEW.enviado_at IS DISTINCT FROM OLD.enviado_at
      OR NEW.rechazado_by IS DISTINCT FROM OLD.rechazado_by OR NEW.rechazado_at IS DISTINCT FROM OLD.rechazado_at OR NEW.motivo_rechazo IS DISTINCT FROM OLD.motivo_rechazo
      OR NEW.anulado_by IS DISTINCT FROM OLD.anulado_by OR NEW.anulado_at IS DISTINCT FROM OLD.anulado_at OR NEW.motivo_anulacion IS DISTINCT FROM OLD.motivo_anulacion
      OR NEW.descartado_by IS DISTINCT FROM OLD.descartado_by OR NEW.descartado_at IS DISTINCT FROM OLD.descartado_at OR NEW.motivo_descarte IS DISTINCT FROM OLD.motivo_descarte
    THEN RAISE EXCEPTION 'campo_confirmacion_modifica_auditoria'; END IF;
  ELSIF OLD.estado = 'enviado' AND NEW.estado = 'rechazado' THEN
    IF NEW.rechazado_by IS DISTINCT FROM v_uid OR NEW.rechazado_at IS NULL OR NEW.motivo_rechazo IS NULL OR btrim(NEW.motivo_rechazo) = '' THEN RAISE EXCEPTION 'campo_rechazo_incompleto'; END IF;
    IF NEW.enviado_by IS DISTINCT FROM OLD.enviado_by OR NEW.enviado_at IS DISTINCT FROM OLD.enviado_at
      OR NEW.confirmado_by IS DISTINCT FROM OLD.confirmado_by OR NEW.confirmado_at IS DISTINCT FROM OLD.confirmado_at
      OR NEW.anulado_by IS DISTINCT FROM OLD.anulado_by OR NEW.anulado_at IS DISTINCT FROM OLD.anulado_at OR NEW.motivo_anulacion IS DISTINCT FROM OLD.motivo_anulacion
      OR NEW.descartado_by IS DISTINCT FROM OLD.descartado_by OR NEW.descartado_at IS DISTINCT FROM OLD.descartado_at OR NEW.motivo_descarte IS DISTINCT FROM OLD.motivo_descarte
    THEN RAISE EXCEPTION 'campo_rechazo_modifica_auditoria'; END IF;
  ELSIF OLD.estado = 'rechazado' AND NEW.estado = 'borrador' THEN
    IF NEW.enviado_by IS DISTINCT FROM OLD.enviado_by OR NEW.enviado_at IS DISTINCT FROM OLD.enviado_at
      OR NEW.rechazado_by IS DISTINCT FROM OLD.rechazado_by OR NEW.rechazado_at IS DISTINCT FROM OLD.rechazado_at OR NEW.motivo_rechazo IS DISTINCT FROM OLD.motivo_rechazo
      OR NEW.confirmado_by IS DISTINCT FROM OLD.confirmado_by OR NEW.confirmado_at IS DISTINCT FROM OLD.confirmado_at
      OR NEW.anulado_by IS DISTINCT FROM OLD.anulado_by OR NEW.anulado_at IS DISTINCT FROM OLD.anulado_at OR NEW.motivo_anulacion IS DISTINCT FROM OLD.motivo_anulacion
      OR NEW.descartado_by IS DISTINCT FROM OLD.descartado_by OR NEW.descartado_at IS DISTINCT FROM OLD.descartado_at OR NEW.motivo_descarte IS DISTINCT FROM OLD.motivo_descarte
    THEN RAISE EXCEPTION 'campo_reapertura_modifica_auditoria'; END IF;
  ELSIF OLD.estado = 'rechazado' AND NEW.estado = 'descartado' THEN
    IF NEW.descartado_by IS DISTINCT FROM v_uid OR NEW.descartado_at IS NULL OR NEW.motivo_descarte IS NULL OR btrim(NEW.motivo_descarte) = '' THEN RAISE EXCEPTION 'campo_descarte_incompleto'; END IF;
    IF NEW.enviado_by IS DISTINCT FROM OLD.enviado_by OR NEW.enviado_at IS DISTINCT FROM OLD.enviado_at
      OR NEW.rechazado_by IS DISTINCT FROM OLD.rechazado_by OR NEW.rechazado_at IS DISTINCT FROM OLD.rechazado_at OR NEW.motivo_rechazo IS DISTINCT FROM OLD.motivo_rechazo
      OR NEW.confirmado_by IS DISTINCT FROM OLD.confirmado_by OR NEW.confirmado_at IS DISTINCT FROM OLD.confirmado_at
      OR NEW.anulado_by IS DISTINCT FROM OLD.anulado_by OR NEW.anulado_at IS DISTINCT FROM OLD.anulado_at OR NEW.motivo_anulacion IS DISTINCT FROM OLD.motivo_anulacion
    THEN RAISE EXCEPTION 'campo_descarte_modifica_auditoria'; END IF;
  ELSIF OLD.estado = 'confirmado' AND NEW.estado = 'anulado' THEN
    IF NEW.anulado_by IS DISTINCT FROM v_uid OR NEW.anulado_at IS NULL OR NEW.motivo_anulacion IS NULL OR btrim(NEW.motivo_anulacion) = '' THEN RAISE EXCEPTION 'campo_anulacion_incompleta'; END IF;
    IF NEW.enviado_by IS DISTINCT FROM OLD.enviado_by OR NEW.enviado_at IS DISTINCT FROM OLD.enviado_at
      OR NEW.rechazado_by IS DISTINCT FROM OLD.rechazado_by OR NEW.rechazado_at IS DISTINCT FROM OLD.rechazado_at OR NEW.motivo_rechazo IS DISTINCT FROM OLD.motivo_rechazo
      OR NEW.confirmado_by IS DISTINCT FROM OLD.confirmado_by OR NEW.confirmado_at IS DISTINCT FROM OLD.confirmado_at
      OR NEW.descartado_by IS DISTINCT FROM OLD.descartado_by OR NEW.descartado_at IS DISTINCT FROM OLD.descartado_at OR NEW.motivo_descarte IS DISTINCT FROM OLD.motivo_descarte
    THEN RAISE EXCEPTION 'campo_anulacion_modifica_auditoria'; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.campo_protect_parte_state() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Validacion de cabecera, numeracion y detalles para admin/operador.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.campo_validate_parte_relations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_orden_estado text;
  v_labor_orden uuid;
  v_labor_activa boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT public.campo_puede_crear_parte(NEW.comercio_id) THEN
      IF public.user_belongs_to_comercio(NEW.comercio_id) THEN RAISE EXCEPTION 'campo_operador_no_vinculado'; END IF;
      RAISE EXCEPTION 'campo_parte_no_disponible';
    END IF;
  ELSIF NEW.estado IS NOT DISTINCT FROM OLD.estado AND NOT public.campo_puede_editar_parte(OLD.id) THEN
    RAISE EXCEPTION 'campo_parte_no_editable';
  END IF;

  SELECT o.estado INTO v_orden_estado
  FROM public.campo_ordenes_trabajo AS o
  WHERE o.id = NEW.orden_id AND o.comercio_id = NEW.comercio_id;
  IF v_orden_estado IS NULL THEN RAISE EXCEPTION 'campo_orden_invalida'; END IF;

  SELECT l.orden_id, l.activo INTO v_labor_orden, v_labor_activa
  FROM public.campo_orden_labores AS l
  WHERE l.id = NEW.orden_labor_id AND l.comercio_id = NEW.comercio_id;
  IF v_labor_orden IS NULL OR v_labor_orden IS DISTINCT FROM NEW.orden_id THEN RAISE EXCEPTION 'campo_labor_invalida'; END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.orden_id IS DISTINCT FROM OLD.orden_id
    OR NEW.orden_labor_id IS DISTINCT FROM OLD.orden_labor_id
    OR NEW.numero IS DISTINCT FROM OLD.numero
  ) THEN RAISE EXCEPTION 'campo_parte_relacion_inmutable'; END IF;

  IF TG_OP = 'INSERT' OR NEW.estado = 'borrador' OR NEW.estado IN ('enviado', 'confirmado') THEN
    IF v_orden_estado NOT IN ('planificada', 'en_progreso') THEN RAISE EXCEPTION 'campo_orden_no_admite_partes'; END IF;
    IF v_labor_activa IS DISTINCT FROM true THEN RAISE EXCEPTION 'campo_labor_inactiva'; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.campo_assign_parte_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF NOT public.campo_puede_crear_parte(NEW.comercio_id) THEN RAISE EXCEPTION 'campo_parte_no_disponible'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('vortex_campo_parte:' || NEW.orden_id::text, 0));
  SELECT COALESCE(max(p.numero), 0) + 1 INTO NEW.numero
  FROM public.campo_partes_trabajo AS p
  WHERE p.comercio_id = NEW.comercio_id AND p.orden_id = NEW.orden_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.campo_validate_parte_detail_relations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_estado text;
  v_labor uuid;
  v_activo boolean;
  v_unidad text;
  v_asignacion_labor uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF NOT public.campo_puede_editar_parte(NEW.parte_id) THEN RAISE EXCEPTION 'campo_parte_no_editable'; END IF;

  SELECT p.estado, p.orden_labor_id INTO v_estado, v_labor
  FROM public.campo_partes_trabajo AS p
  WHERE p.id = NEW.parte_id AND p.comercio_id = NEW.comercio_id
  FOR UPDATE;
  IF v_estado IS NULL THEN RAISE EXCEPTION 'campo_parte_invalido'; END IF;
  IF v_estado <> 'borrador' THEN RAISE EXCEPTION 'campo_parte_congelado'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.parte_id IS DISTINCT FROM OLD.parte_id THEN RAISE EXCEPTION 'campo_parte_detalle_inmutable'; END IF;

  IF TG_TABLE_NAME = 'campo_parte_lotes' THEN
    IF TG_OP = 'UPDATE' AND NEW.orden_labor_lote_id IS DISTINCT FROM OLD.orden_labor_lote_id THEN RAISE EXCEPTION 'campo_asignacion_parte_inmutable'; END IF;
    SELECT a.orden_labor_id, a.activo, l.unidad INTO v_asignacion_labor, v_activo, v_unidad
    FROM public.campo_orden_labor_lotes AS a
    JOIN public.campo_orden_labores AS l ON l.id = a.orden_labor_id AND l.comercio_id = a.comercio_id
    WHERE a.id = NEW.orden_labor_lote_id AND a.comercio_id = NEW.comercio_id;
    IF v_asignacion_labor IS NULL OR v_asignacion_labor IS DISTINCT FROM v_labor THEN RAISE EXCEPTION 'campo_asignacion_planificada_invalida'; END IF;
    IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.activo AND NOT OLD.activo)) AND v_activo IS DISTINCT FROM true THEN RAISE EXCEPTION 'campo_asignacion_planificada_inactiva'; END IF;
    IF v_unidad = 'fijo' AND NEW.cantidad_ejecutada <> 1 THEN RAISE EXCEPTION 'campo_cantidad_fijo_debe_ser_uno'; END IF;
  ELSIF TG_TABLE_NAME = 'campo_parte_operarios' THEN
    IF TG_OP = 'UPDATE' AND NEW.operario_id IS DISTINCT FROM OLD.operario_id THEN RAISE EXCEPTION 'campo_operario_parte_inmutable'; END IF;
    SELECT o.activo INTO v_activo FROM public.campo_operarios AS o WHERE o.id = NEW.operario_id AND o.comercio_id = NEW.comercio_id;
    IF v_activo IS NULL THEN RAISE EXCEPTION 'campo_operario_invalido'; END IF;
    IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.activo AND NOT OLD.activo)) AND NOT v_activo THEN RAISE EXCEPTION 'campo_operario_inactivo'; END IF;
  ELSIF TG_TABLE_NAME = 'campo_parte_maquinarias' THEN
    IF TG_OP = 'UPDATE' AND NEW.maquinaria_id IS DISTINCT FROM OLD.maquinaria_id THEN RAISE EXCEPTION 'campo_maquinaria_parte_inmutable'; END IF;
    SELECT m.activo INTO v_activo FROM public.campo_maquinarias AS m WHERE m.id = NEW.maquinaria_id AND m.comercio_id = NEW.comercio_id;
    IF v_activo IS NULL THEN RAISE EXCEPTION 'campo_maquinaria_invalida'; END IF;
    IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.activo AND NOT OLD.activo)) AND NOT v_activo THEN RAISE EXCEPTION 'campo_maquinaria_inactiva'; END IF;
  ELSIF TG_TABLE_NAME = 'campo_parte_insumos' THEN
    IF TG_OP = 'INSERT' THEN
      SELECT i.activo, i.unidad INTO v_activo, v_unidad FROM public.campo_insumos AS i WHERE i.id = NEW.insumo_id AND i.comercio_id = NEW.comercio_id;
      IF v_activo IS NULL THEN RAISE EXCEPTION 'campo_insumo_invalido'; END IF;
      IF v_activo IS DISTINCT FROM true THEN RAISE EXCEPTION 'campo_insumo_inactivo'; END IF;
      IF NEW.unidad IS DISTINCT FROM v_unidad THEN RAISE EXCEPTION 'campo_insumo_unidad_invalida'; END IF;
    ELSE
      IF NEW.insumo_id IS DISTINCT FROM OLD.insumo_id THEN RAISE EXCEPTION 'campo_insumo_parte_inmutable'; END IF;
      IF NEW.unidad IS DISTINCT FROM OLD.unidad THEN RAISE EXCEPTION 'campo_insumo_unidad_inmutable'; END IF;
      IF NEW.activo AND NOT OLD.activo THEN
        SELECT i.activo INTO v_activo FROM public.campo_insumos AS i WHERE i.id = NEW.insumo_id AND i.comercio_id = NEW.comercio_id;
        IF v_activo IS NULL THEN RAISE EXCEPTION 'campo_insumo_invalido'; END IF;
        IF v_activo IS DISTINCT FROM true THEN RAISE EXCEPTION 'campo_insumo_inactivo'; END IF;
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'campo_detalle_parte_no_soportado';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.campo_validate_parte_relations() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campo_assign_parte_numero() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campo_validate_parte_detail_relations() FROM PUBLIC, anon, authenticated;

-- Validacion completa compartida por envio y confirmacion. El snapshot de
-- unidad del insumo es historico: se exige insumo activo, no igualdad con la
-- unidad actual del catalogo.
CREATE OR REPLACE FUNCTION public.campo_validar_parte_detalles(
  p_parte_id uuid,
  p_comercio_id uuid,
  p_orden_labor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_unidad text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  SELECT l.unidad INTO v_unidad FROM public.campo_orden_labores AS l
  WHERE l.id = p_orden_labor_id AND l.comercio_id = p_comercio_id AND l.activo = true;
  IF v_unidad IS NULL THEN RAISE EXCEPTION 'campo_labor_invalida'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.campo_parte_lotes AS d WHERE d.comercio_id = p_comercio_id AND d.parte_id = p_parte_id AND d.activo) THEN RAISE EXCEPTION 'campo_parte_sin_lotes'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.campo_parte_lotes AS d
    LEFT JOIN public.campo_orden_labor_lotes AS a ON a.id = d.orden_labor_lote_id AND a.comercio_id = d.comercio_id
    LEFT JOIN public.campo_lotes AS lote ON lote.id = a.lote_id AND lote.comercio_id = d.comercio_id
    WHERE d.comercio_id = p_comercio_id AND d.parte_id = p_parte_id AND d.activo
      AND (a.id IS NULL OR NOT a.activo OR a.orden_labor_id <> p_orden_labor_id OR lote.id IS NULL OR NOT lote.activo OR (v_unidad = 'fijo' AND d.cantidad_ejecutada <> 1))
  ) THEN RAISE EXCEPTION 'campo_parte_lotes_invalidos'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.campo_parte_operarios AS d
    LEFT JOIN public.campo_operarios AS c ON c.id = d.operario_id AND c.comercio_id = d.comercio_id
    WHERE d.comercio_id = p_comercio_id AND d.parte_id = p_parte_id AND d.activo AND (c.id IS NULL OR NOT c.activo)
  ) THEN RAISE EXCEPTION 'campo_parte_operarios_invalidos'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.campo_parte_maquinarias AS d
    LEFT JOIN public.campo_maquinarias AS c ON c.id = d.maquinaria_id AND c.comercio_id = d.comercio_id
    WHERE d.comercio_id = p_comercio_id AND d.parte_id = p_parte_id AND d.activo AND (c.id IS NULL OR NOT c.activo)
  ) THEN RAISE EXCEPTION 'campo_parte_maquinarias_invalidas'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.campo_parte_insumos AS d
    LEFT JOIN public.campo_insumos AS c ON c.id = d.insumo_id AND c.comercio_id = d.comercio_id
    WHERE d.comercio_id = p_comercio_id AND d.parte_id = p_parte_id AND d.activo AND (c.id IS NULL OR NOT c.activo)
  ) THEN RAISE EXCEPTION 'campo_parte_insumos_invalidos'; END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.campo_validar_parte_detalles(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC publicas. Todas derivan tenant de la orden/parte y bloquean orden -> parte.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.campo_crear_parte(
  p_orden_id uuid,
  p_orden_labor_id uuid,
  p_fecha_trabajo date,
  p_hora_inicio time without time zone DEFAULT NULL,
  p_hora_fin time without time zone DEFAULT NULL,
  p_descripcion text DEFAULT NULL,
  p_observaciones text DEFAULT NULL,
  p_condiciones_climaticas text DEFAULT NULL
)
RETURNS public.campo_partes_trabajo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_orden public.campo_ordenes_trabajo;
  v_labor public.campo_orden_labores;
  v_parte public.campo_partes_trabajo;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  SELECT * INTO v_orden FROM public.campo_ordenes_trabajo AS o WHERE o.id = p_orden_id FOR UPDATE;
  IF v_orden.id IS NULL OR NOT public.user_belongs_to_comercio(v_orden.comercio_id) THEN RAISE EXCEPTION 'campo_orden_no_disponible'; END IF;
  IF NOT public.campo_puede_crear_parte(v_orden.comercio_id) THEN RAISE EXCEPTION 'campo_operador_no_vinculado'; END IF;
  IF v_orden.estado NOT IN ('planificada', 'en_progreso') THEN RAISE EXCEPTION 'campo_orden_no_admite_partes'; END IF;
  SELECT * INTO v_labor FROM public.campo_orden_labores AS l WHERE l.id = p_orden_labor_id AND l.comercio_id = v_orden.comercio_id;
  IF v_labor.id IS NULL OR v_labor.orden_id <> v_orden.id OR NOT v_labor.activo THEN RAISE EXCEPTION 'campo_labor_invalida'; END IF;

  INSERT INTO public.campo_partes_trabajo (
    comercio_id, orden_id, orden_labor_id, fecha_trabajo, hora_inicio, hora_fin,
    descripcion, observaciones, condiciones_climaticas
  ) VALUES (
    v_orden.comercio_id, v_orden.id, v_labor.id, p_fecha_trabajo, p_hora_inicio, p_hora_fin,
    p_descripcion, p_observaciones, p_condiciones_climaticas
  ) RETURNING * INTO v_parte;
  RETURN v_parte;
END;
$function$;

CREATE OR REPLACE FUNCTION public.campo_enviar_parte(p_parte_id uuid)
RETURNS public.campo_partes_trabajo
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE v_pre public.campo_partes_trabajo; v_parte public.campo_partes_trabajo; v_orden public.campo_ordenes_trabajo;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  SELECT * INTO v_pre FROM public.campo_partes_trabajo AS p WHERE p.id = p_parte_id;
  IF v_pre.id IS NULL THEN RAISE EXCEPTION 'campo_parte_no_disponible'; END IF;
  SELECT * INTO v_orden FROM public.campo_ordenes_trabajo AS o WHERE o.id = v_pre.orden_id AND o.comercio_id = v_pre.comercio_id FOR UPDATE;
  SELECT * INTO v_parte FROM public.campo_partes_trabajo AS p WHERE p.id = p_parte_id AND p.comercio_id = v_orden.comercio_id AND p.orden_id = v_orden.id FOR UPDATE;
  IF v_parte.id IS NULL OR NOT (public.user_is_comercio_admin(v_parte.comercio_id) OR (v_parte.propietario_user_id = auth.uid() AND public.campo_es_operador_vinculado(v_parte.comercio_id))) THEN RAISE EXCEPTION 'campo_parte_no_disponible'; END IF;
  IF v_parte.estado <> 'borrador' THEN RAISE EXCEPTION 'campo_parte_no_enviable'; END IF;
  IF v_orden.estado NOT IN ('planificada', 'en_progreso') THEN RAISE EXCEPTION 'campo_orden_no_admite_partes'; END IF;
  PERFORM public.campo_validar_parte_detalles(v_parte.id, v_parte.comercio_id, v_parte.orden_labor_id);
  UPDATE public.campo_partes_trabajo SET estado = 'enviado', enviado_by = auth.uid(), enviado_at = now()
  WHERE id = v_parte.id AND comercio_id = v_parte.comercio_id RETURNING * INTO v_parte;
  RETURN v_parte;
END;
$function$;

CREATE OR REPLACE FUNCTION public.campo_confirmar_parte(p_parte_id uuid)
RETURNS public.campo_partes_trabajo
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE v_pre public.campo_partes_trabajo; v_parte public.campo_partes_trabajo; v_orden public.campo_ordenes_trabajo;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  SELECT * INTO v_pre FROM public.campo_partes_trabajo AS p WHERE p.id = p_parte_id;
  IF v_pre.id IS NULL THEN RAISE EXCEPTION 'campo_parte_no_disponible'; END IF;
  SELECT * INTO v_orden FROM public.campo_ordenes_trabajo AS o WHERE o.id = v_pre.orden_id AND o.comercio_id = v_pre.comercio_id FOR UPDATE;
  SELECT * INTO v_parte FROM public.campo_partes_trabajo AS p WHERE p.id = p_parte_id AND p.comercio_id = v_orden.comercio_id AND p.orden_id = v_orden.id FOR UPDATE;
  IF v_parte.id IS NULL OR NOT public.user_is_comercio_admin(v_parte.comercio_id) THEN RAISE EXCEPTION 'campo_parte_no_disponible'; END IF;
  IF v_parte.estado NOT IN ('borrador', 'enviado') THEN RAISE EXCEPTION 'campo_parte_no_confirmable'; END IF;
  IF v_orden.estado NOT IN ('planificada', 'en_progreso') THEN RAISE EXCEPTION 'campo_orden_no_admite_confirmacion'; END IF;
  PERFORM public.campo_validar_parte_detalles(v_parte.id, v_parte.comercio_id, v_parte.orden_labor_id);
  UPDATE public.campo_partes_trabajo SET estado = 'confirmado', confirmado_by = auth.uid(), confirmado_at = now()
  WHERE id = v_parte.id AND comercio_id = v_parte.comercio_id RETURNING * INTO v_parte;
  IF v_orden.estado = 'planificada' THEN
    UPDATE public.campo_ordenes_trabajo SET estado = 'en_progreso' WHERE id = v_orden.id AND comercio_id = v_orden.comercio_id;
  END IF;
  RETURN v_parte;
END;
$function$;

CREATE OR REPLACE FUNCTION public.campo_rechazar_parte(p_parte_id uuid, p_motivo text)
RETURNS public.campo_partes_trabajo
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE v_pre public.campo_partes_trabajo; v_parte public.campo_partes_trabajo; v_orden public.campo_ordenes_trabajo;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'campo_rechazo_requiere_motivo'; END IF;
  SELECT * INTO v_pre FROM public.campo_partes_trabajo AS p WHERE p.id = p_parte_id;
  IF v_pre.id IS NULL THEN RAISE EXCEPTION 'campo_parte_no_disponible'; END IF;
  SELECT * INTO v_orden FROM public.campo_ordenes_trabajo AS o WHERE o.id = v_pre.orden_id AND o.comercio_id = v_pre.comercio_id FOR UPDATE;
  SELECT * INTO v_parte FROM public.campo_partes_trabajo AS p WHERE p.id = p_parte_id AND p.comercio_id = v_orden.comercio_id AND p.orden_id = v_orden.id FOR UPDATE;
  IF v_parte.id IS NULL OR NOT public.user_is_comercio_admin(v_parte.comercio_id) THEN RAISE EXCEPTION 'campo_parte_no_disponible'; END IF;
  IF v_parte.estado <> 'enviado' THEN RAISE EXCEPTION 'campo_parte_no_rechazable'; END IF;
  UPDATE public.campo_partes_trabajo SET estado = 'rechazado', rechazado_by = auth.uid(), rechazado_at = now(), motivo_rechazo = btrim(p_motivo)
  WHERE id = v_parte.id AND comercio_id = v_parte.comercio_id RETURNING * INTO v_parte;
  RETURN v_parte;
END;
$function$;

CREATE OR REPLACE FUNCTION public.campo_reabrir_parte(p_parte_id uuid)
RETURNS public.campo_partes_trabajo
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE v_pre public.campo_partes_trabajo; v_parte public.campo_partes_trabajo; v_orden public.campo_ordenes_trabajo;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  SELECT * INTO v_pre FROM public.campo_partes_trabajo AS p WHERE p.id = p_parte_id;
  IF v_pre.id IS NULL THEN RAISE EXCEPTION 'campo_parte_no_disponible'; END IF;
  SELECT * INTO v_orden FROM public.campo_ordenes_trabajo AS o WHERE o.id = v_pre.orden_id AND o.comercio_id = v_pre.comercio_id FOR UPDATE;
  SELECT * INTO v_parte FROM public.campo_partes_trabajo AS p WHERE p.id = p_parte_id AND p.comercio_id = v_orden.comercio_id AND p.orden_id = v_orden.id FOR UPDATE;
  IF v_parte.id IS NULL OR NOT (public.user_is_comercio_admin(v_parte.comercio_id) OR (v_parte.propietario_user_id = auth.uid() AND public.campo_es_operador_vinculado(v_parte.comercio_id))) THEN RAISE EXCEPTION 'campo_parte_no_disponible'; END IF;
  IF v_parte.estado <> 'rechazado' THEN RAISE EXCEPTION 'campo_parte_no_reabrible'; END IF;
  IF v_orden.estado NOT IN ('planificada', 'en_progreso') THEN RAISE EXCEPTION 'campo_orden_no_admite_partes'; END IF;
  UPDATE public.campo_partes_trabajo SET estado = 'borrador'
  WHERE id = v_parte.id AND comercio_id = v_parte.comercio_id RETURNING * INTO v_parte;
  RETURN v_parte;
END;
$function$;

CREATE OR REPLACE FUNCTION public.campo_descartar_parte(p_parte_id uuid, p_motivo text)
RETURNS public.campo_partes_trabajo
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE v_pre public.campo_partes_trabajo; v_parte public.campo_partes_trabajo; v_orden public.campo_ordenes_trabajo;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'campo_descarte_requiere_motivo'; END IF;
  SELECT * INTO v_pre FROM public.campo_partes_trabajo AS p WHERE p.id = p_parte_id;
  IF v_pre.id IS NULL THEN RAISE EXCEPTION 'campo_parte_no_disponible'; END IF;
  SELECT * INTO v_orden FROM public.campo_ordenes_trabajo AS o WHERE o.id = v_pre.orden_id AND o.comercio_id = v_pre.comercio_id FOR UPDATE;
  SELECT * INTO v_parte FROM public.campo_partes_trabajo AS p WHERE p.id = p_parte_id AND p.comercio_id = v_orden.comercio_id AND p.orden_id = v_orden.id FOR UPDATE;
  IF v_parte.id IS NULL OR NOT (public.user_is_comercio_admin(v_parte.comercio_id) OR (v_parte.propietario_user_id = auth.uid() AND public.campo_es_operador_vinculado(v_parte.comercio_id))) THEN RAISE EXCEPTION 'campo_parte_no_disponible'; END IF;
  IF v_parte.estado NOT IN ('borrador', 'rechazado') THEN RAISE EXCEPTION 'campo_parte_no_descartable'; END IF;
  UPDATE public.campo_partes_trabajo SET estado = 'descartado', descartado_by = auth.uid(), descartado_at = now(), motivo_descarte = btrim(p_motivo)
  WHERE id = v_parte.id AND comercio_id = v_parte.comercio_id RETURNING * INTO v_parte;
  RETURN v_parte;
END;
$function$;

CREATE OR REPLACE FUNCTION public.campo_anular_parte(p_parte_id uuid, p_motivo text)
RETURNS public.campo_partes_trabajo
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE v_pre public.campo_partes_trabajo; v_parte public.campo_partes_trabajo; v_orden public.campo_ordenes_trabajo;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'campo_anulacion_requiere_motivo'; END IF;
  SELECT * INTO v_pre FROM public.campo_partes_trabajo AS p WHERE p.id = p_parte_id;
  IF v_pre.id IS NULL THEN RAISE EXCEPTION 'campo_parte_no_disponible'; END IF;
  SELECT * INTO v_orden FROM public.campo_ordenes_trabajo AS o WHERE o.id = v_pre.orden_id AND o.comercio_id = v_pre.comercio_id FOR UPDATE;
  SELECT * INTO v_parte FROM public.campo_partes_trabajo AS p WHERE p.id = p_parte_id AND p.comercio_id = v_orden.comercio_id AND p.orden_id = v_orden.id FOR UPDATE;
  IF v_parte.id IS NULL OR NOT public.user_is_comercio_admin(v_parte.comercio_id) THEN RAISE EXCEPTION 'campo_parte_no_disponible'; END IF;
  IF v_parte.estado <> 'confirmado' THEN RAISE EXCEPTION 'campo_parte_no_anulable'; END IF;
  UPDATE public.campo_partes_trabajo SET estado = 'anulado', anulado_by = auth.uid(), anulado_at = now(), motivo_anulacion = btrim(p_motivo)
  WHERE id = v_parte.id AND comercio_id = v_parte.comercio_id RETURNING * INTO v_parte;
  RETURN v_parte;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Ordenes: enviado y rechazado son pendientes; anulado y descartado no lo son.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.campo_protect_orden_planificacion()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE v_comercio uuid; v_cliente uuid; v_activo boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF public.user_is_comercio_admin(NEW.comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'campo_admin_requerido'; END IF;
  IF TG_OP = 'INSERT' THEN NEW.estado := 'borrador'; NEW.iniciada_at := NULL; NEW.finalizada_at := NULL; NEW.cancelada_at := NULL; NEW.motivo_cancelacion := NULL; RETURN NEW; END IF;
  IF NEW.numero IS DISTINCT FROM OLD.numero THEN RAISE EXCEPTION 'campo_numero_orden_inmutable'; END IF;
  IF NEW.estado = OLD.estado AND (NEW.iniciada_at IS DISTINCT FROM OLD.iniciada_at OR NEW.finalizada_at IS DISTINCT FROM OLD.finalizada_at OR NEW.cancelada_at IS DISTINCT FROM OLD.cancelada_at OR NEW.motivo_cancelacion IS DISTINCT FROM OLD.motivo_cancelacion) THEN RAISE EXCEPTION 'campo_fechas_estado_no_editables'; END IF;
  IF OLD.estado <> 'borrador' AND (NEW.cliente_id IS DISTINCT FROM OLD.cliente_id OR NEW.establecimiento_id IS DISTINCT FROM OLD.establecimiento_id OR NEW.codigo_interno IS DISTINCT FROM OLD.codigo_interno OR NEW.fecha_inicio_planificada IS DISTINCT FROM OLD.fecha_inicio_planificada OR NEW.fecha_fin_planificada IS DISTINCT FROM OLD.fecha_fin_planificada OR NEW.descripcion IS DISTINCT FROM OLD.descripcion) THEN RAISE EXCEPTION 'campo_planificacion_congelada'; END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT ((OLD.estado = 'borrador' AND NEW.estado = 'planificada') OR (OLD.estado = 'planificada' AND NEW.estado IN ('borrador','en_progreso','cancelada')) OR (OLD.estado = 'en_progreso' AND NEW.estado IN ('finalizada','cancelada'))) THEN RAISE EXCEPTION 'campo_transicion_orden_no_habilitada'; END IF;
    IF OLD.estado = 'borrador' AND NEW.estado = 'planificada' THEN
      SELECT e.comercio_id, e.cliente_id, e.activo INTO v_comercio, v_cliente, v_activo FROM public.campo_establecimientos AS e WHERE e.id = NEW.establecimiento_id;
      IF v_comercio IS DISTINCT FROM NEW.comercio_id OR v_activo IS DISTINCT FROM true THEN RAISE EXCEPTION 'campo_establecimiento_no_disponible_planificar'; END IF;
      IF v_cliente IS DISTINCT FROM NEW.cliente_id THEN RAISE EXCEPTION 'campo_cliente_no_coincide_establecimiento'; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.campo_orden_labores AS l WHERE l.comercio_id = NEW.comercio_id AND l.orden_id = NEW.id AND l.activo) THEN RAISE EXCEPTION 'campo_orden_sin_labores_activas'; END IF;
      IF EXISTS (SELECT 1 FROM public.campo_orden_labores AS l WHERE l.comercio_id = NEW.comercio_id AND l.orden_id = NEW.id AND l.activo AND NOT EXISTS (SELECT 1 FROM public.campo_orden_labor_lotes AS a WHERE a.comercio_id = l.comercio_id AND a.orden_labor_id = l.id AND a.activo)) THEN RAISE EXCEPTION 'campo_labor_sin_lotes_activos'; END IF;
      IF EXISTS (SELECT 1 FROM public.campo_orden_labores AS l JOIN public.campo_orden_labor_lotes AS a ON a.comercio_id = l.comercio_id AND a.orden_labor_id = l.id JOIN public.campo_lotes AS lote ON lote.id = a.lote_id AND lote.comercio_id = a.comercio_id WHERE l.comercio_id = NEW.comercio_id AND l.orden_id = NEW.id AND l.activo AND a.activo AND (NOT lote.activo OR lote.establecimiento_id IS DISTINCT FROM NEW.establecimiento_id OR (l.unidad = 'fijo' AND a.cantidad_planificada <> 1))) THEN RAISE EXCEPTION 'campo_asignacion_no_disponible_planificar'; END IF;
    ELSIF OLD.estado = 'planificada' AND NEW.estado = 'borrador' THEN
      IF EXISTS (SELECT 1 FROM public.campo_partes_trabajo AS p WHERE p.comercio_id = NEW.comercio_id AND p.orden_id = NEW.id) THEN RAISE EXCEPTION 'campo_orden_con_partes_no_reabrible'; END IF;
    ELSIF OLD.estado = 'planificada' AND NEW.estado = 'en_progreso' THEN
      IF NOT EXISTS (SELECT 1 FROM public.campo_partes_trabajo AS p WHERE p.comercio_id = NEW.comercio_id AND p.orden_id = NEW.id AND p.estado = 'confirmado') THEN RAISE EXCEPTION 'campo_inicio_requiere_parte_confirmado'; END IF;
      NEW.iniciada_at := COALESCE(OLD.iniciada_at, now());
    ELSIF OLD.estado = 'en_progreso' AND NEW.estado = 'finalizada' THEN
      IF NOT EXISTS (SELECT 1 FROM public.campo_partes_trabajo AS p WHERE p.comercio_id = NEW.comercio_id AND p.orden_id = NEW.id AND p.estado = 'confirmado') THEN RAISE EXCEPTION 'campo_finalizacion_sin_partes_confirmados'; END IF;
      IF EXISTS (SELECT 1 FROM public.campo_partes_trabajo AS p WHERE p.comercio_id = NEW.comercio_id AND p.orden_id = NEW.id AND p.estado IN ('borrador', 'enviado', 'rechazado')) THEN RAISE EXCEPTION 'campo_orden_con_partes_pendientes'; END IF;
      NEW.finalizada_at := now(); NEW.cancelada_at := NULL; NEW.motivo_cancelacion := NULL;
    ELSIF NEW.estado = 'cancelada' THEN
      IF NEW.motivo_cancelacion IS NULL OR btrim(NEW.motivo_cancelacion) = '' THEN RAISE EXCEPTION 'campo_cancelacion_requiere_motivo'; END IF;
      IF EXISTS (SELECT 1 FROM public.campo_partes_trabajo AS p WHERE p.comercio_id = NEW.comercio_id AND p.orden_id = NEW.id AND p.estado IN ('borrador', 'enviado', 'rechazado')) THEN RAISE EXCEPTION 'campo_orden_con_partes_pendientes'; END IF;
      NEW.cancelada_at := now(); NEW.finalizada_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.campo_protect_orden_planificacion() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS: SELECT permanece por membresia. INSERT directo de partes queda solo para
-- admin por compatibilidad; UPDATE de cabecera/detalles admite operador propio.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS campo_partes_trabajo_insert_admin ON public.campo_partes_trabajo;
DROP POLICY IF EXISTS campo_partes_trabajo_update_admin ON public.campo_partes_trabajo;

CREATE POLICY campo_partes_trabajo_insert_admin
ON public.campo_partes_trabajo FOR INSERT TO authenticated
WITH CHECK (public.user_is_comercio_admin(comercio_id));

CREATE POLICY campo_partes_trabajo_update_admin_operador
ON public.campo_partes_trabajo FOR UPDATE TO authenticated
USING (
  public.user_is_comercio_admin(comercio_id)
  OR (
    estado = 'borrador' AND propietario_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.comercio_usuarios AS cu WHERE cu.comercio_id = campo_partes_trabajo.comercio_id AND cu.user_id = auth.uid() AND cu.rol = 'operador' AND cu.activo)
    AND EXISTS (SELECT 1 FROM public.campo_operarios AS o WHERE o.comercio_id = campo_partes_trabajo.comercio_id AND o.user_id = auth.uid() AND o.activo)
  )
)
WITH CHECK (
  public.user_is_comercio_admin(comercio_id)
  OR (
    estado = 'borrador' AND propietario_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.comercio_usuarios AS cu WHERE cu.comercio_id = campo_partes_trabajo.comercio_id AND cu.user_id = auth.uid() AND cu.rol = 'operador' AND cu.activo)
    AND EXISTS (SELECT 1 FROM public.campo_operarios AS o WHERE o.comercio_id = campo_partes_trabajo.comercio_id AND o.user_id = auth.uid() AND o.activo)
  )
);

DO $policies$
DECLARE
  v_tabla text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY['campo_parte_lotes', 'campo_parte_operarios', 'campo_parte_maquinarias', 'campo_parte_insumos'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_tabla || '_insert_admin', v_tabla);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_tabla || '_update_admin', v_tabla);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
        public.user_is_comercio_admin(comercio_id)
        OR EXISTS (
          SELECT 1 FROM public.campo_partes_trabajo p
          WHERE p.id = %I.parte_id AND p.comercio_id = %I.comercio_id
            AND p.estado = ''borrador'' AND p.propietario_user_id = auth.uid()
            AND EXISTS (SELECT 1 FROM public.comercio_usuarios cu WHERE cu.comercio_id = p.comercio_id AND cu.user_id = auth.uid() AND cu.rol = ''operador'' AND cu.activo)
            AND EXISTS (SELECT 1 FROM public.campo_operarios o WHERE o.comercio_id = p.comercio_id AND o.user_id = auth.uid() AND o.activo)
        )
      )',
      v_tabla || '_insert_admin_operador', v_tabla, v_tabla, v_tabla
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (
        public.user_is_comercio_admin(comercio_id)
        OR EXISTS (
          SELECT 1 FROM public.campo_partes_trabajo p
          WHERE p.id = %I.parte_id AND p.comercio_id = %I.comercio_id
            AND p.estado = ''borrador'' AND p.propietario_user_id = auth.uid()
            AND EXISTS (SELECT 1 FROM public.comercio_usuarios cu WHERE cu.comercio_id = p.comercio_id AND cu.user_id = auth.uid() AND cu.rol = ''operador'' AND cu.activo)
            AND EXISTS (SELECT 1 FROM public.campo_operarios o WHERE o.comercio_id = p.comercio_id AND o.user_id = auth.uid() AND o.activo)
        )
      ) WITH CHECK (
        public.user_is_comercio_admin(comercio_id)
        OR EXISTS (
          SELECT 1 FROM public.campo_partes_trabajo p
          WHERE p.id = %I.parte_id AND p.comercio_id = %I.comercio_id
            AND p.estado = ''borrador'' AND p.propietario_user_id = auth.uid()
            AND EXISTS (SELECT 1 FROM public.comercio_usuarios cu WHERE cu.comercio_id = p.comercio_id AND cu.user_id = auth.uid() AND cu.rol = ''operador'' AND cu.activo)
            AND EXISTS (SELECT 1 FROM public.campo_operarios o WHERE o.comercio_id = p.comercio_id AND o.user_id = auth.uid() AND o.activo)
        )
      )',
      v_tabla || '_update_admin_operador', v_tabla,
      v_tabla, v_tabla, v_tabla, v_tabla
    );
  END LOOP;
END;
$policies$;

-- No se conceden columnas de estado, propiedad o auditoria. Se conservan los
-- GRANT por columna ya existentes para cabecera y los cuatro detalles.
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.campo_partes_trabajo,
  public.campo_parte_lotes,
  public.campo_parte_operarios,
  public.campo_parte_maquinarias,
  public.campo_parte_insumos
FROM authenticated;

REVOKE ALL ON FUNCTION public.campo_crear_parte(uuid, uuid, date, time without time zone, time without time zone, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campo_enviar_parte(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campo_confirmar_parte(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campo_rechazar_parte(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campo_reabrir_parte(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campo_descartar_parte(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campo_anular_parte(uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.campo_crear_parte(uuid, uuid, date, time without time zone, time without time zone, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campo_enviar_parte(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campo_confirmar_parte(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campo_rechazar_parte(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campo_reabrir_parte(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campo_descartar_parte(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campo_anular_parte(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.campo_crear_parte(uuid, uuid, date, time without time zone, time without time zone, text, text, text) IS
  'Crea un parte borrador derivando comercio y propiedad exclusivamente de la orden y auth.uid().';
COMMENT ON FUNCTION public.campo_confirmar_parte(uuid) IS
  'Confirma partes enviados. Compatibilidad transitoria: un administrador tambien puede confirmar un borrador hasta publicar el frontend nuevo.';
COMMENT ON FUNCTION public.campo_enviar_parte(uuid) IS
  'Envia un borrador propio o administrable despues de validar todos sus detalles activos.';
COMMENT ON FUNCTION public.campo_rechazar_parte(uuid, text) IS
  'Rechaza un parte enviado; solo administradores y con motivo obligatorio.';
COMMENT ON FUNCTION public.campo_reabrir_parte(uuid) IS
  'Reabre un parte rechazado conservando los datos historicos de envio y rechazo.';
COMMENT ON FUNCTION public.campo_descartar_parte(uuid, text) IS
  'Descarta logicamente un parte borrador o rechazado sin eliminar cabecera ni detalles.';
