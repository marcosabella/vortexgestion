CREATE OR REPLACE FUNCTION public.campo_validate_parte_detail_relations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_estado text; v_labor uuid; v_activo boolean; v_unidad text; v_asignacion_labor uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF public.user_is_comercio_admin(NEW.comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'campo_admin_requerido'; END IF;
  SELECT p.estado, p.orden_labor_id INTO v_estado, v_labor FROM public.campo_partes_trabajo p WHERE p.id = NEW.parte_id AND p.comercio_id = NEW.comercio_id FOR UPDATE;
  IF v_estado IS NULL THEN RAISE EXCEPTION 'campo_parte_invalido'; END IF;
  IF v_estado <> 'borrador' THEN RAISE EXCEPTION 'campo_parte_congelado'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.parte_id IS DISTINCT FROM OLD.parte_id THEN RAISE EXCEPTION 'campo_parte_detalle_inmutable'; END IF;
  IF TG_TABLE_NAME = 'campo_parte_lotes' THEN
    IF TG_OP = 'UPDATE' AND NEW.orden_labor_lote_id IS DISTINCT FROM OLD.orden_labor_lote_id THEN RAISE EXCEPTION 'campo_asignacion_parte_inmutable'; END IF;
    SELECT oll.orden_labor_id, oll.activo, l.unidad INTO v_asignacion_labor, v_activo, v_unidad
    FROM public.campo_orden_labor_lotes oll JOIN public.campo_orden_labores l ON l.id = oll.orden_labor_id AND l.comercio_id = oll.comercio_id
    WHERE oll.id = NEW.orden_labor_lote_id AND oll.comercio_id = NEW.comercio_id;
    IF v_asignacion_labor IS NULL OR v_asignacion_labor IS DISTINCT FROM v_labor THEN RAISE EXCEPTION 'campo_asignacion_planificada_invalida'; END IF;
    IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.activo AND NOT OLD.activo)) AND v_activo IS DISTINCT FROM true THEN RAISE EXCEPTION 'campo_asignacion_planificada_inactiva'; END IF;
    IF v_unidad = 'fijo' AND NEW.cantidad_ejecutada <> 1 THEN RAISE EXCEPTION 'campo_cantidad_fijo_debe_ser_uno'; END IF;
  ELSIF TG_TABLE_NAME = 'campo_parte_operarios' THEN
    IF TG_OP = 'UPDATE' AND NEW.operario_id IS DISTINCT FROM OLD.operario_id THEN RAISE EXCEPTION 'campo_operario_parte_inmutable'; END IF;
    SELECT o.activo INTO v_activo FROM public.campo_operarios o WHERE o.id = NEW.operario_id AND o.comercio_id = NEW.comercio_id;
    IF v_activo IS NULL THEN RAISE EXCEPTION 'campo_operario_invalido'; END IF;
    IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.activo AND NOT OLD.activo)) AND NOT v_activo THEN RAISE EXCEPTION 'campo_operario_inactivo'; END IF;
  ELSIF TG_TABLE_NAME = 'campo_parte_maquinarias' THEN
    IF TG_OP = 'UPDATE' AND NEW.maquinaria_id IS DISTINCT FROM OLD.maquinaria_id THEN RAISE EXCEPTION 'campo_maquinaria_parte_inmutable'; END IF;
    SELECT m.activo INTO v_activo FROM public.campo_maquinarias m WHERE m.id = NEW.maquinaria_id AND m.comercio_id = NEW.comercio_id;
    IF v_activo IS NULL THEN RAISE EXCEPTION 'campo_maquinaria_invalida'; END IF;
    IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.activo AND NOT OLD.activo)) AND NOT v_activo THEN RAISE EXCEPTION 'campo_maquinaria_inactiva'; END IF;
  ELSIF TG_TABLE_NAME = 'campo_parte_insumos' THEN
    IF TG_OP = 'INSERT' THEN
      SELECT i.activo, i.unidad INTO v_activo, v_unidad FROM public.campo_insumos i WHERE i.id = NEW.insumo_id AND i.comercio_id = NEW.comercio_id;
      IF v_activo IS NULL THEN RAISE EXCEPTION 'campo_insumo_invalido'; END IF;
      IF v_activo IS DISTINCT FROM true THEN RAISE EXCEPTION 'campo_insumo_inactivo'; END IF;
      IF NEW.unidad IS DISTINCT FROM v_unidad THEN RAISE EXCEPTION 'campo_insumo_unidad_invalida'; END IF;
    ELSE
      IF NEW.insumo_id IS DISTINCT FROM OLD.insumo_id THEN RAISE EXCEPTION 'campo_insumo_parte_inmutable'; END IF;
      IF NEW.unidad IS DISTINCT FROM OLD.unidad THEN RAISE EXCEPTION 'campo_insumo_unidad_inmutable'; END IF;
      IF NEW.activo AND NOT OLD.activo THEN
        SELECT i.activo INTO v_activo FROM public.campo_insumos i WHERE i.id = NEW.insumo_id AND i.comercio_id = NEW.comercio_id;
        IF v_activo IS NULL THEN RAISE EXCEPTION 'campo_insumo_invalido'; END IF;
        IF v_activo IS DISTINCT FROM true THEN RAISE EXCEPTION 'campo_insumo_inactivo'; END IF;
      END IF;
    END IF;
  ELSE RAISE EXCEPTION 'campo_detalle_parte_no_soportado';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.campo_validate_parte_detail_relations() FROM PUBLIC, anon, authenticated;
