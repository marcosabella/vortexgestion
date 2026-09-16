ALTER TABLE public.extintores
  ADD COLUMN IF NOT EXISTS patente text;

CREATE INDEX IF NOT EXISTS idx_extintores_comercio_patente
  ON public.extintores(comercio_id, patente);
