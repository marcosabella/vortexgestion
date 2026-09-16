-- Un intento de Checkout Pro no confirma una venta ni debe alterar el inventario.
-- El stock se descuenta en la misma transaccion que confirma el pago informado
-- por Mercado Pago.

-- Hasta esta migracion las reservas pendientes ya habian descontado stock.
-- Se lo devuelve una sola vez, por pedido que tenga un Checkout sin aprobar.
DO $$
DECLARE v_pedido record; v_item record;
BEGIN
  FOR v_pedido IN
    SELECT p.id
    FROM public.pedidos_online p
    WHERE p.estado_pago IN ('no_iniciado','pendiente')
      AND p.estado <> 'cancelado'
      AND EXISTS (
        SELECT 1 FROM public.mercadopago_operaciones o
        WHERE o.pedido_online_id=p.id
          AND o.modalidad='checkout_pro'
          AND o.estado NOT IN ('aprobado','rechazado','cancelado','vencido','reembolsado','parcialmente_reembolsado')
      )
  LOOP
    FOR v_item IN SELECT producto_id,producto_variante_id,cantidad FROM public.pedido_online_items WHERE pedido_id=v_pedido.id LOOP
      IF v_item.producto_variante_id IS NULL THEN
        UPDATE public.productos SET stock=stock+v_item.cantidad WHERE id=v_item.producto_id;
      ELSE
        UPDATE public.producto_variantes SET stock=stock+v_item.cantidad WHERE id=v_item.producto_variante_id;
      END IF;
    END LOOP;
  END LOOP;
END $$;

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

  SELECT cliente_id INTO v_cliente_id FROM public.cliente_usuarios WHERE comercio_id=v_comercio AND user_id=v_user;
  IF v_cliente_id IS NULL THEN SELECT id INTO v_cliente_id FROM public.clientes WHERE comercio_id=v_comercio AND lower(btrim(email))=v_email ORDER BY created_at LIMIT 1; END IF;
  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes(comercio_id,nombre,apellido,cuit,calle,numero,codigo_postal,localidad,provincia,telefono,email,situacion_afip,tipo_persona)
    VALUES(v_comercio,btrim(p_cliente->>'nombre'),'','',btrim(coalesce(p_cliente->>'direccion','')),'','',btrim(coalesce(p_cliente->>'localidad','')),'',btrim(p_cliente->>'telefono'),v_email,'Consumidor Final','fisica') RETURNING id INTO v_cliente_id;
  END IF;
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
REVOKE EXECUTE ON FUNCTION public.crear_pedido_online(jsonb,jsonb) FROM anon;

CREATE OR REPLACE FUNCTION public.registrar_pago_mercadopago_aprobado(p_operacion_id uuid,p_payment_id text,p_medio_pago text,p_cuotas integer,p_raw jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_op public.mercadopago_operaciones; v_item record; v_pago_id uuid; v_actualizados integer;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Operacion reservada al backend'; END IF;
  SELECT * INTO v_op FROM public.mercadopago_operaciones WHERE id=p_operacion_id FOR UPDATE;
  IF v_op.id IS NULL THEN RAISE EXCEPTION 'Operacion inexistente'; END IF;
  IF v_op.estado='aprobado' THEN RETURN; END IF;
  IF v_op.pedido_online_id IS NOT NULL THEN
    FOR v_item IN SELECT producto_id,producto_variante_id,cantidad FROM public.pedido_online_items WHERE pedido_id=v_op.pedido_online_id LOOP
      IF v_item.producto_variante_id IS NULL THEN
        UPDATE public.productos SET stock=stock-v_item.cantidad WHERE id=v_item.producto_id AND comercio_id=v_op.comercio_id AND stock>=v_item.cantidad;
      ELSE
        UPDATE public.producto_variantes SET stock=stock-v_item.cantidad WHERE id=v_item.producto_variante_id AND stock>=v_item.cantidad;
      END IF;
      GET DIAGNOSTICS v_actualizados = ROW_COUNT;
      IF v_actualizados=0 THEN RAISE EXCEPTION 'No hay stock disponible para confirmar el pedido pagado'; END IF;
    END LOOP;
  END IF;
  UPDATE public.mercadopago_operaciones SET estado='aprobado',payment_id=p_payment_id,medio_pago=p_medio_pago,cuotas=p_cuotas,approved_at=now(),raw_response=p_raw WHERE id=v_op.id;
  IF v_op.pedido_online_id IS NOT NULL THEN
    UPDATE public.pedidos_online SET estado_pago='aprobado',importe_pagado=v_op.importe WHERE id=v_op.pedido_online_id;
  ELSE
    INSERT INTO public.pagos_venta(comercio_id,venta_id,tipo_pago,monto,mercadopago_operacion_id)
    SELECT v_op.comercio_id,v_op.venta_id,'mercado_pago'::public.tipo_pago,v_op.importe,v_op.id WHERE NOT EXISTS (SELECT 1 FROM public.pagos_venta WHERE mercadopago_operacion_id=v_op.id) RETURNING id INTO v_pago_id;
    UPDATE public.mercadopago_operaciones SET pago_venta_id=coalesce(v_pago_id,pago_venta_id) WHERE id=v_op.id;
  END IF;
END $$;

-- El comercio debe llegar desde la tienda que hace la consulta. Sin ese dato
-- no es posible distinguir dos tiendas para el mismo usuario de Auth, por lo
-- que se devuelve una lista vacia en vez de filtrar datos de otra tienda.
DROP FUNCTION IF EXISTS public.get_mi_historial_compras();
CREATE FUNCTION public.get_mi_historial_compras(p_comercio_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid:=auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debe iniciar sesion'; END IF;
  IF p_comercio_id IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((SELECT jsonb_agg(compra ORDER BY (compra->>'created_at')::timestamptz DESC) FROM (
    SELECT jsonb_build_object('id',po.id,'numero',po.numero::text,'origen','online','estado',po.estado,'estado_pago',po.estado_pago,'importe_pagado',po.importe_pagado,'total',po.total,'created_at',po.created_at,'observaciones',po.observaciones,'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'descripcion',i.descripcion,'cantidad',i.cantidad,'precio_unitario',i.precio_unitario,'subtotal',i.subtotal) ORDER BY i.id) FROM public.pedido_online_items i WHERE i.pedido_id=po.id),'[]'::jsonb)) compra FROM public.pedidos_online po WHERE po.comercio_id=p_comercio_id AND po.cliente_user_id=v_user
    UNION ALL
    SELECT jsonb_build_object('id',v.id,'numero',v.numero_comprobante,'origen','local','estado','completada','estado_pago','aprobado','importe_pagado',v.total,'total',v.total,'created_at',v.fecha_venta,'observaciones',v.observaciones,'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',vi.id,'descripcion',coalesce(p.descripcion,nullif(vi.descripcion_manual,''),'Producto'),'cantidad',vi.cantidad,'precio_unitario',vi.precio_unitario,'subtotal',coalesce(vi.total,vi.subtotal)) ORDER BY vi.id) FROM public.venta_items vi LEFT JOIN public.productos p ON p.id=vi.producto_id WHERE vi.venta_id=v.id),'[]'::jsonb)) compra FROM public.ventas v WHERE v.comercio_id=p_comercio_id AND EXISTS (SELECT 1 FROM public.cliente_usuarios cu WHERE cu.comercio_id=p_comercio_id AND cu.cliente_id=v.cliente_id AND cu.user_id=v_user)
  ) h),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.get_mi_historial_compras(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mi_historial_compras(uuid) TO authenticated;
