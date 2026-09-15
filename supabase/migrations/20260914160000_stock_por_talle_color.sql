-- Stock independiente por combinación de color y talle.
CREATE TABLE public.producto_variantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  color_id uuid REFERENCES public.producto_colores(id) ON DELETE RESTRICT,
  talle_id uuid REFERENCES public.producto_talles(id) ON DELETE RESTRICT,
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (color_id IS NOT NULL OR talle_id IS NOT NULL)
);
CREATE UNIQUE INDEX producto_variantes_combinacion_unica ON public.producto_variantes (producto_id, coalesce(color_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(talle_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX producto_variantes_producto ON public.producto_variantes(producto_id);

CREATE OR REPLACE FUNCTION public.validar_comercio_producto_variante()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_comercio uuid; v_atributo uuid;
BEGIN
  SELECT comercio_id INTO v_comercio FROM public.productos WHERE id = NEW.producto_id;
  IF NEW.color_id IS NOT NULL THEN SELECT comercio_id INTO v_atributo FROM public.producto_colores WHERE id = NEW.color_id; IF v_atributo IS DISTINCT FROM v_comercio THEN RAISE EXCEPTION 'El color no pertenece al comercio del producto'; END IF; END IF;
  IF NEW.talle_id IS NOT NULL THEN SELECT comercio_id INTO v_atributo FROM public.producto_talles WHERE id = NEW.talle_id; IF v_atributo IS DISTINCT FROM v_comercio THEN RAISE EXCEPTION 'El talle no pertenece al comercio del producto'; END IF; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER validar_comercio_producto_variante BEFORE INSERT OR UPDATE ON public.producto_variantes FOR EACH ROW EXECUTE FUNCTION public.validar_comercio_producto_variante();
CREATE TRIGGER actualizar_producto_variantes_updated_at BEFORE UPDATE ON public.producto_variantes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- El stock del producto es siempre la suma de las variantes cuando éstas existen.
CREATE OR REPLACE FUNCTION public.sincronizar_stock_producto_variantes()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_producto_id uuid := coalesce(NEW.producto_id, OLD.producto_id);
BEGIN
  UPDATE public.productos SET stock = coalesce((SELECT sum(stock) FROM public.producto_variantes WHERE producto_id = v_producto_id), 0) WHERE id = v_producto_id;
  RETURN coalesce(NEW, OLD);
END; $$;
CREATE TRIGGER sincronizar_stock_producto_variantes AFTER INSERT OR UPDATE OF stock OR DELETE ON public.producto_variantes FOR EACH ROW EXECUTE FUNCTION public.sincronizar_stock_producto_variantes();

ALTER TABLE public.producto_variantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY producto_variantes_tenant ON public.producto_variantes FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.productos p WHERE p.id = producto_id AND public.user_belongs_to_comercio(p.comercio_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.productos p WHERE p.id = producto_id AND public.user_belongs_to_comercio(p.comercio_id)));

ALTER TABLE public.venta_items ADD COLUMN IF NOT EXISTS producto_variante_id uuid REFERENCES public.producto_variantes(id) ON DELETE RESTRICT;
ALTER TABLE public.pedido_online_items ADD COLUMN IF NOT EXISTS producto_variante_id uuid REFERENCES public.producto_variantes(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS venta_items_variante ON public.venta_items(producto_variante_id) WHERE producto_variante_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pedido_online_items_variante ON public.pedido_online_items(producto_variante_id) WHERE producto_variante_id IS NOT NULL;

-- Mantiene la compatibilidad con productos sin variantes y descuenta la variante elegida cuando existe.
CREATE OR REPLACE FUNCTION public.apply_venta_item_stock()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected_rows integer;
BEGIN
  IF current_setting('app.skip_stock_movements', true) = 'on' THEN RETURN coalesce(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    IF OLD.producto_variante_id IS NOT NULL THEN
      UPDATE public.producto_variantes SET stock = stock + OLD.cantidad WHERE id = OLD.producto_variante_id;
    ELSIF OLD.producto_id IS NOT NULL THEN
      UPDATE public.productos SET stock = stock + OLD.cantidad WHERE id = OLD.producto_id;
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.producto_variante_id IS NOT NULL THEN
      UPDATE public.producto_variantes SET stock = stock - NEW.cantidad WHERE id = NEW.producto_variante_id AND stock >= NEW.cantidad;
      GET DIAGNOSTICS affected_rows = ROW_COUNT;
    ELSIF NEW.producto_id IS NOT NULL THEN
      UPDATE public.productos SET stock = stock - NEW.cantidad WHERE id = NEW.producto_id AND stock >= NEW.cantidad;
      GET DIAGNOSTICS affected_rows = ROW_COUNT;
    ELSE
      affected_rows := 1;
    END IF;
    IF affected_rows = 0 THEN RAISE EXCEPTION 'Stock insuficiente para el producto o variante seleccionada'; END IF;
  END IF;
  RETURN coalesce(NEW, OLD);
END; $$;

-- La tienda consume la lista de variantes con stock. El frontend debe enviar variante_id al reservar.
CREATE OR REPLACE VIEW public.tienda_productos AS
SELECT p.id, p.comercio_id, p.cod_producto, p.descripcion, p.precio_venta, p.stock, p.tipo_moneda, p.observaciones, p.created_at,
  r.nombre AS rubro_nombre, m.nombre AS marca_nombre, sr.nombre AS subrubro_nombre, p.destacado_en_tienda,
  (SELECT pi.storage_path FROM public.producto_imagenes pi WHERE pi.producto_id=p.id ORDER BY pi.orden LIMIT 1) AS imagen_path,
  coalesce((SELECT array_agg(pi.storage_path ORDER BY pi.orden) FROM public.producto_imagenes pi WHERE pi.producto_id=p.id), ARRAY[]::text[]) AS imagen_paths,
  p.descripcion_tienda_html,
  CASE WHEN coalesce((cp.parametros->'funciones'->>'talles_colores_productos')::boolean,false) THEN coalesce((SELECT array_agg(c.nombre ORDER BY c.nombre) FROM public.producto_colores_asignados a JOIN public.producto_colores c ON c.id=a.color_id WHERE a.producto_id=p.id),ARRAY[]::text[]) ELSE ARRAY[]::text[] END AS colores,
  CASE WHEN coalesce((cp.parametros->'funciones'->>'talles_colores_productos')::boolean,false) THEN coalesce((SELECT array_agg(t.nombre ORDER BY t.nombre) FROM public.producto_talles_asignados a JOIN public.producto_talles t ON t.id=a.talle_id WHERE a.producto_id=p.id),ARRAY[]::text[]) ELSE ARRAY[]::text[] END AS talles,
  CASE WHEN coalesce((cp.parametros->'funciones'->>'talles_colores_productos')::boolean,false) THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'color_id',v.color_id,'color',c.nombre,'talle_id',v.talle_id,'talle',t.nombre,'stock',v.stock) ORDER BY c.nombre NULLS FIRST,t.nombre NULLS FIRST) FROM public.producto_variantes v LEFT JOIN public.producto_colores c ON c.id=v.color_id LEFT JOIN public.producto_talles t ON t.id=v.talle_id WHERE v.producto_id=p.id AND v.stock>0),'[]'::jsonb) ELSE '[]'::jsonb END AS variantes
FROM public.productos p LEFT JOIN public.rubros r ON r.id=p.rubro_id LEFT JOIN public.subrubros sr ON sr.id=p.subrubro_id LEFT JOIN public.marcas m ON m.id=p.marca_id LEFT JOIN public.comercio_parametrizacion cp ON cp.comercio_id=p.comercio_id
WHERE p.visible_en_tienda=true AND p.stock>0;
GRANT SELECT ON public.tienda_productos TO anon, authenticated;

-- La misma API de la tienda acepta opcionalmente variante_id en cada item.
-- Si se omite, conserva el comportamiento para productos sin variantes.
CREATE OR REPLACE FUNCTION public.crear_pedido_online(p_cliente jsonb, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_comercio uuid;
  v_pedido public.pedidos_online;
  v_item jsonb;
  v_producto public.productos;
  v_variante public.producto_variantes;
  v_total numeric := 0;
  v_cliente_id uuid;
  v_email text := lower(btrim(coalesce(p_cliente->>'email','')));
  v_entrega text := lower(btrim(coalesce(p_cliente->>'entrega','retiro')));
  v_descripcion text;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'El carrito esta vacio'; END IF;
  IF nullif(btrim(p_cliente->>'nombre'),'') IS NULL OR nullif(btrim(p_cliente->>'telefono'),'') IS NULL OR nullif(v_email,'') IS NULL THEN RAISE EXCEPTION 'Complete nombre, correo electronico y telefono'; END IF;
  SELECT comercio_id INTO v_comercio FROM public.productos WHERE id=(p_items->0->>'producto_id')::uuid;
  IF v_comercio IS NULL THEN RAISE EXCEPTION 'Producto no disponible'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_producto FROM public.productos WHERE id=(v_item->>'producto_id')::uuid FOR UPDATE;
    IF v_producto.id IS NULL OR v_producto.comercio_id<>v_comercio OR NOT v_producto.visible_en_tienda OR (v_item->>'cantidad')::integer<=0 THEN RAISE EXCEPTION 'Producto no disponible'; END IF;
    IF nullif(v_item->>'variante_id','') IS NOT NULL THEN
      SELECT * INTO v_variante FROM public.producto_variantes WHERE id=(v_item->>'variante_id')::uuid AND producto_id=v_producto.id FOR UPDATE;
      IF v_variante.id IS NULL OR v_variante.stock<(v_item->>'cantidad')::integer THEN RAISE EXCEPTION 'Stock insuficiente para la variante seleccionada'; END IF;
    ELSIF EXISTS (SELECT 1 FROM public.producto_variantes WHERE producto_id=v_producto.id) THEN
      RAISE EXCEPTION 'Seleccione color y talle para %', v_producto.descripcion;
    ELSIF v_producto.stock<(v_item->>'cantidad')::integer THEN RAISE EXCEPTION 'Stock insuficiente para %', v_producto.descripcion;
    END IF;
    v_total:=v_total+v_producto.precio_venta*(v_item->>'cantidad')::integer;
  END LOOP;

  SELECT cliente_id INTO v_cliente_id FROM public.cliente_usuarios WHERE comercio_id=v_comercio AND user_id=v_user;
  IF v_cliente_id IS NULL THEN
    SELECT id INTO v_cliente_id FROM public.clientes WHERE comercio_id=v_comercio AND lower(btrim(email))=v_email ORDER BY created_at LIMIT 1;
  END IF;
  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes(comercio_id,nombre,apellido,cuit,calle,numero,codigo_postal,localidad,provincia,telefono,email,situacion_afip,tipo_persona)
    VALUES(v_comercio,btrim(p_cliente->>'nombre'),'','',btrim(coalesce(p_cliente->>'direccion','')),'','',btrim(coalesce(p_cliente->>'localidad','')),'',btrim(p_cliente->>'telefono'),v_email,'Consumidor Final','fisica') RETURNING id INTO v_cliente_id;
  END IF;
  INSERT INTO public.pedidos_online(comercio_id,cliente_id,cliente_user_id,cliente_nombre,cliente_email,cliente_telefono,cliente_direccion,observaciones,total)
  VALUES(v_comercio,v_cliente_id,v_user,btrim(p_cliente->>'nombre'),v_email,btrim(p_cliente->>'telefono'),CASE WHEN v_entrega='envio' THEN concat_ws(', ',btrim(p_cliente->>'direccion'),btrim(p_cliente->>'localidad')) ELSE 'Retiro en el local' END,nullif(btrim(p_cliente->>'observaciones'),''),v_total) RETURNING * INTO v_pedido;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_producto FROM public.productos WHERE id=(v_item->>'producto_id')::uuid;
    v_descripcion:=v_producto.descripcion;
    IF nullif(v_item->>'variante_id','') IS NOT NULL THEN
      SELECT * INTO v_variante FROM public.producto_variantes WHERE id=(v_item->>'variante_id')::uuid;
      v_descripcion:=v_descripcion||' ('||coalesce((SELECT nombre FROM public.producto_colores WHERE id=v_variante.color_id)||' ','')||coalesce((SELECT nombre FROM public.producto_talles WHERE id=v_variante.talle_id),'')||')';
      INSERT INTO public.pedido_online_items(pedido_id,producto_id,producto_variante_id,descripcion,cantidad,precio_unitario,subtotal) VALUES(v_pedido.id,v_producto.id,v_variante.id,v_descripcion,(v_item->>'cantidad')::integer,v_producto.precio_venta,v_producto.precio_venta*(v_item->>'cantidad')::integer);
      UPDATE public.producto_variantes SET stock=stock-(v_item->>'cantidad')::integer WHERE id=v_variante.id;
    ELSE
      INSERT INTO public.pedido_online_items(pedido_id,producto_id,descripcion,cantidad,precio_unitario,subtotal) VALUES(v_pedido.id,v_producto.id,v_descripcion,(v_item->>'cantidad')::integer,v_producto.precio_venta,v_producto.precio_venta*(v_item->>'cantidad')::integer);
      UPDATE public.productos SET stock=stock-(v_item->>'cantidad')::integer WHERE id=v_producto.id;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('id',v_pedido.id,'numero',v_pedido.numero,'total',v_total,'estado',v_pedido.estado,'cliente_id',v_cliente_id);
END; $$;

CREATE OR REPLACE FUNCTION public.actualizar_estado_pedido_online(p_pedido_id uuid,p_estado text)
RETURNS public.pedidos_online LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_pedido public.pedidos_online; v_item record;
BEGIN
  SELECT * INTO v_pedido FROM public.pedidos_online WHERE id=p_pedido_id FOR UPDATE;
  IF v_pedido.id IS NULL OR NOT public.user_belongs_to_comercio(v_pedido.comercio_id) THEN RAISE EXCEPTION 'Pedido no autorizado'; END IF;
  IF p_estado NOT IN ('recibido','confirmado','preparando','listo','entregado','cancelado') OR v_pedido.estado='cancelado' THEN RAISE EXCEPTION 'Estado invalido'; END IF;
  IF p_estado='cancelado' THEN FOR v_item IN SELECT producto_id,producto_variante_id,cantidad FROM public.pedido_online_items WHERE pedido_id=p_pedido_id LOOP
    IF v_item.producto_variante_id IS NULL THEN UPDATE public.productos SET stock=stock+v_item.cantidad WHERE id=v_item.producto_id; ELSE UPDATE public.producto_variantes SET stock=stock+v_item.cantidad WHERE id=v_item.producto_variante_id; END IF;
  END LOOP; END IF;
  UPDATE public.pedidos_online SET estado=p_estado WHERE id=p_pedido_id RETURNING * INTO v_pedido; RETURN v_pedido;
END; $$;

REVOKE ALL ON FUNCTION public.crear_pedido_online(jsonb,jsonb),public.actualizar_estado_pedido_online(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_pedido_online(jsonb,jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_estado_pedido_online(uuid,text) TO authenticated;
