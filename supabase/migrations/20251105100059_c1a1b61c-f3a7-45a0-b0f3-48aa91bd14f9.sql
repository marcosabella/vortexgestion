-- Create enum for cheque status
CREATE TYPE public.estado_cheque AS ENUM ('en_cartera', 'depositado', 'rechazado', 'endosado');

-- Create cheques table
CREATE TABLE public.cheques (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_cheque VARCHAR NOT NULL,
  banco_emisor VARCHAR NOT NULL,
  monto NUMERIC NOT NULL DEFAULT 0,
  fecha_emision DATE NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  emisor_nombre VARCHAR NOT NULL,
  emisor_cuit VARCHAR,
  cliente_id UUID,
  venta_id UUID,
  cuenta_corriente_id UUID,
  estado estado_cheque NOT NULL DEFAULT 'en_cartera',
  observaciones TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add foreign key constraints
ALTER TABLE public.cheques 
ADD CONSTRAINT fk_cheques_cliente 
FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;

ALTER TABLE public.cheques 
ADD CONSTRAINT fk_cheques_venta 
FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE SET NULL;

ALTER TABLE public.cheques 
ADD CONSTRAINT fk_cheques_cuenta_corriente 
FOREIGN KEY (cuenta_corriente_id) REFERENCES public.cuenta_corriente(id) ON DELETE SET NULL;

-- Enable Row Level Security
ALTER TABLE public.cheques ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Usuarios pueden ver todos los cheques" 
ON public.cheques 
FOR SELECT 
USING (true);

CREATE POLICY "Usuarios pueden insertar cheques" 
ON public.cheques 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Usuarios pueden actualizar cheques" 
ON public.cheques 
FOR UPDATE 
USING (true);

CREATE POLICY "Usuarios pueden eliminar cheques" 
ON public.cheques 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_cheques_updated_at
BEFORE UPDATE ON public.cheques
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_cheques_cliente_id ON public.cheques(cliente_id);
CREATE INDEX idx_cheques_numero ON public.cheques(numero_cheque);
CREATE INDEX idx_cheques_estado ON public.cheques(estado);
CREATE INDEX idx_cheques_fecha_vencimiento ON public.cheques(fecha_vencimiento);