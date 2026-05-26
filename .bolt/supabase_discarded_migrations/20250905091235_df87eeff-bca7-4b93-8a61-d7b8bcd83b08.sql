-- Create marcas table
CREATE TABLE public.marcas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre VARCHAR NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create rubros table
CREATE TABLE public.rubros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre VARCHAR NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create subrubros table
CREATE TABLE public.subrubros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre VARCHAR NOT NULL,
  descripcion TEXT,
  rubro_id UUID NOT NULL REFERENCES public.rubros(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tipo_moneda enum
CREATE TYPE public.tipo_moneda AS ENUM ('ARS', 'USD', 'USD_BLUE');

-- Create productos table
CREATE TABLE public.productos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_producto VARCHAR NOT NULL UNIQUE,
  cod_barras VARCHAR,
  descripcion VARCHAR NOT NULL,
  proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE RESTRICT,
  marca_id UUID NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  rubro_id UUID NOT NULL REFERENCES public.rubros(id) ON DELETE RESTRICT,
  subrubro_id UUID NOT NULL REFERENCES public.subrubros(id) ON DELETE RESTRICT,
  precio_costo DECIMAL(12,2) NOT NULL DEFAULT 0,
  porcentaje_iva DECIMAL(5,2) NOT NULL DEFAULT 0,
  porcentaje_utilidad DECIMAL(5,2) NOT NULL DEFAULT 0,
  porcentaje_descuento DECIMAL(5,2) NOT NULL DEFAULT 0,
  precio_venta DECIMAL(12,2) GENERATED ALWAYS AS (
    precio_costo * (1 + porcentaje_iva/100) * (1 + porcentaje_utilidad/100) * (1 - porcentaje_descuento/100)
  ) STORED,
  stock INTEGER NOT NULL DEFAULT 0,
  tipo_moneda public.tipo_moneda NOT NULL DEFAULT 'ARS',
  observaciones TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.marcas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subrubros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for marcas
CREATE POLICY "Usuarios pueden ver todas las marcas" ON public.marcas FOR SELECT USING (true);
CREATE POLICY "Usuarios pueden insertar marcas" ON public.marcas FOR INSERT WITH CHECK (true);
CREATE POLICY "Usuarios pueden actualizar marcas" ON public.marcas FOR UPDATE USING (true);
CREATE POLICY "Usuarios pueden eliminar marcas" ON public.marcas FOR DELETE USING (true);

-- Create RLS policies for rubros
CREATE POLICY "Usuarios pueden ver todos los rubros" ON public.rubros FOR SELECT USING (true);
CREATE POLICY "Usuarios pueden insertar rubros" ON public.rubros FOR INSERT WITH CHECK (true);
CREATE POLICY "Usuarios pueden actualizar rubros" ON public.rubros FOR UPDATE USING (true);
CREATE POLICY "Usuarios pueden eliminar rubros" ON public.rubros FOR DELETE USING (true);

-- Create RLS policies for subrubros
CREATE POLICY "Usuarios pueden ver todos los subrubros" ON public.subrubros FOR SELECT USING (true);
CREATE POLICY "Usuarios pueden insertar subrubros" ON public.subrubros FOR INSERT WITH CHECK (true);
CREATE POLICY "Usuarios pueden actualizar subrubros" ON public.subrubros FOR UPDATE USING (true);
CREATE POLICY "Usuarios pueden eliminar subrubros" ON public.subrubros FOR DELETE USING (true);

-- Create RLS policies for productos
CREATE POLICY "Usuarios pueden ver todos los productos" ON public.productos FOR SELECT USING (true);
CREATE POLICY "Usuarios pueden insertar productos" ON public.productos FOR INSERT WITH CHECK (true);
CREATE POLICY "Usuarios pueden actualizar productos" ON public.productos FOR UPDATE USING (true);
CREATE POLICY "Usuarios pueden eliminar productos" ON public.productos FOR DELETE USING (true);

-- Create triggers for updated_at
CREATE TRIGGER update_marcas_updated_at
  BEFORE UPDATE ON public.marcas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rubros_updated_at
  BEFORE UPDATE ON public.rubros
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subrubros_updated_at
  BEFORE UPDATE ON public.subrubros
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_productos_updated_at
  BEFORE UPDATE ON public.productos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_subrubros_rubro_id ON public.subrubros(rubro_id);
CREATE INDEX idx_productos_proveedor_id ON public.productos(proveedor_id);
CREATE INDEX idx_productos_marca_id ON public.productos(marca_id);
CREATE INDEX idx_productos_rubro_id ON public.productos(rubro_id);
CREATE INDEX idx_productos_subrubro_id ON public.productos(subrubro_id);
CREATE INDEX idx_productos_cod_producto ON public.productos(cod_producto);
CREATE INDEX idx_productos_cod_barras ON public.productos(cod_barras);