-- Un intento de pago no constituye un pedido operativo. Se crea una reserva
-- transaccional para poder generar la preferencia de Mercado Pago, pero sólo
-- se informa al comercio cuando el webhook confirma el cobro.

CREATE OR REPLACE FUNCTION public.crear_pedido_online_mercadopago(p_cliente jsonb, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_pedido_id uuid;
BEGIN
  v_result := public.crear_pedido_online(p_cliente, p_items);
  v_pedido_id := (v_result->>'id')::uuid;

  UPDATE public.pedidos_online
  SET estado_pago = 'pendiente'
  WHERE id = v_pedido_id;

  -- La función original genera la alerta dentro de esta misma transacción.
  -- Se elimina antes del commit y se recrea sólo al aprobarse el pago.
  DELETE FROM public.notificacion_destinatarios
  WHERE notificacion_id IN (
    SELECT id
    FROM public.notificaciones
    WHERE metadata @> jsonb_build_object('tipo', 'pedido_online', 'pedido_id', v_pedido_id)
  );

  DELETE FROM public.notificaciones
  WHERE metadata @> jsonb_build_object('tipo', 'pedido_online', 'pedido_id', v_pedido_id);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_pedido_online_mercadopago(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_pedido_online_mercadopago(jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.notificar_pedido_online_pagado(p_operacion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operacion public.mercadopago_operaciones;
  v_pedido public.pedidos_online;
  v_notificacion_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Operacion reservada al backend';
  END IF;

  SELECT * INTO v_operacion
  FROM public.mercadopago_operaciones
  WHERE id = p_operacion_id;

  IF v_operacion.pedido_online_id IS NULL OR v_operacion.estado <> 'aprobado' THEN
    RETURN;
  END IF;

  SELECT * INTO v_pedido
  FROM public.pedidos_online
  WHERE id = v_operacion.pedido_online_id AND estado_pago = 'aprobado';

  IF v_pedido.id IS NULL OR EXISTS (
    SELECT 1
    FROM public.notificaciones
    WHERE metadata @> jsonb_build_object('tipo', 'pedido_online', 'pedido_id', v_pedido.id)
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.notificaciones(titulo, mensaje, categoria, prioridad, metadata)
  VALUES (
    'Nuevo pedido online pagado #' || v_pedido.numero,
    'Se acreditó un pago de ' || v_pedido.cliente_nombre || ' por $ ' || v_pedido.total,
    'general',
    'alta',
    jsonb_build_object('tipo', 'pedido_online', 'pedido_id', v_pedido.id, 'numero', v_pedido.numero, 'cliente_id', v_pedido.cliente_id, 'pago', 'mercado_pago')
  )
  RETURNING id INTO v_notificacion_id;

  INSERT INTO public.notificacion_destinatarios(notificacion_id, comercio_id)
  VALUES (v_notificacion_id, v_pedido.comercio_id);
END;
$$;

REVOKE ALL ON FUNCTION public.notificar_pedido_online_pagado(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notificar_pedido_online_pagado(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cancelar_pedido_online_no_pagado(p_operacion_id uuid, p_estado_pago text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operacion public.mercadopago_operaciones;
  v_pedido public.pedidos_online;
  v_item record;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Operacion reservada al backend';
  END IF;
  IF p_estado_pago NOT IN ('rechazado', 'cancelado', 'vencido') THEN
    RAISE EXCEPTION 'Estado de pago invalido';
  END IF;

  SELECT * INTO v_operacion
  FROM public.mercadopago_operaciones
  WHERE id = p_operacion_id
  FOR UPDATE;

  IF v_operacion.pedido_online_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_pedido
  FROM public.pedidos_online
  WHERE id = v_operacion.pedido_online_id
  FOR UPDATE;

  IF v_pedido.id IS NULL OR v_pedido.estado_pago = 'aprobado' OR v_pedido.estado = 'cancelado' THEN
    RETURN;
  END IF;

  FOR v_item IN
    SELECT producto_id, cantidad
    FROM public.pedido_online_items
    WHERE pedido_id = v_pedido.id
  LOOP
    UPDATE public.productos
    SET stock = stock + v_item.cantidad
    WHERE id = v_item.producto_id AND comercio_id = v_pedido.comercio_id;
  END LOOP;

  UPDATE public.pedidos_online
  SET estado = 'cancelado', estado_pago = p_estado_pago
  WHERE id = v_pedido.id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancelar_pedido_online_no_pagado(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido_online_no_pagado(uuid, text) TO service_role;
