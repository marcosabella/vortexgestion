ALTER TABLE public.extintores
  ADD COLUMN IF NOT EXISTS area text;

CREATE INDEX IF NOT EXISTS idx_extintores_comercio_area
  ON public.extintores(comercio_id, area);
