-- Create table for comercio configuration
CREATE TABLE public.comercio (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre_comercio VARCHAR NOT NULL,
  calle VARCHAR NOT NULL,
  numero VARCHAR NOT NULL,
  codigo_postal VARCHAR NOT NULL,
  localidad VARCHAR NOT NULL,
  provincia VARCHAR NOT NULL,
  telefono VARCHAR,
  cuit VARCHAR NOT NULL,
  ingresos_brutos VARCHAR,
  fecha_inicio_actividad DATE NOT NULL,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.comercio ENABLE ROW LEVEL SECURITY;

-- Create policies for comercio
CREATE POLICY "Usuarios pueden ver datos del comercio" 
ON public.comercio 
FOR SELECT 
USING (true);

CREATE POLICY "Usuarios pueden insertar datos del comercio" 
ON public.comercio 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Usuarios pueden actualizar datos del comercio" 
ON public.comercio 
FOR UPDATE 
USING (true);

CREATE POLICY "Usuarios pueden eliminar datos del comercio" 
ON public.comercio 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_comercio_updated_at
BEFORE UPDATE ON public.comercio
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();