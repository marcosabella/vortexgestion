CREATE TABLE IF NOT EXISTS public.whatsapp_comercios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL UNIQUE REFERENCES public.comercio(id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'no_conectado' CHECK (estado IN ('no_conectado', 'pendiente', 'conectado', 'error')),
  waba_id text,
  phone_number_id text,
  numero_telefono text,
  nombre_visible text,
  plantilla_factura_nombre text NOT NULL DEFAULT 'factura_documento',
  plantilla_factura_estado text NOT NULL DEFAULT 'aprobada',
  conectado_at timestamp with time zone,
  ultimo_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_comercios ENABLE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_comercios_select_por_comercio ON public.whatsapp_comercios
FOR SELECT TO authenticated
USING (public.user_belongs_to_comercio(comercio_id));

CREATE POLICY whatsapp_comercios_insert_admin ON public.whatsapp_comercios
FOR INSERT TO authenticated
WITH CHECK (public.user_is_comercio_admin(comercio_id));

CREATE POLICY whatsapp_comercios_update_admin ON public.whatsapp_comercios
FOR UPDATE TO authenticated
USING (public.user_is_comercio_admin(comercio_id))
WITH CHECK (public.user_is_comercio_admin(comercio_id));

CREATE TRIGGER update_whatsapp_comercios_updated_at
BEFORE UPDATE ON public.whatsapp_comercios
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
