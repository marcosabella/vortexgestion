-- Eliminar trigger existente si existe
DROP TRIGGER IF EXISTS update_afip_config_updated_at ON public.afip_config;

-- Crear tabla de configuración AFIP si no existe
CREATE TABLE IF NOT EXISTS public.afip_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  punto_venta INTEGER NOT NULL,
  cuit_emisor TEXT NOT NULL,
  ambiente TEXT NOT NULL DEFAULT 'homologacion',
  certificado_crt TEXT,
  certificado_key TEXT,
  nombre_certificado_crt TEXT,
  nombre_certificado_key TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.afip_config ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes si existen
DROP POLICY IF EXISTS "Usuarios pueden ver configuración AFIP" ON public.afip_config;
DROP POLICY IF EXISTS "Usuarios pueden insertar configuración AFIP" ON public.afip_config;
DROP POLICY IF EXISTS "Usuarios pueden actualizar configuración AFIP" ON public.afip_config;
DROP POLICY IF EXISTS "Usuarios pueden eliminar configuración AFIP" ON public.afip_config;

-- Crear políticas RLS
CREATE POLICY "Usuarios pueden ver configuración AFIP"
  ON public.afip_config
  FOR SELECT
  USING (true);

CREATE POLICY "Usuarios pueden insertar configuración AFIP"
  ON public.afip_config
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Usuarios pueden actualizar configuración AFIP"
  ON public.afip_config
  FOR UPDATE
  USING (true);

CREATE POLICY "Usuarios pueden eliminar configuración AFIP"
  ON public.afip_config
  FOR DELETE
  USING (true);

-- Crear trigger para actualizar updated_at
CREATE TRIGGER update_afip_config_updated_at
  BEFORE UPDATE ON public.afip_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();