-- Permite que el trigger de Auth actúe con la identidad del comprador durante el alta.
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
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
BEGIN
  IF v_metadata->>'comercio_id' IS DISTINCT FROM v_comercio::text THEN
    RETURN new;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', new.id::text, true);

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
      btrim(coalesce(v_metadata->>'direccion', '')), '', '',
      btrim(coalesce(v_metadata->>'localidad', '')), '',
      nullif(btrim(v_metadata->>'telefono'), ''), v_email,
      'Consumidor Final', 'fisica'
    ) RETURNING id INTO v_cliente_id;
  END IF;

  INSERT INTO public.cliente_usuarios (comercio_id, cliente_id, user_id, metodo)
  VALUES (v_comercio, v_cliente_id, new.id, 'registro_tienda')
  ON CONFLICT (comercio_id, user_id) DO NOTHING;

  PERFORM set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);
  RETURN new;
END;
$$;

