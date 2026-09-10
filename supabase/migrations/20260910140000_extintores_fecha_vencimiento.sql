ALTER TABLE public.extintores ADD COLUMN IF NOT EXISTS fecha_vencimiento date;
CREATE INDEX IF NOT EXISTS idx_extintores_comercio_vencimiento ON public.extintores(comercio_id, fecha_vencimiento);
