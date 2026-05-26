-- Ensure tarjeta_cuotas table exists with proper structure
CREATE TABLE IF NOT EXISTS public.tarjeta_cuotas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tarjeta_id UUID NOT NULL REFERENCES public.tarjetas_credito(id) ON DELETE CASCADE,
  cantidad_cuotas INTEGER NOT NULL,
  porcentaje_recargo NUMERIC NOT NULL DEFAULT 0,
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on tarjeta_cuotas
ALTER TABLE public.tarjeta_cuotas ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tarjeta_cuotas
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tarjeta_cuotas' AND policyname = 'Usuarios pueden ver todas las cuotas de tarjeta') THEN
    CREATE POLICY "Usuarios pueden ver todas las cuotas de tarjeta" 
    ON public.tarjeta_cuotas 
    FOR SELECT 
    USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tarjeta_cuotas' AND policyname = 'Usuarios pueden insertar cuotas de tarjeta') THEN
    CREATE POLICY "Usuarios pueden insertar cuotas de tarjeta" 
    ON public.tarjeta_cuotas 
    FOR INSERT 
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tarjeta_cuotas' AND policyname = 'Usuarios pueden actualizar cuotas de tarjeta') THEN
    CREATE POLICY "Usuarios pueden actualizar cuotas de tarjeta" 
    ON public.tarjeta_cuotas 
    FOR UPDATE 
    USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tarjeta_cuotas' AND policyname = 'Usuarios pueden eliminar cuotas de tarjeta') THEN
    CREATE POLICY "Usuarios pueden eliminar cuotas de tarjeta" 
    ON public.tarjeta_cuotas 
    FOR DELETE 
    USING (true);
  END IF;
END $$;

-- Create trigger for tarjeta_cuotas updated_at
DROP TRIGGER IF EXISTS update_tarjeta_cuotas_updated_at ON public.tarjeta_cuotas;
CREATE TRIGGER update_tarjeta_cuotas_updated_at
  BEFORE UPDATE ON public.tarjeta_cuotas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add foreign key constraint for tarjeta in ventas if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'ventas_tarjeta_id_fkey' 
    AND table_name = 'ventas'
  ) THEN
    ALTER TABLE public.ventas 
    ADD CONSTRAINT ventas_tarjeta_id_fkey 
    FOREIGN KEY (tarjeta_id) REFERENCES public.tarjetas_credito(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key constraint for tarjeta in cuenta_corriente if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'cuenta_corriente_tarjeta_id_fkey' 
    AND table_name = 'cuenta_corriente'
  ) THEN
    ALTER TABLE public.cuenta_corriente 
    ADD CONSTRAINT cuenta_corriente_tarjeta_id_fkey 
    FOREIGN KEY (tarjeta_id) REFERENCES public.tarjetas_credito(id) ON DELETE SET NULL;
  END IF;
END $$;