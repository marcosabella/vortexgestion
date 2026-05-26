ALTER TABLE public.caja_movimientos
ADD COLUMN IF NOT EXISTS venta_id uuid REFERENCES public.ventas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_caja_movimientos_venta_id
ON public.caja_movimientos(venta_id)
WHERE venta_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_caja_movimientos_venta_id_unica
ON public.caja_movimientos(venta_id)
WHERE venta_id IS NOT NULL;
