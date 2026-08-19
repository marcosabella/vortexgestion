-- Expone únicamente los datos públicos necesarios para el footer de la tienda.
CREATE OR REPLACE FUNCTION public.get_tienda_comercio_contacto(target_comercio_id uuid)
RETURNS TABLE (
  calle varchar,
  numero varchar,
  localidad varchar,
  provincia varchar,
  telefono varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.calle, c.numero, c.localidad, c.provincia, c.telefono
  FROM public.comercio c
  WHERE c.id = target_comercio_id
    AND COALESCE(c.activo, true)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_tienda_comercio_contacto(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tienda_comercio_contacto(uuid) TO anon, authenticated;
