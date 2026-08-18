DO $$
DECLARE
  v_comercio constant uuid := '30e79cd0-360d-4a03-b634-bb7414ee505b';
  v_cliente_id uuid;
  v_user_id uuid;
BEGIN
  SELECT id INTO v_cliente_id
  FROM public.clientes
  WHERE comercio_id = v_comercio
    AND lower(btrim(nombre)) = 'marcos'
    AND lower(btrim(apellido)) = 'abella'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el cliente Marcos Abella en MATE KING';
  END IF;

  UPDATE public.clientes
  SET calle = 'Roque S. Peña 287', localidad = 'Jovita'
  WHERE id = v_cliente_id;

  SELECT user_id INTO v_user_id
  FROM public.cliente_usuarios
  WHERE comercio_id = v_comercio AND cliente_id = v_cliente_id
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('direccion', 'Roque S. Peña 287', 'localidad', 'Jovita')
    WHERE id = v_user_id;
  END IF;

  RAISE NOTICE 'Domicilio de Marcos Abella actualizado correctamente';
END;
$$;

