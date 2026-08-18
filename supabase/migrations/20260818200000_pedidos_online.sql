-- Pedidos recibidos desde la tienda online de MATE KING.
CREATE TABLE public.pedidos_online (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  cliente_user_id uuid NOT NULL REFERENCES auth.users(id),
  cliente_nombre text NOT NULL,
  cliente_email text NOT NULL,
  cliente_telefono text NOT NULL,
  cliente_direccion text NOT NULL,
  observaciones text,
  estado text NOT NULL DEFAULT 'recibido' CHECK (estado IN ('recibido','confirmado','preparando','listo','entregado','cancelado')),
  total numeric(14,2) NOT NULL CHECK (total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pedido_online_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos_online(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  descripcion text NOT NULL,
  cantidad integer NOT NULL CHECK (cantidad > 0),
  precio_unitario numeric(14,2) NOT NULL CHECK (precio_unitario >= 0),
  subtotal numeric(14,2) NOT NULL CHECK (subtotal >= 0)
);

CREATE INDEX idx_pedidos_online_comercio_fecha ON public.pedidos_online(comercio_id, created_at DESC);
CREATE INDEX idx_pedidos_online_cliente ON public.pedidos_online(cliente_user_id, created_at DESC);
CREATE INDEX idx_pedido_online_items_pedido ON public.pedido_online_items(pedido_id);

ALTER TABLE public.pedidos_online ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_online_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clientes ven sus pedidos" ON public.pedidos_online FOR SELECT TO authenticated
USING (cliente_user_id = auth.uid() OR public.user_belongs_to_comercio(comercio_id));
CREATE POLICY "Comercios gestionan pedidos" ON public.pedidos_online FOR UPDATE TO authenticated
USING (public.user_belongs_to_comercio(comercio_id))
WITH CHECK (public.user_belongs_to_comercio(comercio_id));
CREATE POLICY "Usuarios ven items de pedidos permitidos" ON public.pedido_online_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.pedidos_online po WHERE po.id=pedido_id AND (po.cliente_user_id=auth.uid() OR public.user_belongs_to_comercio(po.comercio_id))));

CREATE TRIGGER update_pedidos_online_updated_at BEFORE UPDATE ON public.pedidos_online
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.crear_pedido_online(p_cliente jsonb, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_user uuid:=auth.uid(); v_comercio constant uuid:='30e79cd0-360d-4a03-b634-bb7414ee505b';
  v_pedido public.pedidos_online; v_item jsonb; v_producto public.productos; v_total numeric:=0; v_notificacion uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debe iniciar sesion para realizar el pedido'; END IF;
  IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'El carrito esta vacio'; END IF;
  IF nullif(trim(p_cliente->>'nombre'),'') IS NULL OR nullif(trim(p_cliente->>'telefono'),'') IS NULL OR nullif(trim(p_cliente->>'direccion'),'') IS NULL THEN
    RAISE EXCEPTION 'Complete nombre, telefono y direccion';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_producto FROM public.productos WHERE id=(v_item->>'producto_id')::uuid FOR UPDATE;
    IF v_producto.id IS NULL OR v_producto.comercio_id<>v_comercio OR NOT v_producto.visible_en_tienda THEN RAISE EXCEPTION 'Producto no disponible'; END IF;
    IF (v_item->>'cantidad')::integer<=0 OR v_producto.stock<(v_item->>'cantidad')::integer THEN RAISE EXCEPTION 'Stock insuficiente para %',v_producto.descripcion; END IF;
    v_total:=v_total+(v_producto.precio_venta*(v_item->>'cantidad')::integer);
  END LOOP;
  INSERT INTO public.pedidos_online(comercio_id,cliente_user_id,cliente_nombre,cliente_email,cliente_telefono,cliente_direccion,observaciones,total)
  VALUES(v_comercio,v_user,trim(p_cliente->>'nombre'),COALESCE(nullif(trim(p_cliente->>'email'),''),(SELECT email FROM auth.users WHERE id=v_user)),trim(p_cliente->>'telefono'),trim(p_cliente->>'direccion'),nullif(trim(p_cliente->>'observaciones'),''),v_total) RETURNING * INTO v_pedido;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_producto FROM public.productos WHERE id=(v_item->>'producto_id')::uuid;
    INSERT INTO public.pedido_online_items(pedido_id,producto_id,descripcion,cantidad,precio_unitario,subtotal)
    VALUES(v_pedido.id,v_producto.id,v_producto.descripcion,(v_item->>'cantidad')::integer,v_producto.precio_venta,v_producto.precio_venta*(v_item->>'cantidad')::integer);
    UPDATE public.productos SET stock=stock-(v_item->>'cantidad')::integer WHERE id=v_producto.id;
  END LOOP;
  INSERT INTO public.notificaciones(titulo,mensaje,categoria,prioridad,metadata,created_by)
  VALUES('Nuevo pedido online #'||v_pedido.numero,'Se recibio un pedido de '||v_pedido.cliente_nombre||' por $ '||v_total,'general','alta',jsonb_build_object('tipo','pedido_online','pedido_id',v_pedido.id,'numero',v_pedido.numero),v_user) RETURNING id INTO v_notificacion;
  INSERT INTO public.notificacion_destinatarios(notificacion_id,comercio_id) VALUES(v_notificacion,v_comercio);
  RETURN jsonb_build_object('id',v_pedido.id,'numero',v_pedido.numero,'total',v_total,'estado',v_pedido.estado);
END $$;

CREATE OR REPLACE FUNCTION public.actualizar_estado_pedido_online(p_pedido_id uuid,p_estado text)
RETURNS public.pedidos_online LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_pedido public.pedidos_online; v_item record;
BEGIN
  SELECT * INTO v_pedido FROM public.pedidos_online WHERE id=p_pedido_id FOR UPDATE;
  IF v_pedido.id IS NULL OR NOT public.user_belongs_to_comercio(v_pedido.comercio_id) THEN RAISE EXCEPTION 'Pedido no autorizado'; END IF;
  IF p_estado NOT IN ('recibido','confirmado','preparando','listo','entregado','cancelado') THEN RAISE EXCEPTION 'Estado invalido'; END IF;
  IF v_pedido.estado='cancelado' THEN RAISE EXCEPTION 'El pedido ya esta cancelado'; END IF;
  IF p_estado='cancelado' THEN
    FOR v_item IN SELECT producto_id,cantidad FROM public.pedido_online_items WHERE pedido_id=p_pedido_id LOOP
      UPDATE public.productos SET stock=stock+v_item.cantidad WHERE id=v_item.producto_id;
    END LOOP;
  END IF;
  UPDATE public.pedidos_online SET estado=p_estado WHERE id=p_pedido_id RETURNING * INTO v_pedido;
  RETURN v_pedido;
END $$;

REVOKE ALL ON FUNCTION public.crear_pedido_online(jsonb,jsonb),public.actualizar_estado_pedido_online(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crear_pedido_online(jsonb,jsonb),public.actualizar_estado_pedido_online(uuid,text) TO authenticated;
GRANT SELECT ON public.pedidos_online,public.pedido_online_items TO authenticated;

-- Modulo habilitado solo para MATE KING.
UPDATE public.comercio_parametrizacion SET parametros=jsonb_set(parametros,'{modulos,pedidos_online}','true'::jsonb,true)
WHERE comercio_id='30e79cd0-360d-4a03-b634-bb7414ee505b';
