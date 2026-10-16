-- Lectura del certificado publico para la pantalla administrativa de ARCA.
-- La clave privada permanece exclusivamente en el backend.
BEGIN;
CREATE OR REPLACE FUNCTION public.consultar_certificado_emisor_fiscal(p_comercio_id uuid, p_emisor_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE certificado text;
BEGIN
  IF NOT public.user_is_comercio_admin(p_comercio_id) THEN
    RAISE EXCEPTION 'emisores_no_autorizado' USING ERRCODE = '42501';
  END IF;
  SELECT certificado_crt INTO certificado
  FROM public.emisores_fiscales
  WHERE comercio_id = p_comercio_id AND id = p_emisor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'emisor_fiscal_no_disponible';
  END IF;
  RETURN certificado;
END;
$$;
REVOKE ALL ON FUNCTION public.consultar_certificado_emisor_fiscal(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consultar_certificado_emisor_fiscal(uuid,uuid) TO authenticated;
COMMIT;
