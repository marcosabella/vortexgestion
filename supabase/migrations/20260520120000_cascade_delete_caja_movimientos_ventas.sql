ALTER TABLE public.caja_movimientos
DROP CONSTRAINT IF EXISTS caja_movimientos_venta_id_fkey;

ALTER TABLE public.caja_movimientos
ADD CONSTRAINT caja_movimientos_venta_id_fkey
FOREIGN KEY (venta_id)
REFERENCES public.ventas(id)
ON DELETE CASCADE;
