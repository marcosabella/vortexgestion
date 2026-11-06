-- Estructura y funciones; no activa campañas ni modifica datos productivos.
BEGIN;
ALTER TABLE public.referidos_campanas ADD COLUMN mensaje text, ADD COLUMN condiciones text;

CREATE TABLE public.notificacion_presentaciones (
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  notificacion_id uuid NOT NULL REFERENCES public.notificaciones(id) ON DELETE CASCADE,
  presentada_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY(comercio_id,notificacion_id)
);
CREATE INDEX notificacion_presentaciones_notificacion ON public.notificacion_presentaciones(notificacion_id);
ALTER TABLE public.notificacion_presentaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notificacion_presentaciones FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.notificacion_presentaciones TO authenticated;
CREATE POLICY notificacion_presentaciones_lectura ON public.notificacion_presentaciones
  FOR SELECT TO authenticated USING(public.is_app_admin() OR public.user_is_comercio_admin(comercio_id));

CREATE FUNCTION public.admin_editar_campana_referidos(p_id text,p_titulo text,p_mensaje text,p_condiciones text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_app_admin() IS DISTINCT FROM true THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
  IF coalesce(length(btrim(p_titulo)),0) NOT BETWEEN 1 AND 200
    OR coalesce(length(btrim(p_mensaje)),0) NOT BETWEEN 1 AND 10000
    OR coalesce(length(btrim(p_condiciones)),0) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Completá título, mensaje y condiciones dentro de los límites permitidos'; END IF;
  UPDATE public.referidos_campanas SET titulo=btrim(p_titulo),mensaje=btrim(p_mensaje),condiciones=btrim(p_condiciones) WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaña no encontrada'; END IF;
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
  RETURN jsonb_build_object('campana_id',c.id,'titulo',c.titulo,'mensaje',c.mensaje,'condiciones',c.condiciones,'codigo',p.codigo,'modal_visto_at',p.modal_visto_at,'notificacion_leida_at',p.notificacion_leida_at,
    'pendientes',(SELECT count(*) FROM public.referidos_registros WHERE comercio_id=p_comercio_id AND estado IN ('consulta','contactado','pago_confirmado')),
    'meses_bonificados',(SELECT count(*) FROM public.referidos_registros WHERE comercio_id=p_comercio_id AND estado='bonificado'));
END; $$;

-- Guardado atómico: ningún aviso puede verse globalmente durante la carga de destinos.
CREATE FUNCTION public.admin_guardar_comunicacion(p_payload jsonb,p_id uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE aviso uuid; destinos uuid[]; dato public.notificaciones;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_admin() IS DISTINCT FROM true THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
  IF coalesce(length(btrim(p_payload->>'titulo')),0) NOT BETWEEN 1 AND 200
    OR coalesce(length(btrim(p_payload->>'mensaje')),0) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Completá título y mensaje dentro de los límites permitidos'; END IF;
  IF jsonb_typeof(p_payload->'comercioIds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Indicá los destinatarios del aviso'; END IF;
  SELECT coalesce(array_agg(DISTINCT value::uuid),'{}'::uuid[]) INTO destinos FROM jsonb_array_elements_text(p_payload->'comercioIds');
  IF EXISTS(SELECT 1 FROM unnest(destinos) d(id) WHERE NOT EXISTS(SELECT 1 FROM public.comercio c WHERE c.id=d.id)) THEN RAISE EXCEPTION 'Comercio destinatario inexistente'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO dato FROM public.notificaciones WHERE id=p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Notificación no encontrada'; END IF;
  END IF;
  IF p_payload ? 'metadata' AND jsonb_typeof(p_payload->'metadata') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Metadatos inválidos'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.notificaciones(titulo,mensaje,categoria,prioridad,comprobante_numero,comprobante_fecha,comprobante_monto,comprobante_periodo,metadata,created_by)
      VALUES(btrim(p_payload->>'titulo'),btrim(p_payload->>'mensaje'),p_payload->>'categoria',p_payload->>'prioridad',nullif(p_payload->>'comprobante_numero',''),nullif(p_payload->>'comprobante_fecha','')::date,(p_payload->>'comprobante_monto')::numeric,nullif(p_payload->>'comprobante_periodo',''),coalesce(p_payload->'metadata','{}'::jsonb),auth.uid()) RETURNING id INTO aviso;
  ELSE
    aviso:=p_id;
    UPDATE public.notificaciones SET titulo=btrim(p_payload->>'titulo'),mensaje=btrim(p_payload->>'mensaje'),categoria=p_payload->>'categoria',prioridad=p_payload->>'prioridad',
      comprobante_numero=nullif(p_payload->>'comprobante_numero',''),comprobante_fecha=nullif(p_payload->>'comprobante_fecha','')::date,comprobante_monto=(p_payload->>'comprobante_monto')::numeric,
      comprobante_periodo=nullif(p_payload->>'comprobante_periodo',''),metadata=coalesce(p_payload->'metadata',dato.metadata) WHERE id=aviso;
    DELETE FROM public.notificacion_destinatarios WHERE notificacion_id=aviso;
  END IF;
  INSERT INTO public.notificacion_destinatarios(notificacion_id,comercio_id) SELECT aviso,unnest(destinos);
  RETURN aviso;
END; $$;

CREATE FUNCTION public.mis_modales_pendientes(p_comercio_id uuid) RETURNS SETOF public.notificaciones
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT n.* FROM public.notificaciones n
    WHERE EXISTS(SELECT 1 FROM public.comercio WHERE id=p_comercio_id AND activo)
      AND n.activo AND n.metadata->'mostrar_modal'='true'::jsonb
      AND public.notificacion_visible_para_comercio(n.id,p_comercio_id)
      AND NOT EXISTS(SELECT 1 FROM public.notificacion_presentaciones p WHERE p.comercio_id=p_comercio_id AND p.notificacion_id=n.id)
    ORDER BY CASE n.prioridad WHEN 'alta' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,n.created_at,n.id LIMIT 50;
END; $$;

-- Se confirma al cerrar el modal, para no consumirlo por una solicitud previa al render.
CREATE FUNCTION public.confirmar_presentacion_notificacion(p_comercio_id uuid,p_notificacion_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.comercio WHERE id=p_comercio_id AND activo)
    OR NOT public.notificacion_visible_para_comercio(p_notificacion_id,p_comercio_id)
    OR NOT EXISTS(SELECT 1 FROM public.notificaciones WHERE id=p_notificacion_id AND metadata->'mostrar_modal'='true'::jsonb)
    THEN RAISE EXCEPTION 'Notificación no disponible'; END IF;
  INSERT INTO public.notificacion_presentaciones(comercio_id,notificacion_id,user_id) VALUES(p_comercio_id,p_notificacion_id,auth.uid()) ON CONFLICT DO NOTHING;
END; $$;

REVOKE ALL ON FUNCTION public.admin_editar_campana_referidos(text,text,text,text),public.admin_guardar_comunicacion(jsonb,uuid),public.mis_modales_pendientes(uuid),public.confirmar_presentacion_notificacion(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_editar_campana_referidos(text,text,text,text),public.admin_guardar_comunicacion(jsonb,uuid),public.mis_modales_pendientes(uuid),public.confirmar_presentacion_notificacion(uuid,uuid) TO authenticated;
COMMIT;
