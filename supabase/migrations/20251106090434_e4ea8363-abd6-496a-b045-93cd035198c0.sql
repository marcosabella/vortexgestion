-- Crear tipo enum para tipo de pago si no existe
DO $$ BEGIN
  CREATE TYPE public.tipo_pago AS ENUM ('contado', 'transferencia', 'tarjeta', 'cheque', 'cta_cte');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Crear tabla para múltiples métodos de pago por venta
CREATE TABLE public.pagos_venta (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venta_id UUID NOT NULL,
  tipo_pago public.tipo_pago NOT NULL,
  monto NUMERIC NOT NULL DEFAULT 0,
  banco_id UUID,
  tarjeta_id UUID,
  cuotas INTEGER DEFAULT 1,
  recargo_cuotas NUMERIC DEFAULT 0,
  cheque_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.pagos_venta ENABLE ROW LEVEL SECURITY;

-- Crear políticas para pagos_venta
CREATE POLICY "Usuarios pueden ver todos los pagos de venta"
  ON public.pagos_venta
  FOR SELECT
  USING (true);

CREATE POLICY "Usuarios pueden insertar pagos de venta"
  ON public.pagos_venta
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Usuarios pueden actualizar pagos de venta"
  ON public.pagos_venta
  FOR UPDATE
  USING (true);

CREATE POLICY "Usuarios pueden eliminar pagos de venta"
  ON public.pagos_venta
  FOR DELETE
  USING (true);

-- Crear trigger para actualizar updated_at
CREATE TRIGGER update_pagos_venta_updated_at
  BEFORE UPDATE ON public.pagos_venta
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();