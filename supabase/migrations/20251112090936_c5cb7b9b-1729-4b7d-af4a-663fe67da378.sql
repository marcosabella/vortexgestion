-- Agregar campos para CAE de AFIP a la tabla ventas
ALTER TABLE public.ventas
ADD COLUMN IF NOT EXISTS cae character varying,
ADD COLUMN IF NOT EXISTS cae_vencimiento date,
ADD COLUMN IF NOT EXISTS cae_solicitado_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS cae_error text;

COMMENT ON COLUMN public.ventas.cae IS 'Código de Autorización Electrónico de AFIP';
COMMENT ON COLUMN public.ventas.cae_vencimiento IS 'Fecha de vencimiento del CAE';
COMMENT ON COLUMN public.ventas.cae_solicitado_at IS 'Fecha y hora en que se solicitó el CAE';
COMMENT ON COLUMN public.ventas.cae_error IS 'Mensaje de error si falla la solicitud del CAE';