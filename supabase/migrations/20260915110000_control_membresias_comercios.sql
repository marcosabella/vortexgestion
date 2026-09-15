-- Control de vigencia de membresías por comercio.
-- Los comercios existentes quedan sin vencimiento para no alterar su acceso actual.
ALTER TABLE public.comercio
  ADD COLUMN IF NOT EXISTS fecha_ingreso_sistema date,
  ADD COLUMN IF NOT EXISTS membresia_vigente_hasta date;

CREATE INDEX IF NOT EXISTS comercio_membresia_vencimiento_idx
  ON public.comercio (membresia_vigente_hasta)
  WHERE membresia_vigente_hasta IS NOT NULL;

-- Un vencimiento cargado impide el acceso desde el día siguiente. Una fecha nula
-- representa comercios históricos a los que todavía no se les comenzó a controlar membresía.
CREATE OR REPLACE FUNCTION public.comercio_acceso_vigente(target_comercio_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.comercio c
    WHERE c.id = target_comercio_id
      AND c.activo = true
      AND (c.membresia_vigente_hasta IS NULL OR c.membresia_vigente_hasta >= current_date)
  );
$$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_comercio(target_comercio_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.comercio_usuarios cu
    WHERE cu.comercio_id = target_comercio_id
      AND cu.user_id = auth.uid()
      AND cu.activo = true
      AND public.comercio_acceso_vigente(cu.comercio_id)
  );
$$;
