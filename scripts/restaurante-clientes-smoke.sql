BEGIN READ ONLY;
DO $$
DECLARE personal record; clientes jsonb; comprobados integer:=0; demo_visible boolean:=false;
BEGIN
 FOR personal IN SELECT r.comercio_id,r.usuario_id FROM public.restaurante_permisos r
 JOIN public.comercio_usuarios cu ON cu.comercio_id=r.comercio_id AND cu.user_id=r.usuario_id
 WHERE 'mozo'=ANY(r.roles) AND r.activo AND cu.activo AND public.comercio_acceso_vigente(r.comercio_id) LOOP
   PERFORM set_config('request.jwt.claim.sub',personal.usuario_id::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',personal.usuario_id,'role','authenticated')::text,true);
   PERFORM set_config('role','authenticated',true);
   clientes:=public.restaurante_clientes(personal.comercio_id);
   IF jsonb_array_length(clientes)=0 THEN RAISE EXCEPTION 'El mozo no recibe clientes del comercio'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(clientes) c WHERE c->>'nombre' ILIKE '%demo%' OR c->>'apellido' ILIKE '%demo%') THEN demo_visible:=true; END IF;
   comprobados:=comprobados+1;
   PERFORM set_config('role','postgres',true);
 END LOOP;
 IF comprobados=0 OR NOT demo_visible THEN RAISE EXCEPTION 'No se pudo comprobar el cliente Demo para un mozo activo'; END IF;
 RAISE NOTICE 'OK: % mozo(s) activo(s) recibe(n) clientes; Demo visible; sin cambios de datos',comprobados;
END $$;
ROLLBACK;
