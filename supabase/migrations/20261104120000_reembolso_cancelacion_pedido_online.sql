-- Estructura y funciones. No cancela ni reembolsa pedidos historicos.
CREATE TABLE public.pedido_online_reembolsos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  pedido_id uuid NOT NULL UNIQUE REFERENCES public.pedidos_online(id),
  operacion_id uuid NOT NULL UNIQUE REFERENCES public.mercadopago_operaciones(id),
  solicitado_por uuid NOT NULL REFERENCES auth.users(id),
  idempotency_key uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  importe numeric(14,2) NOT NULL CHECK (importe>0),
  importe_solicitado numeric(14,2) CHECK (importe_solicitado>0 AND importe_solicitado<=importe),
  importe_reembolsado numeric(14,2) NOT NULL DEFAULT 0 CHECK (importe_reembolsado>=0 AND importe_reembolsado<=importe),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','procesando','completado','error')),
  intento uuid, procesando_hasta timestamptz, refund_id text, error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pedido_online_reembolsos_comercio ON public.pedido_online_reembolsos(comercio_id,created_at DESC);
ALTER TABLE public.pedido_online_reembolsos ENABLE ROW LEVEL SECURITY;
CREATE POLICY reembolsos_lectura_comercio ON public.pedido_online_reembolsos FOR SELECT TO authenticated
  USING(public.user_belongs_to_comercio(comercio_id));
GRANT SELECT ON public.pedido_online_reembolsos TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.pedido_online_reembolsos TO service_role;
REVOKE INSERT,UPDATE,DELETE ON public.pedido_online_reembolsos FROM anon,authenticated;

CREATE FUNCTION public.validar_reembolso_online_tenant() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.pedidos_online p JOIN public.mercadopago_operaciones o
    ON o.pedido_online_id=p.id AND o.comercio_id=p.comercio_id
    WHERE p.id=NEW.pedido_id AND p.comercio_id=NEW.comercio_id AND o.id=NEW.operacion_id
      AND o.modalidad='checkout_pro' AND o.importe=NEW.importe) THEN
    RAISE EXCEPTION 'Reembolso de otro comercio, pedido o importe';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reembolso_online_tenant BEFORE INSERT OR UPDATE ON public.pedido_online_reembolsos
FOR EACH ROW EXECUTE FUNCTION public.validar_reembolso_online_tenant();
REVOKE ALL ON FUNCTION public.validar_reembolso_online_tenant() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.preparar_reembolso_pedido_online(p_pedido_id uuid,p_comercio_id uuid,p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  p public.pedidos_online; o public.mercadopago_operaciones; r public.pedido_online_reembolsos;
  cantidad integer; item record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Operacion reservada al backend'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.comercio_usuarios WHERE comercio_id=p_comercio_id
    AND user_id=p_usuario_id AND activo AND NOT solo_restaurante AND rol='admin') THEN
    RAISE EXCEPTION 'Solo un administrador del comercio puede cancelar y devolver dinero';
  END IF;
  -- Orden de bloqueos compartido con la confirmacion del pago y el webhook.
  SELECT count(*) INTO cantidad FROM public.mercadopago_operaciones
  WHERE pedido_online_id=p_pedido_id AND comercio_id=p_comercio_id
    AND (approved_at IS NOT NULL OR estado IN ('aprobado','reembolsado','parcialmente_reembolsado'));
  IF cantidad<>1 THEN RAISE EXCEPTION 'No se identifico un unico pago aprobado para este pedido'; END IF;
  SELECT * INTO o FROM public.mercadopago_operaciones
  WHERE pedido_online_id=p_pedido_id AND comercio_id=p_comercio_id
    AND (approved_at IS NOT NULL OR estado IN ('aprobado','reembolsado','parcialmente_reembolsado')) FOR UPDATE;
  IF o.modalidad<>'checkout_pro' OR nullif(o.payment_id,'') IS NULL OR o.venta_id IS NOT NULL THEN
    RAISE EXCEPTION 'El pago no es un cobro de tienda online reembolsable';
  END IF;
  SELECT * INTO p FROM public.pedidos_online WHERE id=p_pedido_id AND comercio_id=p_comercio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no autorizado'; END IF;
  IF p.venta_id IS NOT NULL THEN RAISE EXCEPTION 'El pedido tiene una venta asociada: requiere revisar su anulacion contable'; END IF;
  IF p.estado<>'cancelado' THEN
    FOR item IN SELECT * FROM public.pedido_online_items WHERE pedido_id=p.id LOOP
      IF item.producto_variante_id IS NULL THEN
        UPDATE public.productos SET stock=stock+item.cantidad WHERE id=item.producto_id AND comercio_id=p.comercio_id;
      ELSE
        UPDATE public.producto_variantes v SET stock=v.stock+item.cantidad
        WHERE v.id=item.producto_variante_id AND v.producto_id=item.producto_id
          AND EXISTS(SELECT 1 FROM public.productos pr WHERE pr.id=v.producto_id AND pr.comercio_id=p.comercio_id);
      END IF;
      IF NOT FOUND THEN RAISE EXCEPTION 'Producto o variante fuera del comercio'; END IF;
    END LOOP;
    UPDATE public.pedidos_online SET estado='cancelado' WHERE id=p.id;
  END IF;
  INSERT INTO public.pedido_online_reembolsos(comercio_id,pedido_id,operacion_id,solicitado_por,importe)
  VALUES(p.comercio_id,p.id,o.id,p_usuario_id,o.importe) ON CONFLICT(pedido_id) DO NOTHING;
  SELECT * INTO r FROM public.pedido_online_reembolsos WHERE pedido_id=p.id FOR UPDATE;
  IF r.operacion_id<>o.id OR r.comercio_id<>p.comercio_id THEN RAISE EXCEPTION 'El pago del pedido cambio'; END IF;
  IF r.estado='completado' OR (r.estado='procesando' AND r.procesando_hasta>now()) THEN
    RETURN to_jsonb(r)||jsonb_build_object('puede_procesar',false);
  END IF;
  UPDATE public.pedido_online_reembolsos SET estado='procesando',intento=gen_random_uuid(),
    procesando_hasta=now()+interval '90 seconds',error=NULL,updated_at=now() WHERE id=r.id RETURNING * INTO r;
  RETURN to_jsonb(r)||jsonb_build_object('puede_procesar',true,'payment_id',o.payment_id,'external_reference',o.external_reference);
END $$;

CREATE FUNCTION public.fijar_importe_reembolso_online(p_id uuid,p_intento uuid,p_importe numeric)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE resultado numeric;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Operacion reservada al backend'; END IF;
  UPDATE public.pedido_online_reembolsos SET importe_solicitado=coalesce(importe_solicitado,p_importe),updated_at=now()
  WHERE id=p_id AND intento=p_intento AND estado='procesando' AND p_importe>0 AND p_importe<=importe
  RETURNING importe_solicitado INTO resultado;
  IF NOT FOUND THEN RAISE EXCEPTION 'El intento de devolucion ya no esta vigente'; END IF;
  RETURN resultado;
END $$;

-- Se usa tanto al reconciliar un reintento como al recibir un webhook de MP.
CREATE FUNCTION public.sincronizar_reembolso_pedido_online(p_operacion_id uuid,p_payment_id text,p_total numeric,p_refund_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.mercadopago_operaciones; total numeric;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Operacion reservada al backend'; END IF;
  SELECT * INTO o FROM public.mercadopago_operaciones WHERE id=p_operacion_id FOR UPDATE;
  IF NOT FOUND OR o.pedido_online_id IS NULL OR o.modalidad<>'checkout_pro'
    OR o.payment_id IS DISTINCT FROM p_payment_id OR p_total IS NULL OR p_total<0 OR p_total>o.importe THEN
    RAISE EXCEPTION 'Reembolso incompatible con el pago';
  END IF;
  PERFORM 1 FROM public.pedidos_online WHERE id=o.pedido_online_id AND comercio_id=o.comercio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido fuera del comercio'; END IF;
  total:=greatest(o.importe_reembolsado,p_total);
  IF total=0 THEN RETURN; END IF;
  UPDATE public.mercadopago_operaciones SET importe_reembolsado=total,
    estado=CASE WHEN total>=importe THEN 'reembolsado' ELSE 'parcialmente_reembolsado' END WHERE id=o.id;
  UPDATE public.pedidos_online SET estado_pago=CASE WHEN total>=o.importe THEN 'reembolsado' ELSE 'parcialmente_reembolsado' END
    WHERE id=o.pedido_online_id AND comercio_id=o.comercio_id;
  UPDATE public.pedido_online_reembolsos SET importe_reembolsado=total,refund_id=coalesce(p_refund_id,refund_id),
    estado=CASE WHEN total>=importe THEN 'completado' ELSE estado END,
    error=CASE WHEN total>=importe THEN NULL ELSE error END,
    intento=CASE WHEN total>=importe THEN NULL ELSE intento END,
    procesando_hasta=CASE WHEN total>=importe THEN NULL ELSE procesando_hasta END,updated_at=now()
    WHERE operacion_id=o.id AND comercio_id=o.comercio_id;
END $$;

CREATE FUNCTION public.finalizar_intento_reembolso_online(p_id uuid,p_intento uuid,p_estado text,p_error text,p_refund_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Operacion reservada al backend'; END IF;
  IF p_estado NOT IN ('pendiente','error') THEN RAISE EXCEPTION 'Resultado invalido'; END IF;
  -- Un worker vencido o una respuesta tardia nunca pisan un webhook completado.
  UPDATE public.pedido_online_reembolsos SET estado=p_estado,error=left(p_error,500),
    refund_id=coalesce(p_refund_id,refund_id),procesando_hasta=NULL,updated_at=now()
  WHERE id=p_id AND intento=p_intento AND estado='procesando';
END $$;

REVOKE ALL ON FUNCTION public.preparar_reembolso_pedido_online(uuid,uuid,uuid),public.fijar_importe_reembolso_online(uuid,uuid,numeric),
  public.sincronizar_reembolso_pedido_online(uuid,text,numeric,text),public.finalizar_intento_reembolso_online(uuid,uuid,text,text,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preparar_reembolso_pedido_online(uuid,uuid,uuid),public.fijar_importe_reembolso_online(uuid,uuid,numeric),
  public.sincronizar_reembolso_pedido_online(uuid,text,numeric,text),public.finalizar_intento_reembolso_online(uuid,uuid,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.actualizar_estado_pedido_online(p_pedido_id uuid,p_estado text)
RETURNS public.pedidos_online LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.pedidos_online;
BEGIN
  SELECT * INTO p FROM public.pedidos_online WHERE id=p_pedido_id FOR UPDATE;
  IF NOT FOUND OR NOT public.user_belongs_to_comercio(p.comercio_id) THEN RAISE EXCEPTION 'Pedido no autorizado'; END IF;
  IF p_estado IS NULL OR p_estado NOT IN ('recibido','confirmado','preparando','listo','entregado','cancelado') OR p.estado='cancelado' THEN
    RAISE EXCEPTION 'Estado invalido';
  END IF;
  IF p_estado='cancelado' AND (p.importe_pagado>0 OR p.estado_pago IN ('aprobado','reembolsado','parcialmente_reembolsado')
    OR EXISTS(SELECT 1 FROM public.mercadopago_operaciones WHERE pedido_online_id=p.id AND comercio_id=p.comercio_id
      AND (approved_at IS NOT NULL OR estado IN ('aprobado','reembolsado','parcialmente_reembolsado')))) THEN
    RAISE EXCEPTION 'El pedido pagado debe cancelarse con la devolucion de Mercado Pago';
  END IF;
  IF p_estado='cancelado' AND EXISTS(SELECT 1 FROM public.mercadopago_operaciones
    WHERE pedido_online_id=p.id AND comercio_id=p.comercio_id AND estado IN ('pendiente','procesando')) THEN
    RAISE EXCEPTION 'El pago sigue en proceso en Mercado Pago. Verifique su resultado antes de cancelar';
  END IF;
  -- El checkout vigente descuenta stock al aprobar el pago, nunca al iniciar.
  UPDATE public.pedidos_online SET estado=p_estado WHERE id=p.id RETURNING * INTO p;
  RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.actualizar_estado_pedido_online(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.actualizar_estado_pedido_online(uuid,text) TO authenticated;

-- Un webhook repetido no vuelve a descontar stock ni revierte un reembolso.
CREATE OR REPLACE FUNCTION public.registrar_pago_mercadopago_aprobado(p_operacion_id uuid,p_payment_id text,p_medio_pago text,p_cuotas integer,p_raw jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_op public.mercadopago_operaciones; v_item record; v_pago_id uuid; v_actualizados integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Operacion reservada al backend'; END IF;
  SELECT * INTO v_op FROM public.mercadopago_operaciones WHERE id=p_operacion_id FOR UPDATE;
  IF v_op.id IS NULL THEN RAISE EXCEPTION 'Operacion inexistente'; END IF;
  IF v_op.approved_at IS NOT NULL OR v_op.estado IN ('aprobado','reembolsado','parcialmente_reembolsado') THEN RETURN; END IF;
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
REVOKE ALL ON FUNCTION public.registrar_pago_mercadopago_aprobado(uuid,text,text,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_mercadopago_aprobado(uuid,text,text,integer,jsonb) TO service_role;
