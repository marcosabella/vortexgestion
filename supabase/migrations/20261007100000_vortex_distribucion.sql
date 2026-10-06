-- Módulo opcional. Sólo estructura y funciones; no activa comercios ni repara datos.
BEGIN;

CREATE FUNCTION public.distribucion_habilitado(p_comercio uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.user_belongs_to_comercio(p_comercio) AND EXISTS (
 SELECT 1 FROM public.comercio_parametrizacion WHERE comercio_id=p_comercio
 AND parametros->'modulos'->>'distribucion'='true');
$$;

CREATE TABLE public.distribucion_pedidos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 numero bigint GENERATED ALWAYS AS IDENTITY, cliente_id uuid NOT NULL REFERENCES public.clientes(id),
 cliente_nombre text NOT NULL, direccion text NOT NULL DEFAULT '', telefono text NOT NULL DEFAULT '',
 fecha date NOT NULL DEFAULT current_date, observaciones text NOT NULL DEFAULT '',
 estado text NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','preparacion','listo','cancelado')),
 creado_por uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,comercio_id)
);
CREATE TABLE public.distribucion_pedido_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 pedido_id uuid NOT NULL, producto_id uuid NOT NULL REFERENCES public.productos(id),
 descripcion text NOT NULL, cantidad integer NOT NULL CHECK(cantidad>0),
 precio numeric(16,4) NOT NULL CHECK(precio>0 AND precio::text<>'NaN'),
 iva numeric(7,4) NOT NULL CHECK(iva BETWEEN 0 AND 100),
 FOREIGN KEY(pedido_id,comercio_id) REFERENCES public.distribucion_pedidos(id,comercio_id),
 UNIQUE(pedido_id,producto_id), UNIQUE(id,comercio_id)
);
CREATE TABLE public.distribucion_repartos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 nombre text NOT NULL CHECK(length(btrim(nombre))>0), fecha date NOT NULL,
 repartidor_id uuid NOT NULL REFERENCES auth.users(id), vehiculo text NOT NULL DEFAULT '',
 estado text NOT NULL DEFAULT 'planificado' CHECK(estado IN ('planificado','en_reparto','pendiente_rendicion','rendido','cancelado')),
 efectivo_rendido numeric(14,2), diferencia numeric(14,2), observaciones text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,comercio_id)
);
CREATE TABLE public.distribucion_paradas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 reparto_id uuid NOT NULL, pedido_id uuid NOT NULL, orden integer NOT NULL CHECK(orden>0),
 venta_id uuid REFERENCES public.ventas(id) ON DELETE RESTRICT,
 FOREIGN KEY(reparto_id,comercio_id) REFERENCES public.distribucion_repartos(id,comercio_id),
 FOREIGN KEY(pedido_id,comercio_id) REFERENCES public.distribucion_pedidos(id,comercio_id),
 UNIQUE(reparto_id,pedido_id), UNIQUE(id,comercio_id)
);
CREATE TABLE public.distribucion_cargas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 parada_id uuid NOT NULL, item_id uuid NOT NULL,
 cargada integer NOT NULL CHECK(cargada>0), entregada integer NOT NULL DEFAULT 0,
 devuelta integer NOT NULL DEFAULT 0,
 CHECK(entregada BETWEEN 0 AND cargada AND devuelta BETWEEN 0 AND entregada),
 FOREIGN KEY(parada_id,comercio_id) REFERENCES public.distribucion_paradas(id,comercio_id),
 FOREIGN KEY(item_id,comercio_id) REFERENCES public.distribucion_pedido_items(id,comercio_id),
 UNIQUE(parada_id,item_id)
);
CREATE TABLE public.distribucion_eventos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 reparto_id uuid, parada_id uuid,
 tipo text NOT NULL, datos jsonb NOT NULL, usuario_id uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(reparto_id,comercio_id) REFERENCES public.distribucion_repartos(id,comercio_id),
 FOREIGN KEY(parada_id,comercio_id) REFERENCES public.distribucion_paradas(id,comercio_id)
);
CREATE TABLE public.distribucion_intentos (
 comercio_id uuid NOT NULL REFERENCES public.comercio(id), clave uuid NOT NULL,
 usuario_id uuid NOT NULL REFERENCES auth.users(id), accion text NOT NULL, datos jsonb NOT NULL,
 resultado uuid NOT NULL, PRIMARY KEY(comercio_id,clave)
);

CREATE INDEX distribucion_pedidos_cliente ON public.distribucion_pedidos(comercio_id,cliente_id,fecha);
CREATE INDEX distribucion_items_producto ON public.distribucion_pedido_items(comercio_id,producto_id);
CREATE INDEX distribucion_repartos_fecha ON public.distribucion_repartos(comercio_id,fecha,repartidor_id);
CREATE INDEX distribucion_paradas_pedido ON public.distribucion_paradas(comercio_id,pedido_id);
CREATE INDEX distribucion_paradas_venta ON public.distribucion_paradas(venta_id);
CREATE INDEX distribucion_cargas_item ON public.distribucion_cargas(comercio_id,item_id);
CREATE INDEX distribucion_eventos_reparto ON public.distribucion_eventos(comercio_id,reparto_id,created_at);
CREATE INDEX distribucion_eventos_parada ON public.distribucion_eventos(parada_id,tipo);

-- Integridad adicional para referencias que no tienen una clave compuesta en el núcleo.
CREATE FUNCTION public.distribucion_relaciones() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.comercio_id IS DISTINCT FROM OLD.comercio_id THEN RAISE EXCEPTION 'Comercio inmutable'; END IF;
 IF TG_TABLE_NAME='distribucion_pedidos' THEN
 IF NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=NEW.cliente_id AND comercio_id=NEW.comercio_id) THEN RAISE EXCEPTION 'Cliente de otro comercio'; END IF;
 ELSIF TG_TABLE_NAME='distribucion_pedido_items' THEN
 IF NOT EXISTS(SELECT 1 FROM public.productos WHERE id=NEW.producto_id AND comercio_id=NEW.comercio_id) THEN RAISE EXCEPTION 'Producto de otro comercio'; END IF;
 ELSIF TG_TABLE_NAME='distribucion_repartos' THEN
 IF NOT EXISTS(SELECT 1 FROM public.comercio_usuarios WHERE comercio_id=NEW.comercio_id AND user_id=NEW.repartidor_id AND activo) THEN RAISE EXCEPTION 'Repartidor sin acceso al comercio'; END IF;
 ELSIF TG_TABLE_NAME='distribucion_paradas' THEN
 IF NEW.venta_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ventas v JOIN public.distribucion_pedidos p ON p.id=NEW.pedido_id WHERE v.id=NEW.venta_id AND v.comercio_id=NEW.comercio_id AND v.cliente_id=p.cliente_id) THEN RAISE EXCEPTION 'Venta incompatible'; END IF;
 ELSIF TG_TABLE_NAME='distribucion_cargas' THEN
 IF NOT EXISTS(SELECT 1 FROM public.distribucion_paradas p JOIN public.distribucion_pedido_items i ON i.pedido_id=p.pedido_id WHERE p.id=NEW.parada_id AND i.id=NEW.item_id) THEN RAISE EXCEPTION 'Item de otro pedido'; END IF;
 ELSIF TG_TABLE_NAME='distribucion_eventos' THEN
 IF NEW.parada_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.distribucion_paradas WHERE id=NEW.parada_id AND reparto_id=NEW.reparto_id) THEN RAISE EXCEPTION 'Parada de otro reparto'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['distribucion_pedidos','distribucion_pedido_items','distribucion_repartos','distribucion_paradas','distribucion_cargas','distribucion_eventos'] LOOP
 EXECUTE format('CREATE TRIGGER distribucion_relaciones BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.distribucion_relaciones()',t);
 END LOOP;
END $$;

-- Toda lectura del módulo pasa por la RPC, que limita el reparto al usuario asignado.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['distribucion_pedidos','distribucion_pedido_items','distribucion_repartos','distribucion_paradas','distribucion_cargas','distribucion_eventos','distribucion_intentos'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
 EXECUTE format('CREATE POLICY distribucion_admin ON public.%I FOR SELECT TO authenticated USING(public.distribucion_habilitado(comercio_id) AND public.user_is_comercio_admin(comercio_id))',t);
 END LOOP;
END $$;

CREATE FUNCTION public.distribucion_stock_reservado(p_producto uuid) RETURNS bigint
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(sum(c.cargada),0) FROM public.distribucion_cargas c
 JOIN public.distribucion_pedido_items i ON i.id=c.item_id
 JOIN public.distribucion_paradas p ON p.id=c.parada_id
 JOIN public.distribucion_repartos r ON r.id=p.reparto_id
 WHERE i.producto_id=p_producto AND r.estado IN ('en_reparto','pendiente_rendicion');
$$;
CREATE FUNCTION public.distribucion_proteger_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.stock<OLD.stock AND NEW.stock<public.distribucion_stock_reservado(OLD.id) THEN RAISE EXCEPTION 'Stock reservado para distribución'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER distribucion_stock BEFORE UPDATE OF stock ON public.productos FOR EACH ROW EXECUTE FUNCTION public.distribucion_proteger_stock();

CREATE FUNCTION public.distribucion_operar(p_comercio_id uuid,p_accion text,p_datos jsonb,p_clave uuid) RETURNS uuid
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

CREATE FUNCTION public.distribucion_resumen(p_comercio_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE admin boolean; resultado jsonb;
BEGIN
 IF public.distribucion_habilitado(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Distribución no habilitada o sin acceso' USING ERRCODE='42501'; END IF;
 admin:=public.user_is_comercio_admin(p_comercio_id);
 WITH rutas AS (SELECT * FROM public.distribucion_repartos WHERE comercio_id=p_comercio_id AND (admin OR repartidor_id=auth.uid())),
 paradas AS (SELECT p.* FROM public.distribucion_paradas p JOIN rutas r ON r.id=p.reparto_id),
 pedidos AS (SELECT p.* FROM public.distribucion_pedidos p WHERE comercio_id=p_comercio_id AND (admin OR creado_por=auth.uid() OR id IN (SELECT pedido_id FROM paradas)))
 SELECT jsonb_build_object('admin',admin,
 'pedidos',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY numero DESC) FROM pedidos p),'[]'::jsonb),
 'items',coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM public.distribucion_pedido_items i JOIN pedidos p ON p.id=i.pedido_id),'[]'::jsonb),
 'repartos',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY fecha DESC,created_at DESC) FROM rutas r),'[]'::jsonb),
 'paradas',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY orden) FROM paradas p),'[]'::jsonb),
 'cargas',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.distribucion_cargas c JOIN paradas p ON p.id=c.parada_id),'[]'::jsonb),
 'eventos',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY created_at DESC) FROM public.distribucion_eventos e WHERE e.reparto_id IN (SELECT id FROM rutas)),'[]'::jsonb),
 'usuarios',CASE WHEN admin THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',cu.user_id,'nombre',coalesce(u.email,cu.user_id::text))) FROM public.comercio_usuarios cu JOIN auth.users u ON u.id=cu.user_id WHERE cu.comercio_id=p_comercio_id AND cu.activo),'[]'::jsonb) ELSE '[]'::jsonb END,
 'saldos',coalesce((SELECT jsonb_agg(jsonb_build_object('venta_id',s.venta_id,'saldo',s.saldo)) FROM (SELECT cc.venta_id,sum(CASE WHEN cc.tipo_movimiento='debito' THEN cc.monto ELSE -cc.monto END) saldo FROM public.cuenta_corriente cc WHERE cc.venta_id IN(SELECT venta_id FROM paradas) GROUP BY cc.venta_id) s),'[]'::jsonb)
 ) INTO resultado;
 RETURN resultado;
END $$;

-- El recibo conserva lo rendido. Cobros posteriores se registran en cuenta corriente.
CREATE FUNCTION public.distribucion_proteger_venta() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v uuid;
BEGIN
 IF TG_TABLE_NAME='ventas' THEN v:=OLD.id;
 ELSIF TG_OP='INSERT' THEN v:=NEW.venta_id;
 ELSE v:=OLD.venta_id; END IF;
 IF EXISTS(SELECT 1 FROM public.distribucion_paradas WHERE venta_id=v) THEN RAISE EXCEPTION 'La venta de distribución conserva la rendición. Registrá cobros en cuenta corriente y devoluciones en distribución'; END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME IN ('venta_items','pagos_venta') THEN
 IF EXISTS(SELECT 1 FROM public.distribucion_paradas WHERE venta_id=NEW.venta_id) THEN RAISE EXCEPTION 'La venta de distribución conserva la rendición'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER distribucion_venta BEFORE UPDATE OR DELETE ON public.ventas FOR EACH ROW EXECUTE FUNCTION public.distribucion_proteger_venta();
CREATE TRIGGER distribucion_venta_items BEFORE INSERT OR UPDATE OR DELETE ON public.venta_items FOR EACH ROW EXECUTE FUNCTION public.distribucion_proteger_venta();
CREATE TRIGGER distribucion_venta_pagos BEFORE INSERT OR UPDATE OR DELETE ON public.pagos_venta FOR EACH ROW EXECUTE FUNCTION public.distribucion_proteger_venta();

CREATE FUNCTION public.distribucion_proteger_cuenta() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF (OLD.tipo_movimiento='debito' OR OLD.concepto='devolucion_distribucion') AND EXISTS(SELECT 1 FROM public.distribucion_paradas WHERE venta_id=OLD.venta_id) THEN RAISE EXCEPTION 'El movimiento conserva la rendición de distribución'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER distribucion_cuenta BEFORE UPDATE OR DELETE ON public.cuenta_corriente FOR EACH ROW EXECUTE FUNCTION public.distribucion_proteger_cuenta();

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure firma,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'distribucion_%' LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.firma);
 IF f.proname IN ('distribucion_habilitado','distribucion_operar','distribucion_resumen') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.firma); END IF;
 END LOOP;
END $$;
COMMIT;
