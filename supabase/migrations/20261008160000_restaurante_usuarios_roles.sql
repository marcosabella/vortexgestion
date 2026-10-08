-- Sólo estructura y permisos. No modifica usuarios ni datos existentes.
BEGIN;
ALTER TABLE public.comercio_usuarios ADD COLUMN solo_restaurante boolean NOT NULL DEFAULT false;
ALTER TABLE public.comercio_usuarios ADD CONSTRAINT restaurante_admin_acceso CHECK (NOT solo_restaurante OR rol='operador');
ALTER TABLE public.restaurante_permisos ADD COLUMN roles text[] NOT NULL DEFAULT '{}', ADD COLUMN nombre text NOT NULL DEFAULT '', ADD COLUMN activo boolean NOT NULL DEFAULT true;
ALTER TABLE public.restaurante_permisos ADD CONSTRAINT restaurante_roles_validos CHECK (roles <@ ARRAY['mozo','repartidor','cocina','barra']);

-- La pertenencia administrativa no concede acceso a las cuentas exclusivas del restaurante.
CREATE OR REPLACE FUNCTION public.user_belongs_to_comercio(target_comercio_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.comercio_usuarios cu WHERE cu.comercio_id=target_comercio_id AND cu.user_id=auth.uid() AND cu.activo AND NOT cu.solo_restaurante AND public.comercio_acceso_vigente(cu.comercio_id));
$$;
CREATE OR REPLACE FUNCTION public.restaurante_habilitado(p_comercio uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.comercio_acceso_vigente(p_comercio) AND EXISTS(SELECT 1 FROM public.comercio_usuarios WHERE comercio_id=p_comercio AND user_id=auth.uid() AND activo)
 AND EXISTS(SELECT 1 FROM public.comercio_parametrizacion WHERE comercio_id=p_comercio AND parametros->'modulos'->>'restaurante'='true');
$$;
CREATE OR REPLACE FUNCTION public.restaurante_permiso(p_comercio uuid,p_permiso text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.restaurante_habilitado(p_comercio) AND (public.user_is_comercio_admin(p_comercio) OR EXISTS(SELECT 1 FROM public.restaurante_permisos WHERE comercio_id=p_comercio AND usuario_id=auth.uid() AND activo AND p_permiso=ANY(permisos)));
$$;
CREATE OR REPLACE FUNCTION public.restaurante_acceso(p_comercio uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.restaurante_habilitado(p_comercio) AND (public.user_is_comercio_admin(p_comercio) OR EXISTS(SELECT 1 FROM public.restaurante_permisos WHERE comercio_id=p_comercio AND usuario_id=auth.uid() AND activo AND cardinality(permisos)>0));
$$;
-- Acceso mínimo a la identidad y parametrización del comercio para el ingreso.
CREATE POLICY restaurante_comercio_identidad ON public.comercio FOR SELECT TO authenticated USING(public.restaurante_habilitado(id));
CREATE POLICY restaurante_parametrizacion ON public.comercio_parametrizacion FOR SELECT TO authenticated USING(public.restaurante_habilitado(comercio_id));

-- Las políticas permisivas por propietario tampoco deben abrir otros módulos.
CREATE FUNCTION public.restaurante_gestion_permitida(p_comercio_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.comercio_usuarios WHERE comercio_id=p_comercio_id AND user_id=auth.uid() AND solo_restaurante);
$$;
REVOKE ALL ON FUNCTION public.restaurante_gestion_permitida(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restaurante_gestion_permitida(uuid) TO authenticated;
DO $$ DECLARE tabla record; BEGIN
 FOR tabla IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity AND c.relname NOT LIKE 'restaurante_%'
 AND c.relname NOT IN ('comercio_usuarios','comercio_parametrizacion')
 AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='comercio_id' AND NOT a.attisdropped) LOOP
 EXECUTE format('CREATE POLICY restaurante_aislamiento ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(public.restaurante_gestion_permitida(comercio_id)) WITH CHECK(public.restaurante_gestion_permitida(comercio_id))',tabla.relname);
 END LOOP;
END $$;

CREATE FUNCTION public.restaurante_mi_acceso(p_comercio_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('solo_restaurante',cu.solo_restaurante,'admin',cu.rol='admin','permisos',CASE WHEN cu.rol='admin' THEN ARRAY['pedidos','salon','cocina','despacho','envios','cobros','cierre','configuracion'] WHEN r.activo AND public.restaurante_habilitado(p_comercio_id) THEN r.permisos ELSE '{}'::text[] END)
 FROM public.comercio_usuarios cu LEFT JOIN public.restaurante_permisos r ON r.comercio_id=cu.comercio_id AND r.usuario_id=cu.user_id
 WHERE cu.comercio_id=p_comercio_id AND cu.user_id=auth.uid() AND cu.activo AND public.comercio_acceso_vigente(cu.comercio_id);
$$;
CREATE FUNCTION public.restaurante_listar_usuarios(p_comercio_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF public.restaurante_habilitado(p_comercio_id) IS DISTINCT FROM true OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sin acceso' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',cu.user_id,'email',u.email,'nombre',coalesce(nullif(r.nombre,''),u.email),'admin',cu.rol='admin','solo_restaurante',cu.solo_restaurante,'activo',cu.activo AND coalesce(r.activo,false),'roles',coalesce(r.roles,'{}'),'permisos',coalesce(r.permisos,'{}'),'sector_id',r.sector_id) ORDER BY u.email)
 FROM public.comercio_usuarios cu JOIN auth.users u ON u.id=cu.user_id LEFT JOIN public.restaurante_permisos r ON r.comercio_id=cu.comercio_id AND r.usuario_id=cu.user_id WHERE cu.comercio_id=p_comercio_id),'[]');
END $$;
CREATE FUNCTION public.restaurante_guardar_usuario(p_comercio_id uuid,p_usuario_id uuid,p_nombre text,p_roles text[],p_sector_id uuid,p_cobros boolean,p_activo boolean,p_nuevo boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE miembro public.comercio_usuarios; v_permisos text[]:='{}';
BEGIN
 IF public.restaurante_habilitado(p_comercio_id) IS DISTINCT FROM true OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sin acceso' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('restaurante:'||p_comercio_id::text,0));
 IF p_activo IS NULL OR p_cobros IS NULL OR p_nombre IS NULL OR p_nuevo IS NULL OR p_roles IS NULL OR cardinality(p_roles)=0 OR NOT(p_roles <@ ARRAY['mozo','repartidor','cocina','barra']) OR array_position(p_roles,NULL) IS NOT NULL OR length(btrim(p_nombre)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Datos de usuario inválidos'; END IF;
 IF p_roles && ARRAY['cocina','barra'] THEN
 IF cardinality(p_roles)<>1 OR p_sector_id IS NULL THEN RAISE EXCEPTION 'Preparación requiere un único rol y un sector'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.restaurante_sectores WHERE comercio_id=p_comercio_id AND id=p_sector_id AND activo) THEN RAISE EXCEPTION 'Sector no disponible'; END IF;
 v_permisos:=ARRAY['cocina'];
 ELSE
 IF p_sector_id IS NOT NULL THEN RAISE EXCEPTION 'El sector corresponde a preparación'; END IF;
 IF 'mozo'=ANY(p_roles) THEN v_permisos:=array_append(v_permisos,'salon'); END IF;
 IF 'repartidor'=ANY(p_roles) THEN v_permisos:=array_append(v_permisos,'envios'); END IF;
 IF p_cobros AND 'mozo'=ANY(p_roles) THEN v_permisos:=array_append(v_permisos,'cobros'); END IF;
 END IF;
 SELECT * INTO miembro FROM public.comercio_usuarios WHERE comercio_id=p_comercio_id AND user_id=p_usuario_id FOR UPDATE;
 IF NOT FOUND THEN
 IF NOT p_nuevo THEN RAISE EXCEPTION 'Usuario de otro comercio'; END IF;
 INSERT INTO public.comercio_usuarios(comercio_id,user_id,rol,activo,solo_restaurante) VALUES(p_comercio_id,p_usuario_id,'operador',true,true);
 ELSIF miembro.rol='admin' THEN RAISE EXCEPTION 'El administrador conserva sus permisos completos';
 ELSIF NOT miembro.activo AND NOT miembro.solo_restaurante THEN RAISE EXCEPTION 'La cuenta está desactivada en el comercio';
 END IF;
 -- Se desactiva únicamente Restaurante; se conservan membresía e historial.
 INSERT INTO public.restaurante_permisos(comercio_id,usuario_id,nombre,roles,sector_id,permisos,activo)
 VALUES(p_comercio_id,p_usuario_id,btrim(p_nombre),p_roles,p_sector_id,CASE WHEN p_activo THEN v_permisos ELSE '{}' END,p_activo)
 ON CONFLICT(comercio_id,usuario_id) DO UPDATE SET nombre=EXCLUDED.nombre,roles=EXCLUDED.roles,sector_id=EXCLUDED.sector_id,permisos=EXCLUDED.permisos,activo=EXCLUDED.activo;
 RETURN p_usuario_id;
END $$;
REVOKE ALL ON FUNCTION public.restaurante_mi_acceso(uuid), public.restaurante_listar_usuarios(uuid),public.restaurante_guardar_usuario(uuid,uuid,text,text[],uuid,boolean,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restaurante_mi_acceso(uuid), public.restaurante_listar_usuarios(uuid),public.restaurante_guardar_usuario(uuid,uuid,text,text[],uuid,boolean,boolean,boolean) TO authenticated;
COMMIT;
