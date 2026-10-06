-- Evolución compatible: los repartos existentes mantienen su circuito anterior.
BEGIN;
ALTER TABLE public.distribucion_repartos ADD COLUMN circuito_remitos boolean NOT NULL DEFAULT false;
ALTER TABLE public.distribucion_repartos ADD COLUMN papeles_preparados boolean NOT NULL DEFAULT false;
CREATE TABLE public.distribucion_remitos_autorizacion (
 comercio_id uuid PRIMARY KEY REFERENCES public.comercio(id), punto_venta integer NOT NULL CHECK(punto_venta BETWEEN 1 AND 9999),
 cai text NOT NULL CHECK(cai ~ '^[0-9]{14}$'), vencimiento date NOT NULL,
 desde integer NOT NULL CHECK(desde>0), hasta integer NOT NULL CHECK(hasta BETWEEN desde AND 99999999),
 ultimo integer NOT NULL CHECK(ultimo BETWEEN desde-1 AND hasta)
);
ALTER TABLE public.distribucion_remitos_autorizacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.distribucion_remitos_autorizacion FROM anon,authenticated;
CREATE POLICY distribucion_autorizacion_lectura ON public.distribucion_remitos_autorizacion FOR SELECT TO authenticated USING(public.distribucion_habilitado(comercio_id) AND public.user_is_comercio_admin(comercio_id));
CREATE TABLE public.distribucion_remitos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 numero bigint GENERATED ALWAYS AS IDENTITY, reparto_id uuid NOT NULL, parada_id uuid NOT NULL UNIQUE,
 cliente_id uuid NOT NULL REFERENCES public.clientes(id), cliente_nombre text NOT NULL, cliente_cuit text, direccion text NOT NULL, telefono text NOT NULL,
 fecha date NOT NULL, estado text NOT NULL DEFAULT 'emitido' CHECK(estado IN ('emitido','confirmado','anulado')),
 punto_venta integer, numero_autorizado integer, cai text, cai_vencimiento date,
 CHECK((punto_venta IS NULL AND numero_autorizado IS NULL AND cai IS NULL AND cai_vencimiento IS NULL) OR (punto_venta IS NOT NULL AND numero_autorizado IS NOT NULL AND cai IS NOT NULL AND cai_vencimiento IS NOT NULL)),
 recibido_por text, firma_papel boolean NOT NULL DEFAULT false, motivo text NOT NULL DEFAULT '',
 confirmado_at timestamptz, confirmado_por uuid REFERENCES auth.users(id), foto_path text,
 venta_id uuid REFERENCES public.ventas(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,comercio_id), FOREIGN KEY(reparto_id,comercio_id) REFERENCES public.distribucion_repartos(id,comercio_id),
 FOREIGN KEY(parada_id,comercio_id) REFERENCES public.distribucion_paradas(id,comercio_id)
);
CREATE TABLE public.distribucion_remito_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL, remito_id uuid NOT NULL,
 carga_id uuid NOT NULL UNIQUE REFERENCES public.distribucion_cargas(id), producto_id uuid NOT NULL REFERENCES public.productos(id),
 descripcion text NOT NULL, codigo text NOT NULL DEFAULT '', cantidad integer NOT NULL CHECK(cantidad>0),
 recibida integer NOT NULL DEFAULT 0, devuelta integer NOT NULL DEFAULT 0,
 precio numeric(16,4) NOT NULL CHECK(precio>0), iva numeric(7,4) NOT NULL CHECK(iva BETWEEN 0 AND 100),
 CHECK(recibida BETWEEN 0 AND cantidad AND devuelta BETWEEN 0 AND recibida),
 FOREIGN KEY(remito_id,comercio_id) REFERENCES public.distribucion_remitos(id,comercio_id)
);
CREATE INDEX distribucion_remitos_ruta ON public.distribucion_remitos(comercio_id,reparto_id,estado);
CREATE INDEX distribucion_remitos_facturacion ON public.distribucion_remitos(comercio_id,estado,venta_id);
CREATE INDEX distribucion_remitos_cliente ON public.distribucion_remitos(comercio_id,cliente_id);
CREATE INDEX distribucion_remitos_venta ON public.distribucion_remitos(venta_id);
CREATE UNIQUE INDEX distribucion_remitos_numero_autorizado ON public.distribucion_remitos(comercio_id,punto_venta,numero_autorizado) WHERE numero_autorizado IS NOT NULL;
CREATE INDEX distribucion_remito_items_producto ON public.distribucion_remito_items(comercio_id,producto_id);

CREATE FUNCTION public.distribucion_remito_relaciones() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.comercio_id IS DISTINCT FROM OLD.comercio_id THEN RAISE EXCEPTION 'Comercio inmutable'; END IF;
 IF TG_TABLE_NAME='distribucion_remitos' THEN
 IF NOT EXISTS(SELECT 1 FROM public.distribucion_paradas pp JOIN public.distribucion_pedidos p ON p.id=pp.pedido_id WHERE pp.id=NEW.parada_id AND pp.reparto_id=NEW.reparto_id AND p.cliente_id=NEW.cliente_id AND p.comercio_id=NEW.comercio_id) THEN RAISE EXCEPTION 'Remito incompatible con pedido'; END IF;
 IF NEW.venta_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ventas v WHERE v.id=NEW.venta_id AND v.comercio_id=NEW.comercio_id AND v.cliente_id=NEW.cliente_id) THEN RAISE EXCEPTION 'Factura incompatible'; END IF;
 ELSE
 IF NOT EXISTS(SELECT 1 FROM public.distribucion_cargas c JOIN public.distribucion_paradas pp ON pp.id=c.parada_id JOIN public.distribucion_remitos m ON m.parada_id=pp.id JOIN public.distribucion_pedido_items i ON i.id=c.item_id WHERE c.id=NEW.carga_id AND m.id=NEW.remito_id AND i.producto_id=NEW.producto_id AND c.comercio_id=NEW.comercio_id) THEN RAISE EXCEPTION 'Producto de otro remito'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER distribucion_remito_relaciones BEFORE INSERT OR UPDATE ON public.distribucion_remitos FOR EACH ROW EXECUTE FUNCTION public.distribucion_remito_relaciones();
CREATE TRIGGER distribucion_remito_item_relaciones BEFORE INSERT OR UPDATE ON public.distribucion_remito_items FOR EACH ROW EXECUTE FUNCTION public.distribucion_remito_relaciones();
ALTER TABLE public.distribucion_remitos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribucion_remito_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.distribucion_remitos,public.distribucion_remito_items FROM anon,authenticated;
CREATE POLICY distribucion_remitos_lectura ON public.distribucion_remitos FOR SELECT TO authenticated USING(public.distribucion_habilitado(comercio_id) AND (public.user_is_comercio_admin(comercio_id) OR EXISTS(SELECT 1 FROM public.distribucion_repartos r WHERE r.id=reparto_id AND r.repartidor_id=auth.uid())));
CREATE POLICY distribucion_remito_items_lectura ON public.distribucion_remito_items FOR SELECT TO authenticated USING(public.distribucion_habilitado(comercio_id) AND public.user_is_comercio_admin(comercio_id));

CREATE OR REPLACE FUNCTION public.distribucion_stock_reservado(p_producto uuid) RETURNS bigint
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(sum(CASE WHEN r.circuito_remitos THEN c.cargada-c.entregada+c.devuelta ELSE c.cargada END),0)
 FROM public.distribucion_cargas c JOIN public.distribucion_pedido_items i ON i.id=c.item_id
 JOIN public.distribucion_paradas pp ON pp.id=c.parada_id JOIN public.distribucion_repartos r ON r.id=pp.reparto_id
 WHERE i.producto_id=p_producto AND r.estado IN ('en_reparto','pendiente_rendicion');
$$;

CREATE FUNCTION public.distribucion_remito_acceso(p_comercio uuid,p_remito uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.distribucion_habilitado(p_comercio) AND EXISTS(SELECT 1 FROM public.distribucion_remitos m JOIN public.distribucion_repartos r ON r.id=m.reparto_id WHERE m.id=p_remito AND m.comercio_id=p_comercio AND (public.user_is_comercio_admin(p_comercio) OR r.repartidor_id=auth.uid()));
$$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('distribucion-remitos','distribucion-remitos',false,10485760,ARRAY['image/jpeg','image/png','image/webp']);
CREATE POLICY distribucion_remito_fotos_select ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='distribucion-remitos' AND public.distribucion_remito_acceso(((storage.foldername(name))[1])::uuid,((storage.foldername(name))[2])::uuid));
CREATE POLICY distribucion_remito_fotos_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='distribucion-remitos' AND public.distribucion_remito_acceso(((storage.foldername(name))[1])::uuid,((storage.foldername(name))[2])::uuid));

CREATE FUNCTION public.distribucion_remitos_operar(p_comercio_id uuid,p_accion text,p_datos jsonb,p_clave uuid) RETURNS uuid
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
 IF qty_remito<mi.cantidad AND length(btrim(motivo))=0 THEN RAISE EXCEPTION 'Indicá el motivo de faltantes o rechazo'; END IF;
 total:=total+qty_remito;
 END LOOP;
 IF total>0 AND (length(btrim(coalesce(p_datos->>'recibido_por','')))=0 OR coalesce((p_datos->>'firma_papel')::boolean,false) IS DISTINCT FROM true) THEN RAISE EXCEPTION 'Registrá quién recibió y la firma en ambos ejemplares'; END IF;
 FOR prod IN SELECT pr.id FROM public.productos pr WHERE pr.id IN(SELECT producto_id FROM public.distribucion_remito_items WHERE remito_id=m.id) ORDER BY pr.id FOR UPDATE LOOP NULL; END LOOP;
 FOR el IN SELECT value FROM jsonb_array_elements(p_datos->'items') LOOP
 UPDATE public.distribucion_remito_items SET recibida=(el->>'recibida')::integer WHERE id=(el->>'item_id')::uuid AND remito_id=m.id RETURNING * INTO mi;
 UPDATE public.distribucion_cargas SET entregada=mi.recibida WHERE id=mi.carga_id;
 END LOOP;
 -- Actualizar cantidades primero reduce la reserva en la misma transacción.
 FOR prod IN SELECT producto_id,sum(recibida)::integer qty FROM public.distribucion_remito_items WHERE remito_id=m.id GROUP BY producto_id LOOP
 UPDATE public.productos SET stock=stock-prod.qty WHERE id=prod.producto_id; END LOOP;
 UPDATE public.distribucion_remitos SET estado='confirmado',recibido_por=coalesce(p_datos->>'recibido_por',''),firma_papel=coalesce((p_datos->>'firma_papel')::boolean,false),motivo=coalesce(p_datos->>'motivo',''),confirmado_at=now(),confirmado_por=auth.uid() WHERE id=m.id;
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

-- La función anterior se copia a un auxiliar privado a continuación; no se renombra ni elimina.
CREATE FUNCTION public.distribucion_operar_anterior(p_comercio_id uuid,p_accion text,p_datos jsonb,p_clave uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 admin boolean; resultado uuid; intento public.distribucion_intentos; r public.distribucion_repartos;
 p public.distribucion_pedidos; parada public.distribucion_paradas; carga public.distribucion_cargas;
 prod public.productos; cliente public.clientes; elemento jsonb; detalle jsonb; pagos jsonb;
 item public.distribucion_pedido_items; venta public.ventas; qty integer; disponible bigint;
 efectivo numeric; monto numeric; total numeric; pv integer; motivo text;
BEGIN
 IF public.distribucion_habilitado(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Distribución no habilitada o sin acceso' USING ERRCODE='42501'; END IF;
 IF p_clave IS NULL OR jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitud inválida'; END IF;
 -- Serializa comandos del tenant y permite reintentar después de cortes de conexión.
 PERFORM pg_advisory_xact_lock(hashtextextended('distribucion:'||p_comercio_id::text,0));
 SELECT * INTO intento FROM public.distribucion_intentos WHERE comercio_id=p_comercio_id AND clave=p_clave;
 IF FOUND THEN
 IF intento.usuario_id<>auth.uid() OR intento.accion<>p_accion OR intento.datos<>p_datos THEN RAISE EXCEPTION 'Intento reutilizado con otros datos'; END IF;
 RETURN intento.resultado;
 END IF;
 admin:=public.user_is_comercio_admin(p_comercio_id);
 IF p_accion NOT IN ('pedido','entrega','devolucion','cobro','anular_cobro','finalizar') AND admin IS DISTINCT FROM true THEN RAISE EXCEPTION 'Acción reservada a administración' USING ERRCODE='42501'; END IF;

 IF p_accion='pedido' THEN
 SELECT * INTO cliente FROM public.clientes WHERE id=(p_datos->>'cliente_id')::uuid AND comercio_id=p_comercio_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no disponible'; END IF;
 IF jsonb_typeof(p_datos->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_datos->'items')=0 THEN RAISE EXCEPTION 'Agregá productos al pedido'; END IF;
 INSERT INTO public.distribucion_pedidos(comercio_id,cliente_id,cliente_nombre,direccion,telefono,fecha,observaciones,creado_por)
 VALUES(p_comercio_id,cliente.id,concat_ws(' ',cliente.nombre,cliente.apellido),coalesce(p_datos->>'direccion',''),coalesce(p_datos->>'telefono',''),coalesce((p_datos->>'fecha')::date,current_date),coalesce(p_datos->>'observaciones',''),auth.uid()) RETURNING id INTO resultado;
 FOR elemento IN SELECT value FROM jsonb_array_elements(p_datos->'items') LOOP
 SELECT * INTO prod FROM public.productos WHERE id=(elemento->>'producto_id')::uuid AND comercio_id=p_comercio_id FOR SHARE;
 IF NOT FOUND OR prod.tipo_moneda<>'ARS' THEN RAISE EXCEPTION 'Producto no disponible en pesos'; END IF;
 IF (elemento->>'cantidad')::numeric<>trunc((elemento->>'cantidad')::numeric) THEN RAISE EXCEPTION 'La cantidad debe ser entera'; END IF;
 INSERT INTO public.distribucion_pedido_items(comercio_id,pedido_id,producto_id,descripcion,cantidad,precio,iva)
 VALUES(p_comercio_id,resultado,prod.id,prod.descripcion,(elemento->>'cantidad')::integer,prod.precio_venta,prod.porcentaje_iva);
 END LOOP;

 ELSIF p_accion='preparar' OR p_accion='listo' OR p_accion='cancelar_pedido' THEN
 SELECT * INTO p FROM public.distribucion_pedidos WHERE id=(p_datos->>'pedido_id')::uuid AND comercio_id=p_comercio_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no disponible'; END IF;
 IF (p_accion='preparar' AND p.estado<>'pendiente') OR (p_accion='listo' AND p.estado<>'preparacion') OR (p_accion='cancelar_pedido' AND (p.estado='cancelado' OR EXISTS(SELECT 1 FROM public.distribucion_paradas WHERE pedido_id=p.id))) THEN RAISE EXCEPTION 'Estado del pedido incompatible'; END IF;
 UPDATE public.distribucion_pedidos SET estado=CASE p_accion WHEN 'preparar' THEN 'preparacion' WHEN 'listo' THEN 'listo' ELSE 'cancelado' END WHERE id=p.id;
 resultado:=p.id;

 ELSIF p_accion='reparto' THEN
 INSERT INTO public.distribucion_repartos(comercio_id,nombre,fecha,repartidor_id,vehiculo)
 VALUES(p_comercio_id,p_datos->>'nombre',(p_datos->>'fecha')::date,(p_datos->>'repartidor_id')::uuid,coalesce(p_datos->>'vehiculo','')) RETURNING id INTO resultado;

 ELSE
 SELECT * INTO r FROM public.distribucion_repartos WHERE id=(p_datos->>'reparto_id')::uuid AND comercio_id=p_comercio_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reparto no disponible'; END IF;
 IF admin IS DISTINCT FROM true AND r.repartidor_id<>auth.uid() THEN RAISE EXCEPTION 'Reparto de otro usuario' USING ERRCODE='42501'; END IF;
 resultado:=r.id;

 IF p_accion='asignar' THEN
 IF r.estado<>'planificado' THEN RAISE EXCEPTION 'El reparto ya salió'; END IF;
 SELECT * INTO p FROM public.distribucion_pedidos WHERE id=(p_datos->>'pedido_id')::uuid AND comercio_id=p_comercio_id AND estado='listo' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no preparado'; END IF;
 INSERT INTO public.distribucion_paradas(comercio_id,reparto_id,pedido_id,orden)
 VALUES(p_comercio_id,r.id,p.id,1+(SELECT count(*) FROM public.distribucion_paradas WHERE reparto_id=r.id)) RETURNING * INTO parada;
 FOR item IN SELECT * FROM public.distribucion_pedido_items WHERE pedido_id=p.id ORDER BY id LOOP
 SELECT item.cantidad-coalesce(sum(CASE WHEN rr.estado IN ('planificado','en_reparto','pendiente_rendicion') THEN c.cargada WHEN rr.estado='rendido' THEN c.entregada-c.devuelta ELSE 0 END),0)
 INTO disponible FROM public.distribucion_cargas c JOIN public.distribucion_paradas pp ON pp.id=c.parada_id JOIN public.distribucion_repartos rr ON rr.id=pp.reparto_id WHERE c.item_id=item.id;
 IF disponible>0 THEN INSERT INTO public.distribucion_cargas(comercio_id,parada_id,item_id,cargada) VALUES(p_comercio_id,parada.id,item.id,disponible); END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.distribucion_cargas WHERE parada_id=parada.id) THEN RAISE EXCEPTION 'El pedido no tiene cantidades pendientes'; END IF;

 ELSIF p_accion='quitar' THEN
 IF r.estado<>'planificado' THEN RAISE EXCEPTION 'El reparto ya salió'; END IF;
 SELECT * INTO parada FROM public.distribucion_paradas WHERE id=(p_datos->>'parada_id')::uuid AND reparto_id=r.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Parada no disponible'; END IF;
 DELETE FROM public.distribucion_cargas WHERE parada_id=parada.id;
 DELETE FROM public.distribucion_paradas WHERE id=parada.id;

 ELSIF p_accion='despachar' THEN
 IF r.estado<>'planificado' OR NOT EXISTS(SELECT 1 FROM public.distribucion_paradas WHERE reparto_id=r.id) THEN RAISE EXCEPTION 'Reparto sin pedidos o ya despachado'; END IF;
 FOR prod IN SELECT pr.* FROM public.productos pr WHERE pr.id IN (SELECT i.producto_id FROM public.distribucion_cargas c JOIN public.distribucion_pedido_items i ON i.id=c.item_id JOIN public.distribucion_paradas pp ON pp.id=c.parada_id WHERE pp.reparto_id=r.id) ORDER BY pr.id FOR UPDATE LOOP
 SELECT sum(c.cargada) INTO disponible FROM public.distribucion_cargas c JOIN public.distribucion_pedido_items i ON i.id=c.item_id JOIN public.distribucion_paradas pp ON pp.id=c.parada_id WHERE pp.reparto_id=r.id AND i.producto_id=prod.id;
 IF prod.stock-public.distribucion_stock_reservado(prod.id)<disponible THEN RAISE EXCEPTION 'Stock insuficiente para %',prod.descripcion; END IF;
 END LOOP;
 UPDATE public.distribucion_repartos SET estado='en_reparto' WHERE id=r.id;

 ELSIF p_accion IN ('entrega','devolucion','cobro','anular_cobro') THEN
 IF r.estado<>'en_reparto' THEN RAISE EXCEPTION 'El reparto no está abierto'; END IF;
 SELECT * INTO parada FROM public.distribucion_paradas WHERE id=(p_datos->>'parada_id')::uuid AND reparto_id=r.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Parada no disponible'; END IF;
 IF p_accion='cobro' THEN
 monto:=(p_datos->>'monto')::numeric;
 IF monto IS NULL OR monto<=0 OR monto::text IN ('NaN','Infinity','-Infinity') OR monto<>round(monto,2) OR coalesce(p_datos->>'medio','') NOT IN ('contado','transferencia') THEN RAISE EXCEPTION 'Cobro inválido'; END IF;
 SELECT coalesce(sum(round((c.entregada-c.devuelta)*i.precio,2)),0) INTO total FROM public.distribucion_cargas c JOIN public.distribucion_pedido_items i ON i.id=c.item_id WHERE c.parada_id=parada.id;
 SELECT monto+coalesce(sum((e.datos->>'monto')::numeric),0) INTO efectivo FROM public.distribucion_eventos e WHERE e.parada_id=parada.id AND e.tipo='cobro' AND NOT EXISTS(SELECT 1 FROM public.distribucion_eventos a WHERE a.tipo='anular_cobro' AND a.datos->>'evento_id'=e.id::text);
 IF efectivo>total THEN RAISE EXCEPTION 'El cobro supera lo entregado'; END IF;
 ELSIF p_accion='anular_cobro' THEN
 IF length(btrim(coalesce(p_datos->>'motivo','')))=0 OR NOT EXISTS(SELECT 1 FROM public.distribucion_eventos e WHERE e.id=(p_datos->>'evento_id')::uuid AND e.parada_id=parada.id AND e.tipo='cobro' AND NOT EXISTS(SELECT 1 FROM public.distribucion_eventos a WHERE a.tipo='anular_cobro' AND a.datos->>'evento_id'=e.id::text)) THEN RAISE EXCEPTION 'Cobro no disponible o motivo vacío'; END IF;
 ELSE
 SELECT * INTO carga FROM public.distribucion_cargas WHERE parada_id=parada.id AND id=(p_datos->>'carga_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Producto no incluido en la carga'; END IF;
 IF (p_datos->>'cantidad')::numeric<>trunc((p_datos->>'cantidad')::numeric) THEN RAISE EXCEPTION 'La cantidad debe ser entera'; END IF;
 qty:=(p_datos->>'cantidad')::integer;
 IF qty IS NULL OR qty<=0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
 IF p_accion='entrega' THEN UPDATE public.distribucion_cargas SET entregada=entregada+qty WHERE id=carga.id;
 ELSE
 IF length(btrim(coalesce(p_datos->>'motivo','')))=0 THEN RAISE EXCEPTION 'Indicá el motivo de devolución'; END IF;
 UPDATE public.distribucion_cargas SET devuelta=devuelta+qty WHERE id=carga.id;
 SELECT coalesce(sum(round((c.entregada-c.devuelta)*i.precio,2)),0) INTO total FROM public.distribucion_cargas c JOIN public.distribucion_pedido_items i ON i.id=c.item_id WHERE c.parada_id=parada.id;
 SELECT coalesce(sum((e.datos->>'monto')::numeric),0) INTO efectivo FROM public.distribucion_eventos e WHERE e.parada_id=parada.id AND e.tipo='cobro' AND NOT EXISTS(SELECT 1 FROM public.distribucion_eventos a WHERE a.tipo='anular_cobro' AND a.datos->>'evento_id'=e.id::text);
 IF efectivo>total THEN RAISE EXCEPTION 'Corregí o anulá el cobro antes de devolver esta cantidad'; END IF;
 END IF;
 END IF;
 INSERT INTO public.distribucion_eventos(comercio_id,reparto_id,parada_id,tipo,datos,usuario_id) VALUES(p_comercio_id,r.id,parada.id,p_accion,p_datos,auth.uid());

 ELSIF p_accion='finalizar' THEN
 IF r.estado<>'en_reparto' THEN RAISE EXCEPTION 'El reparto no está abierto'; END IF;
 UPDATE public.distribucion_repartos SET estado='pendiente_rendicion' WHERE id=r.id;

 ELSIF p_accion='reabrir' THEN
 IF r.estado<>'pendiente_rendicion' OR length(btrim(coalesce(p_datos->>'motivo','')))=0 THEN RAISE EXCEPTION 'Sólo se reabre una rendición pendiente con motivo'; END IF;
 UPDATE public.distribucion_repartos SET estado='en_reparto' WHERE id=r.id;

 ELSIF p_accion='cancelar_reparto' THEN
 IF r.estado<>'planificado' THEN RAISE EXCEPTION 'Sólo se cancela un reparto planificado'; END IF;
 UPDATE public.distribucion_repartos SET estado='cancelado' WHERE id=r.id;

 ELSIF p_accion='rendir' THEN
 IF r.estado<>'pendiente_rendicion' THEN RAISE EXCEPTION 'Finalizá el reparto antes de rendir'; END IF;
 monto:=(p_datos->>'efectivo')::numeric;
 motivo:=coalesce(p_datos->>'observaciones','');
 IF monto IS NULL OR monto<0 OR monto::text IN ('NaN','Infinity','-Infinity') OR monto<>round(monto,2) THEN RAISE EXCEPTION 'Efectivo inválido'; END IF;
 SELECT coalesce(sum((e.datos->>'monto')::numeric),0) INTO efectivo FROM public.distribucion_eventos e WHERE reparto_id=r.id AND tipo='cobro' AND datos->>'medio'='contado' AND NOT EXISTS(SELECT 1 FROM public.distribucion_eventos a WHERE a.tipo='anular_cobro' AND a.datos->>'evento_id'=e.id::text);
 IF monto<>efectivo AND length(btrim(motivo))=0 THEN RAISE EXCEPTION 'Explicá la diferencia de efectivo'; END IF;
 -- Libera las reservas dentro de la misma transacción que genera las ventas.
 UPDATE public.distribucion_repartos SET estado='rendido',efectivo_rendido=monto,diferencia=monto-efectivo,observaciones=motivo WHERE id=r.id;
 SELECT punto_venta INTO pv FROM public.afip_config WHERE comercio_id=p_comercio_id AND activo ORDER BY punto_venta LIMIT 1;
 FOR parada IN SELECT * FROM public.distribucion_paradas WHERE reparto_id=r.id ORDER BY orden,id LOOP
 SELECT * INTO p FROM public.distribucion_pedidos WHERE id=parada.pedido_id;
 SELECT jsonb_agg(jsonb_build_object('producto_id',i.producto_id,'cantidad',c.entregada-c.devuelta,'precio_unitario',i.precio,'porcentaje_iva',i.iva,'afecta_stock',true) ORDER BY i.id),coalesce(sum(round((c.entregada-c.devuelta)*i.precio,2)),0)
 INTO detalle,total FROM public.distribucion_cargas c JOIN public.distribucion_pedido_items i ON i.id=c.item_id WHERE c.parada_id=parada.id AND c.entregada>c.devuelta;
 SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',datos->>'medio','monto',(datos->>'monto')::numeric,'observaciones','Reparto '||r.nombre) ORDER BY created_at,id),'[]'::jsonb),coalesce(sum((datos->>'monto')::numeric),0)
 INTO pagos,efectivo FROM public.distribucion_eventos e WHERE parada_id=parada.id AND tipo='cobro' AND NOT EXISTS(SELECT 1 FROM public.distribucion_eventos a WHERE a.tipo='anular_cobro' AND a.datos->>'evento_id'=e.id::text);
 IF efectivo>total THEN RAISE EXCEPTION 'Hay cobros superiores a la entrega neta. Revisá las devoluciones'; END IF;
 IF detalle IS NOT NULL THEN
 SELECT * INTO venta FROM public.registrar_venta_transaccional(p_comercio_id,'recibo_x',coalesce(pv,1),p.cliente_id,p.cliente_nombre,'ARS','cta_cte',detalle,'[]'::jsonb,parada.id,now(),'Distribución: pedido '||p.numero||', reparto '||r.nombre);
 UPDATE public.distribucion_paradas SET venta_id=venta.id WHERE id=parada.id;
 IF efectivo>0 THEN PERFORM public.registrar_pagos_cliente_multi_documento(p.cliente_id,ARRAY[venta.id],current_date,'Rendición '||r.nombre,pagos); END IF;
 END IF;
 END LOOP;

 ELSIF p_accion='devolucion_rendida' THEN
 IF r.estado<>'rendido' THEN RAISE EXCEPTION 'Reparto sin rendir'; END IF;
 SELECT * INTO parada FROM public.distribucion_paradas WHERE id=(p_datos->>'parada_id')::uuid AND reparto_id=r.id;
 IF NOT FOUND OR parada.venta_id IS NULL THEN RAISE EXCEPTION 'Entrega sin venta'; END IF;
 SELECT * INTO venta FROM public.ventas WHERE id=parada.venta_id FOR UPDATE;
 IF coalesce(venta.cae,'')<>'' THEN RAISE EXCEPTION 'La devolución fiscal requiere una nota de crédito'; END IF;
 SELECT * INTO carga FROM public.distribucion_cargas WHERE parada_id=parada.id AND id=(p_datos->>'carga_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Producto no incluido'; END IF;
 IF (p_datos->>'cantidad')::numeric<>trunc((p_datos->>'cantidad')::numeric) THEN RAISE EXCEPTION 'La cantidad debe ser entera'; END IF;
 qty:=(p_datos->>'cantidad')::integer;
 IF qty IS NULL OR qty<=0 OR length(btrim(coalesce(p_datos->>'motivo','')))=0 THEN RAISE EXCEPTION 'Cantidad y motivo requeridos'; END IF;
 UPDATE public.distribucion_cargas SET devuelta=devuelta+qty WHERE id=carga.id;
 SELECT * INTO item FROM public.distribucion_pedido_items WHERE id=carga.item_id;
 UPDATE public.productos SET stock=stock+qty WHERE id=item.producto_id;
 INSERT INTO public.cuenta_corriente(comercio_id,cliente_id,venta_id,tipo_movimiento,concepto,monto,fecha_movimiento,moneda,observaciones)
 VALUES(p_comercio_id,venta.cliente_id,venta.id,'credito','devolucion_distribucion',round((carga.entregada-carga.devuelta)*item.precio,2)-round((carga.entregada-carga.devuelta-qty)*item.precio,2),now(),'ARS',p_datos->>'motivo');
 INSERT INTO public.distribucion_eventos(comercio_id,reparto_id,parada_id,tipo,datos,usuario_id) VALUES(p_comercio_id,r.id,parada.id,p_accion,p_datos,auth.uid());
 ELSE RAISE EXCEPTION 'Acción desconocida';
 END IF;
 END IF;
 IF p_accion NOT IN ('entrega','devolucion','cobro','anular_cobro','devolucion_rendida') THEN
 INSERT INTO public.distribucion_eventos(comercio_id,reparto_id,tipo,datos,usuario_id) VALUES(p_comercio_id,r.id,p_accion,p_datos,auth.uid());
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
 IF p_accion='despachar' AND NOT r.papeles_preparados THEN RAISE EXCEPTION 'Confirmá que llevás los dos ejemplares impresos por cliente'; END IF;
 IF p_accion IN ('asignar','quitar') AND EXISTS(SELECT 1 FROM public.distribucion_remitos WHERE reparto_id=r.id) THEN RAISE EXCEPTION 'Los remitos emitidos conservan la carga; cancelá y armá otro reparto para cambiarla'; END IF;
 IF p_accion='finalizar' AND EXISTS(SELECT 1 FROM public.distribucion_remitos WHERE reparto_id=r.id AND estado='emitido') THEN RAISE EXCEPTION 'Confirmá todos los remitos, incluso los rechazados'; END IF;
 IF p_accion='cobro' AND NOT EXISTS(SELECT 1 FROM public.distribucion_remitos WHERE parada_id=(p_datos->>'parada_id')::uuid AND reparto_id=r.id AND estado='confirmado') THEN RAISE EXCEPTION 'Confirmá la entrega antes de cobrar'; END IF;
 END IF;
 resultado:=public.distribucion_operar_anterior(p_comercio_id,p_accion,p_datos,p_clave);
 IF r.circuito_remitos AND p_accion='cancelar_reparto' THEN UPDATE public.distribucion_remitos SET estado='anulado' WHERE reparto_id=r.id; END IF;
 RETURN resultado;
END $$;

CREATE FUNCTION public.distribucion_estado_pedido(p_pedido uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.distribucion_pedidos; neto bigint; completo boolean;
BEGIN
 SELECT * INTO p FROM public.distribucion_pedidos WHERE id=p_pedido;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF p.estado='cancelado' THEN RETURN 'cancelado'; END IF;
 IF EXISTS(SELECT 1 FROM public.distribucion_paradas pp JOIN public.distribucion_repartos r ON r.id=pp.reparto_id WHERE pp.pedido_id=p.id AND r.estado='en_reparto') THEN RETURN 'en_reparto'; END IF;
 IF EXISTS(SELECT 1 FROM public.distribucion_paradas pp JOIN public.distribucion_repartos r ON r.id=pp.reparto_id WHERE pp.pedido_id=p.id AND r.estado='pendiente_rendicion') THEN RETURN 'pendiente_rendicion'; END IF;
 IF EXISTS(SELECT 1 FROM public.distribucion_paradas pp JOIN public.distribucion_repartos r ON r.id=pp.reparto_id WHERE pp.pedido_id=p.id AND r.estado='planificado') THEN RETURN 'asignado'; END IF;
 SELECT coalesce(sum(c.entregada-c.devuelta),0) INTO neto FROM public.distribucion_cargas c JOIN public.distribucion_paradas pp ON pp.id=c.parada_id JOIN public.distribucion_repartos r ON r.id=pp.reparto_id WHERE pp.pedido_id=p.id AND r.estado<>'cancelado';
 SELECT NOT EXISTS(SELECT 1 FROM public.distribucion_pedido_items i WHERE i.pedido_id=p.id AND i.cantidad>coalesce((SELECT sum(c.entregada-c.devuelta) FROM public.distribucion_cargas c JOIN public.distribucion_paradas pp ON pp.id=c.parada_id JOIN public.distribucion_repartos r ON r.id=pp.reparto_id WHERE c.item_id=i.id AND r.estado<>'cancelado'),0)) INTO completo;
 IF neto>0 AND completo THEN
 IF EXISTS(SELECT 1 FROM public.distribucion_remitos m JOIN public.distribucion_paradas pp ON pp.id=m.parada_id WHERE pp.pedido_id=p.id AND m.estado='confirmado' AND m.venta_id IS NULL AND EXISTS(SELECT 1 FROM public.distribucion_remito_items i WHERE i.remito_id=m.id AND i.recibida>i.devuelta)) THEN RETURN 'pendiente_facturacion'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.distribucion_paradas pp JOIN public.distribucion_cargas c ON c.parada_id=pp.id LEFT JOIN public.distribucion_remitos m ON m.parada_id=pp.id WHERE pp.pedido_id=p.id AND c.entregada>c.devuelta AND coalesce(pp.venta_id,m.venta_id) IS NULL) THEN
 IF EXISTS(SELECT 1 FROM public.distribucion_paradas pp LEFT JOIN public.distribucion_remitos m ON m.parada_id=pp.id JOIN public.ventas v ON v.id=coalesce(pp.venta_id,m.venta_id) WHERE pp.pedido_id=p.id AND v.tipo_comprobante<>'recibo_x' AND coalesce(v.cae,'')='') THEN RETURN 'pendiente_cae'; END IF;
 RETURN 'facturado'; END IF;
 RETURN 'entregado'; END IF;
 IF neto>0 THEN RETURN 'entrega_parcial'; END IF;
 IF EXISTS(SELECT 1 FROM public.distribucion_paradas pp JOIN public.distribucion_repartos r ON r.id=pp.reparto_id WHERE pp.pedido_id=p.id AND r.estado='rendido') THEN RETURN 'sin_entrega'; END IF;
 RETURN p.estado;
END $$;
REVOKE ALL ON FUNCTION public.distribucion_estado_pedido(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.distribucion_resumen(p_comercio_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE admin boolean; resultado jsonb;
BEGIN
 IF public.distribucion_habilitado(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Distribución no habilitada o sin acceso' USING ERRCODE='42501'; END IF;
 admin:=public.user_is_comercio_admin(p_comercio_id);
 WITH rutas AS (SELECT * FROM public.distribucion_repartos WHERE comercio_id=p_comercio_id AND (admin OR repartidor_id=auth.uid())),
 paradas AS (SELECT p.* FROM public.distribucion_paradas p JOIN rutas r ON r.id=p.reparto_id),
 pedidos AS (SELECT p.* FROM public.distribucion_pedidos p WHERE comercio_id=p_comercio_id AND (admin OR creado_por=auth.uid() OR id IN (SELECT pedido_id FROM paradas)))
 SELECT jsonb_build_object('admin',admin,
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



CREATE FUNCTION public.distribucion_proteger_factura_remito() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v uuid;
BEGIN
 IF TG_TABLE_NAME='ventas' THEN v:=OLD.id; ELSIF TG_OP='INSERT' THEN v:=NEW.venta_id; ELSE v:=OLD.venta_id; END IF;
 IF EXISTS(SELECT 1 FROM public.distribucion_remitos WHERE venta_id=v) THEN
 IF TG_TABLE_NAME='ventas' AND TG_OP='UPDATE' THEN
 -- Permite al circuito ARCA completar la numeración y autorización, conservando importes y cliente.
 IF (to_jsonb(NEW)-ARRAY['cae','cae_vencimiento','cae_solicitado_at','cae_error','updated_at','numero_comprobante','numero_secuencial','punto_venta']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['cae','cae_vencimiento','cae_solicitado_at','cae_error','updated_at','numero_comprobante','numero_secuencial','punto_venta']) THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'La factura conserva el remito y sus cobros. Usá el circuito de notas de crédito'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER distribucion_factura_remito BEFORE UPDATE OR DELETE ON public.ventas FOR EACH ROW EXECUTE FUNCTION public.distribucion_proteger_factura_remito();
CREATE TRIGGER distribucion_factura_remito_items BEFORE INSERT OR UPDATE OR DELETE ON public.venta_items FOR EACH ROW EXECUTE FUNCTION public.distribucion_proteger_factura_remito();
CREATE TRIGGER distribucion_factura_remito_pagos BEFORE UPDATE OR DELETE ON public.pagos_venta FOR EACH ROW EXECUTE FUNCTION public.distribucion_proteger_factura_remito();
CREATE TRIGGER distribucion_factura_remito_cuenta BEFORE UPDATE OR DELETE ON public.cuenta_corriente FOR EACH ROW EXECUTE FUNCTION public.distribucion_proteger_factura_remito();
REVOKE ALL ON FUNCTION public.distribucion_remito_relaciones(),public.distribucion_proteger_factura_remito(),public.distribucion_remitos_operar(uuid,text,jsonb,uuid),public.distribucion_operar_anterior(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.distribucion_remito_acceso(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.distribucion_remito_acceso(uuid,uuid) TO authenticated;
CREATE FUNCTION public.distribucion_configurar_remitos(p_comercio_id uuid,p_datos jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE pv integer; inicio integer; fin integer; ultimo integer; vence date;
BEGIN
 IF public.distribucion_habilitado(p_comercio_id) IS DISTINCT FROM true OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Configuración reservada a administración' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('distribucion:'||p_comercio_id::text,0));
 pv:=(p_datos->>'punto_venta')::integer; inicio:=(p_datos->>'desde')::integer; fin:=(p_datos->>'hasta')::integer; vence:=(p_datos->>'vencimiento')::date;
 IF vence IS NULL OR vence<current_date THEN RAISE EXCEPTION 'Indicá una autorización vigente'; END IF;
 SELECT greatest(inicio-1,coalesce(max(numero_autorizado),0)) INTO ultimo FROM public.distribucion_remitos WHERE comercio_id=p_comercio_id AND punto_venta=pv;
 INSERT INTO public.distribucion_remitos_autorizacion(comercio_id,punto_venta,cai,vencimiento,desde,hasta,ultimo) VALUES(p_comercio_id,pv,p_datos->>'cai',vence,inicio,fin,ultimo)
 ON CONFLICT(comercio_id) DO UPDATE SET punto_venta=EXCLUDED.punto_venta,cai=EXCLUDED.cai,vencimiento=EXCLUDED.vencimiento,desde=EXCLUDED.desde,hasta=EXCLUDED.hasta,ultimo=EXCLUDED.ultimo;
END $$;
REVOKE ALL ON FUNCTION public.distribucion_configurar_remitos(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.distribucion_configurar_remitos(uuid,jsonb) TO authenticated;
COMMIT;
