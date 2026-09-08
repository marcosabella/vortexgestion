BEGIN;

CREATE FUNCTION public.previsualizar_numero_venta(
  p_comercio_id uuid, p_tipo_comprobante public.tipo_comprobante, p_punto_venta integer
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_ultimo bigint;
BEGIN
  IF auth.uid() IS NULL OR p_comercio_id IS NULL OR NOT public.user_is_comercio_admin(p_comercio_id) THEN RAISE EXCEPTION 'ventas_no_disponible' USING ERRCODE='42501'; END IF;
  IF p_tipo_comprobante IS NULL OR p_punto_venta IS NULL OR p_punto_venta <= 0 THEN RAISE EXCEPTION 'ventas_cabecera_invalida' USING ERRCODE='22023'; END IF;
  SELECT ultimo_numero INTO v_ultimo FROM public.ventas_numeradores
  WHERE comercio_id=p_comercio_id AND tipo_comprobante=p_tipo_comprobante AND punto_venta=p_punto_venta;
  RETURN lpad(p_punto_venta::text,4,'0') || '-' || lpad((coalesce(v_ultimo,0)+1)::text,8,'0');
END; $$;
REVOKE ALL ON FUNCTION public.previsualizar_numero_venta(uuid, public.tipo_comprobante, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.previsualizar_numero_venta(uuid, public.tipo_comprobante, integer) TO authenticated;
COMMENT ON FUNCTION public.previsualizar_numero_venta(uuid, public.tipo_comprobante, integer) IS 'Previsualizacion informativa: no bloquea, reserva ni garantiza disponibilidad.';

CREATE OR REPLACE FUNCTION public.confirmar_presupuesto(p_presupuesto_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE p public.presupuestos%ROWTYPE; nueva_venta_id uuid; v_numero bigint; v_numero_texto text; v_intento integer:=0; v_punto_venta integer;
BEGIN
  SELECT * INTO p FROM public.presupuestos WHERE id=p_presupuesto_id FOR UPDATE;
  IF p.id IS NULL OR NOT public.user_belongs_to_comercio(p.comercio_id) THEN RAISE EXCEPTION 'Presupuesto no encontrado'; END IF;
  IF p.estado<>'pendiente' OR p.venta_id IS NOT NULL THEN RAISE EXCEPTION 'El presupuesto ya fue confirmado'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.presupuesto_items WHERE presupuesto_id=p.id) THEN RAISE EXCEPTION 'El presupuesto no tiene items'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.presupuesto_pagos WHERE presupuesto_id=p.id) THEN RAISE EXCEPTION 'El presupuesto no tiene medios de pago'; END IF;
  SELECT punto_venta INTO v_punto_venta FROM public.afip_config WHERE comercio_id=p.comercio_id AND activo=true FOR SHARE;
  IF v_punto_venta IS NULL OR v_punto_venta<=0 OR (SELECT count(*) FROM public.afip_config WHERE comercio_id=p.comercio_id AND activo=true)<>1 THEN RAISE EXCEPTION 'afip_punto_venta_invalido'; END IF;
  INSERT INTO public.ventas_numeradores(comercio_id,tipo_comprobante,punto_venta,ultimo_numero) VALUES(p.comercio_id,p.tipo_comprobante,v_punto_venta,0) ON CONFLICT(comercio_id,tipo_comprobante,punto_venta) DO NOTHING;
  LOOP
    v_intento:=v_intento+1; IF v_intento>100 THEN RAISE EXCEPTION 'ventas_numeracion_no_disponible' USING ERRCODE='40001'; END IF;
    UPDATE public.ventas_numeradores SET ultimo_numero=ultimo_numero+1,updated_at=now() WHERE comercio_id=p.comercio_id AND tipo_comprobante=p.tipo_comprobante AND punto_venta=v_punto_venta RETURNING ultimo_numero INTO v_numero;
    v_numero_texto:=lpad(v_punto_venta::text,4,'0')||'-'||lpad(v_numero::text,8,'0');
    BEGIN INSERT INTO public.ventas(comercio_id,numero_comprobante,fecha_venta,tipo_pago,tipo_comprobante,cliente_id,cliente_nombre,moneda,punto_venta,numero_secuencial,porcentaje_descuento,monto_descuento,porcentaje_recargo,monto_recargo,subtotal,total_iva,total,observaciones) VALUES(p.comercio_id,v_numero_texto,now(),p.tipo_pago,p.tipo_comprobante,p.cliente_id,p.cliente_nombre,'ARS',v_punto_venta,v_numero,p.porcentaje_descuento,p.monto_descuento,p.porcentaje_recargo,p.monto_recargo,p.subtotal,p.total_iva,p.total,concat_ws(E'\n',NULLIF(p.observaciones,''),'Generada desde presupuesto '||p.numero_comprobante)) RETURNING id INTO nueva_venta_id; EXIT; EXCEPTION WHEN unique_violation THEN NULL; END;
  END LOOP;
  INSERT INTO public.venta_items(venta_id,comercio_id,producto_id,descripcion_manual,codigo_manual,cantidad,precio_unitario,porcentaje_iva,porcentaje_descuento,monto_descuento,porcentaje_recargo,monto_recargo,monto_iva,subtotal,total,afecta_stock) SELECT nueva_venta_id,p.comercio_id,producto_id,descripcion_manual,codigo_manual,cantidad,precio_unitario,porcentaje_iva,porcentaje_descuento,monto_descuento,porcentaje_recargo,monto_recargo,monto_iva,subtotal,total,producto_id IS NOT NULL FROM public.presupuesto_items WHERE presupuesto_id=p.id;
  INSERT INTO public.pagos_venta(venta_id,comercio_id,tipo_pago,monto,banco_id,tarjeta_id,cuotas,recargo_cuotas,cheque_id,moneda) SELECT nueva_venta_id,p.comercio_id,tipo_pago,monto,banco_id,tarjeta_id,cuotas,recargo_cuotas,cheque_id,'ARS' FROM public.presupuesto_pagos WHERE presupuesto_id=p.id;
  IF p.cliente_id IS NOT NULL THEN INSERT INTO public.cuenta_corriente(comercio_id,cliente_id,tipo_movimiento,monto,concepto,venta_id,fecha_movimiento,moneda) SELECT p.comercio_id,p.cliente_id,'debito',pp.monto,'pago_cuenta_corriente',nueva_venta_id,now(),'ARS' FROM public.presupuesto_pagos pp WHERE pp.presupuesto_id=p.id AND pp.tipo_pago='cta_cte'; END IF;
  UPDATE public.presupuestos SET estado='confirmado',venta_id=nueva_venta_id,confirmado_at=now() WHERE id=p.id; RETURN nueva_venta_id;
END; $$;
REVOKE ALL ON FUNCTION public.confirmar_presupuesto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_presupuesto(uuid) TO authenticated;
COMMIT;
