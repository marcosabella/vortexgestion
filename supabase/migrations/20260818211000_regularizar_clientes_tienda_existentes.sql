-- Regulariza usuarios de MATE KING registrados antes de crear el trigger de sincronización.
DO $$
DECLARE
  v_comercio constant uuid := '30e79cd0-360d-4a03-b634-bb7414ee505b';
  v_user record;
  v_cliente_id uuid;
BEGIN
  FOR v_user IN
    SELECT id, lower(btrim(email)) AS email, coalesce(raw_user_meta_data, '{}'::jsonb) AS metadata
    FROM auth.users
    WHERE raw_user_meta_data->>'comercio_id' = v_comercio::text
  LOOP
    SELECT id INTO v_cliente_id
    FROM public.clientes
    WHERE comercio_id = v_comercio
      AND lower(btrim(email)) = v_user.email
    ORDER BY created_at
    LIMIT 1;

    IF v_cliente_id IS NULL THEN
      INSERT INTO public.clientes (
        comercio_id, nombre, apellido, cuit, calle, numero, codigo_postal,
        localidad, provincia, telefono, email, situacion_afip, tipo_persona
      ) VALUES (
        v_comercio,
        btrim(coalesce(v_user.metadata->>'nombre', '')),
        btrim(coalesce(v_user.metadata->>'apellido', '')),
        '', btrim(coalesce(v_user.metadata->>'direccion', '')), '', '',
        btrim(coalesce(v_user.metadata->>'localidad', '')), '',
        nullif(btrim(v_user.metadata->>'telefono'), ''), v_user.email,
        'Consumidor Final', 'fisica'
      )
      RETURNING id INTO v_cliente_id;
    END IF;

    INSERT INTO public.cliente_usuarios (comercio_id, cliente_id, user_id, metodo)
    VALUES (v_comercio, v_cliente_id, v_user.id, 'registro_tienda')
    ON CONFLICT (comercio_id, user_id) DO NOTHING;
  END LOOP;
END;
$$;

