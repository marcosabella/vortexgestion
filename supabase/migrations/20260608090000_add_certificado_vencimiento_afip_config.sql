ALTER TABLE public.afip_config
ADD COLUMN IF NOT EXISTS certificado_vencimiento DATE,
ADD COLUMN IF NOT EXISTS certificado_vigente BOOLEAN;
