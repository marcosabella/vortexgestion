-- Integración de los permisos generales con operaciones existentes.
-- No modifica usuarios ni datos de negocio.
BEGIN;
CREATE FUNCTION public.vortex_permiso_asignado_servicio(p_user_id uuid,p_comercio_id uuid,p_modulo text,p_accion text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.comercio_usuario_accesos WHERE comercio_id=p_comercio_id AND user_id=p_user_id) AND public.vortex_usuario_permiso_interno(p_user_id,p_comercio_id,p_modulo,p_accion)
$$;
REVOKE ALL ON FUNCTION public.vortex_permiso_asignado_servicio(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vortex_permiso_asignado_servicio(uuid,uuid,text,text) TO service_role;
CREATE FUNCTION public.vortex_permiso_asignado(c uuid,m text,a text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.comercio_usuario_accesos WHERE comercio_id=c AND user_id=auth.uid()) AND (
 public.vortex_permiso(c,m,a) OR (m='ventas' AND public.vortex_permiso(c,'transporte','facturar') AND
 ((a='crear' AND current_setting('request.path',true) LIKE '%/rpc/transporte_operar') OR (a='consultar' AND current_setting('request.path',true) LIKE '%/rpc/listar_emisores_fiscales')))
 OR (m='ventas' AND a='crear' AND EXISTS(SELECT 1 FROM unnest(ARRAY['campo','apicola','taller','distribucion']) modulo WHERE current_setting('request.path',true) LIKE '%/rpc/'||modulo||'_%' AND public.vortex_permiso(c,modulo,'administrar')))
 OR (m='ventas' AND a='crear' AND current_setting('request.path',true) LIKE '%/rpc/generar_comprobante_pedido_online' AND public.vortex_permiso(c,'pedidos_online','administrar')))
$$;
CREATE FUNCTION public.vortex_sectores_restaurante(p_comercio_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.user_is_comercio_admin(p_comercio_id) THEN RAISE EXCEPTION 'Sin acceso' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'nombre',nombre) ORDER BY nombre) FROM public.restaurante_sectores WHERE comercio_id=p_comercio_id AND activo),'[]'::jsonb);
END $$;
CREATE FUNCTION public.vortex_config_fiscal_publica(p_comercio_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.comercio_usuarios WHERE comercio_id=p_comercio_id AND user_id=auth.uid() AND activo) OR NOT public.comercio_acceso_vigente(p_comercio_id) THEN RAISE EXCEPTION 'Sin acceso' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object('id',to_jsonb(a)->'id','comercio_id',a.comercio_id,'punto_venta',a.punto_venta,'ambiente',to_jsonb(a)->'ambiente','cuit_emisor',to_jsonb(a)->'cuit_emisor','activo',a.activo,'tiene_certificados',nullif(to_jsonb(a)->>'certificado_crt','') IS NOT NULL AND nullif(to_jsonb(a)->>'certificado_key','') IS NOT NULL,'certificado_vencimiento',to_jsonb(a)->'certificado_vencimiento') FROM public.afip_config a WHERE comercio_id=p_comercio_id AND activo LIMIT 1);
END $$;
REVOKE ALL ON FUNCTION public.vortex_config_fiscal_publica(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vortex_config_fiscal_publica(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.transporte_habilitado(c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.vortex_permiso(c,'transporte','consultar') AND public.vortex_modulo_habilitado(c,'transporte')
$$;
CREATE OR REPLACE FUNCTION public.transporte_admin(c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.transporte_habilitado(c) AND (public.user_is_comercio_admin(c) OR public.vortex_permiso_asignado(c,'transporte','administrar'))
$$;
CREATE FUNCTION public.vortex_usuarios_transporte(c uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
BEGIN
 IF NOT public.transporte_admin(c) THEN RAISE EXCEPTION 'Sin acceso' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',cu.user_id,'rol',cu.rol,'email',u.email,'nombre',coalesce(ac.nombre,nullif(u.raw_user_meta_data->>'nombre',''),u.email)) ORDER BY coalesce(ac.nombre,u.email))
 FROM public.comercio_usuarios cu JOIN auth.users u ON u.id=cu.user_id LEFT JOIN public.comercio_usuario_accesos ac USING(comercio_id,user_id)
 WHERE cu.comercio_id=c AND cu.activo AND (cu.rol='admin' OR (ac.user_id IS NULL AND NOT cu.solo_restaurante) OR (ac.permisos->'transporte' ? 'consultar' AND public.vortex_modulo_habilitado(c,'transporte')))),'[]'::jsonb);
END $$;
CREATE FUNCTION public.vortex_validar_transporte(c uuid,accion text,registro uuid) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE permiso text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.comercio_usuario_accesos WHERE comercio_id=c AND user_id=auth.uid()) THEN RETURN; END IF;
 permiso:=CASE WHEN accion IN ('facturar','presupuesto') THEN 'facturar' WHEN accion IN ('estado','adjunto') THEN 'operar' WHEN accion='presentacion' OR registro IS NOT NULL THEN 'editar' ELSE 'crear' END;
 IF NOT public.vortex_permiso(c,'transporte',permiso) THEN RAISE EXCEPTION 'No tenés permiso para esta operación de Transporte' USING ERRCODE='42501'; END IF;
END $$;
DO $$ DECLARE d text; BEGIN
 IF to_regprocedure('public.campo_listar_operadores_comercio(uuid)') IS NOT NULL THEN
  SELECT pg_get_functiondef('public.campo_listar_operadores_comercio(uuid)'::regprocedure) INTO d;
  IF position('WHERE cu.comercio_id = p_comercio_id AND cu.rol = ''operador''' IN d)=0 THEN RAISE EXCEPTION 'Revisar listado de operadores de Campo'; END IF;
  d:=replace(d,'WHERE cu.comercio_id = p_comercio_id AND cu.rol = ''operador''','WHERE cu.comercio_id = p_comercio_id AND cu.rol = ''operador'' AND public.vortex_usuario_permiso_interno(cu.user_id,cu.comercio_id,''campo'',''consultar'')');EXECUTE d;
 END IF;
 IF to_regprocedure('public.campo_vincular_operador(uuid,uuid,uuid)') IS NOT NULL THEN
  SELECT pg_get_functiondef('public.campo_vincular_operador(uuid,uuid,uuid)'::regprocedure) INTO d;
  d:=regexp_replace(d,'\mBEGIN\M','BEGIN IF NOT public.vortex_usuario_permiso_interno(p_user_id,p_comercio_id,''campo'',''consultar'') THEN RAISE EXCEPTION ''El usuario no tiene acceso a Campo''; END IF;');EXECUTE d;
 END IF;
END $$;
DO $$ DECLARE definicion text; BEGIN
 SELECT pg_get_functiondef('public.transporte_datos(uuid)'::regprocedure) INTO definicion;
 IF position('RETURN resultado;' IN definicion)=0 THEN RAISE EXCEPTION 'Revisar integración de transporte_datos'; END IF;
 definicion:=replace(definicion,'RETURN resultado;', 'RETURN resultado || jsonb_build_object(''usuarios'',CASE WHEN a THEN public.vortex_usuarios_transporte(c) ELSE ''[]''::jsonb END,''permisos'',jsonb_build_object(''crear'',public.vortex_permiso(c,''transporte'',''crear''),''editar'',public.vortex_permiso(c,''transporte'',''editar''),''operar'',public.vortex_permiso(c,''transporte'',''operar''),''facturar'',public.vortex_permiso(c,''transporte'',''facturar'')));');
 EXECUTE definicion;
 SELECT pg_get_functiondef('public.transporte_operar(uuid,text,uuid,integer,jsonb)'::regprocedure) INTO definicion;
 definicion:=regexp_replace(definicion,'\mBEGIN\M','BEGIN PERFORM public.vortex_validar_transporte(c,p_accion,p_id);');
 EXECUTE definicion;
END $$;

-- Amplía únicamente la operación concedida. Los operadores anteriores NO
-- reciben permisos administrativos nuevos por la compatibilidad legacy.
DO $$ DECLARE f record; definicion text; m text; a text; BEGIN
 FOR f IN SELECT p.oid,p.proname,p.proargnames,l.lanname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public' AND (
 p.proname IN ('registrar_venta_transaccional','registrar_venta_manual_transaccional','registrar_venta_emisor_transaccional','actualizar_venta_transaccional','previsualizar_numero_venta','previsualizar_numero_venta_emisor','confirmar_presupuesto','listar_emisores_fiscales')
 OR p.proname LIKE 'taller_%' OR p.proname LIKE 'distribucion_%'
 OR (p.proname LIKE 'campo_%' AND p.proname NOT IN ('campo_actualizar_operador_membresia','campo_listar_operadores_comercio','campo_vincular_operador'))) LOOP
  m:=CASE WHEN f.proname LIKE 'taller_%' THEN 'taller' WHEN f.proname LIKE 'campo_%' THEN 'campo' WHEN f.proname LIKE 'distribucion_%' THEN 'distribucion' ELSE 'ventas' END;
  a:=CASE WHEN m<>'ventas' THEN 'administrar' WHEN f.proname LIKE 'previsualizar%' OR f.proname='listar_emisores_fiscales' THEN 'consultar' WHEN f.proname='actualizar_venta_transaccional' THEN 'editar' ELSE 'crear' END;
  SELECT pg_get_functiondef(f.oid) INTO definicion;
  definicion:=regexp_replace(definicion,'public\.user_is_comercio_admin\(([^()]*)\)',format('(public.user_is_comercio_admin(\1) OR public.vortex_permiso_asignado(\1,%L,%L))',m,a),'g');
  IF f.proname IN ('registrar_venta_transaccional','registrar_venta_manual_transaccional','registrar_venta_emisor_transaccional') THEN
   definicion:=regexp_replace(definicion,'\mBEGIN\M','BEGIN IF EXISTS(SELECT 1 FROM public.comercio_usuario_accesos WHERE comercio_id=p_comercio_id AND user_id=auth.uid()) AND p_tipo_comprobante::text LIKE ''nota_%'' AND NOT public.vortex_permiso(p_comercio_id,''ventas'',''anular'') THEN RAISE EXCEPTION ''No tenés permiso para emitir notas de crédito o débito'' USING ERRCODE=''42501''; END IF;');
  END IF;
  IF f.lanname='plpgsql' AND (f.proname LIKE 'campo_%' OR f.proname LIKE 'taller_%' OR f.proname LIKE 'distribucion_%') THEN
   IF 'p_comercio_id'=ANY(f.proargnames) THEN definicion:=regexp_replace(definicion,'\mBEGIN\M','BEGIN IF NOT public.vortex_solicitud_permitida(p_comercio_id) THEN RAISE EXCEPTION ''No tenés permiso para esta operación'' USING ERRCODE=''42501''; END IF;');
   ELSIF 'p_comercio'=ANY(f.proargnames) THEN definicion:=regexp_replace(definicion,'\mBEGIN\M','BEGIN IF NOT public.vortex_solicitud_permitida(p_comercio) THEN RAISE EXCEPTION ''No tenés permiso para esta operación'' USING ERRCODE=''42501''; END IF;'); END IF;
   IF f.proname LIKE 'campo_%' THEN
    IF 'p_sesion_id'=ANY(f.proargnames) THEN definicion:=regexp_replace(definicion,'\mBEGIN\M','BEGIN IF EXISTS(SELECT 1 FROM public.campo_gps_sesiones WHERE id=p_sesion_id AND NOT public.vortex_solicitud_permitida(comercio_id)) THEN RAISE EXCEPTION ''Sin permiso para esta sesión de Campo'' USING ERRCODE=''42501''; END IF;');
    ELSIF 'p_importacion_id'=ANY(f.proargnames) THEN definicion:=regexp_replace(definicion,'\mBEGIN\M','BEGIN IF EXISTS(SELECT 1 FROM public.campo_telemetria_importaciones WHERE id=p_importacion_id AND NOT public.vortex_solicitud_permitida(comercio_id)) THEN RAISE EXCEPTION ''Sin permiso para esta importación de Campo'' USING ERRCODE=''42501''; END IF;');
    ELSIF 'p_parte_id'=ANY(f.proargnames) THEN definicion:=regexp_replace(definicion,'\mBEGIN\M','BEGIN IF EXISTS(SELECT 1 FROM public.campo_partes_trabajo WHERE id=p_parte_id AND NOT public.vortex_solicitud_permitida(comercio_id)) THEN RAISE EXCEPTION ''Sin permiso para este parte de Campo'' USING ERRCODE=''42501''; END IF;'); END IF;
   END IF;
  END IF;
  EXECUTE definicion;
 END LOOP;
END $$;
-- Permisos generales para las tablas de módulos que antes reservaban sus
-- escrituras al administrador global. Restaurante y Transporte conservan
-- su autorización operativa propia y no reciben estas políticas.
DO $$ DECLARE t record; m text; cmd text; a text; condicion text; BEGIN
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity
 AND EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=c.oid AND attname='comercio_id' AND NOT attisdropped) LOOP
  m:=(public.vortex_recurso_api(t.relname))[1];
  IF m NOT IN ('campo','apicola','taller','distribucion','extintores') THEN CONTINUE; END IF;
  FOREACH cmd IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
   a:=CASE WHEN cmd='SELECT' THEN 'consultar' ELSE 'administrar' END;condicion:=format('public.vortex_permiso_asignado(comercio_id,%L,%L)',m,a);
   EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated %s','vortex_modulo_'||lower(cmd),t.relname,cmd,CASE WHEN cmd='INSERT' THEN 'WITH CHECK ('||condicion||')' WHEN cmd='UPDATE' THEN 'USING ('||condicion||') WITH CHECK ('||condicion||')' ELSE 'USING ('||condicion||')' END);
  END LOOP;
 END LOOP;
END $$;
-- El permiso nativo de Apícola mantiene sus niveles anteriores; sólo añade
-- administración de módulo cuando fue concedida desde la pantalla general.
DO $$ DECLARE d text; BEGIN
 IF to_regprocedure('public.apicola_permiso(uuid,text)') IS NOT NULL THEN
  SELECT pg_get_functiondef('public.apicola_permiso(uuid,text)'::regprocedure) INTO d;
  d:=replace(d,'u.rol=''admin''','(u.rol=''admin'' OR public.vortex_permiso_asignado(p_comercio,''apicola'',''administrar''))');
  d:=replace(d,'p_nivel=''operar'' AND u.rol IN','p_nivel=''operar'' AND (NOT EXISTS(SELECT 1 FROM public.comercio_usuario_accesos WHERE comercio_id=p_comercio AND user_id=auth.uid()) OR public.vortex_permiso_asignado(p_comercio,''apicola'',''administrar'')) AND u.rol IN');
  d:=replace(d,'auth.uid() IS NOT NULL','auth.uid() IS NOT NULL AND public.vortex_solicitud_permitida(p_comercio)');EXECUTE d;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.restaurante_habilitado(p_comercio uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.comercio_acceso_vigente(p_comercio) AND EXISTS(SELECT 1 FROM public.comercio_usuarios WHERE comercio_id=p_comercio AND user_id=auth.uid() AND activo)
 AND public.vortex_modulo_habilitado(p_comercio,'restaurante') AND public.vortex_solicitud_permitida(p_comercio)
$$;

-- La pantalla de terminal se mantiene para cuentas que sólo operan Restaurante.
CREATE OR REPLACE FUNCTION public.restaurante_mi_acceso(p_comercio_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('solo_restaurante',cu.solo_restaurante OR (ac.user_id IS NOT NULL AND cu.rol<>'admin' AND ac.permisos ? 'restaurante' AND NOT EXISTS(SELECT 1 FROM jsonb_each(ac.permisos) x WHERE x.key<>'restaurante' AND jsonb_array_length(x.value)>0)),
 'admin',cu.rol='admin','permisos',CASE WHEN cu.rol='admin' THEN ARRAY['pedidos','salon','cocina','despacho','envios','cobros','cierre','configuracion'] WHEN r.activo AND public.restaurante_habilitado(p_comercio_id) AND (ac.user_id IS NULL OR ac.permisos->'restaurante' ? 'consultar') THEN r.permisos ELSE '{}'::text[] END)
 FROM public.comercio_usuarios cu LEFT JOIN public.restaurante_permisos r ON r.comercio_id=cu.comercio_id AND r.usuario_id=cu.user_id LEFT JOIN public.comercio_usuario_accesos ac ON ac.comercio_id=cu.comercio_id AND ac.user_id=cu.user_id
 WHERE cu.comercio_id=p_comercio_id AND cu.user_id=auth.uid() AND cu.activo AND public.comercio_acceso_vigente(cu.comercio_id)
$$;
CREATE FUNCTION public.vortex_conservar_administrador() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND OLD.rol='admin' AND OLD.activo AND (TG_OP='DELETE' OR NEW.rol IS DISTINCT FROM 'admin' OR NOT NEW.activo OR NEW.comercio_id IS DISTINCT FROM OLD.comercio_id) THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('vortex-usuarios:'||OLD.comercio_id::text,0));
  IF NOT EXISTS(SELECT 1 FROM public.comercio_usuarios WHERE comercio_id=OLD.comercio_id AND user_id<>OLD.user_id AND rol='admin' AND activo) THEN RAISE EXCEPTION 'El comercio debe conservar un administrador activo'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
CREATE TRIGGER vortex_conservar_administrador BEFORE UPDATE OR DELETE ON public.comercio_usuarios FOR EACH ROW EXECUTE FUNCTION public.vortex_conservar_administrador();
-- Última barrera para escrituras de RPC SECURITY DEFINER: se valida el tenant
-- de cada fila, incluso si la identidad administra además otro comercio.
CREATE FUNCTION public.vortex_validar_escritura() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c uuid;
BEGIN
 IF TG_OP<>'DELETE' THEN c:=NEW.comercio_id; ELSE c:=OLD.comercio_id; END IF;
 IF NOT public.vortex_solicitud_permitida(c) OR (TG_OP='UPDATE' AND NOT public.vortex_solicitud_permitida(OLD.comercio_id)) THEN RAISE EXCEPTION 'No tenés permiso para escribir en este comercio' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.vortex_validar_escritura() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity
 AND EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=c.oid AND attname='comercio_id' AND NOT attisdropped) LOOP
  EXECUTE format('CREATE TRIGGER zz_vortex_escritura BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.vortex_validar_escritura()',t.relname);
 END LOOP;
END $$;
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.transporte_integridad()'::regprocedure) INTO d;
 d:=regexp_replace(d,'\mBEGIN\M','BEGIN IF TG_TABLE_NAME=''transporte_choferes'' AND to_jsonb(NEW)->>''user_id'' IS NOT NULL AND NOT public.vortex_usuario_permiso_interno((to_jsonb(NEW)->>''user_id'')::uuid,NEW.comercio_id,''transporte'',''consultar'') THEN RAISE EXCEPTION ''El usuario no tiene acceso a Transporte en este comercio''; END IF;');EXECUTE d;
END $$;
CREATE FUNCTION public.vortex_archivo_permitido(bucket text,ruta text,accion text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c uuid;
BEGIN
 IF bucket NOT IN ('transporte','producto-imagenes') THEN RETURN true; END IF;
 BEGIN c:=split_part(ruta,'/',1)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 IF NOT EXISTS(SELECT 1 FROM public.comercio_usuario_accesos WHERE comercio_id=c AND user_id=auth.uid()) THEN RETURN true; END IF;
 IF bucket='producto-imagenes' AND accion='crear' THEN RETURN public.vortex_permiso(c,'productos','crear') OR public.vortex_permiso(c,'productos','editar'); END IF;
 RETURN public.vortex_permiso(c,CASE WHEN bucket='transporte' THEN 'transporte' ELSE 'productos' END,CASE WHEN bucket='transporte' AND accion<>'consultar' THEN 'operar' ELSE accion END);
END $$;
CREATE FUNCTION public.vortex_archivo_producto_asignado(ruta text,accion text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c uuid;
BEGIN
 BEGIN c:=split_part(ruta,'/',1)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 RETURN public.vortex_permiso_asignado(c,'productos',accion) OR (accion='crear' AND public.vortex_permiso_asignado(c,'productos','editar'));
END $$;
CREATE POLICY vortex_transporte_archivos_alta ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.vortex_archivo_permitido(bucket_id,name,'crear'));
CREATE POLICY vortex_transporte_archivos_edicion ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.vortex_archivo_permitido(bucket_id,name,'editar')) WITH CHECK(public.vortex_archivo_permitido(bucket_id,name,'editar'));
CREATE POLICY vortex_transporte_archivos_baja ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(public.vortex_archivo_permitido(bucket_id,name,'eliminar'));
CREATE POLICY vortex_productos_archivos_lectura ON storage.objects FOR SELECT TO authenticated USING(bucket_id='producto-imagenes' AND public.vortex_archivo_producto_asignado(name,'consultar'));
CREATE POLICY vortex_productos_archivos_alta ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='producto-imagenes' AND public.vortex_archivo_producto_asignado(name,'crear'));
CREATE POLICY vortex_productos_archivos_edicion ON storage.objects FOR UPDATE TO authenticated USING(bucket_id='producto-imagenes' AND public.vortex_archivo_producto_asignado(name,'editar')) WITH CHECK(bucket_id='producto-imagenes' AND public.vortex_archivo_producto_asignado(name,'editar'));
CREATE POLICY vortex_productos_archivos_baja ON storage.objects FOR DELETE TO authenticated USING(bucket_id='producto-imagenes' AND public.vortex_archivo_producto_asignado(name,'eliminar'));
REVOKE ALL ON FUNCTION public.vortex_archivo_permitido(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vortex_archivo_permitido(text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.vortex_archivo_producto_asignado(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vortex_archivo_producto_asignado(text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.vortex_conservar_administrador(),public.vortex_validar_transporte(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.vortex_permiso_asignado(uuid,text,text),public.vortex_sectores_restaurante(uuid),public.vortex_usuarios_transporte(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vortex_permiso_asignado(uuid,text,text),public.vortex_sectores_restaurante(uuid),public.vortex_usuarios_transporte(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
