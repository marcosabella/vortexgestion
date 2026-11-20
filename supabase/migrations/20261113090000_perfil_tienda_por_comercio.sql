-- Ampliación compatible. Conserva la función histórica de un argumento.
-- No modifica datos existentes. Aplicar únicamente con autorización expresa.
BEGIN;
CREATE FUNCTION public.actualizar_mi_cliente_tienda(p_datos jsonb, p_comercio_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_cliente uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debe iniciar sesión' USING ERRCODE='42501'; END IF;
  IF p_comercio_id IS NULL THEN RAISE EXCEPTION 'Comercio requerido'; END IF;
  IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object'
    OR nullif(btrim(p_datos->>'nombre'),'') IS NULL
    OR nullif(btrim(p_datos->>'apellido'),'') IS NULL THEN
    RAISE EXCEPTION 'Nombre y apellido son obligatorios';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each_text(p_datos) AS dato WHERE length(dato.value)>250) THEN
    RAISE EXCEPTION 'Los datos superan la longitud permitida';
  END IF;
  -- El tenant proviene del vínculo persistido, nunca de metadata editable.
  SELECT cu.cliente_id INTO v_cliente
  FROM public.cliente_usuarios cu JOIN public.clientes c
    ON c.id=cu.cliente_id AND c.comercio_id=cu.comercio_id
  WHERE cu.comercio_id=p_comercio_id AND cu.user_id=v_user
  FOR UPDATE OF c;
  IF v_cliente IS NULL THEN
    RAISE EXCEPTION 'La cuenta no está vinculada a un cliente de este comercio' USING ERRCODE='42501';
  END IF;
  UPDATE public.clientes SET nombre=btrim(p_datos->>'nombre'),apellido=btrim(p_datos->>'apellido'),
    telefono=nullif(btrim(p_datos->>'telefono'),''),calle=btrim(coalesce(p_datos->>'direccion','')),
    numero=btrim(coalesce(p_datos->>'numero','')),localidad=btrim(coalesce(p_datos->>'localidad',''))
  WHERE id=v_cliente AND comercio_id=p_comercio_id;
  UPDATE auth.users SET raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||jsonb_build_object(
    'nombre',btrim(p_datos->>'nombre'),'apellido',btrim(p_datos->>'apellido'),
    'telefono',btrim(coalesce(p_datos->>'telefono','')),'direccion',btrim(coalesce(p_datos->>'direccion','')),
    'numero',btrim(coalesce(p_datos->>'numero','')),'localidad',btrim(coalesce(p_datos->>'localidad','')))
  WHERE id=v_user;
END $$;
REVOKE ALL ON FUNCTION public.actualizar_mi_cliente_tienda(jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.actualizar_mi_cliente_tienda(jsonb,uuid) TO authenticated;
COMMIT;
