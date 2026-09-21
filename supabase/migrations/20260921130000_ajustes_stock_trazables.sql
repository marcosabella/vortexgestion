CREATE TABLE public.ajustes_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  cantidad integer NOT NULL CHECK(cantidad <> 0), motivo text NOT NULL CHECK(motivo IN ('inventario','merma','rotura','devolucion','correccion','otro')),
  observaciones text, usuario_id uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ajustes_stock_producto ON public.ajustes_stock(comercio_id,producto_id,created_at DESC);
ALTER TABLE public.ajustes_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY ajustes_stock_select ON public.ajustes_stock FOR SELECT TO authenticated USING(public.user_belongs_to_comercio(comercio_id));
CREATE OR REPLACE FUNCTION public.registrar_ajuste_stock(p_producto_id uuid,p_cantidad integer,p_motivo text,p_observaciones text DEFAULT NULL)
RETURNS public.ajustes_stock LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.productos; a public.ajustes_stock;
BEGIN SELECT * INTO p FROM public.productos WHERE id=p_producto_id FOR UPDATE;
 IF NOT FOUND OR NOT public.user_belongs_to_comercio(p.comercio_id) OR p_cantidad=0 OR p_motivo NOT IN ('inventario','merma','rotura','devolucion','correccion','otro') THEN RAISE EXCEPTION 'ajuste_stock_invalido'; END IF;
 IF p.stock+p_cantidad<0 THEN RAISE EXCEPTION 'ajuste_stock_insuficiente'; END IF;
 UPDATE public.productos SET stock=stock+p_cantidad WHERE id=p.id;
 INSERT INTO public.ajustes_stock(comercio_id,producto_id,cantidad,motivo,observaciones) VALUES(p.comercio_id,p.id,p_cantidad,p_motivo,nullif(trim(p_observaciones),'')) RETURNING * INTO a;
 RETURN a;
END; $$;
REVOKE ALL ON TABLE public.ajustes_stock FROM authenticated;
GRANT SELECT ON TABLE public.ajustes_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_ajuste_stock(uuid,integer,text,text) TO authenticated;
