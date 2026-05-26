-- Create a table for proveedores (suppliers)
CREATE TABLE public.proveedores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre VARCHAR NOT NULL,
  apellido VARCHAR,
  razon_social VARCHAR,
  cuit VARCHAR NOT NULL,
  calle VARCHAR NOT NULL,
  numero VARCHAR NOT NULL,
  codigo_postal VARCHAR NOT NULL,
  localidad VARCHAR NOT NULL,
  provincia VARCHAR NOT NULL,
  telefono VARCHAR,
  email VARCHAR,
  situacion_afip VARCHAR NOT NULL,
  ingresos_brutos VARCHAR,
  tipo_persona VARCHAR NOT NULL CHECK (tipo_persona IN ('fisica', 'juridica')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable Row Level Security
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

-- Create policies for user access (allowing all operations for now)
CREATE POLICY "Usuarios pueden ver todos los proveedores" 
ON public.proveedores 
FOR SELECT 
USING (true);

CREATE POLICY "Usuarios pueden insertar proveedores" 
ON public.proveedores 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Usuarios pueden actualizar proveedores" 
ON public.proveedores 
FOR UPDATE 
USING (true);

CREATE POLICY "Usuarios pueden eliminar proveedores" 
ON public.proveedores 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_proveedores_updated_at
BEFORE UPDATE ON public.proveedores
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();