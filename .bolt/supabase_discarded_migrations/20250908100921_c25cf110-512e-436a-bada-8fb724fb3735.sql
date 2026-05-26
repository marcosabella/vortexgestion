-- Create enum for payment types
CREATE TYPE public.tipo_pago AS ENUM (
  'contado',
  'transferencia', 
  'tarjeta',
  'cheque',
  'cta_cte'
);

-- Create enum for receipt types (ARCA Argentina)
CREATE TYPE public.tipo_comprobante AS ENUM (
  'factura_a',
  'factura_b', 
  'factura_c',
  'nota_credito_a',
  'nota_credito_b',
  'nota_credito_c',
  'nota_debito_a',
  'nota_debito_b',
  'nota_debito_c',
  'recibo_a',
  'recibo_b',
  'recibo_c',
  'ticket_fiscal',
  'factura_exportacion'
);

-- Create sales table
CREATE TABLE public.ventas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_comprobante VARCHAR NOT NULL,
  fecha_venta TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  tipo_pago tipo_pago NOT NULL DEFAULT 'contado',
  tipo_comprobante tipo_comprobante NOT NULL DEFAULT 'ticket_fiscal',
  cliente_id UUID REFERENCES public.clientes(id),
  cliente_nombre VARCHAR DEFAULT 'Consumidor Final',
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_iva NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  observaciones TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create sale items table
CREATE TABLE public.venta_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venta_id UUID NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id),
  cantidad INTEGER NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(10,2) NOT NULL,
  porcentaje_iva NUMERIC(5,2) NOT NULL DEFAULT 0,
  monto_iva NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venta_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for ventas
CREATE POLICY "Usuarios pueden ver todas las ventas"
ON public.ventas FOR SELECT
USING (true);

CREATE POLICY "Usuarios pueden insertar ventas"
ON public.ventas FOR INSERT
WITH CHECK (true);

CREATE POLICY "Usuarios pueden actualizar ventas"
ON public.ventas FOR UPDATE
USING (true);

CREATE POLICY "Usuarios pueden eliminar ventas"
ON public.ventas FOR DELETE
USING (true);

-- Create RLS policies for venta_items
CREATE POLICY "Usuarios pueden ver todos los items de venta"
ON public.venta_items FOR SELECT
USING (true);

CREATE POLICY "Usuarios pueden insertar items de venta"
ON public.venta_items FOR INSERT
WITH CHECK (true);

CREATE POLICY "Usuarios pueden actualizar items de venta"
ON public.venta_items FOR UPDATE
USING (true);

CREATE POLICY "Usuarios pueden eliminar items de venta"
ON public.venta_items FOR DELETE
USING (true);

-- Create triggers for updated_at
CREATE TRIGGER update_ventas_updated_at
  BEFORE UPDATE ON public.ventas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_venta_items_updated_at
  BEFORE UPDATE ON public.venta_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_ventas_fecha ON public.ventas(fecha_venta);
CREATE INDEX idx_ventas_cliente ON public.ventas(cliente_id);
CREATE INDEX idx_venta_items_venta ON public.venta_items(venta_id);
CREATE INDEX idx_venta_items_producto ON public.venta_items(producto_id);

-- Create sequence for receipt numbers
CREATE SEQUENCE public.ventas_numero_seq START 1;