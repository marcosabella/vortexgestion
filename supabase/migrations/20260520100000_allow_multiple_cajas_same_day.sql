DROP INDEX IF EXISTS public.idx_cajas_diarias_comercio_fecha;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cajas_diarias_comercio_fecha_abierta
ON public.cajas_diarias(comercio_id, fecha)
WHERE comercio_id IS NOT NULL AND estado = 'abierta';
