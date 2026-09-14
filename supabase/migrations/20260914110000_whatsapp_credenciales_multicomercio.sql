-- Credenciales privadas de cada cuenta WhatsApp Business conectada mediante Meta Embedded Signup.
-- No se exponen a usuarios autenticados ni a la interfaz web.
CREATE TABLE public.whatsapp_credenciales (
  comercio_id uuid PRIMARY KEY REFERENCES public.comercio(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  waba_id text NOT NULL,
  phone_number_id text NOT NULL,
  token_expires_at timestamptz,
  scopes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_credenciales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_credenciales FROM anon, authenticated;

CREATE TRIGGER update_whatsapp_credenciales_updated_at
BEFORE UPDATE ON public.whatsapp_credenciales
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
