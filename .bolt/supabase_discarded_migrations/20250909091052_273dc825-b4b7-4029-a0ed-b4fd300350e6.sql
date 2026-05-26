-- Create cuenta_corriente table for tracking account movements
CREATE TABLE public.cuenta_corriente (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL,
  tipo_movimiento VARCHAR NOT NULL CHECK (tipo_movimiento IN ('debito', 'credito')),
  monto NUMERIC NOT NULL DEFAULT 0,
  concepto TEXT NOT NULL,
  venta_id UUID NULL,
  fecha_movimiento TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  observaciones TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add foreign key constraint to clientes table
ALTER TABLE public.cuenta_corriente 
ADD CONSTRAINT fk_cuenta_corriente_cliente 
FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;

-- Add foreign key constraint to ventas table (optional, for sales on credit)
ALTER TABLE public.cuenta_corriente 
ADD CONSTRAINT fk_cuenta_corriente_venta 
FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE SET NULL;

-- Enable Row Level Security
ALTER TABLE public.cuenta_corriente ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Usuarios pueden ver todos los movimientos de cuenta corriente" 
ON public.cuenta_corriente 
FOR SELECT 
USING (true);

CREATE POLICY "Usuarios pueden insertar movimientos de cuenta corriente" 
ON public.cuenta_corriente 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Usuarios pueden actualizar movimientos de cuenta corriente" 
ON public.cuenta_corriente 
FOR UPDATE 
USING (true);

CREATE POLICY "Usuarios pueden eliminar movimientos de cuenta corriente" 
ON public.cuenta_corriente 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_cuenta_corriente_updated_at
BEFORE UPDATE ON public.cuenta_corriente
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_cuenta_corriente_cliente_id ON public.cuenta_corriente(cliente_id);
CREATE INDEX idx_cuenta_corriente_fecha ON public.cuenta_corriente(fecha_movimiento);
CREATE INDEX idx_cuenta_corriente_tipo ON public.cuenta_corriente(tipo_movimiento);