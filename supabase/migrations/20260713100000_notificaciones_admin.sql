-- Centro de notificaciones administrado por app_admins.

CREATE TABLE IF NOT EXISTS public.notificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  mensaje text NOT NULL,
  categoria text NOT NULL DEFAULT 'general' CHECK (categoria IN ('general', 'sistema', 'abono', 'comprobante')),
  prioridad text NOT NULL DEFAULT 'normal' CHECK (prioridad IN ('baja', 'normal', 'alta')),
  comprobante_numero text,
  comprobante_fecha date,
  comprobante_monto numeric(14,2),
  comprobante_periodo text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notificacion_destinatarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacion_id uuid NOT NULL REFERENCES public.notificaciones(id) ON DELETE CASCADE,
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (notificacion_id, comercio_id)
);

CREATE TABLE IF NOT EXISTS public.notificacion_lecturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacion_id uuid NOT NULL REFERENCES public.notificaciones(id) ON DELETE CASCADE,
  comercio_id uuid REFERENCES public.comercio(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (notificacion_id, user_id, comercio_id)
);

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacion_destinatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacion_lecturas ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_notificaciones_created_at ON public.notificaciones(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificacion_destinatarios_notificacion_id ON public.notificacion_destinatarios(notificacion_id);
CREATE INDEX IF NOT EXISTS idx_notificacion_destinatarios_comercio_id ON public.notificacion_destinatarios(comercio_id);
CREATE INDEX IF NOT EXISTS idx_notificacion_lecturas_user_id ON public.notificacion_lecturas(user_id);
CREATE INDEX IF NOT EXISTS idx_notificacion_lecturas_comercio_id ON public.notificacion_lecturas(comercio_id);

DROP TRIGGER IF EXISTS update_notificaciones_updated_at ON public.notificaciones;
CREATE TRIGGER update_notificaciones_updated_at
BEFORE UPDATE ON public.notificaciones
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.notificacion_visible_para_comercio(target_notificacion_id uuid, target_comercio_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.notificaciones n
    WHERE n.id = target_notificacion_id
      AND n.activo = true
      AND (
        NOT EXISTS (
          SELECT 1
          FROM public.notificacion_destinatarios nd
          WHERE nd.notificacion_id = n.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.notificacion_destinatarios nd
          WHERE nd.notificacion_id = n.id
            AND nd.comercio_id = target_comercio_id
        )
      )
  );
$$;

DROP POLICY IF EXISTS "Admins gestionan notificaciones" ON public.notificaciones;
CREATE POLICY "Admins gestionan notificaciones"
ON public.notificaciones
FOR ALL
TO authenticated
USING (public.is_app_admin())
WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "Usuarios ven notificaciones asignadas" ON public.notificaciones;
CREATE POLICY "Usuarios ven notificaciones asignadas"
ON public.notificaciones
FOR SELECT
TO authenticated
USING (
  activo = true
  AND (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1
      FROM public.comercio_usuarios cu
      WHERE cu.user_id = auth.uid()
        AND cu.activo = true
        AND public.user_belongs_to_comercio(cu.comercio_id)
        AND public.notificacion_visible_para_comercio(id, cu.comercio_id)
    )
  )
);

DROP POLICY IF EXISTS "Admins gestionan destinatarios" ON public.notificacion_destinatarios;
CREATE POLICY "Admins gestionan destinatarios"
ON public.notificacion_destinatarios
FOR ALL
TO authenticated
USING (public.is_app_admin())
WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "Usuarios ven destinatarios asignados" ON public.notificacion_destinatarios;
CREATE POLICY "Usuarios ven destinatarios asignados"
ON public.notificacion_destinatarios
FOR SELECT
TO authenticated
USING (public.user_belongs_to_comercio(comercio_id) OR public.is_app_admin());

DROP POLICY IF EXISTS "Usuarios ven sus lecturas" ON public.notificacion_lecturas;
CREATE POLICY "Usuarios ven sus lecturas"
ON public.notificacion_lecturas
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_app_admin());

DROP POLICY IF EXISTS "Usuarios marcan notificaciones leidas" ON public.notificacion_lecturas;
CREATE POLICY "Usuarios marcan notificaciones leidas"
ON public.notificacion_lecturas
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.user_belongs_to_comercio(comercio_id)
  AND public.notificacion_visible_para_comercio(notificacion_id, comercio_id)
);

DROP POLICY IF EXISTS "Usuarios actualizan sus lecturas" ON public.notificacion_lecturas;
CREATE POLICY "Usuarios actualizan sus lecturas"
ON public.notificacion_lecturas
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
