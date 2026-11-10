-- Infraestructura y autorización. No convierte ni modifica usuarios existentes.
BEGIN;
CREATE TABLE public.comercio_usuario_accesos (
 comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 nombre text NOT NULL CHECK(length(btrim(nombre)) BETWEEN 1 AND 100), perfil text NOT NULL DEFAULT 'personalizado',
 permisos jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(permisos)='object'), version bigint NOT NULL DEFAULT 1,
 actualizado_en timestamptz NOT NULL DEFAULT now(), actualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 PRIMARY KEY(comercio_id,user_id), FOREIGN KEY(comercio_id,user_id) REFERENCES public.comercio_usuarios(comercio_id,user_id) ON DELETE CASCADE
);
CREATE INDEX comercio_usuario_accesos_usuario_idx ON public.comercio_usuario_accesos(user_id,comercio_id);
CREATE TABLE public.comercio_usuario_eventos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 fecha timestamptz NOT NULL DEFAULT now(), anterior jsonb, posterior jsonb NOT NULL
);
CREATE INDEX comercio_usuario_eventos_comercio_idx ON public.comercio_usuario_eventos(comercio_id,fecha DESC);
ALTER TABLE public.comercio_usuario_accesos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comercio_usuario_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comercio_usuario_accesos,public.comercio_usuario_eventos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.comercio_usuario_accesos,public.comercio_usuario_eventos TO authenticated;
CREATE POLICY usuarios_accesos_lectura ON public.comercio_usuario_accesos FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.user_is_comercio_admin(comercio_id));
CREATE POLICY usuarios_eventos_lectura ON public.comercio_usuario_eventos FOR SELECT TO authenticated USING(public.user_is_comercio_admin(comercio_id));

CREATE FUNCTION public.vortex_catalogo_permisos() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT '{"clientes":["consultar","crear","editar","eliminar"],"proveedores":["consultar","crear","editar","eliminar"],"productos":["consultar","crear","editar","eliminar"],"ventas":["consultar","crear","editar","eliminar","anular","facturar"],"presupuestos":["consultar","crear","editar","eliminar"],"compras":["consultar","crear","editar","eliminar","cobrar"],"cuenta_corriente":["consultar","crear","editar","eliminar","cobrar"],"caja":["consultar","crear","editar","eliminar"],"gastos_egresos":["consultar","crear","editar","eliminar","cobrar"],"cheques":["consultar","crear","editar","eliminar"],"bancos":["consultar"],"tarjetas":["consultar"],"listados":["consultar"],"utilidades":["consultar"],"transporte":["consultar","crear","editar","operar","administrar","facturar"],"restaurante":["consultar","operar"],"campo":["consultar","operar","administrar"],"apicola":["consultar","administrar"],"taller":["consultar","administrar"],"distribucion":["consultar","administrar"],"extintores":["consultar","administrar"],"pedidos_online":["consultar","administrar"]}'::jsonb
$$;
CREATE FUNCTION public.vortex_modulo_habilitado(c uuid,m text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce((SELECT (parametros->'modulos'->>m)::boolean FROM public.comercio_parametrizacion WHERE comercio_id=c),m NOT IN ('compras','pedidos_online','campo','apicola','taller','transporte','restaurante','distribucion','extintores','utilidades','whatsapp'))
$$;
CREATE FUNCTION public.vortex_usuario_permiso_interno(u uuid,c uuid,m text,a text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.comercio_usuarios cu LEFT JOIN public.comercio_usuario_accesos ac USING(comercio_id,user_id)
 WHERE cu.comercio_id=c AND cu.user_id=u AND cu.activo AND public.comercio_acceso_vigente(c)
 AND (cu.rol='admin' OR (ac.user_id IS NULL AND NOT cu.solo_restaurante)
 OR (ac.user_id IS NOT NULL AND public.vortex_modulo_habilitado(c,m) AND coalesce(ac.permisos->m ? a,false))))
$$;
CREATE FUNCTION public.vortex_permiso(p_comercio_id uuid,p_modulo text,p_accion text DEFAULT 'consultar') RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.vortex_usuario_permiso_interno(auth.uid(),p_comercio_id,p_modulo,p_accion)
$$;
-- Sólo las Edge Functions con service_role pueden consultar por otra identidad.
CREATE FUNCTION public.vortex_permiso_servicio(p_user_id uuid,p_comercio_id uuid,p_modulo text,p_accion text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.vortex_usuario_permiso_interno(p_user_id,p_comercio_id,p_modulo,p_accion)
$$;
REVOKE ALL ON FUNCTION public.vortex_usuario_permiso_interno(uuid,uuid,text,text),public.vortex_permiso_servicio(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vortex_permiso_servicio(uuid,uuid,text,text) TO service_role;

-- Recursos expuestos por la API. Un recurso nuevo queda cerrado para cuentas
-- configuradas hasta incorporarlo expresamente; no se infiere por el verbo HTTP de una RPC.
CREATE FUNCTION public.vortex_recurso_api(r text,es_rpc boolean DEFAULT false) RETURNS text[] LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 IF es_rpc THEN
  IF r IN ('registrar_venta_transaccional','registrar_venta_emisor_transaccional','registrar_venta_manual_transaccional') THEN RETURN ARRAY['ventas','crear']; END IF;
  IF r='actualizar_venta_transaccional' THEN RETURN ARRAY['ventas','editar']; END IF;
  IF r IN ('previsualizar_numero_venta','previsualizar_numero_venta_emisor','ventas_punto_venta_canonico','ventas_numero_secuencial_canonico','listar_emisores_fiscales') THEN RETURN ARRAY['ventas','consultar']; END IF;
  IF r='confirmar_presupuesto' THEN RETURN ARRAY['ventas','crear']; END IF;
  IF r IN ('registrar_cobro_cliente_con_recibo','registrar_pagos_cliente_mixtos','registrar_pagos_cliente_multi_documento') THEN RETURN ARRAY['cuenta_corriente','cobrar']; END IF;
  IF r='eliminar_pago_cliente' THEN RETURN ARRAY['cuenta_corriente','eliminar']; END IF;
  IF r IN ('eliminar_pago_factura_compra','eliminar_pago_proveedor_con_cheque') THEN RETURN ARRAY['compras','eliminar']; END IF;
  IF r='eliminar_pago_gasto_egreso' THEN RETURN ARRAY['gastos_egresos','eliminar']; END IF;
  IF r IN ('registrar_pagos_proveedor_mixtos','registrar_pagos_proveedor_multi_documento','registrar_pagos_proveedor_multi_documento_v2','registrar_pago_proveedor_con_cheque','registrar_pago_factura_compra','editar_pago_factura_compra','eliminar_pago_factura_compra','eliminar_pago_proveedor_con_cheque') THEN RETURN ARRAY['compras','cobrar']; END IF;
  IF r IN ('registrar_pago_gasto_egreso','editar_pago_gasto_egreso','eliminar_pago_gasto_egreso') THEN RETURN ARRAY['gastos_egresos','cobrar']; END IF;
  IF r IN ('crear_compra','registrar_compra_confirmada','registrar_compra_confirmada_con_pagos','registrar_compra_confirmada_v2','registrar_factura_compra') THEN RETURN ARRAY['compras','crear']; END IF;
  IF r IN ('editar_compra_confirmada','editar_compra_confirmada_v2','cambiar_estado_compra','recepcionar_compra_item') THEN RETURN ARRAY['compras','editar']; END IF;
  IF r IN ('eliminar_compra_confirmada','eliminar_compra_confirmada_con_cheques') THEN RETURN ARRAY['compras','eliminar']; END IF;
  IF r='registrar_ajuste_stock' THEN RETURN ARRAY['productos','editar']; END IF;
  IF r IN ('transporte_datos','transporte_habilitado','transporte_admin','transporte_puede_servicio','transporte_archivo_autorizado') THEN RETURN ARRAY['transporte','consultar']; END IF;
  IF r='transporte_operar' THEN RETURN ARRAY['transporte','operar']; END IF;
  IF r IN ('restaurante_resumen','restaurante_clientes','restaurante_ver_pedido','restaurante_reservas_listar','restaurante_habilitado','restaurante_acceso','restaurante_permiso') THEN RETURN ARRAY['restaurante','consultar']; END IF;
  IF r IN ('restaurante_operar','restaurante_reserva_operar') THEN RETURN ARRAY['restaurante','operar']; END IF;
  IF r IN ('distribucion_resumen','distribucion_habilitado','distribucion_remito_acceso') THEN RETURN ARRAY['distribucion','consultar']; END IF;
  IF r IN ('distribucion_operar','distribucion_modificar_pedido','distribucion_guardar_ruta','distribucion_configurar_remitos') THEN RETURN ARRAY['distribucion','administrar']; END IF;
  IF r LIKE 'campo_%' AND r NOT IN ('campo_actualizar_operador_membresia','campo_listar_operadores_comercio','campo_vincular_operador') THEN
   IF r IN ('campo_crear_parte','campo_enviar_parte','campo_descartar_parte','campo_gps_iniciar_sesion','campo_gps_cambiar_estado','campo_gps_registrar_puntos') THEN RETURN ARRAY['campo','operar']; END IF;
   RETURN ARRAY['campo',CASE WHEN r LIKE '%costos%' OR r LIKE '%resumen%' OR r LIKE '%metricas%' OR r LIKE '%estado_importacion' OR r LIKE '%resolver_tarifa%' THEN 'consultar' ELSE 'administrar' END];
  END IF;
  IF r LIKE 'apicola_%' THEN RETURN ARRAY['apicola',CASE WHEN r LIKE '%consultar' OR r LIKE '%fuentes' OR r LIKE '%catalogo' OR r LIKE '%documentos' OR r='apicola_informe' OR r='apicola_permiso' THEN 'consultar' ELSE 'administrar' END]; END IF;
  IF r LIKE 'taller_%' THEN RETURN ARRAY['taller',CASE WHEN r IN ('taller_habilitado','taller_clave_nombre') THEN 'consultar' ELSE 'administrar' END]; END IF;
  IF r IN ('actualizar_estado_pedido_online','generar_comprobante_pedido_online') THEN RETURN ARRAY['pedidos_online','administrar']; END IF;
  RETURN ARRAY['__denegado','administrar'];
 END IF;
 IF r IN ('clientes','cliente_usuarios','cliente_vinculaciones_pendientes') THEN RETURN ARRAY['clientes']; END IF;
 IF r='proveedores' THEN RETURN ARRAY['proveedores']; END IF;
 IF r='productos' OR r IN ('marcas','rubros','subrubros','ajustes_stock') OR r LIKE 'producto_%' THEN RETURN ARRAY['productos']; END IF;
 IF r IN ('ventas','venta_items','pagos_venta','ventas_numeradores','ventas_numeradores_emisores') THEN RETURN ARRAY['ventas']; END IF;
 IF r IN ('presupuestos','presupuesto_items','presupuesto_pagos') THEN RETURN ARRAY['presupuestos']; END IF;
 IF r IN ('compras','compra_items','compras_facturas','pagos_compra','cuenta_corriente_proveedores') THEN RETURN ARRAY['compras']; END IF;
 IF r IN ('cuenta_corriente','recibos_pago_cliente') THEN RETURN ARRAY['cuenta_corriente']; END IF;
 IF r IN ('caja_movimientos','cajas_diarias') THEN RETURN ARRAY['caja']; END IF;
 IF r IN ('gastos_egresos','gastos_egresos_categorias') THEN RETURN ARRAY['gastos_egresos']; END IF;
 IF r='cheques' THEN RETURN ARRAY['cheques']; END IF;
 IF r='bancos' THEN RETURN ARRAY['bancos']; END IF;
 IF r IN ('tarjetas_credito','tarjeta_cuotas') THEN RETURN ARRAY['tarjetas']; END IF;
 IF r LIKE 'transporte_%' THEN RETURN ARRAY['transporte']; END IF;
 IF r LIKE 'restaurante_%' THEN RETURN ARRAY['restaurante']; END IF;
 IF r LIKE 'campo_%' THEN RETURN ARRAY['campo']; END IF;
 IF r LIKE 'apicola_%' THEN RETURN ARRAY['apicola']; END IF;
 IF r LIKE 'taller_%' THEN RETURN ARRAY['taller']; END IF;
 IF r LIKE 'distribucion_%' THEN RETURN ARRAY['distribucion']; END IF;
 IF r LIKE 'extintor_%' OR r='extintores' OR r LIKE 'ordenes_trabajo_extintores%' THEN RETURN ARRAY['extintores']; END IF;
 IF r IN ('pedidos_online','pedido_online_items','pedido_online_cancelaciones','pedido_online_reembolsos') THEN RETURN ARRAY['pedidos_online']; END IF;
 RETURN ARRAY['__denegado'];
END $$;

CREATE FUNCTION public.vortex_solicitud_permitida(c uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ruta text:=nullif(current_setting('request.path',true),''); metodo text:=current_setting('request.method',true); r text; recurso text[]; a text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.comercio_usuario_accesos WHERE comercio_id=c AND user_id=auth.uid()) THEN RETURN true; END IF;
 IF ruta IS NULL THEN RETURN false; END IF;
 r:=regexp_replace(ruta,'^.*/','');
 IF r IN ('vortex_mi_acceso','vortex_config_fiscal_publica','vortex_permiso','user_is_comercio_admin','comercio_acceso_vigente','current_comercio_id','restaurante_mi_acceso','is_app_admin','get_mi_historial_compras','actualizar_mi_cliente_tienda','crear_pedido_online','crear_pedido_online_mercadopago','get_estado_pago_pedido') THEN RETURN true; END IF;
 IF ruta NOT LIKE '%/rpc/%' AND metodo IN ('GET','HEAD') AND r IN ('comercio','comercio_usuarios','comercio_parametrizacion','comercio_usuario_accesos','notificaciones','notificacion_destinatarios','notificacion_lecturas','app_admins') THEN RETURN true; END IF;
 IF ruta LIKE '%/rpc/%' THEN
  IF r='listar_emisores_fiscales' AND public.vortex_permiso(c,'transporte','facturar') THEN RETURN true; END IF;
  IF r='transporte_operar' THEN RETURN public.vortex_permiso(c,'transporte','operar') OR public.vortex_permiso(c,'transporte','crear') OR public.vortex_permiso(c,'transporte','editar') OR public.vortex_permiso(c,'transporte','facturar'); END IF;
  recurso:=public.vortex_recurso_api(r,true);a:=recurso[2];
 ELSE recurso:=public.vortex_recurso_api(r);a:=CASE metodo WHEN 'GET' THEN 'consultar' WHEN 'HEAD' THEN 'consultar' WHEN 'POST' THEN 'crear' WHEN 'PATCH' THEN 'editar' WHEN 'DELETE' THEN 'eliminar' ELSE '__denegado' END;
 END IF;
 IF recurso[1] IN ('campo','apicola','taller','distribucion','extintores','pedidos_online') AND a NOT IN ('consultar','operar') THEN
  IF recurso[1]='campo' AND (r='campo_partes_trabajo' OR r LIKE 'campo_parte_%' OR r IN ('campo_gps_sesiones','campo_gps_puntos')) THEN a:='operar'; ELSE a:='administrar'; END IF;
 END IF;
 RETURN public.vortex_permiso(c,recurso[1],a) OR (recurso[1]='campo' AND a='operar' AND public.vortex_permiso(c,'campo','administrar'));
END $$;
CREATE OR REPLACE FUNCTION public.user_belongs_to_comercio(target_comercio_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.comercio_usuarios cu WHERE cu.comercio_id=target_comercio_id AND cu.user_id=auth.uid() AND cu.activo AND NOT cu.solo_restaurante AND public.comercio_acceso_vigente(cu.comercio_id)) AND public.vortex_solicitud_permitida(target_comercio_id)
$$;
-- Pre-request bloquea también las RPC SECURITY DEFINER antes de ejecutarlas.
CREATE FUNCTION public.vortex_validar_solicitud() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.comercio_usuario_accesos WHERE user_id=auth.uid()) THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.comercio_usuarios cu WHERE cu.user_id=auth.uid() AND cu.activo AND public.comercio_acceso_vigente(cu.comercio_id) AND public.vortex_solicitud_permitida(cu.comercio_id)) THEN
  RAISE EXCEPTION 'No tenés permiso para esta operación' USING ERRCODE='42501';
 END IF;
END $$;

-- Restricciones adicionales: las políticas permisivas existentes siguen
-- aislando el tenant. Las nuevas restricciones se suman, nunca las sustituyen.
CREATE FUNCTION public.vortex_tabla_permitida(c uuid,t text,a text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE m text:=(public.vortex_recurso_api(t))[1];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.comercio_usuario_accesos WHERE comercio_id=c AND user_id=auth.uid()) THEN RETURN true; END IF;
 IF t IN ('comercio','comercio_usuarios','comercio_parametrizacion') THEN RETURN a='consultar' OR public.user_is_comercio_admin(c); END IF;
 IF t IN ('notificaciones','notificacion_destinatarios','notificacion_lecturas') THEN RETURN a IN ('consultar','editar'); END IF;
 IF m IN ('campo','apicola','taller','distribucion','extintores','pedidos_online') AND a<>'consultar' THEN
  IF m='campo' AND (t='campo_partes_trabajo' OR t LIKE 'campo_parte_%' OR t IN ('campo_gps_sesiones','campo_gps_puntos')) THEN a:='operar'; ELSE a:='administrar'; END IF;
 END IF;
 -- Las escrituras derivadas de una RPC autorizada (stock, caja, etc.) se
 -- ejecutan con sus validaciones transaccionales; el recurso de entrada manda.
 IF nullif(current_setting('request.path',true),'') LIKE '%/rpc/%' THEN RETURN public.vortex_solicitud_permitida(c); END IF;
 RETURN public.vortex_permiso(c,m,a) OR (m='campo' AND a='operar' AND public.vortex_permiso(c,'campo','administrar'));
END $$;
DO $$ DECLARE t record; a text; cmd text; condicion text; BEGIN
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity
 AND c.relname NOT IN ('comercio_usuario_accesos','comercio_usuario_eventos')
 AND EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=c.oid AND attname='comercio_id' AND NOT attisdropped) LOOP
  FOREACH cmd IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
   a:=CASE cmd WHEN 'SELECT' THEN 'consultar' WHEN 'INSERT' THEN 'crear' WHEN 'UPDATE' THEN 'editar' ELSE 'eliminar' END;
   condicion:=format('public.vortex_tabla_permitida(comercio_id,%L,%L)',t.relname,a);
   EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated %s', 'vortex_permiso_'||lower(cmd),t.relname,cmd,
    CASE WHEN cmd='INSERT' THEN 'WITH CHECK ('||condicion||')' WHEN cmd='UPDATE' THEN 'USING ('||condicion||') WITH CHECK ('||condicion||')' ELSE 'USING ('||condicion||')' END);
  END LOOP;
 END LOOP;
END $$;
CREATE POLICY vortex_permiso_comercio ON public.comercio AS RESTRICTIVE FOR ALL TO authenticated USING(public.vortex_tabla_permitida(id,'comercio',CASE WHEN current_setting('request.method',true) IN ('GET','HEAD') THEN 'consultar' ELSE 'editar' END));

CREATE FUNCTION public.vortex_mi_acceso(p_comercio_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('admin',cu.rol='admin','configurado',ac.user_id IS NOT NULL,'activo',cu.activo AND public.comercio_acceso_vigente(cu.comercio_id),'solo_restaurante',cu.solo_restaurante,'nombre',coalesce(ac.nombre,''),'perfil',coalesce(ac.perfil,'existente'),'permisos',coalesce(ac.permisos,'{}'::jsonb))
 FROM public.comercio_usuarios cu LEFT JOIN public.comercio_usuario_accesos ac USING(comercio_id,user_id) WHERE cu.comercio_id=p_comercio_id AND cu.user_id=auth.uid()
$$;
CREATE FUNCTION public.vortex_listar_usuarios(p_comercio_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
BEGIN
 IF public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true OR NOT public.comercio_acceso_vigente(p_comercio_id) THEN RAISE EXCEPTION 'Solo el administrador del comercio puede gestionar usuarios' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',cu.user_id,'email',u.email,'nombre',coalesce(ac.nombre,nullif(r.nombre,''),u.raw_user_meta_data->>'nombre',u.email),'rol',cu.rol,'activo',cu.activo,'solo_restaurante',cu.solo_restaurante,'configurado',ac.user_id IS NOT NULL,'perfil',coalesce(ac.perfil,'existente'),'permisos',coalesce(ac.permisos,'{}'::jsonb),'version',coalesce(ac.version,0),'restaurante_roles',coalesce(to_jsonb(r.roles),'[]'::jsonb),'restaurante_sector_id',r.sector_id,'restaurante_cobros',coalesce('cobros'=ANY(r.permisos),false)) ORDER BY cu.rol,coalesce(ac.nombre,u.email))
 FROM public.comercio_usuarios cu JOIN auth.users u ON u.id=cu.user_id LEFT JOIN public.comercio_usuario_accesos ac USING(comercio_id,user_id) LEFT JOIN public.restaurante_permisos r ON r.comercio_id=cu.comercio_id AND r.usuario_id=cu.user_id WHERE cu.comercio_id=p_comercio_id),'[]'::jsonb);
END $$;

CREATE FUNCTION public.vortex_guardar_usuario(p_comercio_id uuid,p_user_id uuid,p_nombre text,p_rol text,p_activo boolean,p_perfil text,p_permisos jsonb,p_version bigint,p_nuevo boolean DEFAULT false,p_restaurante_roles text[] DEFAULT '{}',p_restaurante_sector_id uuid DEFAULT NULL,p_restaurante_cobros boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cu public.comercio_usuarios; ac public.comercio_usuario_accesos; entrada record; anterior jsonb; catalogo jsonb:=public.vortex_catalogo_permisos();
BEGIN
 IF public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true OR NOT public.comercio_acceso_vigente(p_comercio_id) THEN RAISE EXCEPTION 'Solo el administrador del comercio puede gestionar usuarios' USING ERRCODE='42501'; END IF;
 IF p_nombre IS NULL OR length(btrim(p_nombre)) NOT BETWEEN 1 AND 100 OR p_rol IS NULL OR p_rol NOT IN ('admin','operador') OR p_activo IS NULL OR p_permisos IS NULL OR jsonb_typeof(p_permisos)<>'object' OR p_perfil IS NULL OR length(p_perfil)>100 THEN RAISE EXCEPTION 'Datos de usuario inválidos'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('vortex-usuarios:'||p_comercio_id::text,0));
 IF public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sin acceso' USING ERRCODE='42501'; END IF;
 IF p_user_id=auth.uid() AND (NOT p_activo OR p_rol<>'admin') THEN RAISE EXCEPTION 'No podés quitar tu propio acceso administrativo'; END IF;
 FOR entrada IN SELECT * FROM jsonb_each(p_permisos) LOOP
  IF NOT catalogo ? entrada.key OR jsonb_typeof(entrada.value)<>'array' THEN RAISE EXCEPTION 'Permisos inválidos'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(entrada.value) v WHERE jsonb_typeof(v)<>'string' OR NOT catalogo->entrada.key ? (v#>>'{}')) THEN RAISE EXCEPTION 'Permisos inválidos'; END IF;
  IF p_activo AND jsonb_array_length(entrada.value)>0 AND NOT public.vortex_modulo_habilitado(p_comercio_id,entrada.key) THEN RAISE EXCEPTION 'El módulo % no está habilitado',entrada.key; END IF;
  IF jsonb_array_length(entrada.value)>0 AND NOT entrada.value ? 'consultar' THEN RAISE EXCEPTION 'Los permisos del módulo requieren Consultar'; END IF;
 END LOOP;
 IF p_activo AND p_rol='operador' AND NOT EXISTS(SELECT 1 FROM jsonb_each(p_permisos) e WHERE jsonb_array_length(e.value)>0) THEN RAISE EXCEPTION 'Asigná al menos un módulo al usuario'; END IF;
 IF p_permisos->'transporte' ?| ARRAY['crear','editar','facturar'] AND NOT p_permisos->'transporte' ? 'administrar' THEN RAISE EXCEPTION 'La gestión de Transporte requiere Administrar módulo'; END IF;
 SELECT * INTO cu FROM public.comercio_usuarios WHERE comercio_id=p_comercio_id AND user_id=p_user_id FOR UPDATE;
 SELECT * INTO ac FROM public.comercio_usuario_accesos WHERE comercio_id=p_comercio_id AND user_id=p_user_id FOR UPDATE;
 IF cu.user_id IS NULL THEN
  IF NOT p_nuevo OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND raw_app_meta_data->>'vortex_alta_comercio'=p_comercio_id::text AND raw_app_meta_data->>'vortex_alta_actor'=auth.uid()::text AND created_at>now()-interval '10 minutes') THEN RAISE EXCEPTION 'Usuario no disponible en este comercio'; END IF;
  -- Una cuenta creada aquí no puede apropiarse de una identidad ya vinculada.
  IF EXISTS(SELECT 1 FROM public.comercio_usuarios WHERE user_id=p_user_id) THEN RAISE EXCEPTION 'La cuenta ya pertenece a otro comercio'; END IF;
  INSERT INTO public.comercio_usuarios(comercio_id,user_id,rol,activo,solo_restaurante) VALUES(p_comercio_id,p_user_id,p_rol,p_activo,false);
 ELSE
  IF p_nuevo OR p_version IS DISTINCT FROM coalesce(ac.version,0) THEN RAISE EXCEPTION 'El acceso cambió. Actualizá la página antes de guardar'; END IF;
  anterior:=jsonb_build_object('rol',cu.rol,'activo',cu.activo,'acceso',to_jsonb(ac));
  IF cu.rol='admin' AND cu.activo AND (p_rol<>'admin' OR NOT p_activo) AND NOT EXISTS(SELECT 1 FROM public.comercio_usuarios WHERE comercio_id=p_comercio_id AND user_id<>p_user_id AND rol='admin' AND activo) THEN RAISE EXCEPTION 'El comercio debe conservar un administrador activo'; END IF;
  UPDATE public.comercio_usuarios SET rol=p_rol,activo=p_activo,solo_restaurante=false WHERE comercio_id=p_comercio_id AND user_id=p_user_id;
 END IF;
 INSERT INTO public.comercio_usuario_accesos(comercio_id,user_id,nombre,perfil,permisos,actualizado_por)
 VALUES(p_comercio_id,p_user_id,btrim(p_nombre),CASE WHEN p_rol='admin' THEN 'administrador' ELSE p_perfil END,CASE WHEN p_rol='admin' THEN '{}'::jsonb ELSE p_permisos END,auth.uid())
 ON CONFLICT(comercio_id,user_id) DO UPDATE SET nombre=EXCLUDED.nombre,perfil=EXCLUDED.perfil,permisos=EXCLUDED.permisos,version=comercio_usuario_accesos.version+1,actualizado_por=auth.uid(),actualizado_en=now();
 IF p_permisos ? 'restaurante' AND jsonb_array_length(p_permisos->'restaurante')>0 AND p_rol<>'admin' AND p_activo THEN
  PERFORM public.restaurante_guardar_usuario(p_comercio_id,p_user_id,p_nombre,p_restaurante_roles,p_restaurante_sector_id,p_restaurante_cobros,p_activo,false);
 ELSE
  UPDATE public.restaurante_permisos SET activo=false,permisos='{}' WHERE comercio_id=p_comercio_id AND usuario_id=p_user_id AND p_rol<>'admin';
 END IF;
 INSERT INTO public.comercio_usuario_eventos(comercio_id,user_id,actor_id,anterior,posterior) SELECT p_comercio_id,p_user_id,auth.uid(),anterior,jsonb_build_object('rol',p_rol,'activo',p_activo,'acceso',to_jsonb(a),'restaurante_roles',p_restaurante_roles,'restaurante_sector_id',p_restaurante_sector_id,'restaurante_cobros',p_restaurante_cobros) FROM public.comercio_usuario_accesos a WHERE comercio_id=p_comercio_id AND user_id=p_user_id;
 RETURN p_user_id;
END $$;

-- Cuenta/identidad y permisos se administran sólo mediante el servidor.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure firma,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'vortex_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.firma);
  IF f.proname NOT IN ('vortex_usuario_permiso_interno','vortex_permiso_servicio') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.firma); END IF;
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.vortex_validar_solicitud() TO anon,service_role;
-- Evita reemplazar inadvertidamente un pre-request de otra integración.
DO $$ DECLARE actual text; BEGIN
 SELECT split_part(s,'=',2) INTO actual FROM pg_db_role_setting d JOIN pg_roles r ON r.oid=d.setrole CROSS JOIN LATERAL unnest(d.setconfig) s WHERE r.rolname='authenticator' AND s LIKE 'pgrst.db_pre_request=%' LIMIT 1;
 IF coalesce(actual,'') NOT IN ('','public.vortex_validar_solicitud') THEN RAISE EXCEPTION 'Ya existe otro pre-request; integrar antes de aplicar: %',actual; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN EXECUTE 'ALTER ROLE authenticator SET pgrst.db_pre_request = ''public.vortex_validar_solicitud'''; END IF;
END $$;
NOTIFY pgrst,'reload config';
NOTIFY pgrst,'reload schema';
COMMIT;
