-- Gestion administrativa de operadores de Vortex Campo. Sin DELETE fisico.
BEGIN;

CREATE FUNCTION public.campo_listar_operadores_comercio(p_comercio_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  activo boolean,
  operario_id uuid,
  operario_nombre text,
  operario_activo boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'campo_operadores_no_disponibles' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT cu.user_id, lower(btrim(u.email)), cu.activo, o.id, o.nombre, o.activo
  FROM public.comercio_usuarios AS cu
  JOIN auth.users AS u ON u.id = cu.user_id
  LEFT JOIN public.campo_operarios AS o
    ON o.comercio_id = cu.comercio_id AND o.user_id = cu.user_id
  WHERE cu.comercio_id = p_comercio_id AND cu.rol = 'operador'
  ORDER BY lower(btrim(u.email)), cu.user_id;
END;
$function$;

CREATE FUNCTION public.campo_actualizar_operador_membresia(
  p_comercio_id uuid,
  p_user_id uuid,
  p_activo boolean
)
RETURNS TABLE (user_id uuid, activo boolean, rol text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_rol text; v_activo boolean;
BEGIN
  IF p_activo IS NULL THEN
    RAISE EXCEPTION 'campo_operador_no_disponible' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NULL OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'campo_operadores_no_disponibles' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('vortex_campo_operador_membresia:' || p_comercio_id::text || ':' || p_user_id::text, 0));
  SELECT cu.rol, cu.activo INTO v_rol, v_activo
  FROM public.comercio_usuarios AS cu
  WHERE cu.comercio_id = p_comercio_id AND cu.user_id = p_user_id
  FOR UPDATE;
  IF FOUND AND v_rol <> 'operador' THEN
    RAISE EXCEPTION 'campo_operador_no_disponible' USING ERRCODE = '42501';
  END IF;
  IF NOT FOUND THEN
    IF NOT p_activo OR NOT EXISTS (SELECT 1 FROM auth.users AS u WHERE u.id = p_user_id) THEN
      RAISE EXCEPTION 'campo_operador_no_disponible' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.comercio_usuarios (comercio_id, user_id, rol, activo)
    VALUES (p_comercio_id, p_user_id, 'operador', true);
    RETURN QUERY SELECT p_user_id, true, 'operador'::text;
    RETURN;
  END IF;
  UPDATE public.comercio_usuarios AS cu SET activo = p_activo
  WHERE cu.comercio_id = p_comercio_id AND cu.user_id = p_user_id AND cu.rol = 'operador'
  RETURNING cu.user_id, cu.activo, cu.rol INTO user_id, activo, rol;
  RETURN NEXT;
END;
$function$;

CREATE FUNCTION public.campo_vincular_operador(
  p_comercio_id uuid,
  p_user_id uuid,
  p_operario_id uuid DEFAULT NULL
)
RETURNS TABLE (user_id uuid, operario_id uuid, operario_nombre text, operario_activo boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_operario public.campo_operarios;
DECLARE v_membresia public.comercio_usuarios;
DECLARE v_first text; v_second text;
BEGIN
  IF auth.uid() IS NULL OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'campo_operadores_no_disponibles' USING ERRCODE = '42501';
  END IF;
  v_first := least(p_user_id::text, coalesce(p_operario_id::text, p_user_id::text));
  v_second := greatest(p_user_id::text, coalesce(p_operario_id::text, p_user_id::text));
  PERFORM pg_advisory_xact_lock(hashtextextended('vortex_campo_operador_vinculo:' || p_comercio_id::text || ':' || v_first, 0));
  IF v_second <> v_first THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('vortex_campo_operador_vinculo:' || p_comercio_id::text || ':' || v_second, 0));
  END IF;
  SELECT * INTO v_membresia
  FROM public.comercio_usuarios AS cu
  WHERE cu.comercio_id = p_comercio_id AND cu.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_membresia.comercio_id IS DISTINCT FROM p_comercio_id
    OR v_membresia.user_id IS DISTINCT FROM p_user_id
    OR v_membresia.rol <> 'operador'
    OR v_membresia.activo IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'campo_operador_no_disponible' USING ERRCODE = '42501'; END IF;
  IF p_operario_id IS NULL THEN
    UPDATE public.campo_operarios SET user_id = NULL
    WHERE comercio_id = p_comercio_id AND user_id = p_user_id;
    RETURN QUERY SELECT p_user_id, NULL::uuid, NULL::text, NULL::boolean;
    RETURN;
  END IF;
  SELECT * INTO v_operario FROM public.campo_operarios
  WHERE comercio_id = p_comercio_id AND id = p_operario_id AND activo
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campo_operador_no_disponible' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.campo_operarios AS o WHERE o.comercio_id = p_comercio_id AND o.user_id = p_user_id AND o.id <> p_operario_id) THEN
    RAISE EXCEPTION 'campo_operador_no_disponible' USING ERRCODE = '42501';
  END IF;
  IF v_operario.user_id IS NOT NULL AND v_operario.user_id <> p_user_id THEN
    RAISE EXCEPTION 'campo_operador_no_disponible' USING ERRCODE = '42501';
  END IF;
  UPDATE public.campo_operarios SET user_id = p_user_id
  WHERE comercio_id = p_comercio_id AND id = p_operario_id;
  RETURN QUERY SELECT p_user_id, v_operario.id, v_operario.nombre, v_operario.activo;
END;
$function$;

REVOKE ALL ON FUNCTION public.campo_listar_operadores_comercio(uuid),
  public.campo_actualizar_operador_membresia(uuid, uuid, boolean),
  public.campo_vincular_operador(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campo_listar_operadores_comercio(uuid),
  public.campo_actualizar_operador_membresia(uuid, uuid, boolean),
  public.campo_vincular_operador(uuid, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.campo_listar_operadores_comercio(uuid) IS
  'Solo admin del comercio. Lee email desde auth.users bajo SECURITY DEFINER y expone solamente identidad operativa y vinculo de operario.';
COMMENT ON FUNCTION public.campo_actualizar_operador_membresia(uuid, uuid, boolean) IS
  'Solo admin del comercio. Crea, reactiva o desactiva exclusivamente membresias operador; nunca modifica administradores ni elimina registros.';
COMMENT ON FUNCTION public.campo_vincular_operador(uuid, uuid, uuid) IS
  'Solo admin del comercio. Vincula o desvincula un operador activo con un operario activo del mismo tenant; serializa vinculos y solo actualiza campo_operarios.user_id.';

COMMIT;
