-- Regulariza registros hechos por la versión anterior de la tienda, que no enviaba comercio_id.
DO $$
DECLARE
  v_comercio constant uuid := '30e79cd0-360d-4a03-b634-bb7414ee505b';
  v_user record;
  v_cliente_id uuid;
  v_nombre text;
  v_apellido text;
  v_procesados integer := 0;
BEGIN
  FOR v_user IN
    SELECT id, lower(btrim(email)) AS email, coalesce(raw_user_meta_data, '{}'::jsonb) AS metadata
    FROM auth.users u
    WHERE (
      lower(btrim(coalesce(raw_user_meta_data->>'nombre', ''))) = 'marcos abella'
      OR (
        lower(btrim(coalesce(raw_user_meta_data->>'nombre', ''))) = 'marcos'
        AND lower(btrim(coalesce(raw_user_meta_data->>'apellido', ''))) = 'abella'
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.cliente_usuarios cu
      WHERE cu.comercio_id = v_comercio AND cu.user_id = u.id
    )
  LOOP
    IF nullif(btrim(v_user.metadata->>'apellido'), '') IS NOT NULL THEN
      v_nombre := btrim(v_user.metadata->>'nombre');
      v_apellido := btrim(v_user.metadata->>'apellido');
    ELSE
      v_nombre := split_part(btrim(v_user.metadata->>'nombre'), ' ', 1);
      v_apellido := btrim(substr(btrim(v_user.metadata->>'nombre'), length(v_nombre) + 1));
    END IF;

    SELECT id INTO v_cliente_id
    FROM public.clientes
    WHERE comercio_id = v_comercio AND lower(btrim(email)) = v_user.email
    ORDER BY created_at LIMIT 1;

    IF v_cliente_id IS NULL THEN
      INSERT INTO public.clientes (
        comercio_id, nombre, apellido, cuit, calle, numero, codigo_postal,
        localidad, provincia, telefono, email, situacion_afip, tipo_persona
      ) VALUES (
        v_comercio, v_nombre, v_apellido, '',
        btrim(coalesce(v_user.metadata->>'direccion', '')), '', '',
        btrim(coalesce(v_user.metadata->>'localidad', '')), '',
        nullif(btrim(v_user.metadata->>'telefono'), ''), v_user.email,
        'Consumidor Final', 'fisica'
      ) RETURNING id INTO v_cliente_id;
    END IF;

    INSERT INTO public.cliente_usuarios (comercio_id, cliente_id, user_id, metodo)
    VALUES (v_comercio, v_cliente_id, v_user.id, 'registro_tienda')
    ON CONFLICT (comercio_id, user_id) DO NOTHING;

    UPDATE auth.users
    SET raw_user_meta_data = v_user.metadata || jsonb_build_object(
      'comercio_id', v_comercio::text, 'nombre', v_nombre, 'apellido', v_apellido
    )
    WHERE id = v_user.id;

    v_procesados := v_procesados + 1;
  END LOOP;

  RAISE NOTICE 'Registros legacy de Marcos Abella procesados: %', v_procesados;
END;
$$;

