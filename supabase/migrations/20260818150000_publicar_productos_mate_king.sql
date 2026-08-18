-- Publica en la tienda los productos existentes de MATE KING que tienen stock.
-- La columna visible_en_tienda se agrego con DEFAULT false, por lo que los
-- productos cargados antes de habilitar la tienda quedaron ocultos.
UPDATE public.productos
SET visible_en_tienda = true
WHERE comercio_id = '30e79cd0-360d-4a03-b634-bb7414ee505b'
  AND stock > 0
  AND visible_en_tienda = false;
