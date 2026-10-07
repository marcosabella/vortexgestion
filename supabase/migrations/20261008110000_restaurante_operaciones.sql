BEGIN;
CREATE FUNCTION public.restaurante_total(p_pedido uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(sum(round(i.cantidad*i.precio,2)),0)+(SELECT costo_envio FROM public.restaurante_pedidos WHERE id=p_pedido)
 FROM public.restaurante_items i WHERE pedido_id=p_pedido AND estado<>'cancelada';
$$;
CREATE FUNCTION public.restaurante_cobrado(p_pedido uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(sum(monto),0) FROM public.restaurante_cobros WHERE pedido_id=p_pedido AND NOT anulado;
$$;
CREATE FUNCTION public.restaurante_operar(p_comercio_id uuid,p_accion text,p_datos jsonb,p_clave uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.restaurante_pedidos; destino public.restaurante_pedidos; i public.restaurante_items;
 carta public.restaurante_carta; producto public.productos; adicional public.restaurante_adicionales;
 comanda public.restaurante_comandas; envio public.restaurante_envios; cobro public.restaurante_cobros;
 intento public.restaurante_intentos; venta public.ventas; cfg public.restaurante_config;
 el jsonb; extras jsonb; det jsonb; pagos jsonb; permiso text; resultado uuid; sector uuid; mesa uuid;
 cantidad integer; monto numeric; precio numeric; esperado numeric; recibido numeric; pv integer;
 motivo text; v_cliente_nombre text; tipo text; repartidor uuid; ids uuid[];
BEGIN
 IF public.restaurante_acceso(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Restaurante no habilitado o sin permisos' USING ERRCODE='42501'; END IF;
 IF p_clave IS NULL OR jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitud inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('restaurante:'||p_comercio_id::text,0));
 SELECT * INTO intento FROM public.restaurante_intentos WHERE comercio_id=p_comercio_id AND clave=p_clave;
 IF FOUND THEN
 IF intento.usuario_id<>auth.uid() OR intento.accion<>p_accion OR intento.datos<>p_datos THEN RAISE EXCEPTION 'Intento reutilizado con otros datos'; END IF;
 RETURN intento.resultado; END IF;
 permiso:=CASE
 WHEN p_accion IN ('config','sector','mesa','carta','adicional','permisos') THEN 'configuracion'
 WHEN p_accion IN ('aceptar','preparar','listo','impresion','reconocer') THEN 'cocina'
 WHEN p_accion IN ('armar','asignar_envio','retirar') THEN 'despacho'
 WHEN p_accion IN ('salida','entregar','incidencia') THEN 'envios'
 WHEN p_accion IN ('cobro','anular_cobro') THEN 'cobros'
 WHEN p_accion IN ('rendir','cerrar') THEN 'cierre'
 WHEN p_accion IN ('mover_mesa','unir','servir','solicitar_cuenta') THEN 'salon'
 ELSE 'pedidos' END;
 IF p_accion='pedido' AND p_datos->>'modalidad'='mesa' THEN permiso:='salon'; END IF;
 -- Mozo puede ampliar y enviar sus cuentas; cocina puede imprimir; reparto cobra sólo su envío.
 IF public.restaurante_permiso(p_comercio_id,permiso) IS DISTINCT FROM true THEN
 IF NOT(p_accion IN ('agregar','enviar','cancelar_item') AND public.restaurante_permiso(p_comercio_id,'salon'))
 AND NOT(p_accion='impresion' AND public.restaurante_permiso(p_comercio_id,'despacho'))
 AND NOT(p_accion='cobro' AND public.restaurante_permiso(p_comercio_id,'envios')) THEN
 RAISE EXCEPTION 'Acción sin permiso' USING ERRCODE='42501'; END IF; END IF;
 resultado:=p_comercio_id;
 SELECT * INTO cfg FROM public.restaurante_config WHERE comercio_id=p_comercio_id;
 IF p_accion IN ('config','sector','mesa','carta','adicional','permisos') THEN
 IF p_accion='config' THEN
 INSERT INTO public.restaurante_config(comercio_id,modalidades,impresion,iva_envio)
 VALUES(p_comercio_id,ARRAY(SELECT jsonb_array_elements_text(p_datos->'modalidades')),p_datos->>'impresion',coalesce((p_datos->>'iva_envio')::numeric,21))
 ON CONFLICT(comercio_id) DO UPDATE SET modalidades=EXCLUDED.modalidades,impresion=EXCLUDED.impresion,iva_envio=EXCLUDED.iva_envio;
 ELSIF p_accion='permisos' THEN
 -- La delegación de funciones queda exclusivamente en administración del comercio.
 IF public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sólo administración asigna permisos' USING ERRCODE='42501'; END IF;
 INSERT INTO public.restaurante_permisos(comercio_id,usuario_id,permisos,sector_id)
 VALUES(p_comercio_id,(p_datos->>'usuario_id')::uuid,ARRAY(SELECT jsonb_array_elements_text(p_datos->'permisos')),nullif(p_datos->>'sector_id','')::uuid)
 ON CONFLICT(comercio_id,usuario_id) DO UPDATE SET permisos=EXCLUDED.permisos,sector_id=EXCLUDED.sector_id;
 ELSIF p_accion='sector' THEN
 IF p_datos ? 'id' THEN UPDATE public.restaurante_sectores SET nombre=btrim(p_datos->>'nombre'),activo=coalesce((p_datos->>'activo')::boolean,true),impresion=nullif(p_datos->>'impresion','') WHERE id=(p_datos->>'id')::uuid AND comercio_id=p_comercio_id RETURNING id INTO resultado;
 ELSE INSERT INTO public.restaurante_sectores(comercio_id,nombre,impresion) VALUES(p_comercio_id,btrim(p_datos->>'nombre'),nullif(p_datos->>'impresion','')) RETURNING id INTO resultado; END IF;
 ELSIF p_accion='mesa' THEN
 IF p_datos ? 'id' THEN
 IF EXISTS(SELECT 1 FROM public.restaurante_cuenta_mesas WHERE mesa_id=(p_datos->>'id')::uuid AND activa) AND (p_datos->>'activo')::boolean=false THEN RAISE EXCEPTION 'Mesa ocupada'; END IF;
 UPDATE public.restaurante_mesas SET nombre=btrim(p_datos->>'nombre'),capacidad=(p_datos->>'capacidad')::integer,activo=coalesce((p_datos->>'activo')::boolean,true) WHERE id=(p_datos->>'id')::uuid AND comercio_id=p_comercio_id RETURNING id INTO resultado;
 ELSE INSERT INTO public.restaurante_mesas(comercio_id,nombre,capacidad) VALUES(p_comercio_id,btrim(p_datos->>'nombre'),(p_datos->>'capacidad')::integer) RETURNING id INTO resultado; END IF;
 ELSIF p_accion='carta' THEN
 IF NOT EXISTS(SELECT 1 FROM public.productos WHERE id=(p_datos->>'producto_id')::uuid AND comercio_id=p_comercio_id AND tipo_moneda='ARS' AND precio_venta>0) THEN RAISE EXCEPTION 'Producto no disponible en pesos'; END IF;
 INSERT INTO public.restaurante_carta(comercio_id,producto_id,sector_id,afecta_stock,activo)
 VALUES(p_comercio_id,(p_datos->>'producto_id')::uuid,(p_datos->>'sector_id')::uuid,coalesce((p_datos->>'afecta_stock')::boolean,false),coalesce((p_datos->>'activo')::boolean,true))
 ON CONFLICT(comercio_id,producto_id) DO UPDATE SET sector_id=EXCLUDED.sector_id,afecta_stock=EXCLUDED.afecta_stock,activo=EXCLUDED.activo RETURNING id INTO resultado;
 ELSE
 IF p_datos ? 'id' THEN UPDATE public.restaurante_adicionales SET nombre=btrim(p_datos->>'nombre'),precio=(p_datos->>'precio')::numeric,activo=coalesce((p_datos->>'activo')::boolean,true) WHERE id=(p_datos->>'id')::uuid AND comercio_id=p_comercio_id RETURNING id INTO resultado;
 ELSE INSERT INTO public.restaurante_adicionales(comercio_id,nombre,precio) VALUES(p_comercio_id,btrim(p_datos->>'nombre'),(p_datos->>'precio')::numeric) RETURNING id INTO resultado; END IF;
 END IF;
 IF resultado IS NULL THEN RAISE EXCEPTION 'Registro no disponible'; END IF;
 ELSIF p_accion='rendir' THEN
 repartidor:=(p_datos->>'usuario_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.comercio_usuarios WHERE comercio_id=p_comercio_id AND user_id=repartidor AND activo) THEN RAISE EXCEPTION 'Usuario no disponible'; END IF;
 IF jsonb_typeof(p_datos->'cobro_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_datos->'cobro_ids')=0 THEN RAISE EXCEPTION 'Seleccioná los cobros a rendir'; END IF;
 ids:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_datos->'cobro_ids'));
 IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) OR cardinality(ids)<>(SELECT count(*) FROM public.restaurante_cobros c WHERE c.id=ANY(ids) AND c.comercio_id=p_comercio_id AND c.usuario_id=repartidor AND c.medio='contado' AND NOT c.anulado AND c.rendicion_id IS NULL) THEN RAISE EXCEPTION 'Cobros inválidos o ya rendidos'; END IF;
 IF EXISTS(SELECT 1 FROM public.restaurante_cobros c JOIN public.restaurante_envios e ON e.pedido_id=c.pedido_id WHERE c.id=ANY(ids) AND e.estado NOT IN ('entregado','cancelado')) THEN RAISE EXCEPTION 'Hay envíos abiertos o incidencias pendientes; resolvé la entrega o devolución antes de rendir'; END IF;
 SELECT sum(c.monto) INTO esperado FROM public.restaurante_cobros c WHERE c.id=ANY(ids);
 recibido:=(p_datos->>'recibido')::numeric; motivo:=coalesce(p_datos->>'motivo','');
 IF recibido IS NULL OR recibido<0 OR recibido::text IN ('NaN','Infinity','-Infinity') OR recibido<>round(recibido,2) THEN RAISE EXCEPTION 'Efectivo inválido'; END IF;
 IF recibido<>esperado AND length(btrim(motivo))=0 THEN RAISE EXCEPTION 'Explicá la diferencia de efectivo'; END IF;
 INSERT INTO public.restaurante_rendiciones(comercio_id,usuario_id,esperado,recibido,diferencia,observaciones,creado_por)
 VALUES(p_comercio_id,repartidor,esperado,recibido,recibido-esperado,motivo,auth.uid()) RETURNING id INTO resultado;
 UPDATE public.restaurante_cobros SET rendicion_id=resultado WHERE id=ANY(ids);
 ELSIF p_accion='pedido' THEN
 tipo:=p_datos->>'modalidad';
 IF tipo IS NULL OR NOT(tipo=ANY(coalesce(cfg.modalidades,ARRAY['delivery','retiro','mesa']))) THEN RAISE EXCEPTION 'Modalidad no habilitada'; END IF;
 IF tipo='delivery' AND length(btrim(coalesce(p_datos->>'direccion','')))=0 THEN RAISE EXCEPTION 'Indicá el domicilio de entrega'; END IF;
 v_cliente_nombre:=coalesce(nullif(btrim(p_datos->>'cliente_nombre'),''),'Consumidor Final');
 IF nullif(p_datos->>'cliente_id','') IS NOT NULL THEN
 SELECT concat_ws(' ',nombre,apellido) INTO v_cliente_nombre FROM public.clientes WHERE id=(p_datos->>'cliente_id')::uuid AND comercio_id=p_comercio_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no disponible'; END IF; END IF;
 INSERT INTO public.restaurante_pedidos(comercio_id,modalidad,cliente_id,cliente_nombre,direccion,telefono,comensales,prometido_at,prioridad,observaciones,instrucciones_envio,costo_envio,iva_envio,creado_por)
 VALUES(p_comercio_id,tipo,nullif(p_datos->>'cliente_id','')::uuid,v_cliente_nombre,coalesce(p_datos->>'direccion',''),coalesce(p_datos->>'telefono',''),coalesce((p_datos->>'comensales')::integer,1),nullif(p_datos->>'prometido_at','')::timestamptz,coalesce((p_datos->>'prioridad')::boolean,false),coalesce(p_datos->>'observaciones',''),coalesce(p_datos->>'instrucciones_envio',''),coalesce((p_datos->>'costo_envio')::numeric,0),coalesce(cfg.iva_envio,21),auth.uid()) RETURNING * INTO p;
 resultado:=p.id;
 IF tipo='mesa' THEN
 mesa:=(p_datos->>'mesa_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.restaurante_mesas WHERE id=mesa AND comercio_id=p_comercio_id AND activo AND capacidad>=p.comensales) THEN RAISE EXCEPTION 'Mesa no disponible o capacidad insuficiente'; END IF;
 INSERT INTO public.restaurante_cuenta_mesas(comercio_id,pedido_id,mesa_id) VALUES(p_comercio_id,p.id,mesa);
 END IF;
 ELSE
 SELECT * INTO p FROM public.restaurante_pedidos WHERE id=(p_datos->>'pedido_id')::uuid AND comercio_id=p_comercio_id FOR UPDATE;
 IF NOT FOUND OR public.restaurante_ver_pedido(p_comercio_id,p.id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Pedido no disponible' USING ERRCODE='42501'; END IF;
 IF p_accion<>'reconocer' AND (p.venta_id IS NOT NULL OR p.estado IN ('cancelado','unido')) THEN RAISE EXCEPTION 'Cuenta cerrada o pedido cancelado'; END IF;
 IF (p_datos->>'version')::integer IS DISTINCT FROM p.version THEN RAISE EXCEPTION 'El pedido cambió; actualizá antes de continuar' USING ERRCODE='40001'; END IF;
 IF permiso='pedidos' AND NOT public.restaurante_permiso(p_comercio_id,'pedidos') AND p.modalidad<>'mesa' THEN RAISE EXCEPTION 'Acción sin permiso'; END IF;
 IF permiso='salon' AND p.modalidad<>'mesa' THEN RAISE EXCEPTION 'Pedido sin mesa'; END IF;
 resultado:=p.id;
 SELECT * INTO envio FROM public.restaurante_envios WHERE pedido_id=p.id;
 IF permiso='envios' OR (p_accion='cobro' AND NOT public.restaurante_permiso(p_comercio_id,'cobros')) THEN
 IF envio.repartidor_id IS DISTINCT FROM auth.uid() AND public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Envío de otro repartidor' USING ERRCODE='42501'; END IF; END IF;
 IF p_accion='agregar' THEN
 IF p.cuenta<>'abierta' OR p.armado OR EXISTS(SELECT 1 FROM public.restaurante_items WHERE pedido_id=p.id AND estado='entregada' AND p.modalidad<>'mesa') OR envio.estado IN ('en_camino','entregado') THEN RAISE EXCEPTION 'El pedido ya está en despacho o pidió la cuenta'; END IF;
 IF jsonb_typeof(p_datos->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_datos->'items')=0 THEN RAISE EXCEPTION 'Agregá productos'; END IF;
 FOR el IN SELECT value FROM jsonb_array_elements(p_datos->'items') LOOP
 SELECT * INTO carta FROM public.restaurante_carta WHERE id=(el->>'carta_id')::uuid AND comercio_id=p_comercio_id AND activo;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.restaurante_sectores WHERE id=carta.sector_id AND activo) THEN RAISE EXCEPTION 'Producto fuera de carta'; END IF;
 SELECT * INTO producto FROM public.productos WHERE id=carta.producto_id AND comercio_id=p_comercio_id AND tipo_moneda='ARS';
 IF NOT FOUND OR producto.precio_venta<=0 THEN RAISE EXCEPTION 'Producto no disponible'; END IF;
 IF (el->>'cantidad')::numeric IS NULL OR (el->>'cantidad')::numeric<>trunc((el->>'cantidad')::numeric) THEN RAISE EXCEPTION 'Cantidad entera requerida'; END IF;
 cantidad:=(el->>'cantidad')::integer; precio:=producto.precio_venta; extras:='[]';
 IF el ? 'adicionales' THEN
 IF jsonb_typeof(el->'adicionales') IS DISTINCT FROM 'array' OR jsonb_array_length(el->'adicionales')<>(SELECT count(DISTINCT value) FROM jsonb_array_elements_text(el->'adicionales')) THEN RAISE EXCEPTION 'Adicionales inválidos'; END IF;
 FOR sector IN SELECT value::uuid FROM jsonb_array_elements_text(el->'adicionales') LOOP
 SELECT * INTO adicional FROM public.restaurante_adicionales WHERE id=sector AND comercio_id=p_comercio_id AND activo;
 IF NOT FOUND THEN RAISE EXCEPTION 'Adicional no disponible'; END IF;
 precio:=precio+adicional.precio; extras:=extras||jsonb_build_array(jsonb_build_object('id',adicional.id,'nombre',adicional.nombre,'precio',adicional.precio));
 END LOOP; END IF;
 INSERT INTO public.restaurante_items(comercio_id,pedido_id,carta_id,sector_id,producto_id,descripcion,cantidad,precio,iva,afecta_stock,adicionales,observaciones)
 VALUES(p_comercio_id,p.id,carta.id,carta.sector_id,producto.id,producto.descripcion,cantidad,precio,producto.porcentaje_iva,carta.afecta_stock,extras,coalesce(el->>'observaciones',''));
 END LOOP;
 ELSIF p_accion='enviar' THEN
 IF NOT EXISTS(SELECT 1 FROM public.restaurante_items WHERE pedido_id=p.id AND estado='borrador') THEN RAISE EXCEPTION 'No hay productos nuevos para cocina'; END IF;
 IF p.cuenta<>'abierta' OR p.armado THEN RAISE EXCEPTION 'Cuenta solicitada o pedido armado'; END IF;
 FOR sector IN SELECT DISTINCT sector_id FROM public.restaurante_items WHERE pedido_id=p.id AND estado='borrador' LOOP
 INSERT INTO public.restaurante_comandas(comercio_id,pedido_id,sector_id) VALUES(p_comercio_id,p.id,sector) RETURNING * INTO comanda;
 UPDATE public.restaurante_items SET comanda_id=comanda.id,estado='pendiente' WHERE pedido_id=p.id AND sector_id=sector AND estado='borrador';
 END LOOP;
 UPDATE public.restaurante_pedidos SET estado='confirmado' WHERE id=p.id;
 ELSIF p_accion IN ('aceptar','preparar','listo','impresion','reconocer') THEN
 SELECT * INTO comanda FROM public.restaurante_comandas WHERE id=(p_datos->>'comanda_id')::uuid AND pedido_id=p.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Comanda no disponible'; END IF;
 SELECT sector_id INTO sector FROM public.restaurante_permisos WHERE comercio_id=p_comercio_id AND usuario_id=auth.uid();
 IF public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true AND sector IS NOT NULL AND sector<>comanda.sector_id THEN RAISE EXCEPTION 'Comanda de otro sector'; END IF;
 IF p_accion='reconocer' THEN
 IF NOT comanda.aviso_cancelacion THEN RAISE EXCEPTION 'No hay cancelaciones pendientes'; END IF;
 UPDATE public.restaurante_comandas SET aviso_cancelacion=false WHERE id=comanda.id;
 ELSIF p_accion='impresion' THEN UPDATE public.restaurante_comandas SET impresiones=impresiones+1 WHERE id=comanda.id;
 ELSE
 tipo:=CASE p_accion WHEN 'aceptar' THEN 'pendiente' WHEN 'preparar' THEN 'aceptada' ELSE 'preparacion' END;
 IF p_datos ? 'item_id' THEN
 IF NOT EXISTS(SELECT 1 FROM public.restaurante_items WHERE id=(p_datos->>'item_id')::uuid AND comanda_id=comanda.id AND estado=tipo) THEN RAISE EXCEPTION 'Producto fuera de estado'; END IF;
 UPDATE public.restaurante_items SET estado=CASE p_accion WHEN 'aceptar' THEN 'aceptada' WHEN 'preparar' THEN 'preparacion' ELSE 'lista' END WHERE id=(p_datos->>'item_id')::uuid AND comanda_id=comanda.id;
 ELSE
 IF NOT EXISTS(SELECT 1 FROM public.restaurante_items WHERE comanda_id=comanda.id AND estado=tipo) THEN RAISE EXCEPTION 'Comanda fuera de estado'; END IF;
 UPDATE public.restaurante_items SET estado=CASE p_accion WHEN 'aceptar' THEN 'aceptada' WHEN 'preparar' THEN 'preparacion' ELSE 'lista' END WHERE comanda_id=comanda.id AND estado=tipo;
 END IF;
 UPDATE public.restaurante_pedidos SET estado='en_atencion' WHERE id=p.id;
 END IF;
 ELSIF p_accion='servir' THEN
 IF NOT EXISTS(SELECT 1 FROM public.restaurante_items WHERE id=(p_datos->>'item_id')::uuid AND pedido_id=p.id AND estado='lista') THEN RAISE EXCEPTION 'Producto todavía no listo'; END IF;
 UPDATE public.restaurante_items SET estado='entregada' WHERE id=(p_datos->>'item_id')::uuid AND pedido_id=p.id;
 ELSIF p_accion IN ('armar','retirar','asignar_envio','salida','entregar','incidencia') THEN
 IF p.modalidad='mesa' THEN RAISE EXCEPTION 'El salón registra servicio por producto'; END IF;
 IF p_accion='incidencia' THEN
 IF envio.estado NOT IN ('asignado','en_camino') OR length(btrim(coalesce(p_datos->>'motivo','')))=0 THEN RAISE EXCEPTION 'Envío o motivo inválido'; END IF;
 UPDATE public.restaurante_envios SET estado='incidencia',observaciones=p_datos->>'motivo' WHERE id=envio.id;
 ELSE
 IF NOT EXISTS(SELECT 1 FROM public.restaurante_items WHERE pedido_id=p.id AND estado<>'cancelada') OR EXISTS(SELECT 1 FROM public.restaurante_items WHERE pedido_id=p.id AND estado NOT IN ('lista','entregada','cancelada')) THEN RAISE EXCEPTION 'Hay productos sin preparar'; END IF;
 IF p_accion='armar' THEN
 IF p.armado THEN RAISE EXCEPTION 'Pedido ya armado'; END IF;
 UPDATE public.restaurante_pedidos SET armado=true WHERE id=p.id;
 ELSE
 IF NOT p.armado THEN RAISE EXCEPTION 'Controlá y armá el pedido antes de entregar'; END IF;
 IF p_accion='asignar_envio' THEN
 IF p.modalidad<>'delivery' OR (envio.id IS NOT NULL AND envio.estado NOT IN ('asignado','incidencia')) THEN RAISE EXCEPTION 'Envío no asignable'; END IF;
 repartidor:=(p_datos->>'repartidor_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.restaurante_permisos WHERE comercio_id=p_comercio_id AND usuario_id=repartidor AND 'envios'=ANY(permisos)) AND public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Repartidor sin permiso de envíos'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.restaurante_permisos WHERE comercio_id=p_comercio_id AND usuario_id=repartidor AND 'envios'=ANY(permisos)) AND NOT EXISTS(SELECT 1 FROM public.comercio_usuarios WHERE comercio_id=p_comercio_id AND user_id=repartidor AND activo AND rol='admin') THEN RAISE EXCEPTION 'Repartidor sin permiso de envíos'; END IF;
 INSERT INTO public.restaurante_envios(comercio_id,pedido_id,repartidor_id) VALUES(p_comercio_id,p.id,repartidor)
 ON CONFLICT(pedido_id) DO UPDATE SET repartidor_id=EXCLUDED.repartidor_id,estado='asignado',observaciones='',salida_at=NULL,entrega_at=NULL;
 ELSIF p_accion='salida' THEN
 IF envio.estado IS DISTINCT FROM 'asignado' THEN RAISE EXCEPTION 'Envío no asignado'; END IF;
 UPDATE public.restaurante_envios SET estado='en_camino',salida_at=now() WHERE id=envio.id;
 ELSIF p_accion='entregar' OR p_accion='retirar' THEN
 IF (p_accion='retirar' AND p.modalidad<>'retiro') OR (p_accion='entregar' AND envio.estado IS DISTINCT FROM 'en_camino') THEN RAISE EXCEPTION 'Entrega fuera de estado'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.restaurante_items WHERE pedido_id=p.id AND estado='lista') THEN RAISE EXCEPTION 'Entrega ya registrada'; END IF;
 UPDATE public.restaurante_items SET estado='entregada' WHERE pedido_id=p.id AND estado='lista';
 IF p_accion='entregar' THEN UPDATE public.restaurante_envios SET estado='entregado',entrega_at=now() WHERE id=envio.id; END IF;
 END IF;
 END IF;
 END IF;
 ELSIF p_accion IN ('cancelar_item','cancelar') THEN
 IF length(btrim(coalesce(p_datos->>'motivo','')))=0 THEN RAISE EXCEPTION 'Indicá el motivo de cancelación'; END IF;
 IF (p.armado AND envio.estado IS DISTINCT FROM 'incidencia' AND NOT(p_accion='cancelar' AND p.modalidad='retiro' AND NOT EXISTS(SELECT 1 FROM public.restaurante_items WHERE pedido_id=p.id AND estado='entregada'))) OR envio.estado IN ('en_camino','entregado') THEN RAISE EXCEPTION 'Pedido en despacho; registrá incidencia antes de cancelar'; END IF;
 IF p_accion='cancelar' THEN
 IF public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sólo administración cancela pedidos'; END IF;
 IF public.restaurante_cobrado(p.id)>0 THEN RAISE EXCEPTION 'Anulá y devolvé los cobros antes de cancelar'; END IF;
 UPDATE public.restaurante_comandas SET aviso_cancelacion=true WHERE pedido_id=p.id;
 UPDATE public.restaurante_items SET estado='cancelada' WHERE pedido_id=p.id;
 UPDATE public.restaurante_pedidos SET estado='cancelado',cuenta='cerrada' WHERE id=p.id;
 UPDATE public.restaurante_cuenta_mesas SET activa=false WHERE pedido_id=p.id;
 UPDATE public.restaurante_envios SET estado='cancelado' WHERE pedido_id=p.id;
 ELSE
 SELECT * INTO i FROM public.restaurante_items WHERE id=(p_datos->>'item_id')::uuid AND pedido_id=p.id;
 IF NOT FOUND OR i.estado IN ('cancelada','entregada') THEN RAISE EXCEPTION 'Producto no cancelable'; END IF;
 IF i.estado<>'borrador' AND public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sólo administración cancela productos enviados'; END IF;
 IF public.restaurante_total(p.id)-round(i.cantidad*i.precio,2)<public.restaurante_cobrado(p.id) OR EXISTS(SELECT 1 FROM public.restaurante_cobro_items ci JOIN public.restaurante_cobros c ON c.id=ci.cobro_id WHERE ci.item_id=i.id AND NOT c.anulado) THEN RAISE EXCEPTION 'Corregí el cobro antes de cancelar el producto'; END IF;
 UPDATE public.restaurante_items SET estado='cancelada' WHERE id=i.id;
 UPDATE public.restaurante_comandas SET aviso_cancelacion=true WHERE id=i.comanda_id;
 END IF;
 ELSIF p_accion='mover_mesa' THEN
 mesa:=(p_datos->>'mesa_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.restaurante_mesas WHERE id=mesa AND comercio_id=p_comercio_id AND activo AND capacidad>=p.comensales) THEN RAISE EXCEPTION 'Mesa no disponible o capacidad insuficiente'; END IF;
 IF EXISTS(SELECT 1 FROM public.restaurante_cuenta_mesas WHERE mesa_id=mesa AND activa) THEN RAISE EXCEPTION 'Mesa ocupada'; END IF;
 UPDATE public.restaurante_cuenta_mesas SET activa=false WHERE pedido_id=p.id;
 INSERT INTO public.restaurante_cuenta_mesas(comercio_id,pedido_id,mesa_id) VALUES(p_comercio_id,p.id,mesa);
 ELSIF p_accion='unir' THEN
 SELECT * INTO destino FROM public.restaurante_pedidos WHERE id=(p_datos->>'destino_id')::uuid AND comercio_id=p_comercio_id FOR UPDATE;
 IF NOT FOUND OR destino.id=p.id OR destino.modalidad<>'mesa' OR destino.cuenta<>'abierta' OR p.cuenta<>'abierta' OR destino.estado IN ('cancelado','unido','completado') THEN RAISE EXCEPTION 'Cuenta destino no disponible'; END IF;
 IF (p_datos->>'destino_version')::integer IS DISTINCT FROM destino.version THEN RAISE EXCEPTION 'La cuenta destino cambió'; END IF;
 IF public.restaurante_cobrado(p.id)>0 OR public.restaurante_cobrado(destino.id)>0 THEN RAISE EXCEPTION 'Uní las cuentas antes de cobrar'; END IF;
 UPDATE public.restaurante_comandas SET pedido_id=destino.id WHERE pedido_id=p.id;
 UPDATE public.restaurante_items SET pedido_id=destino.id WHERE pedido_id=p.id;
 UPDATE public.restaurante_cuenta_mesas SET pedido_id=destino.id WHERE pedido_id=p.id AND activa;
 UPDATE public.restaurante_pedidos SET estado='unido',cuenta='cerrada',unido_a=destino.id WHERE id=p.id;
 UPDATE public.restaurante_pedidos SET version=version+1,comensales=least(100,comensales+p.comensales) WHERE id=destino.id;
 ELSIF p_accion='solicitar_cuenta' THEN
 IF p.cuenta<>'abierta' OR NOT EXISTS(SELECT 1 FROM public.restaurante_items WHERE pedido_id=p.id AND estado<>'cancelada') OR EXISTS(SELECT 1 FROM public.restaurante_items WHERE pedido_id=p.id AND estado NOT IN ('entregada','cancelada')) THEN RAISE EXCEPTION 'Serví todos los productos antes de solicitar la cuenta'; END IF;
 UPDATE public.restaurante_pedidos SET cuenta='solicitada' WHERE id=p.id;
 ELSIF p_accion='cobro' THEN
 IF NOT EXISTS(SELECT 1 FROM public.restaurante_items WHERE pedido_id=p.id AND estado NOT IN ('borrador','cancelada')) THEN RAISE EXCEPTION 'No se puede cobrar un pedido vacío'; END IF;
 IF envio.id IS NOT NULL AND NOT public.restaurante_permiso(p_comercio_id,'cobros') AND envio.estado NOT IN ('en_camino','entregado') THEN RAISE EXCEPTION 'El envío no salió'; END IF;
 monto:=(p_datos->>'monto')::numeric;
 IF monto IS NULL OR monto<=0 OR monto<>round(monto,2) OR monto::text IN ('NaN','Infinity','-Infinity') OR p_datos->>'medio' NOT IN ('contado','transferencia','tarjeta') OR p_datos->>'medio' IS NULL THEN RAISE EXCEPTION 'Cobro inválido'; END IF;
 IF EXISTS(SELECT 1 FROM public.restaurante_items WHERE pedido_id=p.id AND estado='borrador') THEN RAISE EXCEPTION 'Enviá los productos a cocina antes de cobrar'; END IF;
 IF monto+public.restaurante_cobrado(p.id)>public.restaurante_total(p.id) THEN RAISE EXCEPTION 'El cobro supera el saldo'; END IF;
 INSERT INTO public.restaurante_cobros(comercio_id,pedido_id,monto,medio,pagador,usuario_id)
 VALUES(p_comercio_id,p.id,monto,p_datos->>'medio',coalesce(p_datos->>'pagador',''),auth.uid()) RETURNING * INTO cobro;
 IF p_datos ? 'items' THEN
 IF jsonb_typeof(p_datos->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_datos->'items')=0 THEN RAISE EXCEPTION 'Selección de productos inválida'; END IF;
 precio:=0;
 FOR el IN SELECT value FROM jsonb_array_elements(p_datos->'items') LOOP
 SELECT * INTO i FROM public.restaurante_items WHERE id=(el->>'item_id')::uuid AND pedido_id=p.id AND estado NOT IN ('borrador','cancelada');
 IF NOT FOUND OR (el->>'cantidad')::numeric IS NULL OR (el->>'cantidad')::numeric<>trunc((el->>'cantidad')::numeric) THEN RAISE EXCEPTION 'Producto o cantidad inválida'; END IF;
 cantidad:=(el->>'cantidad')::integer;
 IF cantidad<=0 OR cantidad>i.cantidad-coalesce((SELECT sum(ci.cantidad) FROM public.restaurante_cobro_items ci JOIN public.restaurante_cobros c ON c.id=ci.cobro_id WHERE ci.item_id=i.id AND NOT c.anulado),0) THEN RAISE EXCEPTION 'Producto ya cobrado o cantidad excesiva'; END IF;
 INSERT INTO public.restaurante_cobro_items(comercio_id,cobro_id,item_id,cantidad) VALUES(p_comercio_id,cobro.id,i.id,cantidad);
 precio:=precio+round(cantidad*i.precio,2);
 END LOOP;
 IF precio<>monto THEN RAISE EXCEPTION 'El importe no coincide con los productos seleccionados'; END IF;
 END IF;
 ELSIF p_accion='anular_cobro' THEN
 IF public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true OR length(btrim(coalesce(p_datos->>'motivo','')))=0 OR coalesce((p_datos->>'devolucion_confirmada')::boolean,false) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Administración debe confirmar la devolución y su motivo'; END IF;
 UPDATE public.restaurante_cobros SET anulado=true,motivo_anulacion=p_datos->>'motivo' WHERE id=(p_datos->>'cobro_id')::uuid AND pedido_id=p.id AND NOT anulado AND rendicion_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cobro ya anulado o rendido'; END IF;
 ELSIF p_accion='cerrar' THEN
 -- El núcleo de ventas exige administración; se respeta sin ampliar sus permisos.
 IF public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sólo administración cierra y factura'; END IF;
 IF p_datos ? 'cliente_id' THEN
 IF nullif(p_datos->>'cliente_id','') IS NOT NULL THEN
 SELECT concat_ws(' ',nombre,apellido) INTO v_cliente_nombre FROM public.clientes WHERE id=(p_datos->>'cliente_id')::uuid AND comercio_id=p_comercio_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no disponible'; END IF;
 ELSE v_cliente_nombre:=p.cliente_nombre; END IF;
 UPDATE public.restaurante_pedidos SET cliente_id=nullif(p_datos->>'cliente_id','')::uuid,cliente_nombre=v_cliente_nombre WHERE id=p.id RETURNING * INTO p;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.restaurante_items WHERE pedido_id=p.id AND estado='entregada') OR EXISTS(SELECT 1 FROM public.restaurante_items WHERE pedido_id=p.id AND estado NOT IN ('entregada','cancelada')) THEN RAISE EXCEPTION 'Entregá o serví todos los productos antes de cerrar'; END IF;
 IF p.modalidad='delivery' AND envio.estado IS DISTINCT FROM 'entregado' THEN RAISE EXCEPTION 'El envío no fue entregado'; END IF;
 IF EXISTS(SELECT 1 FROM public.restaurante_cobros c JOIN public.restaurante_envios e ON e.pedido_id=c.pedido_id WHERE c.pedido_id=p.id AND c.usuario_id=e.repartidor_id AND c.medio='contado' AND NOT c.anulado AND c.rendicion_id IS NULL) THEN RAISE EXCEPTION 'Rendí el efectivo del repartidor antes de cerrar'; END IF;
 monto:=public.restaurante_total(p.id); esperado:=public.restaurante_cobrado(p.id);
 IF esperado<monto AND p.cliente_id IS NULL THEN RAISE EXCEPTION 'Cobrá el saldo o vinculá un cliente para cuenta corriente'; END IF;
 tipo:=p_datos->>'tipo_comprobante';
 IF tipo IS NULL OR tipo NOT IN ('recibo_x','factura_a','factura_b','factura_c') THEN RAISE EXCEPTION 'Tipo de comprobante inválido'; END IF;
 SELECT coalesce(jsonb_agg((CASE WHEN ri.afecta_stock THEN jsonb_build_object('producto_id',ri.producto_id) ELSE jsonb_build_object('descripcion_manual',ri.descripcion) END)||jsonb_build_object('cantidad',ri.cantidad,'precio_unitario',ri.precio,'porcentaje_iva',ri.iva,'afecta_stock',ri.afecta_stock) ORDER BY ri.created_at,ri.id),'[]') INTO det FROM public.restaurante_items ri WHERE ri.pedido_id=p.id AND ri.estado='entregada';
 IF p.costo_envio>0 THEN det:=det||jsonb_build_array(jsonb_build_object('descripcion_manual','Servicio de delivery','cantidad',1,'precio_unitario',p.costo_envio,'porcentaje_iva',p.iva_envio,'afecta_stock',false)); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('tipo_pago',c.medio,'monto',c.monto) ORDER BY c.created_at,c.id),'[]') INTO pagos FROM public.restaurante_cobros c WHERE c.pedido_id=p.id AND NOT c.anulado;
 SELECT punto_venta INTO pv FROM public.afip_config WHERE comercio_id=p_comercio_id AND activo ORDER BY punto_venta LIMIT 1;
 IF esperado=monto THEN
 SELECT * INTO venta FROM public.registrar_venta_transaccional(p_comercio_id,tipo::public.tipo_comprobante,coalesce(pv,1),p.cliente_id,p.cliente_nombre,'ARS','contado',det,pagos,p.id,now(),'Restaurante pedido '||p.numero);
 ELSE
 SELECT * INTO venta FROM public.registrar_venta_transaccional(p_comercio_id,tipo::public.tipo_comprobante,coalesce(pv,1),p.cliente_id,p.cliente_nombre,'ARS','cta_cte',det,'[]',p.id,now(),'Restaurante pedido '||p.numero);
 IF esperado>0 THEN
 SELECT jsonb_agg(jsonb_build_object('tipo',c.medio,'monto',c.monto,'observaciones','Restaurante pedido '||p.numero)) INTO pagos FROM public.restaurante_cobros c WHERE c.pedido_id=p.id AND NOT c.anulado;
 PERFORM public.registrar_pagos_cliente_multi_documento(p.cliente_id,ARRAY[venta.id],current_date,'Restaurante pedido '||p.numero,pagos);
 END IF;
 END IF;
 UPDATE public.restaurante_pedidos SET estado='completado',cuenta='cerrada',venta_id=venta.id,
 creditos_cierre=ARRAY(SELECT cc.id FROM public.cuenta_corriente cc WHERE cc.venta_id=venta.id AND cc.tipo_movimiento='credito') WHERE id=p.id;
 UPDATE public.restaurante_cuenta_mesas SET activa=false WHERE pedido_id=p.id;
 resultado:=venta.id;
 ELSE RAISE EXCEPTION 'Acción desconocida'; END IF;
 UPDATE public.restaurante_pedidos SET version=version+1 WHERE id=p.id;
 END IF;
 INSERT INTO public.restaurante_eventos(comercio_id,pedido_id,accion,datos,usuario_id) VALUES(p_comercio_id,p.id,p_accion,
 CASE WHEN p_accion IN ('cancelar','cancelar_item','incidencia','anular_cobro') THEN jsonb_build_object('motivo',p_datos->>'motivo','item_id',p_datos->>'item_id') ELSE '{}'::jsonb END,auth.uid());
 INSERT INTO public.restaurante_intentos VALUES(p_comercio_id,p_clave,auth.uid(),p_accion,p_datos,resultado);
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.restaurante_total(uuid),public.restaurante_cobrado(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.restaurante_operar(uuid,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restaurante_operar(uuid,text,jsonb,uuid) TO authenticated;
COMMIT;
