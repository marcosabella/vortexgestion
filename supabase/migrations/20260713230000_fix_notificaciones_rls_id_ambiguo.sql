-- Evita que PostgreSQL resuelva `id` como comercio_usuarios.id dentro de la
-- subconsulta. La funcion debe recibir siempre el id de la notificacion.
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
        AND public.notificacion_visible_para_comercio(notificaciones.id, cu.comercio_id)
    )
  )
);
