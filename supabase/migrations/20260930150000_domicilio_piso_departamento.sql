-- Complementos de domicilio; conserva los datos existentes y las politicas RLS.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS piso text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS departamento text NOT NULL DEFAULT '';

ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS piso text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS departamento text NOT NULL DEFAULT '';
