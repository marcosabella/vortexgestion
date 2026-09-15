-- Al cancelar una reserva de Mercado Pago, la reposición debe volver a la misma variante.
CREATE OR REPLACE FUNCTION public.cancelar_pedido_online_no_pagado(p_operacion_id uuid, p_estado_pago text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_operacion public.mercadopago_operaciones; v_pedido public.pedidos_online; v_item record;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Operacion reservada al backend'; END IF;
  IF p_estado_pago NOT IN ('rechazado','cancelado','vencido') THEN RAISE EXCEPTION 'Estado de pago invalido'; END IF;
  SELECT * INTO v_operacion FROM public.mercadopago_operaciones WHERE id=p_operacion_id FOR UPDATE;
  IF v_operacion.pedido_online_id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_pedido FROM public.pedidos_online WHERE id=v_operacion.pedido_online_id FOR UPDATE;
  IF v_pedido.id IS NULL OR v_pedido.estado_pago='aprobado' OR v_pedido.estado='cancelado' THEN RETURN; END IF;
  FOR v_item IN SELECT producto_id,producto_variante_id,cantidad FROM public.pedido_online_items WHERE pedido_id=v_pedido.id LOOP
    IF v_item.producto_variante_id IS NULL THEN
      UPDATE public.productos SET stock=stock+v_item.cantidad WHERE id=v_item.producto_id AND comercio_id=v_pedido.comercio_id;
    ELSE
      UPDATE public.producto_variantes SET stock=stock+v_item.cantidad WHERE id=v_item.producto_variante_id;
    END IF;
  END LOOP;
  UPDATE public.pedidos_online SET estado='cancelado',estado_pago=p_estado_pago WHERE id=v_pedido.id;
END; $$;
REVOKE ALL ON FUNCTION public.cancelar_pedido_online_no_pagado(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido_online_no_pagado(uuid,text) TO service_role;
