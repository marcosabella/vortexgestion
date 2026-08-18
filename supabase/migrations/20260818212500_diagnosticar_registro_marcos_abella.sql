-- Diagnóstico no destructivo del alta reportada; no expone correos ni datos personales.
DO $$
DECLARE
  v_auth_marcos integer;
  v_auth_abella integer;
  v_clientes_marcos integer;
  v_clientes_abella integer;
BEGIN
  SELECT count(*) INTO v_auth_marcos FROM auth.users
  WHERE coalesce(raw_user_meta_data, '{}'::jsonb)::text ILIKE '%marcos%';
  SELECT count(*) INTO v_auth_abella FROM auth.users
  WHERE coalesce(raw_user_meta_data, '{}'::jsonb)::text ILIKE '%abella%';
  SELECT count(*) INTO v_clientes_marcos FROM public.clientes
  WHERE comercio_id = '30e79cd0-360d-4a03-b634-bb7414ee505b' AND nombre ILIKE '%marcos%';
  SELECT count(*) INTO v_clientes_abella FROM public.clientes
  WHERE comercio_id = '30e79cd0-360d-4a03-b634-bb7414ee505b' AND apellido ILIKE '%abella%';
  RAISE NOTICE 'Coincidencias Auth: marcos=%, abella=%; Clientes MATE KING: marcos=%, abella=%',
    v_auth_marcos, v_auth_abella, v_clientes_marcos, v_clientes_abella;
END;
$$;

