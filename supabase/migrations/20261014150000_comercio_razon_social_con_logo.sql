-- Preferencia de presentación del comercio. Conserva RLS y permisos existentes.
BEGIN;
ALTER TABLE public.comercio ADD COLUMN mostrar_razon_social_con_logo boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.comercio.mostrar_razon_social_con_logo IS 'Imprime nombre o razón social junto al logo en los documentos del comercio.';
NOTIFY pgrst, 'reload schema';
COMMIT;
