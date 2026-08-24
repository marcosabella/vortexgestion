-- Permite pedidos online de invitados sin crear un circuito paralelo:
-- pedidos, items, clientes, stock y notificaciones siguen usando las tablas del sistema.
CREATE OR REPLACE FUNCTION public.crear_pedido_online(p_cliente jsonb, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_comercio constant uuid := '30e79cd0-360d-4a03-b634-bb7414ee505b';
  v_pedido public.pedidos_online;
  v_item jsonb;
  v_producto public.productos;
  v_total numeric := 0;
  v_notificacion uuid;
  v_auth_email text;
  v_email_confirmado timestamptz;
  v_email text := lower(btrim(coalesce(p_cliente->>'email', '')));
  v_entrega text := lower(btrim(coalesce(p_cliente->>'entrega', 'retiro')));
  v_direccion text;
  v_cliente_id uuid;
  v_coincidencias integer := 0;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El carrito esta vacio';
  END IF;
  IF nullif(btrim(p_cliente->>'nombre'), '') IS NULL
     OR nullif(btrim(p_cliente->>'telefono'), '') IS NULL
     OR nullif(v_email, '') IS NULL THEN
    RAISE EXCEPTION 'Complete nombre, correo electronico y telefono';
  END IF;
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Ingrese un correo electronico valido';
  END IF;
  IF v_entrega NOT IN ('retiro', 'envio') THEN
    RAISE EXCEPTION 'La forma de entrega no es valida';
  END IF;
  IF v_entrega = 'envio' AND (
    nullif(btrim(p_cliente->>'direccion'), '') IS NULL OR
    nullif(btrim(p_cliente->>'localidad'), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Complete direccion y localidad para el envio';
  END IF;

  v_direccion := CASE
    WHEN v_entrega = 'envio' THEN concat_ws(', ', btrim(p_cliente->>'direccion'), btrim(p_cliente->>'localidad'))
    ELSE 'Retiro en el local'
  END;

  -- Si hay sesión, conserva la vinculación segura usuario-cliente existente.
  IF v_user IS NOT NULL THEN
    SELECT lower(btrim(email)), email_confirmed_at
      INTO v_auth_email, v_email_confirmado
      FROM auth.users WHERE id = v_user;
    v_email := coalesce(nullif(v_auth_email, ''), v_email);

    SELECT cliente_id INTO v_cliente_id
      FROM public.cliente_usuarios
      WHERE comercio_id = v_comercio AND user_id = v_user;

    IF v_cliente_id IS NULL AND v_email_confirmado IS NOT NULL AND nullif(v_email, '') IS NOT NULL THEN
      SELECT count(*), (array_agg(id ORDER BY created_at))[1] INTO v_coincidencias, v_cliente_id
        FROM public.clientes
        WHERE comercio_id = v_comercio AND lower(btrim(email)) = v_email;
      IF v_coincidencias = 1 THEN
        INSERT INTO public.cliente_usuarios(comercio_id, cliente_id, user_id, metodo)
        VALUES(v_comercio, v_cliente_id, v_user, 'email_verificado')
        ON CONFLICT (comercio_id, user_id) DO NOTHING;
        DELETE FROM public.cliente_vinculaciones_pendientes
          WHERE comercio_id = v_comercio AND user_id = v_user;
      ELSIF v_coincidencias = 0 THEN
        INSERT INTO public.clientes(comercio_id,nombre,apellido,cuit,calle,numero,codigo_postal,localidad,provincia,telefono,email,situacion_afip,tipo_persona)
        VALUES(v_comercio,btrim(p_cliente->>'nombre'),'','',btrim(coalesce(p_cliente->>'direccion','')),'','',btrim(coalesce(p_cliente->>'localidad','')),'',btrim(p_cliente->>'telefono'),v_email,'Consumidor Final','fisica')
        RETURNING id INTO v_cliente_id;
        INSERT INTO public.cliente_usuarios(comercio_id, cliente_id, user_id, metodo)
        VALUES(v_comercio, v_cliente_id, v_user, 'creado_pedido');
      ELSE
        v_cliente_id := NULL;
        INSERT INTO public.cliente_vinculaciones_pendientes(comercio_id,user_id,email,motivo,coincidencias)
        VALUES(v_comercio,v_user,v_email,'email_duplicado',v_coincidencias)
        ON CONFLICT (comercio_id,user_id) DO UPDATE
          SET email=excluded.email,motivo=excluded.motivo,coincidencias=excluded.coincidencias,updated_at=now();
      END IF;
    ELSIF v_cliente_id IS NULL THEN
      INSERT INTO public.cliente_vinculaciones_pendientes(comercio_id,user_id,email,motivo,coincidencias)
      VALUES(v_comercio,v_user,coalesce(v_email,''),'email_no_verificado',0)
      ON CONFLICT (comercio_id,user_id) DO UPDATE
        SET email=excluded.email,motivo=excluded.motivo,coincidencias=0,updated_at=now();
    END IF;
  ELSE
    -- Invitado: reutiliza una coincidencia única por email o crea su ficha comercial.
    SELECT count(*), (array_agg(id ORDER BY created_at))[1] INTO v_coincidencias, v_cliente_id
      FROM public.clientes
      WHERE comercio_id = v_comercio AND lower(btrim(email)) = v_email;
    IF v_coincidencias = 0 THEN
      INSERT INTO public.clientes(comercio_id,nombre,apellido,cuit,calle,numero,codigo_postal,localidad,provincia,telefono,email,situacion_afip,tipo_persona)
      VALUES(v_comercio,btrim(p_cliente->>'nombre'),'','',btrim(coalesce(p_cliente->>'direccion','')),'','',btrim(coalesce(p_cliente->>'localidad','')),'',btrim(p_cliente->>'telefono'),v_email,'Consumidor Final','fisica')
      RETURNING id INTO v_cliente_id;
    ELSIF v_coincidencias > 1 THEN
      v_cliente_id := NULL;
    END IF;
  END IF;

  -- Bloquea cada producto mientras valida y calcula; todo revierte ante cualquier error.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_producto
      FROM public.productos
      WHERE id = (v_item->>'producto_id')::uuid
      FOR UPDATE;
    IF v_producto.id IS NULL OR v_producto.comercio_id <> v_comercio OR NOT v_producto.visible_en_tienda THEN
      RAISE EXCEPTION 'Producto no disponible';
    END IF;
    IF (v_item->>'cantidad')::integer <= 0 OR v_producto.stock < (v_item->>'cantidad')::integer THEN
      RAISE EXCEPTION 'Stock insuficiente para %', v_producto.descripcion;
    END IF;
    v_total := v_total + v_producto.precio_venta * (v_item->>'cantidad')::integer;
  END LOOP;

  INSERT INTO public.pedidos_online(
    comercio_id,cliente_id,cliente_user_id,cliente_nombre,cliente_email,
    cliente_telefono,cliente_direccion,observaciones,total
  ) VALUES (
    v_comercio,v_cliente_id,v_user,btrim(p_cliente->>'nombre'),v_email,
    btrim(p_cliente->>'telefono'),v_direccion,nullif(btrim(p_cliente->>'observaciones'),''),v_total
  ) RETURNING * INTO v_pedido;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_producto FROM public.productos WHERE id = (v_item->>'producto_id')::uuid;
    INSERT INTO public.pedido_online_items(pedido_id,producto_id,descripcion,cantidad,precio_unitario,subtotal)
    VALUES(v_pedido.id,v_producto.id,v_producto.descripcion,(v_item->>'cantidad')::integer,v_producto.precio_venta,v_producto.precio_venta*(v_item->>'cantidad')::integer);
    UPDATE public.productos SET stock = stock - (v_item->>'cantidad')::integer WHERE id = v_producto.id;
  END LOOP;

  INSERT INTO public.notificaciones(titulo,mensaje,categoria,prioridad,metadata,created_by)
  VALUES(
    'Nuevo pedido online #'||v_pedido.numero,
    'Se recibio un pedido de '||v_pedido.cliente_nombre||' por $ '||v_total,
    'general','alta',
    jsonb_build_object('tipo','pedido_online','pedido_id',v_pedido.id,'numero',v_pedido.numero,'cliente_id',v_cliente_id,'entrega',v_entrega,'invitado',v_user IS NULL),
    v_user
  ) RETURNING id INTO v_notificacion;
  INSERT INTO public.notificacion_destinatarios(notificacion_id,comercio_id)
  VALUES(v_notificacion,v_comercio);

  RETURN jsonb_build_object('id',v_pedido.id,'numero',v_pedido.numero,'total',v_total,'estado',v_pedido.estado,'cliente_id',v_cliente_id);
END;
$$;

REVOKE ALL ON FUNCTION public.crear_pedido_online(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_pedido_online(jsonb,jsonb) TO anon, authenticated;
