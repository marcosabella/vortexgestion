-- Catálogos por comercio y múltiples talles/colores por producto.
CREATE TABLE public.producto_colores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.producto_talles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX producto_colores_nombre_comercio_unico ON public.producto_colores (comercio_id, lower(nombre));
CREATE UNIQUE INDEX producto_talles_nombre_comercio_unico ON public.producto_talles (comercio_id, lower(nombre));

CREATE TABLE public.producto_colores_asignados (
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  color_id uuid NOT NULL REFERENCES public.producto_colores(id) ON DELETE CASCADE,
  PRIMARY KEY (producto_id, color_id)
);

CREATE TABLE public.producto_talles_asignados (
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  talle_id uuid NOT NULL REFERENCES public.producto_talles(id) ON DELETE CASCADE,
  PRIMARY KEY (producto_id, talle_id)
);

CREATE OR REPLACE FUNCTION public.validar_comercio_atributo_producto()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  comercio_producto uuid;
  comercio_atributo uuid;
BEGIN
  SELECT comercio_id INTO comercio_producto FROM public.productos WHERE id = NEW.producto_id;
  IF TG_TABLE_NAME = 'producto_colores_asignados' THEN
    SELECT comercio_id INTO comercio_atributo FROM public.producto_colores WHERE id = NEW.color_id;
  ELSE
    SELECT comercio_id INTO comercio_atributo FROM public.producto_talles WHERE id = NEW.talle_id;
  END IF;
  IF comercio_producto IS NULL OR comercio_atributo IS NULL OR comercio_producto <> comercio_atributo THEN
    RAISE EXCEPTION 'El talle o color debe pertenecer al mismo comercio que el producto';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validar_comercio_producto_color BEFORE INSERT OR UPDATE ON public.producto_colores_asignados
FOR EACH ROW EXECUTE FUNCTION public.validar_comercio_atributo_producto();
CREATE TRIGGER validar_comercio_producto_talle BEFORE INSERT OR UPDATE ON public.producto_talles_asignados
FOR EACH ROW EXECUTE FUNCTION public.validar_comercio_atributo_producto();

ALTER TABLE public.producto_colores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_talles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_colores_asignados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_talles_asignados ENABLE ROW LEVEL SECURITY;

CREATE POLICY producto_colores_tenant ON public.producto_colores FOR ALL TO authenticated
USING (public.user_belongs_to_comercio(comercio_id)) WITH CHECK (public.user_belongs_to_comercio(comercio_id));
CREATE POLICY producto_talles_tenant ON public.producto_talles FOR ALL TO authenticated
USING (public.user_belongs_to_comercio(comercio_id)) WITH CHECK (public.user_belongs_to_comercio(comercio_id));
CREATE POLICY producto_colores_asignados_tenant ON public.producto_colores_asignados FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.productos p WHERE p.id = producto_id AND public.user_belongs_to_comercio(p.comercio_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.productos p WHERE p.id = producto_id AND public.user_belongs_to_comercio(p.comercio_id)));
CREATE POLICY producto_talles_asignados_tenant ON public.producto_talles_asignados FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.productos p WHERE p.id = producto_id AND public.user_belongs_to_comercio(p.comercio_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.productos p WHERE p.id = producto_id AND public.user_belongs_to_comercio(p.comercio_id)));

-- El catálogo público recibe las variantes sólo si esta función está habilitada para el comercio.
CREATE OR REPLACE VIEW public.tienda_productos AS
SELECT
  p.id, p.comercio_id, p.cod_producto, p.descripcion, p.precio_venta, p.stock, p.tipo_moneda,
  p.observaciones, p.created_at, r.nombre AS rubro_nombre, m.nombre AS marca_nombre,
  sr.nombre AS subrubro_nombre, p.destacado_en_tienda,
  (SELECT pi.storage_path FROM public.producto_imagenes pi WHERE pi.producto_id = p.id ORDER BY pi.orden LIMIT 1) AS imagen_path,
  COALESCE((SELECT array_agg(pi.storage_path ORDER BY pi.orden) FROM public.producto_imagenes pi WHERE pi.producto_id = p.id), ARRAY[]::text[]) AS imagen_paths,
  p.descripcion_tienda_html,
  CASE WHEN COALESCE((cp.parametros -> 'funciones' ->> 'talles_colores_productos')::boolean, false)
    THEN COALESCE((SELECT array_agg(c.nombre ORDER BY c.nombre) FROM public.producto_colores_asignados pca JOIN public.producto_colores c ON c.id = pca.color_id WHERE pca.producto_id = p.id), ARRAY[]::text[])
    ELSE ARRAY[]::text[] END AS colores,
  CASE WHEN COALESCE((cp.parametros -> 'funciones' ->> 'talles_colores_productos')::boolean, false)
    THEN COALESCE((SELECT array_agg(t.nombre ORDER BY t.nombre) FROM public.producto_talles_asignados pta JOIN public.producto_talles t ON t.id = pta.talle_id WHERE pta.producto_id = p.id), ARRAY[]::text[])
    ELSE ARRAY[]::text[] END AS talles
FROM public.productos p
LEFT JOIN public.rubros r ON r.id = p.rubro_id
LEFT JOIN public.subrubros sr ON sr.id = p.subrubro_id
LEFT JOIN public.marcas m ON m.id = p.marca_id
LEFT JOIN public.comercio_parametrizacion cp ON cp.comercio_id = p.comercio_id
WHERE p.visible_en_tienda = true AND p.stock > 0;

GRANT SELECT ON public.tienda_productos TO anon, authenticated;
