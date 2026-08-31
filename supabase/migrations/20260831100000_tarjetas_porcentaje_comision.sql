-- Comisión que la administradora de la tarjeta descuenta al comercio.
-- Es independiente del recargo de cada plan de cuotas que paga el cliente.
ALTER TABLE public.tarjetas_credito
  ADD COLUMN IF NOT EXISTS porcentaje_comision NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE public.tarjetas_credito
  DROP CONSTRAINT IF EXISTS tarjetas_credito_porcentaje_comision_rango;

ALTER TABLE public.tarjetas_credito
  ADD CONSTRAINT tarjetas_credito_porcentaje_comision_rango
  CHECK (porcentaje_comision >= 0 AND porcentaje_comision <= 100);

COMMENT ON COLUMN public.tarjetas_credito.porcentaje_comision IS
  'Porcentaje descontado al comercio por la administradora en cada cobro con tarjeta.';
