BEGIN;
-- Reorganiza el circuito sin modificar datos historicos ni permisos.
-- Impresion, receptor, firma y observaciones de visita son opcionales.
CREATE OR REPLACE FUNCTION public.distribucion_remitos_operar(p_comercio_id uuid,p_accion text,p_datos jsonb,p_clave uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.distribucion_repartos; m public.distribucion_remitos; mi public.distribucion_remito_items;
 pp public.distribucion_paradas; p public.distribucion_pedidos; intento public.distribucion_intentos; resultado uuid;
 el jsonb; det jsonb; pagos jsonb; v public.ventas; prod record; qty_remito integer;
 total numeric; cobrado numeric; esperado numeric; efectivo numeric; pv integer; motivo text; cfg public.distribucion_remitos_autorizacion;
BEGIN
 IF public.distribucion_habilitado(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Distribución no habilitada o sin acceso' USING ERRCODE='42501'; END IF;
 IF p_clave IS NULL OR jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitud inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('distribucion:'||p_comercio_id::text,0));
 SELECT * INTO intento FROM public.distribucion_intentos WHERE comercio_id=p_comercio_id AND clave=p_clave;
 IF FOUND THEN
 IF intento.usuario_id<>auth.uid() OR intento.accion<>p_accion OR intento.datos<>p_datos THEN RAISE EXCEPTION 'Intento reutilizado con otros datos'; END IF;
 RETURN intento.resultado; END IF;
 SELECT * INTO r FROM public.distribucion_repartos WHERE id=(p_datos->>'reparto_id')::uuid AND comercio_id=p_comercio_id FOR UPDATE;
 IF NOT FOUND OR NOT r.circuito_remitos THEN RAISE EXCEPTION 'Reparto sin circuito de remitos'; END IF;
 IF public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN
 IF r.repartidor_id<>auth.uid() OR p_accion NOT IN ('confirmar_remito','foto_remito') THEN RAISE EXCEPTION 'Acción reservada a administración o repartidor asignado' USING ERRCODE='42501'; END IF; END IF;
 resultado:=r.id;
 IF p_accion='emitir_remitos' THEN
 IF r.estado<>'planificado' OR NOT EXISTS(SELECT 1 FROM public.distribucion_paradas WHERE reparto_id=r.id) THEN RAISE EXCEPTION 'Prepará el reparto antes de emitir remitos'; END IF;
 IF coalesce((p_datos->>'usar_cai')::boolean,false) THEN
 SELECT * INTO cfg FROM public.distribucion_remitos_autorizacion WHERE comercio_id=p_comercio_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Configurá el CAI y rango autorizado o emití una constancia no fiscal'; END IF;
 IF cfg.vencimiento<current_date OR cfg.vencimiento<r.fecha THEN RAISE EXCEPTION 'La autorización de remitos está vencida'; END IF;
 END IF;
 FOR pp IN SELECT * FROM public.distribucion_paradas WHERE reparto_id=r.id ORDER BY orden,id LOOP
 IF EXISTS(SELECT 1 FROM public.distribucion_remitos WHERE parada_id=pp.id) THEN CONTINUE; END IF;
 SELECT * INTO p FROM public.distribucion_pedidos WHERE id=pp.pedido_id;
 INSERT INTO public.distribucion_remitos(comercio_id,reparto_id,parada_id,cliente_id,cliente_nombre,cliente_cuit,direccion,telefono,fecha)
 VALUES(p_comercio_id,r.id,pp.id,p.cliente_id,p.cliente_nombre,(SELECT cuit FROM public.clientes WHERE id=p.cliente_id),p.direccion,p.telefono,r.fecha) RETURNING * INTO m;
 IF cfg.comercio_id IS NOT NULL THEN
 IF cfg.ultimo>=cfg.hasta THEN RAISE EXCEPTION 'Rango autorizado de remitos agotado'; END IF;
 cfg.ultimo:=cfg.ultimo+1;
 UPDATE public.distribucion_remitos_autorizacion SET ultimo=cfg.ultimo WHERE comercio_id=p_comercio_id;
 UPDATE public.distribucion_remitos SET punto_venta=cfg.punto_venta,numero_autorizado=cfg.ultimo,cai=cfg.cai,cai_vencimiento=cfg.vencimiento WHERE id=m.id;
 END IF;
 INSERT INTO public.distribucion_remito_items(comercio_id,remito_id,carga_id,producto_id,descripcion,codigo,cantidad,precio,iva)
 SELECT p_comercio_id,m.id,c.id,i.producto_id,i.descripcion,coalesce(pr.cod_producto,''),c.cargada,i.precio,i.iva FROM public.distribucion_cargas c JOIN public.distribucion_pedido_items i ON i.id=c.item_id JOIN public.productos pr ON pr.id=i.producto_id WHERE c.parada_id=pp.id;
 INSERT INTO public.distribucion_eventos(comercio_id,reparto_id,parada_id,tipo,datos,usuario_id) VALUES(p_comercio_id,r.id,pp.id,p_accion,jsonb_build_object('remito_id',m.id,'numero',m.numero),auth.uid());
 END LOOP;
 ELSIF p_accion='confirmar_papeles' THEN
 IF r.estado<>'planificado' OR NOT EXISTS(SELECT 1 FROM public.distribucion_remitos WHERE reparto_id=r.id) THEN RAISE EXCEPTION 'Generá los remitos antes de confirmar los ejemplares impresos'; END IF;
 UPDATE public.distribucion_repartos SET papeles_preparados=true WHERE id=r.id;
 INSERT INTO public.distribucion_eventos(comercio_id,reparto_id,tipo,datos,usuario_id) VALUES(p_comercio_id,r.id,p_accion,p_datos,auth.uid());
 ELSIF p_accion='rendir_remitos' THEN
 IF r.estado<>'pendiente_rendicion' THEN RAISE EXCEPTION 'Finalizá el reparto antes de rendir'; END IF;
 IF EXISTS(SELECT 1 FROM public.distribucion_remitos WHERE reparto_id=r.id AND estado='emitido') THEN RAISE EXCEPTION 'Hay entregas sin confirmar'; END IF;
 efectivo:=(p_datos->>'efectivo')::numeric; motivo:=coalesce(p_datos->>'observaciones','');
 IF efectivo IS NULL OR efectivo<0 OR efectivo::text IN ('NaN','Infinity','-Infinity') OR efectivo<>round(efectivo,2) THEN RAISE EXCEPTION 'Efectivo inválido'; END IF;
 SELECT coalesce(sum((e.datos->>'monto')::numeric),0) INTO esperado FROM public.distribucion_eventos e WHERE e.reparto_id=r.id AND e.tipo='cobro' AND e.datos->>'medio'='contado' AND NOT EXISTS(SELECT 1 FROM public.distribucion_eventos a WHERE a.tipo='anular_cobro' AND a.datos->>'evento_id'=e.id::text);
 IF efectivo<>esperado AND length(btrim(motivo))=0 THEN RAISE EXCEPTION 'Explicá la diferencia de efectivo'; END IF;
 -- La mercadería nunca entregada o devuelta libera su reserva al volver al depósito.
 UPDATE public.distribucion_repartos SET estado='rendido',efectivo_rendido=efectivo,diferencia=efectivo-esperado,observaciones=motivo WHERE id=r.id;
 INSERT INTO public.distribucion_eventos(comercio_id,reparto_id,tipo,datos,usuario_id) VALUES(p_comercio_id,r.id,p_accion,p_datos,auth.uid());
 ELSE
 SELECT * INTO m FROM public.distribucion_remitos WHERE id=(p_datos->>'remito_id')::uuid AND reparto_id=r.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Remito no disponible'; END IF;
 resultado:=m.id;
 IF p_accion='confirmar_remito' THEN
 IF r.estado<>'en_reparto' OR m.estado<>'emitido' THEN RAISE EXCEPTION 'Entrega ya confirmada o reparto cerrado'; END IF;
 IF jsonb_typeof(p_datos->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_datos->'items')<>(SELECT count(*) FROM public.distribucion_remito_items WHERE remito_id=m.id) OR (SELECT count(DISTINCT value->>'item_id') FROM jsonb_array_elements(p_datos->'items'))<>jsonb_array_length(p_datos->'items') THEN RAISE EXCEPTION 'Confirmá todos los productos sin repetirlos'; END IF;
 motivo:=coalesce(p_datos->>'motivo',''); total:=0;
 FOR el IN SELECT value FROM jsonb_array_elements(p_datos->'items') LOOP
 SELECT * INTO mi FROM public.distribucion_remito_items WHERE id=(el->>'item_id')::uuid AND remito_id=m.id;
 IF NOT FOUND OR (el->>'recibida') IS NULL OR (el->>'recibida')::numeric<>trunc((el->>'recibida')::numeric) THEN RAISE EXCEPTION 'Cantidad o producto inválido'; END IF;
 qty_remito:=(el->>'recibida')::integer;
 IF qty_remito<0 OR qty_remito>mi.cantidad THEN RAISE EXCEPTION 'Cantidad fuera de lo cargado'; END IF;
 total:=total+qty_remito;
 END LOOP;
 FOR prod IN SELECT pr.id FROM public.productos pr WHERE pr.id IN(SELECT producto_id FROM public.distribucion_remito_items WHERE remito_id=m.id) ORDER BY pr.id FOR UPDATE LOOP NULL; END LOOP;
 FOR el IN SELECT value FROM jsonb_array_elements(p_datos->'items') LOOP
 UPDATE public.distribucion_remito_items SET recibida=(el->>'recibida')::integer WHERE id=(el->>'item_id')::uuid AND remito_id=m.id RETURNING * INTO mi;
 UPDATE public.distribucion_cargas SET entregada=mi.recibida WHERE id=mi.carga_id;
 END LOOP;
 -- Actualizar cantidades primero reduce la reserva en la misma transacción.
 FOR prod IN SELECT producto_id,sum(recibida)::integer qty FROM public.distribucion_remito_items WHERE remito_id=m.id GROUP BY producto_id LOOP
 UPDATE public.productos SET stock=stock-prod.qty WHERE id=prod.producto_id; END LOOP;
 UPDATE public.distribucion_remitos SET estado='confirmado',recibido_por=coalesce(p_datos->>'recibido_por',''),firma_papel=coalesce((p_datos->>'firma_papel')::boolean,false),motivo=coalesce(p_datos->>'motivo',''),confirmado_at=now(),confirmado_por=auth.uid() WHERE id=m.id;

 -- Cobro y entrega se confirman juntos; un error revierte cantidades, stock y eventos.
 -- La ausencia de cobro conserva compatibilidad con clientes anteriores.
 IF p_datos ? 'cobro' THEN
 IF jsonb_typeof(p_datos->'cobro') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Cobro invalido'; END IF;
 cobrado:=(p_datos->'cobro'->>'monto')::numeric;
 IF cobrado IS NULL OR cobrado<0 OR cobrado::text IN ('NaN','Infinity','-Infinity') OR cobrado<>round(cobrado,2) THEN RAISE EXCEPTION 'Cobro invalido'; END IF;
 IF cobrado>0 THEN
 PERFORM public.distribucion_operar_anterior(p_comercio_id,'cobro',jsonb_build_object('reparto_id',r.id,'parada_id',m.parada_id,'monto',cobrado,'medio',p_datos->'cobro'->>'medio'),gen_random_uuid());
 END IF;
 END IF;
 ELSIF p_accion='foto_remito' THEN
 IF m.estado<>'confirmado' OR m.foto_path IS NOT NULL THEN RAISE EXCEPTION 'Confirmá la entrega; la foto adjunta se conserva'; END IF;
 IF p_datos->>'path' NOT LIKE p_comercio_id::text||'/'||m.id::text||'/%' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='distribucion-remitos' AND name=p_datos->>'path') THEN RAISE EXCEPTION 'Foto no disponible para este remito'; END IF;
 UPDATE public.distribucion_remitos SET foto_path=p_datos->>'path' WHERE id=m.id;
 ELSIF p_accion='facturar_remito' THEN
 IF m.estado<>'confirmado' OR m.venta_id IS NOT NULL OR r.estado<>'rendido' THEN RAISE EXCEPTION 'Rendí el reparto; el remito debe estar confirmado y sin facturar'; END IF;
 IF coalesce(p_datos->>'tipo_comprobante','') NOT IN ('factura_a','factura_b','factura_c','recibo_x') THEN RAISE EXCEPTION 'Tipo de comprobante inválido'; END IF;
 SELECT punto_venta INTO pv FROM public.afip_config WHERE comercio_id=p_comercio_id AND activo ORDER BY punto_venta LIMIT 1;
 SELECT jsonb_agg(jsonb_build_object('descripcion_manual',descripcion,'codigo_manual',codigo,'cantidad',recibida-devuelta,'precio_unitario',precio,'porcentaje_iva',iva,'afecta_stock',false) ORDER BY id),sum(round((recibida-devuelta)*precio,2)) INTO det,total FROM public.distribucion_remito_items WHERE remito_id=m.id AND recibida>devuelta;
 IF det IS NULL THEN RAISE EXCEPTION 'Remito sin mercadería recibida para facturar'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',e.datos->>'medio','monto',(e.datos->>'monto')::numeric,'observaciones','Remito '||m.numero) ORDER BY e.created_at,e.id),'[]'::jsonb),coalesce(sum((e.datos->>'monto')::numeric),0) INTO pagos,cobrado FROM public.distribucion_eventos e WHERE e.parada_id=m.parada_id AND e.tipo='cobro' AND NOT EXISTS(SELECT 1 FROM public.distribucion_eventos a WHERE a.tipo='anular_cobro' AND a.datos->>'evento_id'=e.id::text);
 IF cobrado>total THEN RAISE EXCEPTION 'Revisá cobros y devoluciones antes de facturar'; END IF;
 SELECT * INTO v FROM public.registrar_venta_transaccional(p_comercio_id,(p_datos->>'tipo_comprobante')::public.tipo_comprobante,coalesce(pv,1),m.cliente_id,m.cliente_nombre,'ARS','cta_cte',det,'[]'::jsonb,m.id,now(),'Remito de entrega '||m.numero||' · Reparto '||r.nombre);
 IF cobrado>0 THEN PERFORM public.registrar_pagos_cliente_multi_documento(m.cliente_id,ARRAY[v.id],current_date,'Remito '||m.numero,pagos); END IF;
 UPDATE public.distribucion_remitos SET venta_id=v.id WHERE id=m.id;
 resultado:=v.id;
 ELSIF p_accion='devolver_remito' THEN
 IF m.estado<>'confirmado' OR m.venta_id IS NOT NULL THEN RAISE EXCEPTION 'La devolución de un remito facturado requiere el circuito de nota de crédito'; END IF;
 SELECT * INTO mi FROM public.distribucion_remito_items WHERE id=(p_datos->>'item_id')::uuid AND remito_id=m.id FOR UPDATE;
 IF NOT FOUND OR (p_datos->>'cantidad')::numeric<>trunc((p_datos->>'cantidad')::numeric) THEN RAISE EXCEPTION 'Producto o cantidad inválida'; END IF;
 qty_remito:=(p_datos->>'cantidad')::integer;
 IF qty_remito IS NULL OR qty_remito<=0 OR qty_remito>mi.recibida-mi.devuelta OR length(btrim(coalesce(p_datos->>'motivo','')))=0 THEN RAISE EXCEPTION 'Cantidad y motivo requeridos'; END IF;
 SELECT coalesce(sum(round((recibida-devuelta)*precio,2)),0)-(round((mi.recibida-mi.devuelta)*mi.precio,2)-round((mi.recibida-mi.devuelta-qty_remito)*mi.precio,2)) INTO total FROM public.distribucion_remito_items WHERE remito_id=m.id;
 SELECT coalesce(sum((e.datos->>'monto')::numeric),0) INTO cobrado FROM public.distribucion_eventos e WHERE e.parada_id=m.parada_id AND e.tipo='cobro' AND NOT EXISTS(SELECT 1 FROM public.distribucion_eventos a WHERE a.tipo='anular_cobro' AND a.datos->>'evento_id'=e.id::text);
 IF cobrado>total THEN RAISE EXCEPTION 'Corregí el cobro antes de devolver'; END IF;
 UPDATE public.distribucion_remito_items SET devuelta=devuelta+qty_remito WHERE id=mi.id;
 UPDATE public.productos SET stock=stock+qty_remito WHERE id=mi.producto_id;
 UPDATE public.distribucion_cargas SET devuelta=devuelta+qty_remito WHERE id=mi.carga_id;
 ELSE RAISE EXCEPTION 'Acción desconocida'; END IF;
 INSERT INTO public.distribucion_eventos(comercio_id,reparto_id,parada_id,tipo,datos,usuario_id) VALUES(p_comercio_id,r.id,m.parada_id,p_accion,p_datos,auth.uid());
 END IF;
 INSERT INTO public.distribucion_intentos VALUES(p_comercio_id,p_clave,auth.uid(),p_accion,p_datos,resultado);
 RETURN resultado;
END $$;

CREATE OR REPLACE FUNCTION public.distribucion_operar(p_comercio_id uuid,p_accion text,p_datos jsonb,p_clave uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.distribucion_repartos; resultado uuid;
BEGIN
 IF public.distribucion_habilitado(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Distribución no habilitada o sin acceso' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('distribucion:'||p_comercio_id::text,0));
 IF p_accion='reparto' THEN
 IF EXISTS(SELECT 1 FROM public.distribucion_intentos WHERE comercio_id=p_comercio_id AND clave=p_clave) THEN RETURN public.distribucion_operar_anterior(p_comercio_id,p_accion,p_datos,p_clave); END IF;
 resultado:=public.distribucion_operar_anterior(p_comercio_id,p_accion,p_datos,p_clave);
 UPDATE public.distribucion_repartos SET circuito_remitos=true WHERE id=resultado;
 RETURN resultado; END IF;
 IF p_accion='asignar' AND NOT EXISTS(SELECT 1 FROM public.distribucion_intentos WHERE comercio_id=p_comercio_id AND clave=p_clave) AND EXISTS(SELECT 1 FROM public.distribucion_paradas pp JOIN public.distribucion_repartos rr ON rr.id=pp.reparto_id WHERE pp.pedido_id=(p_datos->>'pedido_id')::uuid AND rr.estado IN ('planificado','en_reparto','pendiente_rendicion')) THEN RAISE EXCEPTION 'El pedido ya está asignado a un reparto activo'; END IF;
 SELECT * INTO r FROM public.distribucion_repartos WHERE id=(p_datos->>'reparto_id')::uuid AND comercio_id=p_comercio_id;
 IF p_accion='despachar' AND NOT EXISTS(SELECT 1 FROM public.distribucion_intentos WHERE comercio_id=p_comercio_id AND clave=p_clave) AND EXISTS(SELECT 1 FROM public.distribucion_paradas pp JOIN public.distribucion_pedidos p ON p.id=pp.pedido_id WHERE pp.reparto_id=r.id AND p.estado<>'listo') THEN RAISE EXCEPTION 'Todos los pedidos deben estar preparados para iniciar el reparto'; END IF;
 IF FOUND AND r.circuito_remitos THEN
 IF p_accion IN ('emitir_remitos','confirmar_papeles','confirmar_remito','foto_remito','facturar_remito','devolver_remito') THEN RETURN public.distribucion_remitos_operar(p_comercio_id,p_accion,p_datos,p_clave); END IF;
 IF p_accion='rendir' THEN RETURN public.distribucion_remitos_operar(p_comercio_id,'rendir_remitos',p_datos,p_clave); END IF;
 -- Antes de restricciones de estado, permitir el reintento exacto de una operación ya guardada.
 IF EXISTS(SELECT 1 FROM public.distribucion_intentos WHERE comercio_id=p_comercio_id AND clave=p_clave) THEN RETURN public.distribucion_operar_anterior(p_comercio_id,p_accion,p_datos,p_clave); END IF;
 IF p_accion IN ('entrega','devolucion','devolucion_rendida') THEN RAISE EXCEPTION 'Registrá la entrega o devolución desde el remito'; END IF;
 IF p_accion='despachar' AND EXISTS(SELECT 1 FROM public.distribucion_paradas pp WHERE pp.reparto_id=r.id AND NOT EXISTS(SELECT 1 FROM public.distribucion_remitos m WHERE m.parada_id=pp.id AND m.estado='emitido')) THEN RAISE EXCEPTION 'Generá e imprimí los remitos antes de salir'; END IF;
 IF p_accion IN ('asignar','quitar') AND EXISTS(SELECT 1 FROM public.distribucion_remitos WHERE reparto_id=r.id) THEN RAISE EXCEPTION 'Los remitos emitidos conservan la carga; cancelá y armá otro reparto para cambiarla'; END IF;
 IF p_accion='finalizar' AND EXISTS(SELECT 1 FROM public.distribucion_remitos WHERE reparto_id=r.id AND estado='emitido') THEN RAISE EXCEPTION 'Confirmá todos los remitos, incluso los rechazados'; END IF;
 IF p_accion='cobro' AND NOT EXISTS(SELECT 1 FROM public.distribucion_remitos WHERE parada_id=(p_datos->>'parada_id')::uuid AND reparto_id=r.id AND estado='confirmado') THEN RAISE EXCEPTION 'Confirmá la entrega antes de cobrar'; END IF;
 END IF;
 resultado:=public.distribucion_operar_anterior(p_comercio_id,p_accion,p_datos,p_clave);
 IF r.circuito_remitos AND p_accion='cancelar_reparto' THEN UPDATE public.distribucion_remitos SET estado='anulado' WHERE reparto_id=r.id; END IF;
 RETURN resultado;
END $$;
CREATE OR REPLACE FUNCTION public.distribucion_resumen(p_comercio_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE admin boolean; resultado jsonb;
BEGIN
 IF public.distribucion_habilitado(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Distribución no habilitada o sin acceso' USING ERRCODE='42501'; END IF;
 admin:=public.user_is_comercio_admin(p_comercio_id);
 WITH rutas AS (SELECT * FROM public.distribucion_repartos WHERE comercio_id=p_comercio_id AND (admin OR repartidor_id=auth.uid())),
 paradas AS (SELECT p.* FROM public.distribucion_paradas p JOIN rutas r ON r.id=p.reparto_id),
 pedidos AS (SELECT p.* FROM public.distribucion_pedidos p WHERE comercio_id=p_comercio_id AND (admin OR creado_por=auth.uid() OR id IN (SELECT pedido_id FROM paradas)))
 SELECT jsonb_build_object('circuito_pasos',true,'admin',admin,
 'pedidos',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('estado_operativo',public.distribucion_estado_pedido(p.id)) ORDER BY numero DESC) FROM pedidos p),'[]'::jsonb),
 'items',coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM public.distribucion_pedido_items i JOIN pedidos p ON p.id=i.pedido_id),'[]'::jsonb),
 'repartos',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY fecha DESC,created_at DESC) FROM rutas r),'[]'::jsonb),
 'paradas',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY orden) FROM paradas p),'[]'::jsonb),
 'cargas',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.distribucion_cargas c JOIN paradas p ON p.id=c.parada_id),'[]'::jsonb),
 'eventos',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY created_at DESC) FROM public.distribucion_eventos e WHERE e.reparto_id IN (SELECT id FROM rutas)),'[]'::jsonb),
 'usuarios',CASE WHEN admin THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',cu.user_id,'nombre',coalesce(u.email,cu.user_id::text))) FROM public.comercio_usuarios cu JOIN auth.users u ON u.id=cu.user_id WHERE cu.comercio_id=p_comercio_id AND cu.activo),'[]'::jsonb) ELSE '[]'::jsonb END,
 'remitos_autorizacion',CASE WHEN admin THEN (SELECT to_jsonb(a) FROM public.distribucion_remitos_autorizacion a WHERE a.comercio_id=p_comercio_id) ELSE NULL END,
 'remitos',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY numero) FROM public.distribucion_remitos m WHERE m.reparto_id IN(SELECT id FROM rutas)),'[]'::jsonb),
 'remito_items',coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM public.distribucion_remito_items i JOIN public.distribucion_remitos m ON m.id=i.remito_id WHERE m.reparto_id IN(SELECT id FROM rutas)),'[]'::jsonb),
 'saldos',coalesce((SELECT jsonb_agg(jsonb_build_object('venta_id',s.venta_id,'saldo',s.saldo)) FROM (SELECT cc.venta_id,sum(CASE WHEN cc.tipo_movimiento='debito' THEN cc.monto ELSE -cc.monto END) saldo FROM public.cuenta_corriente cc WHERE cc.venta_id IN(SELECT venta_id FROM paradas UNION SELECT venta_id FROM public.distribucion_remitos WHERE reparto_id IN(SELECT id FROM rutas)) GROUP BY cc.venta_id) s),'[]'::jsonb)
 ) INTO resultado;
 RETURN resultado;
END $$;
COMMIT;
