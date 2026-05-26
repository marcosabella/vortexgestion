/*
  # Módulo de Tarjetas de Crédito

  1. New Tables
    - `tarjetas_credito`
      - `id` (uuid, primary key)
      - `nombre` (text, nombre de la tarjeta)
      - `activa` (boolean, si está activa)
      - `observaciones` (text, opcional)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `tarjeta_cuotas`
      - `id` (uuid, primary key)
      - `tarjeta_id` (uuid, foreign key)
      - `cantidad_cuotas` (integer, número de cuotas)
      - `porcentaje_recargo` (decimal, recargo por cuota)
      - `activa` (boolean, si está activa)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to manage credit cards and installments

  3. Changes
    - Add `tarjeta_id` and `cuotas` fields to ventas table
    - Add `tarjeta_id` and `cuotas` fields to cuenta_corriente table
*/

-- Create tarjetas_credito table
CREATE TABLE IF NOT EXISTS public.tarjetas_credito (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre VARCHAR NOT NULL,
  activa BOOLEAN NOT NULL DEFAULT true,
  observaciones TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tarjeta_cuotas table for installment configuration
CREATE TABLE IF NOT EXISTS public.tarjeta_cuotas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tarjeta_id UUID NOT NULL REFERENCES public.tarjetas_credito(id) ON DELETE CASCADE,
  cantidad_cuotas INTEGER NOT NULL,
  porcentaje_recargo DECIMAL(5,2) NOT NULL DEFAULT 0,
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tarjeta_id, cantidad_cuotas)
);

-- Enable RLS
ALTER TABLE public.tarjetas_credito ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarjeta_cuotas ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tarjetas_credito
CREATE POLICY "Usuarios pueden ver todas las tarjetas"
ON public.tarjetas_credito FOR SELECT
USING (true);

CREATE POLICY "Usuarios pueden insertar tarjetas"
ON public.tarjetas_credito FOR INSERT
WITH CHECK (true);

CREATE POLICY "Usuarios pueden actualizar tarjetas"
ON public.tarjetas_credito FOR UPDATE
USING (true);

CREATE POLICY "Usuarios pueden eliminar tarjetas"
ON public.tarjetas_credito FOR DELETE
USING (true);

-- Create RLS policies for tarjeta_cuotas
CREATE POLICY "Usuarios pueden ver todas las cuotas de tarjeta"
ON public.tarjeta_cuotas FOR SELECT
USING (true);

CREATE POLICY "Usuarios pueden insertar cuotas de tarjeta"
ON public.tarjeta_cuotas FOR INSERT
WITH CHECK (true);

CREATE POLICY "Usuarios pueden actualizar cuotas de tarjeta"
ON public.tarjeta_cuotas FOR UPDATE
USING (true);

CREATE POLICY "Usuarios pueden eliminar cuotas de tarjeta"
ON public.tarjeta_cuotas FOR DELETE
USING (true);

-- Create triggers for updated_at
CREATE TRIGGER update_tarjetas_credito_updated_at
  BEFORE UPDATE ON public.tarjetas_credito
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tarjeta_cuotas_updated_at
  BEFORE UPDATE ON public.tarjeta_cuotas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add tarjeta fields to ventas table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ventas' AND column_name = 'tarjeta_id'
  ) THEN
    ALTER TABLE public.ventas ADD COLUMN tarjeta_id UUID REFERENCES public.tarjetas_credito(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ventas' AND column_name = 'cuotas'
  ) THEN
    ALTER TABLE public.ventas ADD COLUMN cuotas INTEGER DEFAULT 1;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ventas' AND column_name = 'recargo_cuotas'
  ) THEN
    ALTER TABLE public.ventas ADD COLUMN recargo_cuotas DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;

-- Add tarjeta fields to cuenta_corriente table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cuenta_corriente' AND column_name = 'tarjeta_id'
  ) THEN
    ALTER TABLE public.cuenta_corriente ADD COLUMN tarjeta_id UUID REFERENCES public.tarjetas_credito(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cuenta_corriente' AND column_name = 'cuotas'
  ) THEN
    ALTER TABLE public.cuenta_corriente ADD COLUMN cuotas INTEGER DEFAULT 1;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tarjetas_credito_activa ON public.tarjetas_credito(activa);
CREATE INDEX IF NOT EXISTS idx_tarjeta_cuotas_tarjeta_id ON public.tarjeta_cuotas(tarjeta_id);
CREATE INDEX IF NOT EXISTS idx_tarjeta_cuotas_activa ON public.tarjeta_cuotas(activa);
CREATE INDEX IF NOT EXISTS idx_ventas_tarjeta_id ON public.ventas(tarjeta_id);
CREATE INDEX IF NOT EXISTS idx_cuenta_corriente_tarjeta_id ON public.cuenta_corriente(tarjeta_id);