-- Estado del aviso, independiente de la vigencia del programa y sus premios.
BEGIN;
ALTER TABLE public.referidos_campanas ADD COLUMN aviso_estado text NOT NULL DEFAULT 'activo'
  CHECK(aviso_estado IN ('activo','archivado','eliminado'));

CREATE FUNCTION public.admin_estado_aviso_referidos(p_id text,p_accion text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE estado text;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_admin() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501';
  END IF;
  estado:=CASE p_accion WHEN 'archivar' THEN 'archivado' WHEN 'restaurar' THEN 'activo' WHEN 'eliminar' THEN 'eliminado' END;
  IF estado IS NULL THEN RAISE EXCEPTION 'Acción no válida'; END IF;
  UPDATE public.referidos_campanas SET aviso_estado=estado WHERE id=p_id AND aviso_estado<>'eliminado';
  IF NOT FOUND THEN RAISE EXCEPTION 'Aviso de campaña no disponible'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.mi_programa_referidos(p_comercio_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.referidos_campanas; p public.referidos_participaciones;
BEGIN
  IF auth.uid() IS NULL OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.comercio WHERE id=p_comercio_id AND activo) THEN RETURN NULL; END IF;
  SELECT * INTO c FROM public.referidos_campanas WHERE activa;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.referidos_participaciones(comercio_id,campana_id) VALUES(p_comercio_id,c.id) ON CONFLICT(comercio_id,campana_id) DO NOTHING;
  SELECT * INTO p FROM public.referidos_participaciones WHERE comercio_id=p_comercio_id AND campana_id=c.id;
  RETURN jsonb_build_object('campana_id',c.id,'titulo',c.titulo,'mensaje',c.mensaje,'condiciones',c.condiciones,'aviso_estado',c.aviso_estado,'codigo',p.codigo,'modal_visto_at',p.modal_visto_at,'notificacion_leida_at',p.notificacion_leida_at,
    'pendientes',(SELECT count(*) FROM public.referidos_registros WHERE comercio_id=p_comercio_id AND estado IN ('consulta','contactado','pago_confirmado')),
    'meses_bonificados',(SELECT count(*) FROM public.referidos_registros WHERE comercio_id=p_comercio_id AND estado='bonificado'));
END; $$;

-- Un navegador que conserve datos anteriores tampoco puede consumir el modal archivado.
CREATE OR REPLACE FUNCTION public.reclamar_modal_referidos(p_comercio_id uuid,p_campana_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
  UPDATE public.referidos_participaciones p SET modal_visto_at=now()
    WHERE comercio_id=p_comercio_id AND campana_id=p_campana_id AND modal_visto_at IS NULL
      AND EXISTS(SELECT 1 FROM public.referidos_campanas WHERE id=p_campana_id AND activa AND aviso_estado='activo');
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.admin_estado_aviso_referidos(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_estado_aviso_referidos(text,text) TO authenticated;
COMMIT;
