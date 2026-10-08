-- Verificación remota de lectura. No crea cuentas ni modifica datos del comercio.
BEGIN READ ONLY;
DO $smoke$
DECLARE v_comercio uuid; v_admin uuid; v_acceso jsonb; v_usuarios jsonb; v_resumen jsonb; v_role text := current_user;
BEGIN
 SELECT cu.comercio_id,cu.user_id INTO v_comercio,v_admin
 FROM public.comercio_usuarios cu JOIN public.comercio_parametrizacion cp ON cp.comercio_id=cu.comercio_id
 WHERE cu.rol='admin' AND cu.activo AND cp.parametros->'modulos'->>'restaurante'='true'
 AND public.comercio_acceso_vigente(cu.comercio_id) ORDER BY cu.created_at LIMIT 1;
 IF v_comercio IS NULL THEN RAISE EXCEPTION 'No hay restaurante activo con administrador para verificar.'; END IF;
 PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
 PERFORM set_config('role','authenticated',true);
 v_acceso:=public.restaurante_mi_acceso(v_comercio);
 IF (v_acceso->>'admin') IS DISTINCT FROM 'true' OR (v_acceso->>'solo_restaurante') IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Acceso administrativo incompatible.'; END IF;
 v_usuarios:=public.restaurante_listar_usuarios(v_comercio);
 IF jsonb_array_length(v_usuarios)<1 THEN RAISE EXCEPTION 'No se listan usuarios del comercio.'; END IF;
 v_resumen:=public.restaurante_resumen(v_comercio);
 IF (v_resumen->>'admin') IS DISTINCT FROM 'true' OR NOT public.user_belongs_to_comercio(v_comercio) THEN RAISE EXCEPTION 'Se alteró el acceso previo del administrador.'; END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
 IF public.restaurante_mi_acceso(v_comercio) IS NOT NULL THEN RAISE EXCEPTION 'Se expuso el acceso a otro usuario.'; END IF;
 BEGIN
   PERFORM public.restaurante_listar_usuarios(v_comercio);
   RAISE EXCEPTION 'Se permitió listar usuarios sin pertenencia.';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('role','anon',true);
 BEGIN
   PERFORM public.restaurante_mi_acceso(v_comercio);
   RAISE EXCEPTION 'Se permitió acceder sin autenticación.';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('role',v_role,true);
END $smoke$;
ROLLBACK;
SELECT 'OK: administrador, usuarios, resumen, aislamiento y acceso anónimo; sin cambios de datos' AS verificacion;
