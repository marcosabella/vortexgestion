ALTER TABLE public.extintores ADD COLUMN sector text;
CREATE INDEX idx_extintores_comercio_sector ON public.extintores(comercio_id, sector);
