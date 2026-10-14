-- Configuración puntual solicitada para carlosbostico@hotmail.com.
-- Separada de la modificación de estructura; no toca movimientos ni comprobantes.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.comercio_usuarios cu
    JOIN auth.users u ON u.id = cu.user_id
    WHERE cu.comercio_id = 'a4983b26-4f3d-46e0-8e4f-46bd34fec838'
      AND lower(u.email) = 'carlosbostico@hotmail.com' AND cu.activo
  ) THEN
    RAISE EXCEPTION 'No se pudo verificar el comercio de Bostico; no se cambia la configuración';
  END IF;
  UPDATE public.comercio SET mostrar_razon_social_con_logo = true
  WHERE id = 'a4983b26-4f3d-46e0-8e4f-46bd34fec838';
END $$;
COMMIT;
