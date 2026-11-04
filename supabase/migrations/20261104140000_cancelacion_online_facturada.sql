-- Flujo separado del reembolso. No procesa pedidos existentes al migrar.
CREATE TABLE public.pedido_online_cancelaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  pedido_id uuid NOT NULL UNIQUE REFERENCES public.pedidos_online(id),
  venta_id uuid NOT NULL UNIQUE REFERENCES public.ventas(id),
  nota_credito_id uuid UNIQUE REFERENCES public.ventas(id),
  solicitado_por uuid NOT NULL REFERENCES auth.users(id),
  estado text NOT NULL CHECK(estado IN ('fiscal_pendiente','lista')),
  error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cancelaciones_online_comercio ON public.pedido_online_cancelaciones(comercio_id,created_at DESC);
ALTER TABLE public.pedido_online_cancelaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY cancelaciones_online_lectura ON public.pedido_online_cancelaciones FOR SELECT TO authenticated USING(public.user_belongs_to_comercio(comercio_id));
GRANT SELECT ON public.pedido_online_cancelaciones TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.pedido_online_cancelaciones TO service_role;
REVOKE INSERT,UPDATE,DELETE ON public.pedido_online_cancelaciones FROM anon,authenticated;

CREATE FUNCTION public.validar_cancelacion_online() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.pedidos_online p JOIN public.ventas v ON v.id=p.venta_id AND v.comercio_id=p.comercio_id
    WHERE p.id=NEW.pedido_id AND p.comercio_id=NEW.comercio_id AND v.id=NEW.venta_id AND v.origen_pedido_online_id=p.id) THEN
    RAISE EXCEPTION 'Cancelacion fuera del pedido o comercio';
  END IF;
  IF NEW.nota_credito_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ventas
    WHERE id=NEW.nota_credito_id AND comercio_id=NEW.comercio_id AND origen_pedido_online_id=NEW.pedido_id
      AND comprobante_asociado_id=NEW.venta_id AND tipo_comprobante::text LIKE 'nota_credito_%') THEN RAISE EXCEPTION 'Nota de credito incompatible'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validar_cancelacion_online BEFORE INSERT OR UPDATE ON public.pedido_online_cancelaciones FOR EACH ROW EXECUTE FUNCTION public.validar_cancelacion_online();

CREATE FUNCTION public.preparar_anulacion_comprobante_online(p_pedido_id uuid,p_comercio_id uuid,p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  p public.pedidos_online; v public.ventas; nota public.ventas; c public.pedido_online_cancelaciones;
  det jsonb; pagos jsonb; tipo public.tipo_comprobante;
  previo_stock text:=current_setting('app.skip_stock_movements',true);
  previo_sub text:=current_setting('request.jwt.claim.sub',true);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Operacion reservada al backend'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.comercio_usuarios WHERE comercio_id=p_comercio_id AND user_id=p_usuario_id
    AND activo AND rol='admin' AND NOT solo_restaurante) THEN RAISE EXCEPTION 'Solo un administrador del comercio puede cancelar'; END IF;
  PERFORM 1 FROM public.mercadopago_operaciones WHERE pedido_online_id=p_pedido_id AND comercio_id=p_comercio_id ORDER BY id FOR UPDATE;
  SELECT * INTO p FROM public.pedidos_online WHERE id=p_pedido_id AND comercio_id=p_comercio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no autorizado'; END IF;
  IF p.venta_id IS NULL THEN RETURN jsonb_build_object('requiere_cae',false); END IF;
  SELECT * INTO v FROM public.ventas WHERE id=p.venta_id AND comercio_id=p.comercio_id AND origen_pedido_online_id=p.id FOR UPDATE;
  IF NOT FOUND OR v.total<>p.total OR v.moneda<>'ARS' OR v.comprobante_asociado_id IS NOT NULL THEN RAISE EXCEPTION 'La venta asociada requiere revision manual'; END IF;
  SELECT * INTO c FROM public.pedido_online_cancelaciones WHERE pedido_id=p.id FOR UPDATE;
  IF NOT FOUND THEN
    IF p.estado_pago NOT IN ('aprobado','parcialmente_reembolsado','reembolsado') OR p.importe_pagado<>p.total
      OR (SELECT count(*) FROM public.mercadopago_operaciones WHERE pedido_online_id=p.id AND comercio_id=p.comercio_id
        AND modalidad='checkout_pro' AND importe=p.total AND (approved_at IS NOT NULL OR estado IN ('aprobado','parcialmente_reembolsado','reembolsado')))<>1 THEN
      RAISE EXCEPTION 'El pago requiere conciliarse antes de cancelar el comprobante'; END IF;
    IF nullif(btrim(v.cae),'') IS NULL AND EXISTS(SELECT 1 FROM public.afip_cae_intentos WHERE venta_id=v.id AND NOT rechazado) THEN
      RAISE EXCEPTION 'La factura tiene una emision fiscal pendiente. Recupere o complete su CAE antes de cancelar';
    END IF;
    INSERT INTO public.pedido_online_cancelaciones(comercio_id,pedido_id,venta_id,solicitado_por,estado)
    VALUES(p.comercio_id,p.id,v.id,p_usuario_id,'fiscal_pendiente') RETURNING * INTO c;
    IF nullif(btrim(v.cae),'') IS NULL THEN
      UPDATE public.ventas SET anulado_at=now() WHERE id=v.id;
      UPDATE public.pedido_online_cancelaciones SET estado='lista' WHERE id=c.id;
      RETURN jsonb_build_object('requiere_cae',false,'anulado_internamente',true);
    END IF;
    tipo:=CASE v.tipo_comprobante::text WHEN 'factura_a' THEN 'nota_credito_a'::public.tipo_comprobante
      WHEN 'factura_b' THEN 'nota_credito_b'::public.tipo_comprobante WHEN 'factura_c' THEN 'nota_credito_c'::public.tipo_comprobante END;
    IF tipo IS NULL THEN RAISE EXCEPTION 'Tipo de comprobante no compatible con cancelacion automatica'; END IF;
    SELECT jsonb_agg(jsonb_build_object('producto_id',producto_id,'cantidad',cantidad,'precio_unitario',precio_unitario,
      'porcentaje_iva',porcentaje_iva,'afecta_stock',true)||CASE WHEN producto_variante_id IS NOT NULL
        THEN jsonb_build_object('producto_variante_id',producto_variante_id) ELSE '{}'::jsonb END ORDER BY id)
    INTO det FROM public.venta_items WHERE venta_id=v.id AND comercio_id=p.comercio_id;
    pagos:=jsonb_build_array(jsonb_build_object('tipo_pago','mercado_pago','monto',v.total));
    PERFORM set_config('request.jwt.claim.sub',p_usuario_id::text,true);
    PERFORM set_config('app.skip_stock_movements','on',true);
    IF v.emisor_fiscal_id IS NOT NULL THEN
      SELECT * INTO nota FROM public.registrar_venta_emisor_transaccional(p.comercio_id,tipo,v.punto_venta,v.cliente_id,v.cliente_nombre,
        'ARS','contado',det,pagos,c.id,v.emisor_fiscal_id,c.created_at,'Cancelacion pedido online #'||p.numero||'. Ajusta '||v.numero_comprobante);
    ELSE
      SELECT * INTO nota FROM public.registrar_venta_transaccional(p.comercio_id,tipo,v.punto_venta,v.cliente_id,v.cliente_nombre,
        'ARS','contado',det,pagos,c.id,c.created_at,'Cancelacion pedido online #'||p.numero||'. Ajusta '||v.numero_comprobante);
    END IF;
    PERFORM set_config('app.skip_stock_movements',coalesce(previo_stock,''),true);
    PERFORM set_config('request.jwt.claim.sub',coalesce(previo_sub,''),true);
    IF nota.total<>v.total OR nota.subtotal<>v.subtotal OR nota.total_iva<>v.total_iva THEN RAISE EXCEPTION 'La nota no reproduce los importes originales'; END IF;
    UPDATE public.ventas SET origen_pedido_online_id=p.id,comprobante_asociado_id=v.id WHERE id=nota.id;
    UPDATE public.pagos_venta SET es_reembolso=true WHERE venta_id=nota.id;
    UPDATE public.pedido_online_cancelaciones SET nota_credito_id=nota.id WHERE id=c.id RETURNING * INTO c;
  END IF;
  IF c.nota_credito_id IS NOT NULL THEN SELECT * INTO nota FROM public.ventas WHERE id=c.nota_credito_id; END IF;
  RETURN jsonb_build_object('requiere_cae',c.nota_credito_id IS NOT NULL AND nullif(btrim(nota.cae),'') IS NULL,
    'nota_credito_id',c.nota_credito_id);
END $$;

CREATE FUNCTION public.validar_anulacion_para_reembolso(p_pedido_id uuid,p_venta_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.pedido_online_cancelaciones; v public.ventas; n public.ventas;
BEGIN
  SELECT * INTO c FROM public.pedido_online_cancelaciones WHERE pedido_id=p_pedido_id AND venta_id=p_venta_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v FROM public.ventas WHERE id=c.venta_id AND comercio_id=c.comercio_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF nullif(btrim(v.cae),'') IS NULL THEN
    IF v.anulado_at IS NULL OR c.nota_credito_id IS NOT NULL THEN RETURN false; END IF;
  ELSE
    SELECT * INTO n FROM public.ventas WHERE id=c.nota_credito_id AND comercio_id=c.comercio_id
      AND comprobante_asociado_id=v.id AND origen_pedido_online_id=c.pedido_id;
    IF NOT FOUND OR nullif(btrim(n.cae),'') IS NULL OR n.total<>v.total OR n.emisor_fiscal_id IS DISTINCT FROM v.emisor_fiscal_id THEN RETURN false; END IF;
  END IF;
  UPDATE public.pedido_online_cancelaciones SET estado='lista',error=NULL,updated_at=now() WHERE id=c.id;
  RETURN true;
END $$;

CREATE FUNCTION public.proteger_vinculo_pedido_online() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.venta_id IS NOT NULL AND NEW.venta_id IS DISTINCT FROM OLD.venta_id THEN RAISE EXCEPTION 'No se puede desvincular el comprobante del pedido'; END IF;
  IF NEW.venta_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ventas WHERE id=NEW.venta_id AND comercio_id=NEW.comercio_id) THEN RAISE EXCEPTION 'Venta fuera del comercio'; END IF;
  IF TG_OP='UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado AND EXISTS(SELECT 1 FROM public.pedido_online_cancelaciones WHERE pedido_id=NEW.id) THEN
    IF NEW.estado<>'cancelado' OR NOT public.validar_anulacion_para_reembolso(NEW.id,NEW.venta_id) THEN RAISE EXCEPTION 'La cancelacion fiscal esta pendiente'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER proteger_vinculo_pedido_online BEFORE INSERT OR UPDATE ON public.pedidos_online FOR EACH ROW EXECUTE FUNCTION public.proteger_vinculo_pedido_online();

CREATE FUNCTION public.proteger_intento_cae_online() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v public.ventas;
BEGIN
  SELECT * INTO v FROM public.ventas WHERE id=NEW.venta_id FOR UPDATE;
  IF v.anulado_at IS NOT NULL THEN RAISE EXCEPTION 'El comprobante fue anulado internamente y no puede autorizarse'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER proteger_intento_cae_online BEFORE INSERT ON public.afip_cae_intentos FOR EACH ROW EXECUTE FUNCTION public.proteger_intento_cae_online();
REVOKE ALL ON FUNCTION public.preparar_anulacion_comprobante_online(uuid,uuid,uuid),public.validar_anulacion_para_reembolso(uuid,uuid),
  public.validar_cancelacion_online(),public.proteger_vinculo_pedido_online(),public.proteger_intento_cae_online() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preparar_anulacion_comprobante_online(uuid,uuid,uuid) TO service_role;

CREATE FUNCTION public.validar_pago_reembolso_online() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v public.ventas;
BEGIN
  IF (TG_OP='INSERT' AND (NEW.es_reembolso OR NEW.reembolso_confirmado<>0)) OR
    (TG_OP='UPDATE' AND (NEW.es_reembolso IS DISTINCT FROM OLD.es_reembolso OR NEW.reembolso_confirmado IS DISTINCT FROM OLD.reembolso_confirmado)) THEN
    SELECT * INTO v FROM public.ventas WHERE id=NEW.venta_id AND comercio_id=NEW.comercio_id;
    IF auth.role() IS DISTINCT FROM 'service_role' OR NOT FOUND OR v.origen_pedido_online_id IS NULL
      OR NEW.es_reembolso IS DISTINCT FROM (v.comprobante_asociado_id IS NOT NULL) THEN RAISE EXCEPTION 'El reembolso solo puede confirmarlo el backend del pedido'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validar_pago_reembolso_online BEFORE INSERT OR UPDATE ON public.pagos_venta FOR EACH ROW EXECUTE FUNCTION public.validar_pago_reembolso_online();
REVOKE ALL ON FUNCTION public.validar_pago_reembolso_online() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.preparar_reembolso_pedido_online(p_pedido_id uuid,p_comercio_id uuid,p_usuario_id uuid)
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
  IF p.venta_id IS NOT NULL AND NOT public.validar_anulacion_para_reembolso(p.id,p.venta_id) THEN RAISE EXCEPTION 'Debe confirmar la anulacion o el CAE de la nota de credito antes de devolver dinero'; END IF;
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
  UPDATE public.pagos_venta pv SET reembolso_confirmado=v_total
  FROM public.pedido_online_cancelaciones c
  WHERE c.pedido_id=o.pedido_online_id AND c.comercio_id=o.comercio_id
    AND pv.comercio_id=c.comercio_id AND pv.venta_id=coalesce(c.nota_credito_id,c.venta_id);
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
