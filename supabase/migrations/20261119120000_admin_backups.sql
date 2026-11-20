-- Estructura y permisos; no modifica datos operativos.
CREATE TABLE public.admin_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid REFERENCES public.comercio(id) ON DELETE RESTRICT,
  solicitado_por uuid NOT NULL REFERENCES auth.users(id),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','procesando','completado','fallido')),
  created_at timestamptz NOT NULL DEFAULT now(),
  iniciado_at timestamptz,
  finalizado_at timestamptz,
  archivo text,
  bytes bigint,
  sha256 text,
  error text,
  resumen jsonb,
  CHECK ((estado = 'completado') = (archivo IS NOT NULL AND bytes > 0 AND sha256 IS NOT NULL))
);
CREATE INDEX admin_backups_comercio_fecha_idx ON public.admin_backups(comercio_id, created_at DESC);
CREATE UNIQUE INDEX admin_backups_un_trabajo_idx ON public.admin_backups ((true)) WHERE estado IN ('pendiente','procesando');
ALTER TABLE public.admin_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_backups FROM anon, authenticated;
GRANT SELECT ON public.admin_backups TO authenticated;
CREATE POLICY admin_backups_lectura ON public.admin_backups FOR SELECT TO authenticated USING (public.is_app_admin());

CREATE TABLE public.admin_backup_worker (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  heartbeat_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_backup_worker ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_backup_worker FROM anon, authenticated;
GRANT SELECT ON public.admin_backup_worker TO authenticated;
CREATE POLICY admin_backup_worker_lectura ON public.admin_backup_worker FOR SELECT TO authenticated USING (public.is_app_admin());
GRANT ALL ON public.admin_backups, public.admin_backup_worker TO service_role;

CREATE FUNCTION public.solicitar_admin_backup(p_comercio_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE resultado uuid;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Solo el administrador general puede generar respaldos' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_backup_worker WHERE heartbeat_at > now() - interval '2 minutes') THEN
    RAISE EXCEPTION 'El generador de respaldos no está conectado';
  END IF;
  IF p_comercio_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.comercio WHERE id = p_comercio_id) THEN
    RAISE EXCEPTION 'El comercio no existe';
  END IF;
  INSERT INTO public.admin_backups(comercio_id, solicitado_por) VALUES (p_comercio_id, auth.uid()) RETURNING id INTO resultado;
  RETURN resultado;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Ya hay un respaldo pendiente o en proceso';
END $$;
REVOKE ALL ON FUNCTION public.solicitar_admin_backup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.solicitar_admin_backup(uuid) TO authenticated;

CREATE FUNCTION public.tomar_admin_backup()
RETURNS SETOF public.admin_backups LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public.admin_backups SET estado = 'procesando', iniciado_at = now()
  WHERE id = (SELECT id FROM public.admin_backups WHERE estado = 'pendiente' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.tomar_admin_backup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomar_admin_backup() TO service_role;

INSERT INTO storage.buckets(id, name, public) VALUES ('admin-backups', 'admin-backups', false);
-- Descargas firmadas únicamente a través del backend. Sin políticas para clientes.
