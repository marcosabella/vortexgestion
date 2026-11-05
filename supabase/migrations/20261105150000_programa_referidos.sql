-- Estructura y operaciones. La activacion comercial se versiona por separado.
BEGIN;
-- Configuracion global de plataforma, no pertenece a un tenant.
CREATE TABLE public.referidos_campanas (
  id text PRIMARY KEY, titulo text NOT NULL, activa boolean NOT NULL DEFAULT false,
  creada_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX referidos_una_campana_activa ON public.referidos_campanas(activa) WHERE activa;
CREATE TABLE public.referidos_participaciones (
  comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  campana_id text NOT NULL REFERENCES public.referidos_campanas(id),
  codigo text NOT NULL UNIQUE DEFAULT ('VX-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  modal_visto_at timestamptz, notificacion_leida_at timestamptz,
  PRIMARY KEY(comercio_id,campana_id)
);
CREATE INDEX referidos_participaciones_campana ON public.referidos_participaciones(campana_id);
CREATE TABLE public.referidos_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL,
  campana_id text NOT NULL,
  consulta_id uuid NOT NULL UNIQUE REFERENCES public.consultas_landing(id),
  estado text NOT NULL DEFAULT 'consulta' CHECK(estado IN ('consulta','contactado','pago_confirmado','bonificado','descartado')),
  nuevo_comercio_id uuid UNIQUE REFERENCES public.comercio(id),
  nuevo_cuit text UNIQUE CHECK(nuevo_cuit ~ '^[0-9]{11}$'),
  evidencia_pago text, pago_confirmado_at timestamptz,
  bonificado_at timestamptz, bonificado_por uuid REFERENCES auth.users(id),
  vigencia_anterior date, vigencia_nueva date,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(comercio_id,campana_id) REFERENCES public.referidos_participaciones(comercio_id,campana_id),
  CHECK(nuevo_comercio_id IS DISTINCT FROM comercio_id),
  CHECK(estado NOT IN ('pago_confirmado','bonificado') OR (nuevo_comercio_id IS NOT NULL AND nuevo_cuit IS NOT NULL AND pago_confirmado_at IS NOT NULL AND coalesce(length(btrim(evidencia_pago)),0) BETWEEN 3 AND 500)),
  CHECK(estado<>'bonificado' OR (bonificado_at IS NOT NULL AND bonificado_por IS NOT NULL AND vigencia_nueva IS NOT NULL))
);
CREATE INDEX referidos_registros_comercio ON public.referidos_registros(comercio_id,creado_en DESC);
CREATE INDEX referidos_registros_campana ON public.referidos_registros(campana_id,estado);
ALTER TABLE public.referidos_campanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referidos_participaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referidos_registros ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referidos_campanas,public.referidos_participaciones,public.referidos_registros FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.referidos_campanas,public.referidos_participaciones,public.referidos_registros TO authenticated;
CREATE POLICY referidos_campanas_lectura ON public.referidos_campanas FOR SELECT TO authenticated USING(activa OR public.is_app_admin());
CREATE POLICY referidos_participaciones_lectura ON public.referidos_participaciones FOR SELECT TO authenticated USING(public.user_is_comercio_admin(comercio_id) OR public.is_app_admin());
-- Los detalles del interesado son exclusivos de plataforma; el referente recibe solo contadores.
CREATE POLICY referidos_registros_admin ON public.referidos_registros FOR SELECT TO authenticated USING(public.is_app_admin());

CREATE FUNCTION public.mi_programa_referidos(p_comercio_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.referidos_campanas; p public.referidos_participaciones;
BEGIN
  IF auth.uid() IS NULL OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.comercio WHERE id=p_comercio_id AND activo) THEN RETURN NULL; END IF;
  SELECT * INTO c FROM public.referidos_campanas WHERE activa;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.referidos_participaciones(comercio_id,campana_id) VALUES(p_comercio_id,c.id) ON CONFLICT(comercio_id,campana_id) DO NOTHING;
  SELECT * INTO p FROM public.referidos_participaciones WHERE comercio_id=p_comercio_id AND campana_id=c.id;
  RETURN jsonb_build_object('campana_id',c.id,'titulo',c.titulo,'codigo',p.codigo,'modal_visto_at',p.modal_visto_at,'notificacion_leida_at',p.notificacion_leida_at,
    'pendientes',(SELECT count(*) FROM public.referidos_registros WHERE comercio_id=p_comercio_id AND estado IN ('consulta','contactado','pago_confirmado')),
    'meses_bonificados',(SELECT count(*) FROM public.referidos_registros WHERE comercio_id=p_comercio_id AND estado='bonificado'));
END; $$;

CREATE FUNCTION public.reclamar_modal_referidos(p_comercio_id uuid,p_campana_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
  UPDATE public.referidos_participaciones p SET modal_visto_at=now()
    WHERE comercio_id=p_comercio_id AND campana_id=p_campana_id AND modal_visto_at IS NULL
      AND EXISTS(SELECT 1 FROM public.referidos_campanas WHERE id=p_campana_id AND activa);
  RETURN FOUND;
END; $$;
CREATE FUNCTION public.leer_notificacion_referidos(p_comercio_id uuid,p_campana_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
  UPDATE public.referidos_participaciones SET notificacion_leida_at=coalesce(notificacion_leida_at,now()) WHERE comercio_id=p_comercio_id AND campana_id=p_campana_id;
END; $$;

CREATE FUNCTION public.enviar_consulta_referida(p_id uuid,p_nombre text,p_negocio text,p_email text,p_telefono text,p_mensaje text,p_honey text,p_codigo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.referidos_participaciones; existente public.referidos_registros;
BEGIN
  SELECT rp.* INTO p FROM public.referidos_participaciones rp JOIN public.referidos_campanas c ON c.id=rp.campana_id AND c.activa
    JOIN public.comercio co ON co.id=rp.comercio_id AND co.activo WHERE rp.codigo=upper(btrim(p_codigo));
  IF NOT FOUND THEN RAISE EXCEPTION 'El codigo de recomendacion no esta disponible. Revisa el enlace.' USING ERRCODE='22023'; END IF;
  -- Mismo bloqueo que la consulta original: atribucion y limites atomicos.
  PERFORM pg_advisory_xact_lock(29102026,120000);
  SELECT * INTO existente FROM public.referidos_registros WHERE consulta_id=p_id;
  IF FOUND THEN
    IF existente.comercio_id<>p.comercio_id OR existente.campana_id<>p.campana_id THEN RAISE EXCEPTION 'La consulta ya fue registrada con otra referencia'; END IF;
    RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM public.consultas_landing WHERE id=p_id) THEN RAISE EXCEPTION 'Inicia una consulta nueva para registrar la referencia'; END IF;
  PERFORM public.enviar_consulta_landing(p_id,p_nombre,p_negocio,p_email,p_telefono,p_mensaje,p_honey);
  INSERT INTO public.referidos_registros(comercio_id,campana_id,consulta_id) VALUES(p.comercio_id,p.campana_id,p_id);
END; $$;

CREATE FUNCTION public.admin_gestionar_referido(p_id uuid,p_accion text,p_nuevo_comercio_id uuid DEFAULT NULL,p_evidencia text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.referidos_registros; origen public.comercio; destino public.comercio; fecha date; aviso uuid;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_admin() IS DISTINCT FROM true THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.referidos_registros WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Referencia no encontrada'; END IF;
  IF r.estado='bonificado' THEN
    IF p_accion='bonificar' THEN RETURN to_jsonb(r); END IF;
    RAISE EXCEPTION 'La bonificacion ya fue aplicada';
  END IF;
  IF p_accion='contactar' AND r.estado='consulta' THEN
    UPDATE public.referidos_registros SET estado='contactado',actualizado_en=now() WHERE id=r.id RETURNING * INTO r;
  ELSIF p_accion='descartar' AND r.estado IN ('consulta','contactado') THEN
    UPDATE public.referidos_registros SET estado='descartado',actualizado_en=now() WHERE id=r.id RETURNING * INTO r;
  ELSIF p_accion='confirmar_pago' AND r.estado IN ('consulta','contactado') THEN
    IF coalesce(length(btrim(p_evidencia)),0) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Indica el comprobante o referencia del primer pago confirmado'; END IF;
    SELECT * INTO origen FROM public.comercio WHERE id=r.comercio_id;
    SELECT * INTO destino FROM public.comercio WHERE id=p_nuevo_comercio_id AND activo FOR UPDATE;
    IF NOT FOUND OR destino.id=origen.id OR destino.created_at<(SELECT creado_en FROM public.consultas_landing WHERE id=r.consulta_id)
      OR regexp_replace(coalesce(destino.cuit,''),'[^0-9]','','g') !~ '^[0-9]{11}$'
      OR regexp_replace(coalesce(destino.cuit,''),'[^0-9]','','g')=regexp_replace(coalesce(origen.cuit,''),'[^0-9]','','g')
      OR EXISTS(SELECT 1 FROM public.comercio_usuarios a JOIN public.comercio_usuarios b ON a.user_id=b.user_id
        WHERE a.comercio_id=origen.id AND b.comercio_id=destino.id AND a.rol='admin' AND b.rol='admin' AND a.activo AND b.activo
          AND NOT EXISTS(SELECT 1 FROM public.app_admins aa WHERE aa.user_id=a.user_id)) THEN
      RAISE EXCEPTION 'Selecciona un comercio nuevo, con CUIT propio y sin administradores compartidos con el referente';
    END IF;
    UPDATE public.referidos_registros SET estado='pago_confirmado',nuevo_comercio_id=destino.id,nuevo_cuit=regexp_replace(destino.cuit,'[^0-9]','','g'),evidencia_pago=btrim(p_evidencia),pago_confirmado_at=now(),actualizado_en=now() WHERE id=r.id RETURNING * INTO r;
  ELSIF p_accion='bonificar' AND r.estado='pago_confirmado' THEN
    SELECT * INTO origen FROM public.comercio WHERE id=r.comercio_id AND activo FOR UPDATE;
    IF NOT FOUND OR origen.membresia_vigente_hasta IS NULL THEN RAISE EXCEPTION 'El referente necesita una licencia activa con vencimiento definido'; END IF;
    SELECT * INTO destino FROM public.comercio WHERE id=r.nuevo_comercio_id AND activo FOR UPDATE;
    IF NOT FOUND OR regexp_replace(coalesce(destino.cuit,''),'[^0-9]','','g') IS DISTINCT FROM r.nuevo_cuit
      OR r.nuevo_cuit=regexp_replace(coalesce(origen.cuit,''),'[^0-9]','','g')
      OR EXISTS(SELECT 1 FROM public.comercio_usuarios a JOIN public.comercio_usuarios b ON a.user_id=b.user_id
        WHERE a.comercio_id=origen.id AND b.comercio_id=destino.id AND a.rol='admin' AND b.rol='admin' AND a.activo AND b.activo
          AND NOT EXISTS(SELECT 1 FROM public.app_admins aa WHERE aa.user_id=a.user_id)) THEN RAISE EXCEPTION 'El comercio contratado cambio desde la confirmacion del pago'; END IF;
    fecha:=(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
    fecha:=(greatest(origen.membresia_vigente_hasta,fecha)+interval '1 month')::date;
    UPDATE public.comercio SET membresia_vigente_hasta=fecha WHERE id=origen.id;
    UPDATE public.referidos_registros SET estado='bonificado',bonificado_at=now(),bonificado_por=auth.uid(),vigencia_anterior=origen.membresia_vigente_hasta,vigencia_nueva=fecha,actualizado_en=now() WHERE id=r.id RETURNING * INTO r;
    INSERT INTO public.notificaciones(titulo,mensaje,categoria,prioridad,created_by,metadata)
      VALUES('¡Ganaste un mes de Vortex!','Tu recomendación se convirtió en un nuevo cliente. Aplicamos un mes bonificado a tu licencia. Nuevo vencimiento: '||to_char(fecha,'DD/MM/YYYY')||'.','abono','normal',auth.uid(),jsonb_build_object('tipo','referido_bonificado','referido_id',r.id)) RETURNING id INTO aviso;
    INSERT INTO public.notificacion_destinatarios(notificacion_id,comercio_id) VALUES(aviso,r.comercio_id);
  ELSE RAISE EXCEPTION 'Transicion de referido no permitida'; END IF;
  RETURN to_jsonb(r);
END; $$;
REVOKE ALL ON FUNCTION public.mi_programa_referidos(uuid),public.reclamar_modal_referidos(uuid,text),public.leer_notificacion_referidos(uuid,text),public.admin_gestionar_referido(uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mi_programa_referidos(uuid),public.reclamar_modal_referidos(uuid,text),public.leer_notificacion_referidos(uuid,text),public.admin_gestionar_referido(uuid,text,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.enviar_consulta_referida(uuid,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enviar_consulta_referida(uuid,text,text,text,text,text,text,text) TO anon,authenticated;
COMMIT;
