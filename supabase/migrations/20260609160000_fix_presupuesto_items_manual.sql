-- Corrige instalaciones donde presupuesto_items se creo antes de admitir
-- items manuales sin una referencia al catalogo de productos.

ALTER TABLE public.presupuesto_items
  ALTER COLUMN producto_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS descripcion_manual text,
  ADD COLUMN IF NOT EXISTS codigo_manual text;

ALTER TABLE public.presupuesto_items
  DROP CONSTRAINT IF EXISTS presupuesto_items_producto_o_descripcion_check;

ALTER TABLE public.presupuesto_items
  ADD CONSTRAINT presupuesto_items_producto_o_descripcion_check
  CHECK (
    producto_id IS NOT NULL
    OR length(trim(coalesce(descripcion_manual, ''))) > 0
  );
