-- Solicitudes autenticadas para el generador bajo demanda en Netlify.
CREATE FUNCTION public.solicitar_admin_backup_cloud(p_comercio_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result uuid;
BEGIN
 IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Solo el administrador general puede generar copias' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(20261120,1200);
 IF to_regclass('public.admin_backup_restore_lock') IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM public.admin_backup_restore_lock) THEN RAISE EXCEPTION 'Hay una restauración en curso'; END IF;
 END IF;
 IF p_comercio_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.comercio WHERE id=p_comercio_id) THEN RAISE EXCEPTION 'El comercio no existe'; END IF;
 UPDATE public.admin_backups SET estado='fallido',finalizado_at=now(),error='El proceso superó su plazo. Se puede solicitar otra copia.' WHERE estado IN ('pendiente','procesando') AND created_at < now()-interval '20 minutes';
 INSERT INTO public.admin_backups(comercio_id,solicitado_por) VALUES(p_comercio_id,auth.uid()) RETURNING id INTO result;
 RETURN result;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Ya hay una copia pendiente o en proceso';
END $$;
REVOKE ALL ON FUNCTION public.solicitar_admin_backup_cloud(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.solicitar_admin_backup_cloud(uuid) TO authenticated;

CREATE FUNCTION public.tomar_admin_backup_cloud(p_id uuid)
RETURNS SETOF public.admin_backups LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 UPDATE public.admin_backups SET estado='procesando',iniciado_at=now() WHERE id=p_id AND estado='pendiente' RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.tomar_admin_backup_cloud(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tomar_admin_backup_cloud(uuid) TO service_role;
