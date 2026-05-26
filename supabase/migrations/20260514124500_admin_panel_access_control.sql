-- Panel de administrador global para altas/bajas de comercios y usuarios.

CREATE TABLE IF NOT EXISTS public.app_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_admins aa
    WHERE aa.user_id = auth.uid()
  );
$$;

ALTER TABLE public.comercio
ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

DROP POLICY IF EXISTS "Administradores pueden verse" ON public.app_admins;
CREATE POLICY "Administradores pueden verse"
ON public.app_admins
FOR SELECT
TO authenticated
USING (public.is_app_admin());

DROP POLICY IF EXISTS "Usuarios autenticados pueden crear comercio" ON public.comercio;

CREATE POLICY "Solo administradores pueden crear comercio"
ON public.comercio
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "Usuarios pueden ver su comercio" ON public.comercio;
CREATE POLICY "Usuarios pueden ver su comercio"
ON public.comercio
FOR SELECT
TO authenticated
USING (public.user_belongs_to_comercio(id) OR public.is_app_admin());

DROP POLICY IF EXISTS "Usuarios pueden actualizar su comercio" ON public.comercio;
CREATE POLICY "Usuarios pueden actualizar su comercio"
ON public.comercio
FOR UPDATE
TO authenticated
USING (public.user_belongs_to_comercio(id) OR public.is_app_admin())
WITH CHECK (public.user_belongs_to_comercio(id) OR public.is_app_admin());

DROP POLICY IF EXISTS "Usuarios pueden eliminar su comercio" ON public.comercio;
CREATE POLICY "Solo administradores pueden eliminar comercio"
ON public.comercio
FOR DELETE
TO authenticated
USING (public.is_app_admin());

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
    JOIN public.comercio c ON c.id = cu.comercio_id
    WHERE cu.comercio_id = target_comercio_id
      AND cu.user_id = auth.uid()
      AND cu.activo = true
      AND c.activo = true
  );
$$;
