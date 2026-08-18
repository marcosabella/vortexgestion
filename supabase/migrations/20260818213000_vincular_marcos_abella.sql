-- Vincula la única cuenta Auth identificada con apellido Abella al cliente informado.
CREATE OR REPLACE FUNCTION public.set_comercio_id_from_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_comercio_id uuid;
BEGIN
  IF NEW.comercio_id IS NOT NULL THEN
    IF public.user_belongs_to_comercio(NEW.comercio_id) THEN
      RETURN NEW;
    END IF;

    -- Un comprador online solo puede crear su propio cliente, con el mismo
    -- correo y comercio declarados en su cuenta de autenticación.
    IF TG_TABLE_NAME = 'clientes' AND EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND lower(btrim(u.email)) = lower(btrim(NEW.email))
        AND u.raw_user_meta_data->>'comercio_id' = NEW.comercio_id::text
    ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'El usuario no pertenece al comercio indicado';
  END IF;

  resolved_comercio_id := public.current_comercio_id();
  IF resolved_comercio_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo resolver el comercio del usuario autenticado';
  END IF;
  NEW.comercio_id := resolved_comercio_id;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_comercio constant uuid := '30e79cd0-360d-4a03-b634-bb7414ee505b';
  v_user record;
  v_cliente_id uuid;
  v_coincidencias integer;
BEGIN
  SELECT count(*) INTO v_coincidencias
  FROM auth.users
  WHERE coalesce(raw_user_meta_data, '{}'::jsonb)::text ILIKE '%abella%';

  IF v_coincidencias <> 1 THEN
    RAISE EXCEPTION 'Se esperaba una única cuenta Abella y se encontraron %', v_coincidencias;
  END IF;

  SELECT id, lower(btrim(email)) AS email, coalesce(raw_user_meta_data, '{}'::jsonb) AS metadata
  INTO v_user
  FROM auth.users
  WHERE coalesce(raw_user_meta_data, '{}'::jsonb)::text ILIKE '%abella%';

  v_user.metadata := v_user.metadata || jsonb_build_object(
    'comercio_id', v_comercio::text, 'nombre', 'Marcos', 'apellido', 'Abella'
  );
  UPDATE auth.users SET raw_user_meta_data = v_user.metadata WHERE id = v_user.id;
  PERFORM set_config('request.jwt.claim.sub', v_user.id::text, true);

  SELECT id INTO v_cliente_id
  FROM public.clientes
  WHERE comercio_id = v_comercio AND lower(btrim(email)) = v_user.email
  ORDER BY created_at LIMIT 1;

  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (
      comercio_id, nombre, apellido, cuit, calle, numero, codigo_postal,
      localidad, provincia, telefono, email, situacion_afip, tipo_persona
    ) VALUES (
      v_comercio, 'Marcos', 'Abella', '',
      btrim(coalesce(v_user.metadata->>'direccion', '')), '', '',
      btrim(coalesce(v_user.metadata->>'localidad', '')), '',
      nullif(btrim(v_user.metadata->>'telefono'), ''), v_user.email,
      'Consumidor Final', 'fisica'
    ) RETURNING id INTO v_cliente_id;
  ELSE
    UPDATE public.clientes
    SET nombre = 'Marcos', apellido = 'Abella',
        calle = coalesce(nullif(calle, ''), btrim(v_user.metadata->>'direccion')),
        localidad = coalesce(nullif(localidad, ''), btrim(v_user.metadata->>'localidad')),
        telefono = coalesce(telefono, nullif(btrim(v_user.metadata->>'telefono'), ''))
    WHERE id = v_cliente_id;
  END IF;

  INSERT INTO public.cliente_usuarios (comercio_id, cliente_id, user_id, metodo)
  VALUES (v_comercio, v_cliente_id, v_user.id, 'registro_tienda')
  ON CONFLICT (comercio_id, user_id) DO NOTHING;

  RAISE NOTICE 'Cliente Marcos Abella creado/vinculado correctamente';
END;
$$;
