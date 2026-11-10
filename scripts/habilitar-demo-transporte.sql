-- Habilitación puntual solicitada por el usuario. No instala infraestructura.
BEGIN;
DO $$
DECLARE destino uuid; cantidad integer;
BEGIN
  SELECT count(*),min(cu.comercio_id::text)::uuid INTO cantidad,destino
  FROM auth.users u JOIN public.comercio_usuarios cu ON cu.user_id=u.id
  JOIN public.comercio c ON c.id=cu.comercio_id
  WHERE lower(u.email)='demo@demo.com' AND cu.activo AND cu.rol='admin' AND c.activo;
  IF cantidad<>1 OR destino IS DISTINCT FROM '253d8d21-e5e9-4ceb-92fd-9baa41f731a5'::uuid THEN
    RAISE EXCEPTION 'No se pudo identificar de forma unívoca el comercio demo autorizado';
  END IF;
  UPDATE public.comercio_parametrizacion
  SET parametros=jsonb_set(coalesce(parametros,'{}'::jsonb),'{modulos}',coalesce(parametros->'modulos','{}'::jsonb)||'{"transporte":true}'::jsonb,true)
  WHERE comercio_id=destino;
  IF NOT FOUND THEN RAISE EXCEPTION 'El comercio demo no tiene parametrización'; END IF;
END $$;
SELECT comercio_id,parametros->'modulos'->'transporte' AS transporte_habilitado
FROM public.comercio_parametrizacion WHERE comercio_id='253d8d21-e5e9-4ceb-92fd-9baa41f731a5';
COMMIT;
