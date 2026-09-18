-- Snapshot inmutable de maquinaria y ancho para superficie GPS estimada.
BEGIN;

ALTER TABLE public.campo_maquinarias ADD COLUMN ancho_trabajo_m numeric(8,3);
ALTER TABLE public.campo_maquinarias ADD CONSTRAINT campo_maquinarias_ancho_trabajo_valido CHECK (ancho_trabajo_m IS NULL OR (ancho_trabajo_m <> 'NaN'::numeric AND ancho_trabajo_m > 0 AND ancho_trabajo_m <= 100));
ALTER TABLE public.campo_gps_sesiones ADD COLUMN parte_maquinaria_id uuid;
ALTER TABLE public.campo_gps_sesiones ADD COLUMN ancho_trabajo_m_snapshot numeric(8,3);
ALTER TABLE public.campo_gps_sesiones ADD CONSTRAINT campo_gps_sesiones_ancho_snapshot_valido CHECK (ancho_trabajo_m_snapshot IS NULL OR (ancho_trabajo_m_snapshot <> 'NaN'::numeric AND ancho_trabajo_m_snapshot > 0 AND ancho_trabajo_m_snapshot <= 100));
ALTER TABLE public.campo_gps_sesiones ADD CONSTRAINT campo_gps_sesiones_parte_maquinaria_fkey FOREIGN KEY (comercio_id, parte_maquinaria_id) REFERENCES public.campo_parte_maquinarias(comercio_id,id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.campo_gps_validar_snapshot_maquinaria()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $function$
DECLARE v_asignacion public.campo_parte_maquinarias; v_maquinaria public.campo_maquinarias;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.parte_maquinaria_id IS DISTINCT FROM OLD.parte_maquinaria_id OR NEW.ancho_trabajo_m_snapshot IS DISTINCT FROM OLD.ancho_trabajo_m_snapshot) THEN RAISE EXCEPTION 'campo_gps_snapshot_maquinaria_inmutable'; END IF;
  IF NEW.parte_maquinaria_id IS NULL THEN
    IF NEW.ancho_trabajo_m_snapshot IS NOT NULL THEN RAISE EXCEPTION 'campo_gps_snapshot_maquinaria_invalido'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO v_asignacion FROM public.campo_parte_maquinarias WHERE comercio_id=NEW.comercio_id AND id=NEW.parte_maquinaria_id AND parte_id=NEW.parte_id AND activo;
  SELECT * INTO v_maquinaria FROM public.campo_maquinarias WHERE comercio_id=NEW.comercio_id AND id=v_asignacion.maquinaria_id AND activo;
  IF v_asignacion.id IS NULL OR v_maquinaria.id IS NULL OR NEW.ancho_trabajo_m_snapshot IS NULL OR NEW.ancho_trabajo_m_snapshot <> v_maquinaria.ancho_trabajo_m THEN RAISE EXCEPTION 'campo_gps_maquinaria_no_elegible'; END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER campo_gps_sesiones_snapshot_maquinaria BEFORE INSERT OR UPDATE ON public.campo_gps_sesiones FOR EACH ROW EXECUTE FUNCTION public.campo_gps_validar_snapshot_maquinaria();

DROP FUNCTION public.campo_gps_iniciar_sesion(uuid);
CREATE FUNCTION public.campo_gps_iniciar_sesion(p_parte_id uuid,p_parte_maquinaria_id uuid DEFAULT NULL)
RETURNS public.campo_gps_sesiones LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v_auth public.campo_gps_sesiones; v_sesion public.campo_gps_sesiones; v_ancho numeric;
BEGIN
  v_auth:=public.campo_gps_autorizar_operador(p_parte_id); PERFORM pg_advisory_xact_lock(hashtextextended('campo_gps:'||v_auth.parte_id::text||':'||v_auth.operador_id::text,0));
  SELECT * INTO v_sesion FROM public.campo_gps_sesiones WHERE comercio_id=v_auth.comercio_id AND parte_id=v_auth.parte_id AND operador_id=v_auth.operador_id AND estado IN ('activa','pausada') FOR UPDATE;
  IF FOUND THEN RETURN v_sesion; END IF;
  IF p_parte_maquinaria_id IS NOT NULL THEN SELECT m.ancho_trabajo_m INTO v_ancho FROM public.campo_parte_maquinarias pm JOIN public.campo_maquinarias m ON m.comercio_id=pm.comercio_id AND m.id=pm.maquinaria_id WHERE pm.comercio_id=v_auth.comercio_id AND pm.id=p_parte_maquinaria_id AND pm.parte_id=v_auth.parte_id AND pm.activo AND m.activo; IF v_ancho IS NULL THEN RAISE EXCEPTION 'campo_gps_maquinaria_no_elegible' USING ERRCODE='42501'; END IF; END IF;
  INSERT INTO public.campo_gps_sesiones(comercio_id,orden_id,parte_id,operador_id,usuario_id,parte_maquinaria_id,ancho_trabajo_m_snapshot) VALUES(v_auth.comercio_id,v_auth.orden_id,v_auth.parte_id,v_auth.operador_id,v_auth.usuario_id,p_parte_maquinaria_id,v_ancho) RETURNING * INTO v_sesion; RETURN v_sesion;
END;
$function$;
REVOKE ALL ON FUNCTION public.campo_gps_validar_snapshot_maquinaria() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.campo_gps_iniciar_sesion(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.campo_gps_iniciar_sesion(uuid,uuid) TO authenticated;

ALTER FUNCTION public.campo_gps_metricas_sesion(uuid) RENAME TO campo_gps_metricas_sesion_base;
CREATE FUNCTION public.campo_gps_metricas_sesion(p_sesion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v_base jsonb; v_sesion public.campo_gps_sesiones; v_maquina public.campo_maquinarias; v_unidad text; v_declarada numeric; v_distancia numeric; v_superficie numeric; v_diferencia numeric;
BEGIN
  v_base:=public.campo_gps_metricas_sesion_base(p_sesion_id);
  SELECT * INTO v_sesion FROM public.campo_gps_sesiones WHERE id=p_sesion_id;
  IF v_sesion.parte_maquinaria_id IS NULL OR v_sesion.ancho_trabajo_m_snapshot IS NULL THEN RETURN v_base || jsonb_build_object('maquinaria',NULL,'ancho_trabajo_m_snapshot',NULL,'superficie_estimada_ha',NULL,'superficie_declarada_ha',NULL,'diferencia_ha',NULL,'diferencia_porcentaje',NULL); END IF;
  SELECT m.* INTO v_maquina FROM public.campo_parte_maquinarias pm JOIN public.campo_maquinarias m ON m.comercio_id=pm.comercio_id AND m.id=pm.maquinaria_id WHERE pm.comercio_id=v_sesion.comercio_id AND pm.id=v_sesion.parte_maquinaria_id;
  SELECT l.unidad INTO v_unidad FROM public.campo_partes_trabajo p JOIN public.campo_orden_labores l ON l.comercio_id=p.comercio_id AND l.id=p.orden_labor_id WHERE p.comercio_id=v_sesion.comercio_id AND p.id=v_sesion.parte_id;
  v_distancia:=coalesce((v_base->>'distancia_valida_m')::numeric,0); v_superficie:=v_distancia*v_sesion.ancho_trabajo_m_snapshot/10000;
  IF v_unidad='ha' THEN SELECT coalesce(sum(cantidad_ejecutada),0) INTO v_declarada FROM public.campo_parte_lotes WHERE comercio_id=v_sesion.comercio_id AND parte_id=v_sesion.parte_id AND activo; v_diferencia:=v_superficie-v_declarada; END IF;
  RETURN v_base || jsonb_build_object('maquinaria',jsonb_build_object('id',v_maquina.id,'nombre',v_maquina.nombre),'ancho_trabajo_m_snapshot',v_sesion.ancho_trabajo_m_snapshot,'superficie_estimada_ha',v_superficie,'superficie_declarada_ha',v_declarada,'diferencia_ha',v_diferencia,'diferencia_porcentaje',CASE WHEN v_declarada>0 THEN v_diferencia*100/v_declarada ELSE NULL END);
END;
$function$;
REVOKE ALL ON FUNCTION public.campo_gps_metricas_sesion_base(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.campo_gps_metricas_sesion(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.campo_gps_metricas_sesion(uuid) TO authenticated;
COMMIT;
