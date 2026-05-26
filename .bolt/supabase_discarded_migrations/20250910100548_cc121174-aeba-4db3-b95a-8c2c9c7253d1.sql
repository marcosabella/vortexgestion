-- Create enum for account types in Argentina
CREATE TYPE tipo_cuenta_bancaria AS ENUM (
  'CA_PESOS',      -- Cuenta de Ahorro en Pesos
  'CA_USD',        -- Cuenta de Ahorro en USD
  'CC_PESOS',      -- Cuenta Corriente en Pesos
  'CC_USD',        -- Cuenta Corriente en USD
  'CAJA_AHORRO',   -- Caja de Ahorro
  'CUENTA_SUELDO'  -- Cuenta Sueldo
);

-- Create bancos table
CREATE TABLE public.bancos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre_banco VARCHAR NOT NULL,
  sucursal VARCHAR NOT NULL,
  numero_cuenta VARCHAR NOT NULL,
  cbu VARCHAR(22) NOT NULL, -- CBU has exactly 22 digits
  tipo_cuenta tipo_cuenta_bancaria NOT NULL DEFAULT 'CA_PESOS',
  observaciones TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bancos ENABLE ROW LEVEL SECURITY;

-- Create policies for bancos
CREATE POLICY "Usuarios pueden ver todos los bancos" 
ON public.bancos 
FOR SELECT 
USING (true);

CREATE POLICY "Usuarios pueden insertar bancos" 
ON public.bancos 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Usuarios pueden actualizar bancos" 
ON public.bancos 
FOR UPDATE 
USING (true);

CREATE POLICY "Usuarios pueden eliminar bancos" 
ON public.bancos 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_bancos_updated_at
BEFORE UPDATE ON public.bancos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add banco_id to ventas table for transfer payments
ALTER TABLE public.ventas 
ADD COLUMN banco_id UUID REFERENCES public.bancos(id);

-- Create index for better performance
CREATE INDEX idx_bancos_activo ON public.bancos(activo);
CREATE INDEX idx_bancos_nombre ON public.bancos(nombre_banco);
CREATE INDEX idx_ventas_banco_id ON public.ventas(banco_id);