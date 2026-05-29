-- Parametrizacion individual de modulos y funciones por comercio.

CREATE TABLE IF NOT EXISTS public.comercio_parametrizacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL UNIQUE REFERENCES public.comercio(id) ON DELETE CASCADE,
  parametros jsonb NOT NULL DEFAULT '{
    "modulos": {
      "caja": true,
      "clientes": true,
      "proveedores": true,
      "productos": true,
      "ventas": true,
      "cuenta_corriente": true,
      "cheques": true,
      "bancos": true,
      "tarjetas": true,
      "afip": true,
      "seguridad": true,
      "listados": true
    },
    "funciones": {
      "venta_items_manuales": true,
      "descuentos_recargos": true,
      "facturacion_afip": true,
      "impresion_comprobantes": true,
      "exportacion_pdf": true
    }
  }'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.comercio_parametrizacion ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_comercio_parametrizacion_updated_at ON public.comercio_parametrizacion;
CREATE TRIGGER update_comercio_parametrizacion_updated_at
BEFORE UPDATE ON public.comercio_parametrizacion
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.comercio_parametrizacion (comercio_id)
SELECT c.id
FROM public.comercio c
LEFT JOIN public.comercio_parametrizacion cp ON cp.comercio_id = c.id
WHERE cp.id IS NULL;

CREATE INDEX IF NOT EXISTS idx_comercio_parametrizacion_comercio_id
ON public.comercio_parametrizacion(comercio_id);

DROP POLICY IF EXISTS "Usuarios pueden ver parametrizacion de su comercio" ON public.comercio_parametrizacion;
CREATE POLICY "Usuarios pueden ver parametrizacion de su comercio"
ON public.comercio_parametrizacion
FOR SELECT
TO authenticated
USING (public.user_belongs_to_comercio(comercio_id) OR public.is_app_admin());

DROP POLICY IF EXISTS "Solo administradores app pueden crear parametrizacion" ON public.comercio_parametrizacion;
CREATE POLICY "Solo administradores app pueden crear parametrizacion"
ON public.comercio_parametrizacion
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "Solo administradores app pueden actualizar parametrizacion" ON public.comercio_parametrizacion;
CREATE POLICY "Solo administradores app pueden actualizar parametrizacion"
ON public.comercio_parametrizacion
FOR UPDATE
TO authenticated
USING (public.is_app_admin())
WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "Solo administradores app pueden eliminar parametrizacion" ON public.comercio_parametrizacion;
CREATE POLICY "Solo administradores app pueden eliminar parametrizacion"
ON public.comercio_parametrizacion
FOR DELETE
TO authenticated
USING (public.is_app_admin());

