BEGIN;
ALTER TABLE public.presupuestos ADD COLUMN taller_vehiculo jsonb;
COMMENT ON COLUMN public.presupuestos.taller_vehiculo IS 'Datos del vehiculo al emitir el presupuesto de Taller';
CREATE OR REPLACE FUNCTION public.taller_generar_presupuesto(p_orden_id uuid,p_version integer) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.taller_ordenes%ROWTYPE; resultado uuid; neto numeric; importe numeric; v_nombre text; v public.taller_vehiculos%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.taller_ordenes WHERE id=p_orden_id FOR UPDATE;
  PERFORM public.taller_exigir_admin(o.comercio_id);
  IF o.presupuesto_id IS NOT NULL AND o.estado<>'cancelado' THEN RETURN o.presupuesto_id; END IF;
  IF o.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'taller_version_desactualizada' USING ERRCODE='40001'; END IF;
  IF o.estado NOT IN ('recibido','diagnostico') THEN RAISE EXCEPTION 'taller_transicion_invalida'; END IF;
  SELECT sum(total),sum(round(total/(1+porcentaje_iva/100),2)) INTO importe,neto FROM public.taller_orden_items WHERE orden_id=o.id;
  IF importe IS NULL OR importe<=0 THEN RAISE EXCEPTION 'taller_detalle_vacio'; END IF;
  SELECT concat_ws(' ',c.nombre,c.apellido) INTO v_nombre FROM public.clientes c WHERE id=o.cliente_id;
  SELECT * INTO v FROM public.taller_vehiculos WHERE id=o.vehiculo_id AND comercio_id=o.comercio_id FOR SHARE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'taller_vehiculo_no_disponible'; END IF;
  INSERT INTO public.presupuestos(comercio_id,numero_comprobante,tipo_pago,tipo_comprobante,cliente_id,cliente_nombre,subtotal,total_iva,total,observaciones,taller_vehiculo)
  VALUES(o.comercio_id,'TALLER-'||lpad(o.numero::text,8,'0'),'cta_cte','recibo_x',o.cliente_id,v_nombre,neto,importe-neto,importe,'Orden de taller #'||o.numero||E'\n'||o.motivo,jsonb_build_object('patente',v.patente,'marca',v.marca,'modelo',v.modelo,'anio',v.anio,'kilometraje',o.kilometraje)) RETURNING id INTO resultado;
  INSERT INTO public.presupuesto_items(comercio_id,presupuesto_id,producto_id,producto_variante_id,descripcion_manual,cantidad,precio_unitario,porcentaje_iva,subtotal,monto_iva,total)
  SELECT o.comercio_id,resultado,producto_id,producto_variante_id,CASE WHEN producto_id IS NULL THEN descripcion ELSE NULL END,cantidad,precio_unitario,porcentaje_iva,round(total/(1+porcentaje_iva/100),2),total-round(total/(1+porcentaje_iva/100),2),total FROM public.taller_orden_items WHERE orden_id=o.id;
  INSERT INTO public.presupuesto_pagos(comercio_id,presupuesto_id,tipo_pago,monto) VALUES(o.comercio_id,resultado,'cta_cte',importe);
  UPDATE public.taller_ordenes SET presupuesto_id=resultado,estado='presupuestado',version=version+1,updated_at=now() WHERE id=o.id;
  INSERT INTO public.taller_orden_eventos(comercio_id,orden_id,estado_anterior,estado_nuevo,detalle,user_id) VALUES(o.comercio_id,o.id,o.estado,'presupuestado','Presupuesto integrado generado',auth.uid());
  RETURN resultado;
END $$;

COMMIT;
