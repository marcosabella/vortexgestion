ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS descripcion_tienda_html text;

-- Conserva como descripción inicial las observaciones existentes, escapando HTML.
UPDATE public.productos
SET descripcion_tienda_html = '<p>' ||
  replace(
    replace(
      replace(
        replace(
          replace(observaciones, '&', '&amp;'),
          '<', '&lt;'
        ),
        '>', '&gt;'
      ),
      E'\r\n', '<br>'
    ),
    E'\n', '<br>'
  ) || '</p>'
WHERE nullif(btrim(observaciones), '') IS NOT NULL
  AND nullif(btrim(descripcion_tienda_html), '') IS NULL;

CREATE OR REPLACE VIEW public.tienda_productos AS
SELECT
  p.id,
  p.comercio_id,
  p.cod_producto,
  p.descripcion,
  p.precio_venta,
  p.stock,
  p.tipo_moneda,
  p.observaciones,
  p.created_at,
  r.nombre AS rubro_nombre,
  m.nombre AS marca_nombre,
  sr.nombre AS subrubro_nombre,
  p.destacado_en_tienda,
  (
    SELECT pi.storage_path
    FROM public.producto_imagenes pi
    WHERE pi.producto_id = p.id
    ORDER BY pi.orden
    LIMIT 1
  ) AS imagen_path,
  COALESCE((
    SELECT array_agg(pi.storage_path ORDER BY pi.orden)
    FROM public.producto_imagenes pi
    WHERE pi.producto_id = p.id
  ), ARRAY[]::text[]) AS imagen_paths,
  p.descripcion_tienda_html
FROM public.productos p
LEFT JOIN public.rubros r ON r.id = p.rubro_id
LEFT JOIN public.subrubros sr ON sr.id = p.subrubro_id
LEFT JOIN public.marcas m ON m.id = p.marca_id
WHERE p.comercio_id = '30e79cd0-360d-4a03-b634-bb7414ee505b'
  AND p.visible_en_tienda = true
  AND p.stock > 0;

GRANT SELECT ON public.tienda_productos TO anon, authenticated;
