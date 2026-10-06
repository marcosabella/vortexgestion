-- Edición y eliminación administrativas; no modifica ventas ni datos históricos.
BEGIN;

ALTER TABLE public.distribucion_pedidos ADD COLUMN version integer NOT NULL DEFAULT 1;

CREATE FUNCTION public.distribucion_version_pedido() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 NEW.version:=OLD.version+1;
 RETURN NEW;
END $$;
CREATE TRIGGER distribucion_version BEFORE UPDATE ON public.distribucion_pedidos
FOR EACH ROW EXECUTE FUNCTION public.distribucion_version_pedido();
REVOKE ALL ON FUNCTION public.distribucion_version_pedido() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.distribucion_modificar_pedido(
 p_comercio_id uuid,p_pedido_id uuid,p_version integer,p_eliminar boolean,p_datos jsonb,p_clave uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 p public.distribucion_pedidos; cliente public.clientes; prod public.productos;
 intento public.distribucion_intentos; elemento jsonb; anterior jsonb;
 accion text; solicitud jsonb; ruta record;
BEGIN
 IF public.distribucion_habilitado(p_comercio_id) IS DISTINCT FROM true OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN
 RAISE EXCEPTION 'Edición y eliminación reservadas a administración' USING ERRCODE='42501'; END IF;
 IF p_clave IS NULL OR p_version IS NULL OR p_eliminar IS NULL OR jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitud inválida'; END IF;
 accion:=CASE WHEN p_eliminar THEN 'eliminar_pedido' ELSE 'editar_pedido' END;
 solicitud:=jsonb_build_object('pedido_id',p_pedido_id,'version',p_version,'datos',p_datos);
 PERFORM pg_advisory_xact_lock(hashtextextended('distribucion:'||p_comercio_id::text,0));
 SELECT * INTO intento FROM public.distribucion_intentos WHERE comercio_id=p_comercio_id AND clave=p_clave;
 IF FOUND THEN
 IF intento.usuario_id<>auth.uid() OR intento.accion<>accion OR intento.datos<>solicitud THEN RAISE EXCEPTION 'Intento reutilizado con otros datos'; END IF;
 RETURN intento.resultado;
 END IF;
 SELECT * INTO p FROM public.distribucion_pedidos WHERE id=p_pedido_id AND comercio_id=p_comercio_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no disponible'; END IF;
 IF p.version<>p_version THEN RAISE EXCEPTION 'El pedido cambió. Actualizá el listado y volvé a intentarlo' USING ERRCODE='40001'; END IF;
 -- Se conserva toda operación física o contable, incluso si la mercadería fue devuelta.
 IF EXISTS(SELECT 1 FROM public.distribucion_paradas pp JOIN public.distribucion_repartos r ON r.id=pp.reparto_id WHERE pp.pedido_id=p.id AND (pp.venta_id IS NOT NULL OR r.estado='rendido'))
 OR EXISTS(SELECT 1 FROM public.distribucion_cargas c JOIN public.distribucion_paradas pp ON pp.id=c.parada_id WHERE pp.pedido_id=p.id AND c.entregada>0)
 OR EXISTS(SELECT 1 FROM public.distribucion_eventos e JOIN public.distribucion_paradas pp ON pp.id=e.parada_id WHERE pp.pedido_id=p.id) THEN
 RAISE EXCEPTION 'El pedido tiene entregas, cobros o una rendición. Registrá devoluciones para restituir stock y conservar el historial'; END IF;
 anterior:=jsonb_build_object('pedido',to_jsonb(p),'items',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.distribucion_pedido_items i WHERE i.pedido_id=p.id),'[]'::jsonb));
 IF NOT p_eliminar THEN
 SELECT * INTO cliente FROM public.clientes WHERE id=(p_datos->>'cliente_id')::uuid AND comercio_id=p_comercio_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no disponible'; END IF;
 IF jsonb_typeof(p_datos->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_datos->'items')=0 OR length(btrim(coalesce(p_datos->>'direccion','')))=0 THEN RAISE EXCEPTION 'Indicá dirección y productos'; END IF;
 IF (SELECT count(DISTINCT value->>'producto_id') FROM jsonb_array_elements(p_datos->'items'))<>jsonb_array_length(p_datos->'items') THEN RAISE EXCEPTION 'No repitas productos'; END IF;
 FOR elemento IN SELECT value FROM jsonb_array_elements(p_datos->'items') LOOP
 SELECT * INTO prod FROM public.productos WHERE id=(elemento->>'producto_id')::uuid AND comercio_id=p_comercio_id FOR SHARE;
 IF NOT FOUND OR prod.tipo_moneda<>'ARS' THEN RAISE EXCEPTION 'Producto no disponible en pesos'; END IF;
 IF (elemento->>'cantidad') IS NULL OR (elemento->>'cantidad')::numeric<=0 OR (elemento->>'cantidad')::numeric<>trunc((elemento->>'cantidad')::numeric) THEN RAISE EXCEPTION 'La cantidad debe ser entera y mayor a cero'; END IF;
 END LOOP;
 END IF;
 -- El pedido sólo reserva existencias: nunca se suma stock que no se haya descontado.
 -- Quitar la carga libera exactamente su reserva y obliga a preparar y reasignar la edición.
 FOR ruta IN SELECT pp.reparto_id FROM public.distribucion_paradas pp WHERE pp.pedido_id=p.id ORDER BY pp.reparto_id LOOP
 INSERT INTO public.distribucion_eventos(comercio_id,reparto_id,tipo,datos,usuario_id)
 VALUES(p_comercio_id,ruta.reparto_id,accion,solicitud||jsonb_build_object('anterior',anterior,'reserva_liberada',true),auth.uid());
 END LOOP;
 DELETE FROM public.distribucion_cargas WHERE parada_id IN(SELECT id FROM public.distribucion_paradas WHERE pedido_id=p.id);
 DELETE FROM public.distribucion_paradas WHERE pedido_id=p.id;
 IF p_eliminar THEN
 DELETE FROM public.distribucion_pedido_items WHERE pedido_id=p.id;
 DELETE FROM public.distribucion_pedidos WHERE id=p.id;
 ELSE
 -- Los productos que permanecen conservan sus precios e IVA originales.
 DELETE FROM public.distribucion_pedido_items WHERE pedido_id=p.id AND producto_id NOT IN(SELECT (value->>'producto_id')::uuid FROM jsonb_array_elements(p_datos->'items'));
 FOR elemento IN SELECT value FROM jsonb_array_elements(p_datos->'items') LOOP
 SELECT * INTO prod FROM public.productos WHERE id=(elemento->>'producto_id')::uuid AND comercio_id=p_comercio_id;
 UPDATE public.distribucion_pedido_items SET cantidad=(elemento->>'cantidad')::integer WHERE pedido_id=p.id AND producto_id=prod.id;
 IF NOT FOUND THEN
 INSERT INTO public.distribucion_pedido_items(comercio_id,pedido_id,producto_id,descripcion,cantidad,precio,iva)
 VALUES(p_comercio_id,p.id,prod.id,prod.descripcion,(elemento->>'cantidad')::integer,prod.precio_venta,prod.porcentaje_iva)
 ;
 END IF;
 END LOOP;
 UPDATE public.distribucion_pedidos SET cliente_id=cliente.id,cliente_nombre=concat_ws(' ',cliente.nombre,cliente.apellido),direccion=p_datos->>'direccion',telefono=coalesce(p_datos->>'telefono',''),fecha=(p_datos->>'fecha')::date,observaciones=coalesce(p_datos->>'observaciones',''),estado='pendiente' WHERE id=p.id;
 END IF;
 INSERT INTO public.distribucion_eventos(comercio_id,tipo,datos,usuario_id)
 VALUES(p_comercio_id,accion,solicitud||jsonb_build_object('anterior',anterior),auth.uid());
 INSERT INTO public.distribucion_intentos VALUES(p_comercio_id,p_clave,auth.uid(),accion,solicitud,p.id);
 RETURN p.id;
END $$;
REVOKE ALL ON FUNCTION public.distribucion_modificar_pedido(uuid,uuid,integer,boolean,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.distribucion_modificar_pedido(uuid,uuid,integer,boolean,jsonb,uuid) TO authenticated;
COMMIT;
