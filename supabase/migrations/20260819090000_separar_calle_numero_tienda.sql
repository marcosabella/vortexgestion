-- Mantiene separados calle y numero entre la tienda online y el sistema de ventas.
CREATE OR REPLACE FUNCTION public.registrar_cliente_tienda_desde_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comercio constant uuid := '30e79cd0-360d-4a03-b634-bb7414ee505b';
  v_cliente_id uuid;
  v_email text := lower(btrim(new.email));
  v_metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
BEGIN
  IF v_metadata->>'comercio_id' IS DISTINCT FROM v_comercio::text THEN RETURN new; END IF;

  SELECT id INTO v_cliente_id FROM public.clientes
  WHERE comercio_id = v_comercio AND lower(btrim(email)) = v_email
  ORDER BY created_at LIMIT 1;

  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (
      comercio_id, nombre, apellido, cuit, calle, numero, codigo_postal,
      localidad, provincia, telefono, email, situacion_afip, tipo_persona
    ) VALUES (
      v_comercio, btrim(coalesce(v_metadata->>'nombre', '')),
      btrim(coalesce(v_metadata->>'apellido', '')), '',
      btrim(coalesce(v_metadata->>'direccion', '')),
      btrim(coalesce(v_metadata->>'numero', '')), '',
      btrim(coalesce(v_metadata->>'localidad', '')), '',
      nullif(btrim(v_metadata->>'telefono'), ''), v_email,
      'Consumidor Final', 'fisica'
    ) RETURNING id INTO v_cliente_id;
  END IF;

  INSERT INTO public.cliente_usuarios (comercio_id, cliente_id, user_id, metodo)
  VALUES (v_comercio, v_cliente_id, new.id, 'registro_tienda')
  ON CONFLICT (comercio_id, user_id) DO NOTHING;
  RETURN new;
END;
$$;

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
    numero = btrim(coalesce(p_datos->>'numero', '')),
    localidad = btrim(coalesce(p_datos->>'localidad', ''))
  WHERE id = v_cliente AND comercio_id = v_comercio;

  UPDATE auth.users SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
    'nombre', btrim(p_datos->>'nombre'), 'apellido', btrim(p_datos->>'apellido'),
    'telefono', btrim(coalesce(p_datos->>'telefono', '')),
    'direccion', btrim(coalesce(p_datos->>'direccion', '')),
    'numero', btrim(coalesce(p_datos->>'numero', '')),
    'localidad', btrim(coalesce(p_datos->>'localidad', '')),
    'comercio_id', v_comercio::text
  ) WHERE id = v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_mi_cliente_tienda(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_mi_cliente_tienda(jsonb) TO authenticated;
