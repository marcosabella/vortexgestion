-- Esta instalación de tienda online pertenece exclusivamente a MATE KING.
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
WHERE p.comercio_id = '30e79cd0-360d-4a03-b634-bb7414ee505b'
  AND p.visible_en_tienda = true
  AND p.stock > 0;
