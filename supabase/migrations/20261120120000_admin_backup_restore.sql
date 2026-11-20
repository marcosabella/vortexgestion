-- Estructura de restauraciones. No restaura ni repara datos de comercios.
CREATE TABLE public.admin_backup_restores (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 comercio_id uuid REFERENCES public.comercio(id) ON DELETE RESTRICT,
 solicitado_por uuid NOT NULL REFERENCES auth.users(id),
 estado text NOT NULL DEFAULT 'cargando' CHECK(estado IN('cargando','analisis_pendiente','analizando','listo','restauracion_pendiente','restaurando','completado','fallido','interrumpido')),
 archivo text NOT NULL,
 bytes bigint NOT NULL CHECK(bytes>0 AND bytes<=268435456),
 sha256 text,
 resumen jsonb,
 backup_previo_id uuid REFERENCES public.admin_backups(id),
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_backup_restores_comercio_idx ON public.admin_backup_restores(comercio_id,created_at DESC);
ALTER TABLE public.admin_backup_restores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_backup_restores FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.admin_backup_restores TO authenticated;
GRANT ALL ON public.admin_backup_restores TO service_role;
CREATE POLICY admin_backup_restores_select ON public.admin_backup_restores FOR SELECT TO authenticated USING(public.is_app_admin());

-- Sin expiración automática: un corte durante Storage requiere reanudar.
CREATE TABLE public.admin_backup_restore_lock (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 restore_id uuid NOT NULL UNIQUE REFERENCES public.admin_backup_restores(id),
 backend_pid integer,
 storage_token text NOT NULL DEFAULT (replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''))
);
ALTER TABLE public.admin_backup_restore_lock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_backup_restore_lock FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.admin_backup_restore_lock TO service_role;

CREATE FUNCTION public.admin_backup_restore_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE active public.admin_backup_restore_lock; request_headers jsonb;
BEGIN
 IF TG_TABLE_SCHEMA='storage' AND TG_TABLE_NAME='objects' AND TG_LEVEL='ROW' THEN
  IF coalesce(CASE WHEN TG_OP='DELETE' THEN OLD.bucket_id ELSE NEW.bucket_id END='admin-backups',false) AND coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'='service_role',false) THEN
   IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
 END IF;
 -- Mismo candado que la activación: espera a que terminen escrituras previas.
 PERFORM pg_advisory_xact_lock_shared(20261120,1200);
 SELECT * INTO active FROM public.admin_backup_restore_lock WHERE id=true;
 IF FOUND AND active.backend_pid IS DISTINCT FROM pg_backend_pid() THEN
  request_headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  IF NOT coalesce(TG_TABLE_SCHEMA='storage' AND nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'='service_role' AND request_headers->>'x-vortex-restore-token'=active.storage_token,false) THEN
   RAISE EXCEPTION 'Sistema en mantenimiento por restauración. Volvé a intentar cuando finalice.' USING ERRCODE='55000';
  END IF;
 END IF;
 IF TG_LEVEL='ROW' THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.admin_backup_restore_guard() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN('r','p') AND NOT relispartition AND relname NOT IN('app_admins','admin_backups','admin_backup_worker','admin_backup_restores','admin_backup_restore_lock') LOOP
  EXECUTE format('CREATE TRIGGER admin_backup_restore_guard BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.admin_backup_restore_guard()',t.relname);
 END LOOP;
END $$;
CREATE TRIGGER admin_backup_restore_guard BEFORE INSERT OR UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.admin_backup_restore_guard();
CREATE TRIGGER admin_backup_restore_truncate_guard BEFORE TRUNCATE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION public.admin_backup_restore_guard();
CREATE TRIGGER admin_backup_restore_guard BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION public.admin_backup_restore_guard();

CREATE FUNCTION public.admin_backup_restore_request(p_action text,p_id uuid DEFAULT NULL,p_bytes bigint DEFAULT NULL,p_comercio_id uuid DEFAULT NULL,p_confirmation text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result uuid; prior uuid; job public.admin_backup_restores;
BEGIN
 IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Solo el administrador general puede restaurar' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(20261120,1200);
 IF p_action='upload' THEN
  IF EXISTS(SELECT 1 FROM public.admin_backup_restore_lock) THEN RAISE EXCEPTION 'Hay una restauración en curso'; END IF;
  result:=gen_random_uuid();
  INSERT INTO public.admin_backup_restores(id,solicitado_por,archivo,bytes) VALUES(result,auth.uid(),'restore-inputs/'||result||'/source.enc',p_bytes);
  RETURN result;
 END IF;
 SELECT * INTO job FROM public.admin_backup_restores WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Restauración inexistente'; END IF;
 IF p_action='inspect' AND job.estado='cargando' THEN
  UPDATE public.admin_backup_restores SET estado='analisis_pendiente',updated_at=now() WHERE id=p_id;
 ELSIF p_action='apply' AND job.estado IN('listo','interrumpido') THEN
  IF p_confirmation IS DISTINCT FROM (CASE WHEN p_comercio_id IS NULL THEN 'RESTAURAR TODOS' ELSE 'RESTAURAR '||p_comercio_id::text END) THEN RAISE EXCEPTION 'Confirmación incorrecta'; END IF;
  IF job.estado='interrumpido' AND job.comercio_id IS DISTINCT FROM p_comercio_id THEN RAISE EXCEPTION 'No se puede cambiar el alcance al reanudar'; END IF;
  IF job.resumen->>'comercio_id' IS NOT NULL AND (job.resumen->>'comercio_id')::uuid IS DISTINCT FROM p_comercio_id THEN RAISE EXCEPTION 'La copia pertenece a otro comercio'; END IF;
  IF p_comercio_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(job.resumen->'comercios') c WHERE c->>'id'=p_comercio_id::text) THEN RAISE EXCEPTION 'El comercio no está en el archivo'; END IF;
  IF job.estado='interrumpido' THEN
   UPDATE public.admin_backups SET estado='fallido',finalizado_at=now(),error='El respaldo previo se interrumpió; se generará otro.' WHERE id=job.backup_previo_id AND (estado='pendiente' OR (estado='procesando' AND created_at<now()-interval '20 minutes'));
  END IF;
  IF EXISTS(SELECT 1 FROM public.admin_backups WHERE estado IN('pendiente','procesando')) THEN RAISE EXCEPTION 'Esperá a que finalice la copia en curso'; END IF;
  IF EXISTS(SELECT 1 FROM public.admin_backup_restore_lock WHERE restore_id<>p_id) THEN RAISE EXCEPTION 'Ya hay una restauración en curso'; END IF;
  INSERT INTO public.admin_backup_restore_lock(restore_id) VALUES(p_id) ON CONFLICT(id) DO NOTHING;
  prior:=job.backup_previo_id;
  IF NOT EXISTS(SELECT 1 FROM public.admin_backups WHERE id=prior AND estado='completado') THEN
   INSERT INTO public.admin_backups(comercio_id,solicitado_por) VALUES(NULL,auth.uid()) RETURNING id INTO prior;
  END IF;
  UPDATE public.admin_backup_restores SET comercio_id=p_comercio_id,backup_previo_id=prior,estado='restauracion_pendiente',error=NULL,updated_at=now() WHERE id=p_id;
 ELSE RAISE EXCEPTION 'La operación no corresponde al estado actual';
 END IF;
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_backup_restore_request(text,uuid,bigint,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_backup_restore_request(text,uuid,bigint,uuid,text) TO authenticated;

CREATE FUNCTION public.claim_admin_backup_restore(p_id uuid) RETURNS SETOF public.admin_backup_restores LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 UPDATE public.admin_backup_restores SET estado=CASE WHEN estado='analisis_pendiente' THEN 'analizando' ELSE 'restaurando' END,updated_at=now() WHERE id=p_id AND estado IN('analisis_pendiente','restauracion_pendiente') RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_admin_backup_restore(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_admin_backup_restore(uuid) TO service_role;

-- Recuperación de una invocación terminada abruptamente; nunca quita mantenimiento.
CREATE FUNCTION public.retry_admin_backup_restore(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Sin permiso' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(20261120,1200);
 UPDATE public.admin_backup_restores SET estado=CASE WHEN estado IN('analizando','analisis_pendiente') THEN 'analisis_pendiente' ELSE 'interrumpido' END,updated_at=now(),error='La ejecución se interrumpió. Revisá y reanudá el mismo alcance.' WHERE id=p_id AND estado IN('analizando','analisis_pendiente','restaurando','restauracion_pendiente') AND updated_at<now()-interval '20 minutes';
 IF NOT FOUND THEN RAISE EXCEPTION 'El proceso todavía está activo o no requiere recuperación'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.retry_admin_backup_restore(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retry_admin_backup_restore(uuid) TO authenticated;

CREATE FUNCTION public.finish_admin_backup_restore(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_backup_restores WHERE id=p_id AND estado='restaurando') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
 UPDATE public.admin_backup_restores SET estado='completado',updated_at=now(),error=NULL WHERE id=p_id;
 DELETE FROM public.admin_backup_restore_lock WHERE restore_id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.finish_admin_backup_restore(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_admin_backup_restore(uuid) TO service_role;

-- Mantener también al generador local dentro de la exclusión de mantenimiento.
CREATE OR REPLACE FUNCTION public.solicitar_admin_backup(p_comercio_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result uuid;
BEGIN
 IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Solo el administrador general puede generar respaldos' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(20261120,1200);
 IF EXISTS(SELECT 1 FROM public.admin_backup_restore_lock) THEN RAISE EXCEPTION 'Hay una restauración en curso'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.admin_backup_worker WHERE heartbeat_at>now()-interval '2 minutes') THEN RAISE EXCEPTION 'El generador de respaldos no está conectado'; END IF;
 IF p_comercio_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.comercio WHERE id=p_comercio_id) THEN RAISE EXCEPTION 'El comercio no existe'; END IF;
 INSERT INTO public.admin_backups(comercio_id,solicitado_por) VALUES(p_comercio_id,auth.uid()) RETURNING id INTO result;
 RETURN result;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Ya hay un respaldo pendiente o en proceso';
END $$;
REVOKE ALL ON FUNCTION public.solicitar_admin_backup(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.solicitar_admin_backup(uuid) TO authenticated;
