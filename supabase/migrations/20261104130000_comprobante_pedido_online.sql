-- No emite comprobantes historicos. Usa la numeracion y el alta de ventas existentes.
ALTER TABLE public.ventas
  ADD COLUMN origen_pedido_online_id uuid REFERENCES public.pedidos_online(id),
  ADD COLUMN comprobante_asociado_id uuid REFERENCES public.ventas(id),
  ADD COLUMN anulado_at timestamptz;
CREATE INDEX ventas_origen_pedido_online ON public.ventas(comercio_id,origen_pedido_online_id) WHERE origen_pedido_online_id IS NOT NULL;
CREATE UNIQUE INDEX ventas_nota_online_unica ON public.ventas(comprobante_asociado_id)
  WHERE origen_pedido_online_id IS NOT NULL AND comprobante_asociado_id IS NOT NULL;
CREATE UNIQUE INDEX pedidos_online_venta_unica ON public.pedidos_online(venta_id) WHERE venta_id IS NOT NULL;
ALTER TABLE public.pagos_venta
  ADD COLUMN es_reembolso boolean NOT NULL DEFAULT false,
  ADD COLUMN reembolso_confirmado numeric(14,2) NOT NULL DEFAULT 0 CHECK(reembolso_confirmado>=0 AND reembolso_confirmado<=abs(monto));

CREATE FUNCTION public.generar_comprobante_pedido_online(p_pedido_id uuid,p_comercio_id uuid,p_tipo public.tipo_comprobante,p_emisor_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  p public.pedidos_online; o public.mercadopago_operaciones; v public.ventas;
  item record; det jsonb:='[]'; pagos jsonb; pv integer; multi boolean; n integer;
  previo_stock text:=current_setting('app.skip_stock_movements',true);
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.comercio_usuarios WHERE comercio_id=p_comercio_id
    AND user_id=auth.uid() AND activo AND rol='admin' AND NOT solo_restaurante) THEN RAISE EXCEPTION 'Solo un administrador del comercio puede generar el comprobante'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.comercio_parametrizacion WHERE comercio_id=p_comercio_id
    AND parametros->'modulos'->>'pedidos_online'='true') THEN RAISE EXCEPTION 'Pedidos online no habilitado'; END IF;
  IF p_tipo IS NULL OR p_tipo::text NOT IN ('recibo_x','factura_a','factura_b','factura_c') THEN RAISE EXCEPTION 'Tipo de comprobante no permitido'; END IF;
  -- Coincide con el orden de bloqueos de pagos/reembolsos: operacion, pedido, venta.
  PERFORM 1 FROM public.mercadopago_operaciones WHERE pedido_online_id=p_pedido_id AND comercio_id=p_comercio_id ORDER BY id FOR UPDATE;
  SELECT * INTO p FROM public.pedidos_online WHERE id=p_pedido_id AND comercio_id=p_comercio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no autorizado'; END IF;
  IF p.venta_id IS NOT NULL THEN
    SELECT * INTO v FROM public.ventas WHERE id=p.venta_id AND comercio_id=p.comercio_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Comprobante fuera del comercio'; END IF;
    RETURN jsonb_build_object('venta_id',v.id,'numero_comprobante',v.numero_comprobante,'reutilizado',true);
  END IF;
  IF p.estado NOT IN ('confirmado','preparando','listo','entregado') OR p.estado_pago<>'aprobado' THEN
    RAISE EXCEPTION 'Confirme el pedido y su pago antes de generar el comprobante';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pedido_online_reembolsos WHERE pedido_id=p.id) THEN RAISE EXCEPTION 'El pedido tiene una devolucion iniciada'; END IF;
  IF p.cliente_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=p.cliente_id AND comercio_id=p.comercio_id) THEN RAISE EXCEPTION 'El pedido requiere un cliente del comercio'; END IF;
  SELECT count(*) INTO n FROM public.mercadopago_operaciones WHERE pedido_online_id=p.id AND comercio_id=p.comercio_id
    AND (approved_at IS NOT NULL OR estado IN ('aprobado','parcialmente_reembolsado','reembolsado'));
  IF n<>1 THEN RAISE EXCEPTION 'No se identifico un unico pago del pedido'; END IF;
  SELECT * INTO o FROM public.mercadopago_operaciones WHERE pedido_online_id=p.id AND comercio_id=p.comercio_id
    AND (approved_at IS NOT NULL OR estado IN ('aprobado','parcialmente_reembolsado','reembolsado'));
  IF o.estado<>'aprobado' OR o.modalidad<>'checkout_pro' OR o.importe_reembolsado<>0
    OR o.importe<>p.total OR p.importe_pagado<>p.total OR nullif(o.payment_id,'') IS NULL OR o.pago_venta_id IS NOT NULL THEN
    RAISE EXCEPTION 'El cobro no coincide o ya fue imputado/devuelto';
  END IF;
  FOR item IN SELECT i.*,pr.porcentaje_iva,pr.comercio_id AS producto_comercio FROM public.pedido_online_items i
    LEFT JOIN public.productos pr ON pr.id=i.producto_id WHERE i.pedido_id=p.id ORDER BY i.id LOOP
    IF item.producto_comercio IS DISTINCT FROM p.comercio_id OR item.cantidad<=0 OR item.precio_unitario<0
      OR item.subtotal<>round(item.cantidad*item.precio_unitario,2) THEN RAISE EXCEPTION 'Detalle del pedido incompatible con la venta'; END IF;
    IF item.producto_variante_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.producto_variantes
      WHERE id=item.producto_variante_id AND producto_id=item.producto_id) THEN RAISE EXCEPTION 'Variante fuera del producto'; END IF;
    det:=det||jsonb_build_array(jsonb_build_object('producto_id',item.producto_id,'cantidad',item.cantidad,
      'precio_unitario',item.precio_unitario,'porcentaje_iva',CASE WHEN p_tipo::text='factura_c' THEN 0 ELSE coalesce(item.porcentaje_iva,0) END,'afecta_stock',true)
      ||CASE WHEN item.producto_variante_id IS NOT NULL THEN jsonb_build_object('producto_variante_id',item.producto_variante_id) ELSE '{}'::jsonb END);
  END LOOP;
  IF jsonb_array_length(det)=0 OR (SELECT sum(subtotal) FROM public.pedido_online_items WHERE pedido_id=p.id)<>p.total THEN RAISE EXCEPTION 'El total del pedido no coincide con el detalle'; END IF;
  SELECT parametros->'funciones'->>'multiples_cuit'='true' INTO multi FROM public.comercio_parametrizacion WHERE comercio_id=p.comercio_id;
  IF coalesce(multi,false) OR p_emisor_id IS NOT NULL THEN
    SELECT punto_venta INTO pv FROM public.emisores_fiscales WHERE id=p_emisor_id AND comercio_id=p.comercio_id AND activo;
    IF NOT FOUND THEN RAISE EXCEPTION 'Seleccione un emisor fiscal activo del comercio'; END IF;
  ELSE
    SELECT punto_venta INTO pv FROM public.afip_config WHERE comercio_id=p.comercio_id AND activo;
    IF p_tipo::text<>'recibo_x' AND pv IS NULL THEN RAISE EXCEPTION 'Configure ARCA antes de generar una factura'; END IF;
    pv:=coalesce(pv,1);
  END IF;
  pagos:=jsonb_build_array(jsonb_build_object('tipo_pago','mercado_pago','monto',p.total));
  -- El pago ya desconto stock. El alcance local se restaura antes de retornar.
  PERFORM set_config('app.skip_stock_movements','on',true);
  IF p_emisor_id IS NOT NULL THEN
    SELECT * INTO v FROM public.registrar_venta_emisor_transaccional(p.comercio_id,p_tipo,pv,p.cliente_id,p.cliente_nombre,
      'ARS','contado',det,pagos,p.id,p_emisor_id,p_observaciones=>'Pedido online #'||p.numero);
  ELSE
    SELECT * INTO v FROM public.registrar_venta_transaccional(p.comercio_id,p_tipo,pv,p.cliente_id,p.cliente_nombre,
      'ARS','contado',det,pagos,p.id,p_observaciones=>'Pedido online #'||p.numero);
  END IF;
  PERFORM set_config('app.skip_stock_movements',coalesce(previo_stock,''),true);
  IF v.total<>p.total THEN RAISE EXCEPTION 'El comprobante no coincide con el pedido'; END IF;
  UPDATE public.venta_items vi SET descripcion_manual=(SELECT i.descripcion FROM public.pedido_online_items i
    WHERE i.pedido_id=p.id AND i.producto_id=vi.producto_id AND i.producto_variante_id IS NOT DISTINCT FROM vi.producto_variante_id ORDER BY i.id LIMIT 1)
    WHERE vi.venta_id=v.id;
  UPDATE public.pagos_venta SET mercadopago_operacion_id=o.id WHERE venta_id=v.id AND comercio_id=p.comercio_id;
  UPDATE public.mercadopago_operaciones SET pago_venta_id=(SELECT id FROM public.pagos_venta WHERE venta_id=v.id) WHERE id=o.id;
  UPDATE public.pedidos_online SET venta_id=v.id WHERE id=p.id;
  UPDATE public.ventas SET origen_pedido_online_id=p.id WHERE id=v.id;
  RETURN jsonb_build_object('venta_id',v.id,'numero_comprobante',v.numero_comprobante,'reutilizado',false);
END $$;
REVOKE ALL ON FUNCTION public.generar_comprobante_pedido_online(uuid,uuid,public.tipo_comprobante,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generar_comprobante_pedido_online(uuid,uuid,public.tipo_comprobante,uuid) TO authenticated;

-- No se puede editar/borrar una venta vinculada y volver a mover su stock/cobro.
CREATE FUNCTION public.proteger_venta_online() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.pedidos_online;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.origen_pedido_online_id IS NOT NULL THEN RAISE EXCEPTION 'El comprobante online se conserva; gestione la cancelacion desde el pedido'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.origen_pedido_online_id IS NOT NULL THEN
    SELECT * INTO p FROM public.pedidos_online WHERE id=NEW.origen_pedido_online_id AND comercio_id=NEW.comercio_id;
    IF NOT FOUND OR (NEW.comprobante_asociado_id IS NULL AND p.venta_id IS DISTINCT FROM NEW.id)
      OR (NEW.comprobante_asociado_id IS NOT NULL AND p.venta_id IS DISTINCT FROM NEW.comprobante_asociado_id) THEN RAISE EXCEPTION 'Comprobante fuera del pedido o comercio'; END IF;
  END IF;
  IF NEW.origen_pedido_online_id IS NULL AND (NEW.comprobante_asociado_id IS NOT NULL OR NEW.anulado_at IS NOT NULL) THEN RAISE EXCEPTION 'La anulacion automatica requiere un pedido online'; END IF;
  IF TG_OP='UPDATE' AND OLD.origen_pedido_online_id IS NOT NULL THEN
    IF (to_jsonb(NEW)-ARRAY['updated_at','cae','cae_vencimiento','cae_solicitado_at','cae_error','numero_comprobante','numero_secuencial','punto_venta','anulado_at'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','cae','cae_vencimiento','cae_solicitado_at','cae_error','numero_comprobante','numero_secuencial','punto_venta','anulado_at'])
      OR (to_jsonb(NEW)-'updated_at' IS DISTINCT FROM to_jsonb(OLD)-'updated_at' AND auth.role() IS DISTINCT FROM 'service_role') THEN
      RAISE EXCEPTION 'Los datos del comprobante online no pueden modificarse';
    END IF;
    IF OLD.anulado_at IS NOT NULL AND (NEW.cae IS DISTINCT FROM OLD.cae OR NEW.anulado_at IS DISTINCT FROM OLD.anulado_at) THEN RAISE EXCEPTION 'Comprobante anulado internamente'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER proteger_venta_online BEFORE INSERT OR UPDATE OR DELETE ON public.ventas FOR EACH ROW EXECUTE FUNCTION public.proteger_venta_online();

CREATE FUNCTION public.proteger_relacion_venta_online() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE anterior uuid; siguiente uuid;
BEGIN
  IF TG_OP<>'INSERT' THEN anterior:=OLD.venta_id; END IF;
  IF TG_OP<>'DELETE' THEN siguiente:=NEW.venta_id; END IF;
  IF EXISTS(SELECT 1 FROM public.ventas WHERE id IN (anterior,siguiente) AND origen_pedido_online_id IS NOT NULL) THEN
    IF TG_TABLE_NAME='pagos_venta' AND TG_OP='UPDATE' AND auth.role()='service_role'
      AND (to_jsonb(NEW)-ARRAY['updated_at','reembolso_confirmado','es_reembolso']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','reembolso_confirmado','es_reembolso']) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'El detalle y el cobro online se conservan; gestione la cancelacion desde el pedido';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER proteger_items_online BEFORE INSERT OR UPDATE OR DELETE ON public.venta_items FOR EACH ROW EXECUTE FUNCTION public.proteger_relacion_venta_online();
CREATE TRIGGER proteger_pagos_online BEFORE INSERT OR UPDATE OR DELETE ON public.pagos_venta FOR EACH ROW EXECUTE FUNCTION public.proteger_relacion_venta_online();
REVOKE ALL ON FUNCTION public.proteger_venta_online(),public.proteger_relacion_venta_online() FROM PUBLIC,anon,authenticated;
