ALTER TABLE public.extintores
  DROP CONSTRAINT IF EXISTS extintores_comercio_id_numero_extintor_key;

CREATE INDEX IF NOT EXISTS idx_extintores_comercio_cliente_numero
  ON public.extintores(comercio_id, cliente_id, numero_extintor);
