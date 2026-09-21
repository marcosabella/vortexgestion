-- Etapa 1: ordenes de compra y recepcion transaccional de mercaderia.
-- Las facturas, pagos y cuenta corriente de proveedores se incorporan en una etapa posterior.

CREATE TABLE public.compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  proveedor_id uuid NOT NULL REFERENCES public.proveedores(id) ON DELETE RESTRICT,
  numero text NOT NULL,
  fecha date NOT NULL DEFAULT current_date,
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'enviada', 'parcial', 'recibida', 'cancelada')),
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comercio_id, numero)
);

CREATE TABLE public.compra_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  compra_id uuid NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  descripcion text NOT NULL,
  cantidad_solicitada numeric(14,3) NOT NULL CHECK (cantidad_solicitada > 0 AND cantidad_solicitada = trunc(cantidad_solicitada)),
  cantidad_recibida numeric(14,3) NOT NULL DEFAULT 0 CHECK (cantidad_recibida >= 0 AND cantidad_recibida <= cantidad_solicitada),
  costo_unitario numeric(14,2) NOT NULL CHECK (costo_unitario >= 0),
  porcentaje_iva numeric(7,3) NOT NULL DEFAULT 0 CHECK (porcentaje_iva >= 0),
  actualizar_costo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (compra_id, producto_id)
);

CREATE INDEX idx_compras_comercio_fecha ON public.compras(comercio_id, fecha DESC);
CREATE INDEX idx_compras_comercio_estado ON public.compras(comercio_id, estado);
CREATE INDEX idx_compra_items_compra ON public.compra_items(compra_id);
CREATE INDEX idx_compra_items_producto ON public.compra_items(comercio_id, producto_id);

ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compra_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY compras_select_por_comercio ON public.compras FOR SELECT TO authenticated USING (public.user_belongs_to_comercio(comercio_id));
CREATE POLICY compra_items_select_por_comercio ON public.compra_items FOR SELECT TO authenticated USING (public.user_belongs_to_comercio(comercio_id));

CREATE OR REPLACE FUNCTION public.crear_compra(
  p_comercio_id uuid,
  p_proveedor_id uuid,
  p_fecha date,
  p_observaciones text,
  p_items jsonb
)
RETURNS public.compras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_compra public.compras;
  v_item jsonb;
  v_producto public.productos;
  v_numero text;
BEGIN
  IF NOT public.user_belongs_to_comercio(p_comercio_id) THEN RAISE EXCEPTION 'compras_comercio_no_autorizado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.proveedores WHERE id=p_proveedor_id AND comercio_id=p_comercio_id) THEN RAISE EXCEPTION 'compras_proveedor_no_disponible'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'compras_items_requeridos'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) x GROUP BY x->>'producto_id' HAVING count(*) > 1) THEN RAISE EXCEPTION 'compras_producto_repetido'; END IF;

  v_numero := 'OC-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
  INSERT INTO public.compras(comercio_id, proveedor_id, numero, fecha, observaciones)
  VALUES(p_comercio_id, p_proveedor_id, v_numero, coalesce(p_fecha,current_date), nullif(trim(p_observaciones),''))
  RETURNING * INTO v_compra;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_producto FROM public.productos WHERE id=(v_item->>'producto_id')::uuid AND comercio_id=p_comercio_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'compras_producto_no_disponible'; END IF;
    IF coalesce((v_item->>'cantidad_solicitada')::numeric,0) <= 0 OR coalesce((v_item->>'costo_unitario')::numeric,-1) < 0 THEN RAISE EXCEPTION 'compras_item_invalido'; END IF;
    INSERT INTO public.compra_items(comercio_id, compra_id, producto_id, descripcion, cantidad_solicitada, costo_unitario, porcentaje_iva, actualizar_costo)
    VALUES(p_comercio_id, v_compra.id, v_producto.id, v_producto.descripcion, (v_item->>'cantidad_solicitada')::numeric, (v_item->>'costo_unitario')::numeric, coalesce((v_item->>'porcentaje_iva')::numeric,v_producto.porcentaje_iva,0), coalesce((v_item->>'actualizar_costo')::boolean,true));
  END LOOP;
  RETURN v_compra;
END;
$$;

CREATE OR REPLACE FUNCTION public.cambiar_estado_compra(p_compra_id uuid, p_estado text)
RETURNS public.compras
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_compra public.compras;
BEGIN
  SELECT * INTO v_compra FROM public.compras WHERE id=p_compra_id FOR UPDATE;
  IF NOT FOUND OR NOT public.user_belongs_to_comercio(v_compra.comercio_id) THEN RAISE EXCEPTION 'compra_no_disponible'; END IF;
  IF p_estado NOT IN ('enviada','cancelada') OR v_compra.estado NOT IN ('borrador','enviada') THEN RAISE EXCEPTION 'compras_transicion_invalida'; END IF;
  UPDATE public.compras SET estado=p_estado WHERE id=v_compra.id RETURNING * INTO v_compra;
  RETURN v_compra;
END;
$$;

CREATE OR REPLACE FUNCTION public.recepcionar_compra_item(p_compra_item_id uuid, p_cantidad numeric, p_actualizar_costo boolean DEFAULT true)
RETURNS public.compras
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_item public.compra_items; v_compra public.compras; v_pendiente numeric; v_estado text;
BEGIN
  SELECT i.* INTO v_item FROM public.compra_items i WHERE i.id=p_compra_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'compra_item_no_disponible'; END IF;
  SELECT * INTO v_compra FROM public.compras WHERE id=v_item.compra_id FOR UPDATE;
  IF NOT public.user_belongs_to_comercio(v_compra.comercio_id) OR v_compra.estado IN ('recibida','cancelada') THEN RAISE EXCEPTION 'compra_no_recepcionable'; END IF;
  v_pendiente := v_item.cantidad_solicitada-v_item.cantidad_recibida;
  IF p_cantidad <= 0 OR p_cantidad <> trunc(p_cantidad) OR p_cantidad > v_pendiente THEN RAISE EXCEPTION 'compras_cantidad_recepcion_invalida'; END IF;
  UPDATE public.compra_items SET cantidad_recibida=cantidad_recibida+p_cantidad WHERE id=v_item.id;
  UPDATE public.productos SET stock=stock+p_cantidad::integer, precio_costo=CASE WHEN p_actualizar_costo AND v_item.actualizar_costo THEN v_item.costo_unitario ELSE precio_costo END WHERE id=v_item.producto_id AND comercio_id=v_compra.comercio_id;
  SELECT CASE WHEN bool_and(cantidad_recibida=cantidad_solicitada) THEN 'recibida' ELSE 'parcial' END INTO v_estado FROM public.compra_items WHERE compra_id=v_compra.id;
  UPDATE public.compras SET estado=v_estado WHERE id=v_compra.id RETURNING * INTO v_compra;
  RETURN v_compra;
END;
$$;

REVOKE ALL ON TABLE public.compras, public.compra_items FROM authenticated;
GRANT SELECT ON TABLE public.compras, public.compra_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_compra(uuid,uuid,date,text,jsonb), public.cambiar_estado_compra(uuid,text), public.recepcionar_compra_item(uuid,numeric,boolean) TO authenticated;
