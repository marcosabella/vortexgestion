-- Solo esquema/funciones: no regulariza clientes historicos ni altera pagos.
-- Uso interno desde el alta de Auth y desde el checkout, nunca desde el navegador.
CREATE OR REPLACE FUNCTION public.resolver_cliente_cuenta_tienda(p_comercio uuid, p_user uuid, p_datos jsonb, p_metodo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_email text; v_confirmado timestamptz; v_cliente uuid; v_cantidad integer;
  v_motivo text;
BEGIN
  IF p_metodo NOT IN ('registro_tienda','creado_pedido') THEN RAISE EXCEPTION 'Metodo invalido'; END IF;
  -- Serializa pedidos simultaneos de una misma cuenta y usa el correo de Auth.
  SELECT lower(btrim(email)), email_confirmed_at INTO v_email, v_confirmado
  FROM auth.users WHERE id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta inexistente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.comercio WHERE id=p_comercio) THEN RAISE EXCEPTION 'Comercio inexistente'; END IF;
  SELECT cu.cliente_id INTO v_cliente FROM public.cliente_usuarios cu
  JOIN public.clientes c ON c.id=cu.cliente_id AND c.comercio_id=cu.comercio_id
  WHERE cu.comercio_id=p_comercio AND cu.user_id=p_user;
  IF v_cliente IS NOT NULL THEN RETURN v_cliente; END IF;

  -- Dos cuentas que llegan a la vez con el mismo correo no crean dos fichas.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_comercio::text||':'||coalesce(v_email,''),0));
  SELECT count(*) INTO v_cantidad FROM public.clientes
  WHERE comercio_id=p_comercio AND lower(btrim(email))=v_email;
  IF nullif(v_email,'') IS NULL THEN
    v_motivo:='email_no_verificado';
  ELSIF v_cantidad=0 THEN
    INSERT INTO public.clientes(comercio_id,nombre,apellido,cuit,calle,numero,codigo_postal,localidad,provincia,telefono,email,situacion_afip,tipo_persona)
    VALUES(p_comercio,btrim(coalesce(p_datos->>'nombre','')),btrim(coalesce(p_datos->>'apellido','')),'',
      btrim(coalesce(p_datos->>'direccion','')),btrim(coalesce(p_datos->>'numero','')),'',
      btrim(coalesce(p_datos->>'localidad','')),'',nullif(btrim(p_datos->>'telefono'),''),v_email,'Consumidor Final','fisica')
    RETURNING id INTO v_cliente;
    INSERT INTO public.cliente_usuarios(comercio_id,cliente_id,user_id,metodo)
    VALUES(p_comercio,v_cliente,p_user,p_metodo);
  ELSIF v_confirmado IS NULL THEN
    v_motivo:='email_no_verificado';
  ELSIF v_cantidad<>1 THEN
    v_motivo:='email_duplicado';
  ELSE
    SELECT id INTO v_cliente FROM public.clientes
    WHERE comercio_id=p_comercio AND lower(btrim(email))=v_email FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.cliente_usuarios WHERE comercio_id=p_comercio AND cliente_id=v_cliente) THEN
      v_cliente:=NULL;
      v_motivo:='email_duplicado';
    ELSE
      INSERT INTO public.cliente_usuarios(comercio_id,cliente_id,user_id,metodo)
      VALUES(p_comercio,v_cliente,p_user,'email_verificado');
    END IF;
  END IF;
  IF v_motivo IS NOT NULL THEN
    INSERT INTO public.cliente_vinculaciones_pendientes(comercio_id,user_id,email,motivo,coincidencias)
    VALUES(p_comercio,p_user,coalesce(v_email,''),v_motivo,v_cantidad)
    ON CONFLICT(comercio_id,user_id) DO UPDATE SET email=excluded.email,motivo=excluded.motivo,coincidencias=excluded.coincidencias,updated_at=now();
  ELSE
    DELETE FROM public.cliente_vinculaciones_pendientes WHERE comercio_id=p_comercio AND user_id=p_user;
  END IF;
  RETURN v_cliente;
END $$;
REVOKE ALL ON FUNCTION public.resolver_cliente_cuenta_tienda(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.registrar_cliente_tienda_desde_auth()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_comercio uuid; v_metadata jsonb:=coalesce(new.raw_user_meta_data,'{}'::jsonb);
  v_previous_sub text:=current_setting('request.jwt.claim.sub',true);
BEGIN
  -- Metadata invalida o un registro ajeno a una tienda no debe romper Auth.
  BEGIN
    v_comercio:=nullif(v_metadata->>'comercio_id','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RETURN new;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.comercio_parametrizacion
    WHERE comercio_id=v_comercio AND parametros->'modulos'->>'pedidos_online'='true') THEN RETURN new; END IF;
  PERFORM set_config('request.jwt.claim.sub',new.id::text,true);
  PERFORM public.resolver_cliente_cuenta_tienda(v_comercio,new.id,v_metadata,'registro_tienda');
  PERFORM set_config('request.jwt.claim.sub',coalesce(v_previous_sub,''),true);
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.registrar_cliente_tienda_desde_auth() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.crear_pedido_online(p_cliente jsonb, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_user uuid := auth.uid(); v_comercio uuid; v_pedido public.pedidos_online;
  v_item jsonb; v_producto public.productos; v_variante public.producto_variantes;
  v_total numeric := 0; v_cliente_id uuid; v_email text := lower(btrim(coalesce(p_cliente->>'email','')));
  v_entrega text := lower(btrim(coalesce(p_cliente->>'entrega','retiro'))); v_descripcion text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debe iniciar sesion para realizar el pago'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'El carrito esta vacio'; END IF;
  IF nullif(btrim(p_cliente->>'nombre'),'') IS NULL OR nullif(btrim(p_cliente->>'telefono'),'') IS NULL OR nullif(v_email,'') IS NULL THEN RAISE EXCEPTION 'Complete nombre, correo electronico y telefono'; END IF;

  SELECT comercio_id INTO v_comercio FROM public.productos WHERE id=(p_items->0->>'producto_id')::uuid;
  IF v_comercio IS NULL THEN RAISE EXCEPTION 'Producto no disponible'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_producto FROM public.productos WHERE id=(v_item->>'producto_id')::uuid FOR UPDATE;
    IF v_producto.id IS NULL OR v_producto.comercio_id<>v_comercio OR NOT v_producto.visible_en_tienda OR (v_item->>'cantidad')::integer<=0 THEN RAISE EXCEPTION 'Producto no disponible'; END IF;
    IF nullif(v_item->>'variante_id','') IS NOT NULL THEN
      SELECT * INTO v_variante FROM public.producto_variantes WHERE id=(v_item->>'variante_id')::uuid AND producto_id=v_producto.id FOR UPDATE;
      IF v_variante.id IS NULL OR v_variante.stock<(v_item->>'cantidad')::integer THEN RAISE EXCEPTION 'Stock insuficiente para la variante seleccionada'; END IF;
    ELSIF EXISTS (SELECT 1 FROM public.producto_variantes WHERE producto_id=v_producto.id) THEN
      RAISE EXCEPTION 'Seleccione color y talle para %', v_producto.descripcion;
    ELSIF v_producto.stock<(v_item->>'cantidad')::integer THEN RAISE EXCEPTION 'Stock insuficiente para %', v_producto.descripcion;
    END IF;
    v_total:=v_total+v_producto.precio_venta*(v_item->>'cantidad')::integer;
  END LOOP;

  v_cliente_id:=public.resolver_cliente_cuenta_tienda(v_comercio,v_user,p_cliente,'creado_pedido');
  INSERT INTO public.pedidos_online(comercio_id,cliente_id,cliente_user_id,cliente_nombre,cliente_email,cliente_telefono,cliente_direccion,observaciones,total)
  VALUES(v_comercio,v_cliente_id,v_user,btrim(p_cliente->>'nombre'),v_email,btrim(p_cliente->>'telefono'),CASE WHEN v_entrega='envio' THEN concat_ws(', ',btrim(p_cliente->>'direccion'),btrim(p_cliente->>'localidad')) ELSE 'Retiro en el local' END,nullif(btrim(p_cliente->>'observaciones'),''),v_total) RETURNING * INTO v_pedido;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_producto FROM public.productos WHERE id=(v_item->>'producto_id')::uuid;
    v_descripcion:=v_producto.descripcion;
    IF nullif(v_item->>'variante_id','') IS NOT NULL THEN
      SELECT * INTO v_variante FROM public.producto_variantes WHERE id=(v_item->>'variante_id')::uuid;
      v_descripcion:=v_descripcion||' ('||coalesce((SELECT nombre FROM public.producto_colores WHERE id=v_variante.color_id)||' ','')||coalesce((SELECT nombre FROM public.producto_talles WHERE id=v_variante.talle_id),'')||')';
      INSERT INTO public.pedido_online_items(pedido_id,producto_id,producto_variante_id,descripcion,cantidad,precio_unitario,subtotal) VALUES(v_pedido.id,v_producto.id,v_variante.id,v_descripcion,(v_item->>'cantidad')::integer,v_producto.precio_venta,v_producto.precio_venta*(v_item->>'cantidad')::integer);
    ELSE
      INSERT INTO public.pedido_online_items(pedido_id,producto_id,descripcion,cantidad,precio_unitario,subtotal) VALUES(v_pedido.id,v_producto.id,v_descripcion,(v_item->>'cantidad')::integer,v_producto.precio_venta,v_producto.precio_venta*(v_item->>'cantidad')::integer);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('id',v_pedido.id,'numero',v_pedido.numero,'total',v_total,'estado',v_pedido.estado,'cliente_id',v_cliente_id);
END $$;
REVOKE ALL ON FUNCTION public.crear_pedido_online(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crear_pedido_online(jsonb,jsonb) TO authenticated;
