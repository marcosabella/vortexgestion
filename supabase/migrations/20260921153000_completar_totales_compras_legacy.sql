-- Reparación de cabeceras creadas por el flujo inicial de órdenes, sin volver a afectar stock.
UPDATE public.compra_items
SET subtotal = round(cantidad_recibida * costo_unitario, 2),
    total = round(cantidad_recibida * costo_unitario, 2)
WHERE subtotal = 0 AND total = 0 AND cantidad_recibida > 0;

WITH totales AS (
  SELECT compra_id, round(sum(cantidad_recibida * costo_unitario), 2) AS total_items
  FROM public.compra_items
  GROUP BY compra_id
)
UPDATE public.compras c
SET subtotal = t.total_items,
    total = t.total_items
FROM totales t
WHERE c.id = t.compra_id
  AND c.total = 0
  AND t.total_items > 0;
