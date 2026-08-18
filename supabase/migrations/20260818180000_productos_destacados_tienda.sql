-- Permite seleccionar productos destacados para la portada de la tienda.
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS destacado_en_tienda boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_productos_destacados_tienda
  ON public.productos (comercio_id, destacado_en_tienda)
  WHERE destacado_en_tienda = true;

-- Mantiene las columnas existentes y agrega al final el indicador y la portada.
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
  ) AS imagen_path
FROM public.productos p
LEFT JOIN public.rubros r ON r.id = p.rubro_id
LEFT JOIN public.subrubros sr ON sr.id = p.subrubro_id
LEFT JOIN public.marcas m ON m.id = p.marca_id
WHERE p.comercio_id = '30e79cd0-360d-4a03-b634-bb7414ee505b'
  AND p.visible_en_tienda = true
  AND p.stock > 0;

GRANT SELECT ON public.tienda_productos TO anon, authenticated;
