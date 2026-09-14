CREATE TABLE IF NOT EXISTS public.whatsapp_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  venta_id uuid REFERENCES public.ventas(id) ON DELETE SET NULL,
  destinatario text NOT NULL,
  mensaje_id text UNIQUE,
  tipo text NOT NULL DEFAULT 'documento',
  estado text NOT NULL DEFAULT 'enviado' CHECK (estado IN ('enviado', 'entregado', 'leido', 'fallido')),
  error_detalle text,
  enviado_at timestamp with time zone NOT NULL DEFAULT now(),
  entregado_at timestamp with time zone,
  leido_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_envios_comercio ON public.whatsapp_envios(comercio_id, enviado_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_envios_venta ON public.whatsapp_envios(venta_id);

ALTER TABLE public.whatsapp_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_envios_select_por_comercio ON public.whatsapp_envios
FOR SELECT TO authenticated
USING (public.user_belongs_to_comercio(comercio_id));

CREATE TRIGGER update_whatsapp_envios_updated_at
BEFORE UPDATE ON public.whatsapp_envios
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
