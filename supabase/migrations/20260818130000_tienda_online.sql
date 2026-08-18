-- Productos que el comercio decide publicar en la tienda online.
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS visible_en_tienda boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_productos_tienda_publicados
  ON public.productos (comercio_id, visible_en_tienda)
  WHERE visible_en_tienda = true;

-- Vista pública: no expone costo, proveedor ni otros datos internos.
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
  m.nombre AS marca_nombre
FROM public.productos p
LEFT JOIN public.rubros r ON r.id = p.rubro_id
LEFT JOIN public.marcas m ON m.id = p.marca_id
WHERE p.visible_en_tienda = true AND p.stock > 0;

GRANT SELECT ON public.tienda_productos TO anon, authenticated;

-- Solo se hacen públicas las imágenes de productos publicados.
DROP POLICY IF EXISTS "Publico puede ver imagenes de productos publicados" ON storage.objects;
CREATE POLICY "Publico puede ver imagenes de productos publicados"
ON storage.objects FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'producto-imagenes'
  AND EXISTS (
    SELECT 1
    FROM public.producto_imagenes pi
    JOIN public.productos p ON p.id = pi.producto_id
    WHERE pi.storage_path = name
      AND p.visible_en_tienda = true
      AND p.stock > 0
  )
);
