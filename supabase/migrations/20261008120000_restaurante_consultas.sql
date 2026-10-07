BEGIN;
CREATE FUNCTION public.restaurante_resumen(p_comercio_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE resultado jsonb; v_permisos text[]; es_admin boolean; cocina_sola boolean; sector uuid;
BEGIN
 IF public.restaurante_acceso(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Restaurante no habilitado o sin permisos' USING ERRCODE='42501'; END IF;
 es_admin:=public.user_is_comercio_admin(p_comercio_id);
 IF es_admin THEN v_permisos:=ARRAY['pedidos','salon','cocina','despacho','envios','cobros','cierre','configuracion'];
 ELSE SELECT r.permisos,r.sector_id INTO v_permisos,sector FROM public.restaurante_permisos r WHERE comercio_id=p_comercio_id AND usuario_id=auth.uid(); END IF;
 cocina_sola:=v_permisos=ARRAY['cocina'];
 WITH pedidos AS (SELECT * FROM public.restaurante_pedidos p WHERE p.comercio_id=p_comercio_id AND public.restaurante_ver_pedido(p_comercio_id,p.id)),
 items AS (SELECT i.* FROM public.restaurante_items i JOIN pedidos p ON p.id=i.pedido_id WHERE NOT cocina_sola OR sector IS NULL OR i.sector_id=sector)
 SELECT jsonb_build_object(
 'admin',es_admin,'usuario_id',auth.uid(),'permisos',to_jsonb(v_permisos),'sector_id',sector,
 'config',coalesce((SELECT to_jsonb(c) FROM public.restaurante_config c WHERE c.comercio_id=p_comercio_id),jsonb_build_object('modalidades',jsonb_build_array('delivery','retiro','mesa'),'impresion','58mm','iva_envio',21)),
 'sectores',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY nombre) FROM public.restaurante_sectores s WHERE comercio_id=p_comercio_id),'[]'),
 'mesas',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY nombre) FROM public.restaurante_mesas m WHERE comercio_id=p_comercio_id),'[]'),
 'carta',coalesce((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('descripcion',pr.descripcion,'precio',pr.precio_venta,'iva',pr.porcentaje_iva,'stock',pr.stock) ORDER BY pr.descripcion) FROM public.restaurante_carta c JOIN public.productos pr ON pr.id=c.producto_id WHERE c.comercio_id=p_comercio_id),'[]'),
 'adicionales',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY nombre) FROM public.restaurante_adicionales a WHERE comercio_id=p_comercio_id),'[]'),
 'pedidos',coalesce((SELECT jsonb_agg((to_jsonb(p)-ARRAY['direccion','telefono','instrucciones_envio','cliente_id','cliente_nombre'])||
 CASE WHEN cocina_sola THEN jsonb_build_object('cliente_nombre','Pedido '||p.numero,'direccion','','telefono','','instrucciones_envio','','cliente_id',NULL)
 ELSE jsonb_build_object('cliente_nombre',p.cliente_nombre,'cliente_id',p.cliente_id,'direccion',p.direccion,'telefono',p.telefono,'instrucciones_envio',p.instrucciones_envio) END||jsonb_build_object('total',public.restaurante_total(p.id),'cobrado',CASE WHEN cocina_sola THEN 0 ELSE public.restaurante_cobrado(p.id) END) ORDER BY p.created_at DESC) FROM pedidos p),'[]'),
 'items',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY created_at,id) FROM items i),'[]'),
 'comandas',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at) FROM public.restaurante_comandas c JOIN pedidos p ON p.id=c.pedido_id WHERE NOT cocina_sola OR sector IS NULL OR c.sector_id=sector),'[]'),
 'cuenta_mesas',coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM public.restaurante_cuenta_mesas m JOIN pedidos p ON p.id=m.pedido_id),'[]'),
 'envios',coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM public.restaurante_envios e JOIN pedidos p ON p.id=e.pedido_id),'[]'),
 'cobros',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at) FROM public.restaurante_cobros c JOIN pedidos p ON p.id=c.pedido_id WHERE NOT cocina_sola AND (v_permisos && ARRAY['pedidos','salon','cobros','cierre','configuracion'] OR c.usuario_id=auth.uid())),'[]'),
 'cobro_items',coalesce((SELECT jsonb_agg(to_jsonb(ci)) FROM public.restaurante_cobro_items ci JOIN public.restaurante_cobros c ON c.id=ci.cobro_id JOIN pedidos p ON p.id=c.pedido_id WHERE NOT cocina_sola AND (v_permisos && ARRAY['pedidos','salon','cobros','cierre','configuracion'] OR c.usuario_id=auth.uid())),'[]'),
 'rendiciones',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC) FROM public.restaurante_rendiciones r WHERE comercio_id=p_comercio_id AND ('cierre'=ANY(v_permisos) OR usuario_id=auth.uid())),'[]'),
 'eventos',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC) FROM public.restaurante_eventos e JOIN pedidos p ON p.id=e.pedido_id),'[]'),
 'usuarios',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'nombre',u.email,'admin',cu.rol='admin')) FROM public.comercio_usuarios cu JOIN auth.users u ON u.id=cu.user_id WHERE cu.comercio_id=p_comercio_id AND cu.activo AND (es_admin OR v_permisos && ARRAY['configuracion','despacho','cierre'] OR u.id=auth.uid())),'[]'),
 'asignaciones',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.restaurante_permisos r WHERE comercio_id=p_comercio_id AND (es_admin OR v_permisos && ARRAY['configuracion','despacho','cierre'] OR usuario_id=auth.uid())),'[]')
 ) INTO resultado;
 RETURN resultado;
END $$;
CREATE FUNCTION public.restaurante_proteger_venta() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v uuid; protegido boolean;
BEGIN
 IF TG_TABLE_NAME='ventas' THEN v:=OLD.id;
 ELSIF TG_OP='INSERT' THEN v:=NEW.venta_id; ELSE v:=OLD.venta_id; END IF;
 protegido:=EXISTS(SELECT 1 FROM public.restaurante_pedidos WHERE venta_id=v);
 IF TG_TABLE_NAME<>'ventas' AND TG_OP='UPDATE' THEN protegido:=protegido OR EXISTS(SELECT 1 FROM public.restaurante_pedidos WHERE venta_id=NEW.venta_id); END IF;
 IF protegido THEN
 IF TG_TABLE_NAME='ventas' AND TG_OP='UPDATE' THEN
 IF
 (to_jsonb(NEW)-ARRAY['cae','cae_vencimiento','cae_solicitado_at','cae_error','updated_at','numero_comprobante','numero_secuencial','punto_venta']) IS NOT DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['cae','cae_vencimiento','cae_solicitado_at','cae_error','updated_at','numero_comprobante','numero_secuencial','punto_venta']) THEN RETURN NEW; END IF; END IF;
 RAISE EXCEPTION 'La venta conserva la cuenta gastronómica; utilizá el circuito de notas de crédito'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER restaurante_venta_protegida BEFORE UPDATE OR DELETE ON public.ventas FOR EACH ROW EXECUTE FUNCTION public.restaurante_proteger_venta();
CREATE TRIGGER restaurante_items_venta_protegidos BEFORE INSERT OR UPDATE OR DELETE ON public.venta_items FOR EACH ROW EXECUTE FUNCTION public.restaurante_proteger_venta();
CREATE TRIGGER restaurante_pagos_protegidos BEFORE INSERT OR UPDATE OR DELETE ON public.pagos_venta FOR EACH ROW EXECUTE FUNCTION public.restaurante_proteger_venta();
CREATE FUNCTION public.restaurante_proteger_debito() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN
 IF (OLD.tipo_movimiento='debito' AND EXISTS(SELECT 1 FROM public.restaurante_pedidos WHERE venta_id=OLD.venta_id)) OR EXISTS(SELECT 1 FROM public.restaurante_pedidos WHERE OLD.id=ANY(creditos_cierre)) THEN RAISE EXCEPTION 'El movimiento conserva la cuenta gastronómica'; END IF; END IF;
 IF TG_OP<>'DELETE' THEN
 IF NEW.tipo_movimiento='debito' AND EXISTS(SELECT 1 FROM public.restaurante_pedidos WHERE venta_id=NEW.venta_id) THEN RAISE EXCEPTION 'El movimiento conserva la cuenta gastronómica'; END IF; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER restaurante_debito_protegido BEFORE INSERT OR UPDATE OR DELETE ON public.cuenta_corriente FOR EACH ROW EXECUTE FUNCTION public.restaurante_proteger_debito();
REVOKE ALL ON FUNCTION public.restaurante_proteger_debito() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.restaurante_proteger_venta() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.restaurante_resumen(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restaurante_resumen(uuid) TO authenticated;
COMMIT;
