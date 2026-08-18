-- Crea o vincula el cliente de MATE KING cuando una persona se registra en la tienda.
ALTER TABLE public.cliente_usuarios
  DROP CONSTRAINT IF EXISTS cliente_usuarios_metodo_check;
ALTER TABLE public.cliente_usuarios
  ADD CONSTRAINT cliente_usuarios_metodo_check
  CHECK (metodo IN ('email_verificado', 'creado_pedido', 'manual', 'registro_tienda'));

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
  -- Solo procesa registros realizados por la tienda de MATE KING.
  IF v_metadata->>'comercio_id' IS DISTINCT FROM v_comercio::text THEN
    RETURN new;
  END IF;

  SELECT id INTO v_cliente_id
  FROM public.clientes
  WHERE comercio_id = v_comercio
    AND lower(btrim(email)) = v_email
  ORDER BY created_at
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (
      comercio_id, nombre, apellido, cuit, calle, numero, codigo_postal,
      localidad, provincia, telefono, email, situacion_afip, tipo_persona
    ) VALUES (
      v_comercio,
      btrim(coalesce(v_metadata->>'nombre', '')),
      btrim(coalesce(v_metadata->>'apellido', '')),
      '',
      btrim(coalesce(v_metadata->>'direccion', '')),
      '',
      '',
      btrim(coalesce(v_metadata->>'localidad', '')),
      '',
      nullif(btrim(v_metadata->>'telefono'), ''),
      v_email,
      'Consumidor Final',
      'fisica'
    )
    RETURNING id INTO v_cliente_id;
  END IF;

  INSERT INTO public.cliente_usuarios (comercio_id, cliente_id, user_id, metodo)
  VALUES (v_comercio, v_cliente_id, new.id, 'registro_tienda')
  ON CONFLICT (comercio_id, user_id) DO NOTHING;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS crear_cliente_tienda_al_registrar ON auth.users;
CREATE TRIGGER crear_cliente_tienda_al_registrar
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.registrar_cliente_tienda_desde_auth();
