-- Verificación de solo lectura tras instalar Vortex Transporte.
BEGIN READ ONLY;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261110100000') THEN
    RAISE EXCEPTION 'Migración de Transporte no registrada';
  END IF;
  IF (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'transporte_%' AND rowsecurity)<>10 THEN
    RAISE EXCEPTION 'Se esperaban diez tablas de Transporte con RLS';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='transporte' AND NOT public) THEN
    RAISE EXCEPTION 'Storage de Transporte no es privado o no existe';
  END IF;
END $$;
SELECT version FROM supabase_migrations.schema_migrations WHERE version='20261110100000';
SELECT c.relname AS tabla,c.relrowsecurity AS rls,
  (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname) AS politicas
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'transporte_%'
ORDER BY c.relname;
SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='transporte';
SELECT policyname,cmd FROM pg_policies WHERE schemaname='storage' AND policyname LIKE 'transporte_%';
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM auth.users WHERE lower(email)='demo@demo.com'),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF NOT public.transporte_admin('253d8d21-e5e9-4ceb-92fd-9baa41f731a5') THEN
    RAISE EXCEPTION 'Demo no tiene acceso administrativo a Transporte';
  END IF;
END $$;
SELECT public.transporte_habilitado('253d8d21-e5e9-4ceb-92fd-9baa41f731a5') AS habilitado,
  public.transporte_admin('253d8d21-e5e9-4ceb-92fd-9baa41f731a5') AS administrador;
SELECT key AS entidad,CASE WHEN jsonb_typeof(value)='array' THEN jsonb_array_length(value) END AS registros
FROM jsonb_each(public.transporte_datos('253d8d21-e5e9-4ceb-92fd-9baa41f731a5'))
ORDER BY key;
ROLLBACK;
