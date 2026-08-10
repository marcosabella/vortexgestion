-- Permite que los usuarios del comercio cambien solamente su formato de impresion.
-- Los modulos y funciones continúan siendo administrados desde el panel general.

CREATE OR REPLACE FUNCTION public.actualizar_formato_impresion_comercio(
  p_comercio_id uuid,
  p_formato text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parametros jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_belongs_to_comercio(p_comercio_id) THEN
    RAISE EXCEPTION 'No tiene acceso al comercio indicado';
  END IF;

  IF p_formato NOT IN ('a4', '58mm') THEN
    RAISE EXCEPTION 'Formato de impresion invalido';
  END IF;

  UPDATE public.comercio_parametrizacion
  SET parametros = jsonb_set(
    parametros,
    '{impresion,formato_comprobante}',
    to_jsonb(p_formato),
    true
  )
  WHERE comercio_id = p_comercio_id
  RETURNING parametros INTO v_parametros;

  IF v_parametros IS NULL THEN
    RAISE EXCEPTION 'No se encontro la parametrizacion del comercio';
  END IF;

  RETURN v_parametros;
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_formato_impresion_comercio(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_formato_impresion_comercio(uuid, text) TO authenticated;
