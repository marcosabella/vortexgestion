CREATE OR REPLACE FUNCTION public.actualizar_mi_cliente_tienda(p_datos jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_comercio constant uuid := '30e79cd0-360d-4a03-b634-bb7414ee505b';
  v_cliente uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debe iniciar sesión'; END IF;
  IF nullif(btrim(p_datos->>'nombre'), '') IS NULL
    OR nullif(btrim(p_datos->>'apellido'), '') IS NULL THEN
    RAISE EXCEPTION 'Nombre y apellido son obligatorios';
  END IF;

  SELECT cliente_id INTO v_cliente FROM public.cliente_usuarios
  WHERE comercio_id = v_comercio AND user_id = v_user;
  IF v_cliente IS NULL THEN RAISE EXCEPTION 'La cuenta no está vinculada a un cliente'; END IF;

  UPDATE public.clientes SET
    nombre = btrim(p_datos->>'nombre'), apellido = btrim(p_datos->>'apellido'),
    telefono = nullif(btrim(p_datos->>'telefono'), ''),
    calle = btrim(coalesce(p_datos->>'direccion', '')),
    localidad = btrim(coalesce(p_datos->>'localidad', ''))
  WHERE id = v_cliente AND comercio_id = v_comercio;

  UPDATE auth.users SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
    'nombre', btrim(p_datos->>'nombre'), 'apellido', btrim(p_datos->>'apellido'),
    'telefono', btrim(coalesce(p_datos->>'telefono', '')),
    'direccion', btrim(coalesce(p_datos->>'direccion', '')),
    'localidad', btrim(coalesce(p_datos->>'localidad', '')),
    'comercio_id', v_comercio::text
  ) WHERE id = v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_mi_cliente_tienda(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_mi_cliente_tienda(jsonb) TO authenticated;

