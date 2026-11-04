-- Evita ambiguedad con pedidos_online.total. Solo funcion; sin cambios de datos.
CREATE OR REPLACE FUNCTION public.sincronizar_reembolso_pedido_online(p_operacion_id uuid,p_payment_id text,p_total numeric,p_refund_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.mercadopago_operaciones; v_total numeric;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Operacion reservada al backend'; END IF;
  SELECT * INTO o FROM public.mercadopago_operaciones WHERE id=p_operacion_id FOR UPDATE;
  IF NOT FOUND OR o.pedido_online_id IS NULL OR o.modalidad<>'checkout_pro'
    OR o.payment_id IS DISTINCT FROM p_payment_id OR p_total IS NULL OR p_total<0 OR p_total>o.importe THEN
    RAISE EXCEPTION 'Reembolso incompatible con el pago';
  END IF;
  PERFORM 1 FROM public.pedidos_online WHERE id=o.pedido_online_id AND comercio_id=o.comercio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido fuera del comercio'; END IF;
  v_total:=greatest(o.importe_reembolsado,p_total);
  IF v_total=0 THEN RETURN; END IF;
  UPDATE public.mercadopago_operaciones SET importe_reembolsado=v_total,
    estado=CASE WHEN v_total>=importe THEN 'reembolsado' ELSE 'parcialmente_reembolsado' END WHERE id=o.id;
  UPDATE public.pedidos_online SET estado_pago=CASE WHEN v_total>=o.importe THEN 'reembolsado' ELSE 'parcialmente_reembolsado' END
    WHERE id=o.pedido_online_id AND comercio_id=o.comercio_id;
  UPDATE public.pedido_online_reembolsos SET importe_reembolsado=v_total,refund_id=coalesce(p_refund_id,refund_id),
    estado=CASE WHEN v_total>=importe THEN 'completado' ELSE estado END,
    error=CASE WHEN v_total>=importe THEN NULL ELSE error END,
    intento=CASE WHEN v_total>=importe THEN NULL ELSE intento END,
    procesando_hasta=CASE WHEN v_total>=importe THEN NULL ELSE procesando_hasta END,updated_at=now()
    WHERE operacion_id=o.id AND comercio_id=o.comercio_id;
END $$;
