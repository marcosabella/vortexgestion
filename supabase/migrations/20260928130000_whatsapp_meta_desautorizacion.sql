-- Vincula la identidad de Meta que autorizó cada conexión para poder
-- retirar únicamente las credenciales afectadas por una desautorización.
ALTER TABLE public.whatsapp_credenciales
ADD COLUMN IF NOT EXISTS meta_user_id text;

CREATE INDEX IF NOT EXISTS whatsapp_credenciales_meta_user_id_idx
ON public.whatsapp_credenciales (meta_user_id)
WHERE meta_user_id IS NOT NULL;

COMMENT ON COLUMN public.whatsapp_credenciales.meta_user_id IS
'Identificador de usuario de Meta validado mediante debug_token; se utiliza para procesar desautorizaciones firmadas.';
