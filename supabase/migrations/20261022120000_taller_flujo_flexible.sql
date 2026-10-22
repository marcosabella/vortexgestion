-- Flujo directo y conceptos editables hasta facturar o cerrar. Sin reparaciones de datos.
BEGIN;

CREATE OR REPLACE FUNCTION public.taller_guardar_item(p_orden_id uuid,p_version integer,p_id uuid,p_datos jsonb,p_eliminar boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.taller_ordenes%ROWTYPE; resultado uuid;
BEGIN
  SELECT * INTO o FROM public.taller_ordenes WHERE id=p_orden_id FOR UPDATE;
  PERFORM public.taller_exigir_admin(o.comercio_id);
  IF o.id IS NULL OR o.estado IN ('cancelado','entregado') OR o.venta_id IS NOT NULL THEN RAISE EXCEPTION 'taller_detalle_congelado'; END IF;
  IF o.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'taller_version_desactualizada' USING ERRCODE='40001'; END IF;
  IF p_eliminar THEN
    DELETE FROM public.taller_orden_items WHERE id=p_id AND orden_id=o.id AND comercio_id=o.comercio_id RETURNING id INTO resultado;
  ELSE
    IF p_id IS NOT NULL THEN
      DELETE FROM public.taller_orden_items WHERE id=p_id AND orden_id=o.id AND comercio_id=o.comercio_id RETURNING id INTO resultado;
      IF resultado IS NULL THEN RAISE EXCEPTION 'taller_item_no_disponible'; END IF;
    END IF;
    INSERT INTO public.taller_orden_items(id,comercio_id,orden_id,tipo,producto_id,producto_variante_id,proveedor_id,descripcion,cantidad,precio_unitario,porcentaje_iva,costo_unitario)
    VALUES(coalesce(p_id,gen_random_uuid()),o.comercio_id,o.id,p_datos->>'tipo',nullif(p_datos->>'producto_id','')::uuid,nullif(p_datos->>'producto_variante_id','')::uuid,nullif(p_datos->>'proveedor_id','')::uuid,p_datos->>'descripcion',(p_datos->>'cantidad')::numeric,(p_datos->>'precio_unitario')::numeric,coalesce((p_datos->>'porcentaje_iva')::numeric,0),coalesce((p_datos->>'costo_unitario')::numeric,0)) RETURNING id INTO resultado;
  END IF;
  IF resultado IS NULL THEN RAISE EXCEPTION 'taller_item_no_disponible'; END IF;
  UPDATE public.taller_ordenes SET version=version+1,updated_at=now() WHERE id=o.id;
  IF o.presupuesto_id IS NOT NULL THEN
    -- Conserva la version anterior del comprobante para consulta en el historial.
    INSERT INTO public.taller_orden_eventos(comercio_id,orden_id,estado_anterior,estado_nuevo,detalle,user_id)
    SELECT o.comercio_id,o.id,o.estado,o.estado,'Presupuesto anterior a modificar conceptos: '||
      jsonb_build_object('presupuesto',to_jsonb(p),'conceptos',(SELECT jsonb_agg(to_jsonb(i)) FROM public.presupuesto_items i WHERE i.presupuesto_id=p.id),'aprobacion',o.aprobacion_cliente)::text,auth.uid()
    FROM public.presupuestos p WHERE p.id=o.presupuesto_id;
    -- Desvinculacion transitoria bajo bloqueo: los triggers siguen activos.
    -- Solo esta RPC administrativa puede actualizar el detalle presupuestado.
    UPDATE public.taller_ordenes SET presupuesto_id=NULL WHERE id=o.id;
    DELETE FROM public.presupuesto_items WHERE presupuesto_id=o.presupuesto_id;
    INSERT INTO public.presupuesto_items(comercio_id,presupuesto_id,producto_id,producto_variante_id,descripcion_manual,cantidad,precio_unitario,porcentaje_iva,subtotal,monto_iva,total)
    SELECT o.comercio_id,o.presupuesto_id,producto_id,producto_variante_id,CASE WHEN producto_id IS NULL THEN descripcion ELSE NULL END,cantidad,precio_unitario,porcentaje_iva,round(total/(1+porcentaje_iva/100),2),total-round(total/(1+porcentaje_iva/100),2),total FROM public.taller_orden_items WHERE orden_id=o.id;
    UPDATE public.presupuestos SET
      total=(SELECT coalesce(sum(total),0) FROM public.taller_orden_items WHERE orden_id=o.id),
      subtotal=(SELECT coalesce(sum(subtotal),0) FROM public.presupuesto_items WHERE presupuesto_id=o.presupuesto_id),
      total_iva=(SELECT coalesce(sum(monto_iva),0) FROM public.presupuesto_items WHERE presupuesto_id=o.presupuesto_id),updated_at=now()
    WHERE id=o.presupuesto_id;
    DELETE FROM public.presupuesto_pagos WHERE presupuesto_id=o.presupuesto_id;
    INSERT INTO public.presupuesto_pagos(comercio_id,presupuesto_id,tipo_pago,monto)
    SELECT o.comercio_id,o.presupuesto_id,'cta_cte',total FROM public.presupuestos WHERE id=o.presupuesto_id AND total>0;
    UPDATE public.taller_ordenes SET presupuesto_id=o.presupuesto_id,aprobacion_cliente=NULL,
      estado=CASE WHEN estado='aprobado' THEN 'presupuestado' ELSE estado END WHERE id=o.id;
  END IF;
  INSERT INTO public.taller_orden_eventos(comercio_id,orden_id,estado_anterior,estado_nuevo,detalle,user_id)
  SELECT o.comercio_id,o.id,o.estado,estado,
    CASE WHEN p_eliminar THEN 'Concepto eliminado' ELSE 'Concepto guardado' END ||
    CASE WHEN o.presupuesto_id IS NOT NULL THEN '. Presupuesto actualizado; aprobacion anterior invalidada: '||coalesce(o.aprobacion_cliente,'Sin aprobacion') ELSE '' END,auth.uid()
  FROM public.taller_ordenes WHERE id=o.id;
  RETURN resultado;
END $$;

CREATE OR REPLACE FUNCTION public.taller_cambiar_estado(p_orden_id uuid,p_version integer,p_estado text,p_detalle text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.taller_ordenes%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.taller_ordenes WHERE id=p_orden_id FOR UPDATE;
  PERFORM public.taller_exigir_admin(o.comercio_id);
  IF o.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'taller_version_desactualizada' USING ERRCODE='40001'; END IF;
  IF NOT ((o.estado='recibido' AND p_estado='diagnostico') OR (o.estado IN ('recibido','diagnostico','presupuestado') AND p_estado='en_reparacion') OR (o.estado='presupuestado' AND p_estado='aprobado') OR (o.estado='aprobado' AND p_estado='en_reparacion') OR (o.estado='en_reparacion' AND p_estado='listo') OR (o.estado='listo' AND p_estado='entregado') OR (o.estado IN ('recibido','diagnostico','presupuestado','aprobado','en_reparacion','listo') AND p_estado='cancelado' AND o.venta_id IS NULL)) THEN RAISE EXCEPTION 'taller_transicion_invalida'; END IF;
  IF p_estado IN ('aprobado','cancelado') AND length(btrim(coalesce(p_detalle,'')))=0 THEN RAISE EXCEPTION 'taller_motivo_requerido'; END IF;
  IF p_estado='listo' AND length(btrim(o.trabajo_realizado))=0 THEN RAISE EXCEPTION 'taller_trabajo_realizado_requerido'; END IF;
  UPDATE public.taller_ordenes SET estado=p_estado,aprobacion_cliente=CASE WHEN p_estado='aprobado' THEN p_detalle ELSE aprobacion_cliente END,motivo_cancelacion=CASE WHEN p_estado='cancelado' THEN p_detalle ELSE motivo_cancelacion END,entregado_at=CASE WHEN p_estado='entregado' THEN now() ELSE entregado_at END,version=version+1,updated_at=now() WHERE id=o.id;
  INSERT INTO public.taller_orden_eventos(comercio_id,orden_id,estado_anterior,estado_nuevo,detalle,user_id) VALUES(o.comercio_id,o.id,o.estado,p_estado,p_detalle,auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.taller_generar_presupuesto(p_orden_id uuid,p_version integer) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.taller_ordenes%ROWTYPE; resultado uuid; neto numeric; importe numeric; v_nombre text; v public.taller_vehiculos%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.taller_ordenes WHERE id=p_orden_id FOR UPDATE;
  PERFORM public.taller_exigir_admin(o.comercio_id);
  IF o.presupuesto_id IS NOT NULL AND o.estado<>'cancelado' THEN RETURN o.presupuesto_id; END IF;
  IF o.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'taller_version_desactualizada' USING ERRCODE='40001'; END IF;
  IF o.estado NOT IN ('recibido','diagnostico','presupuestado','aprobado','en_reparacion','listo') OR o.venta_id IS NOT NULL THEN RAISE EXCEPTION 'taller_transicion_invalida'; END IF;
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
  UPDATE public.taller_ordenes SET presupuesto_id=resultado,estado=CASE WHEN o.estado IN ('recibido','diagnostico') THEN 'presupuestado' ELSE o.estado END,version=version+1,updated_at=now() WHERE id=o.id;
  INSERT INTO public.taller_orden_eventos(comercio_id,orden_id,estado_anterior,estado_nuevo,detalle,user_id) VALUES(o.comercio_id,o.id,o.estado,CASE WHEN o.estado IN ('recibido','diagnostico') THEN 'presupuestado' ELSE o.estado END,'Presupuesto integrado generado',auth.uid());
  RETURN resultado;
END $$;

CREATE OR REPLACE FUNCTION public.taller_facturar_orden(p_orden_id uuid,p_tipo public.tipo_comprobante,p_pagos jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.taller_ordenes%ROWTYPE; p public.presupuestos%ROWTYPE; pago jsonb; resultado uuid; suma numeric;
BEGIN
  SELECT * INTO o FROM public.taller_ordenes WHERE id=p_orden_id FOR UPDATE;
  PERFORM public.taller_exigir_admin(o.comercio_id);
  IF o.venta_id IS NOT NULL THEN RETURN o.venta_id; END IF;
  IF o.estado<>'listo' THEN RAISE EXCEPTION 'taller_orden_no_lista'; END IF;
  IF o.presupuesto_id IS NULL THEN
    -- Reutiliza la integracion comercial existente sin exigir presupuesto previo.
    PERFORM public.taller_generar_presupuesto(o.id,o.version);
    SELECT * INTO o FROM public.taller_ordenes WHERE id=p_orden_id;
  END IF;
  IF p_tipo::text NOT IN ('recibo_x','factura_a','factura_b','factura_c') THEN RAISE EXCEPTION 'taller_comprobante_invalido'; END IF;
  SELECT * INTO p FROM public.presupuestos WHERE id=o.presupuesto_id FOR UPDATE;
  IF p.estado<>'pendiente' THEN RAISE EXCEPTION 'taller_presupuesto_protegido'; END IF;
  IF jsonb_typeof(p_pagos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_pagos)=0 THEN RAISE EXCEPTION 'taller_pagos_invalidos'; END IF;
  SELECT sum((value->>'monto')::numeric-coalesce((value->>'recargo_cuotas')::numeric,0)) INTO suma FROM jsonb_array_elements(p_pagos);
  IF suma IS DISTINCT FROM p.total THEN RAISE EXCEPTION 'taller_pagos_no_coinciden'; END IF;
  DELETE FROM public.presupuesto_pagos WHERE presupuesto_id=p.id;
  FOR pago IN SELECT value FROM jsonb_array_elements(p_pagos) LOOP
    IF (pago->>'monto')::numeric<=0 OR (pago->>'monto')::numeric::text IN ('NaN','Infinity','-Infinity') OR (pago->>'tipo_pago') NOT IN ('contado','transferencia','tarjeta','cheque','cta_cte') OR coalesce((pago->>'recargo_cuotas')::numeric,0)<0 OR coalesce((pago->>'recargo_cuotas')::numeric,0)>=(pago->>'monto')::numeric THEN RAISE EXCEPTION 'taller_pagos_invalidos'; END IF;
    IF pago->>'tipo_pago'='tarjeta' AND nullif(pago->>'tarjeta_id','') IS NULL THEN RAISE EXCEPTION 'taller_tarjeta_requerida'; END IF;
    IF pago->>'tipo_pago'='cheque' AND nullif(pago->>'cheque_id','') IS NULL THEN RAISE EXCEPTION 'taller_cheque_requerido'; END IF;
    IF coalesce((pago->>'cuotas')::integer,1)<1 OR coalesce((pago->>'cuotas')::integer,1)>120 THEN RAISE EXCEPTION 'taller_cuotas_invalidas'; END IF;
    IF pago->>'tipo_pago'<>'tarjeta' AND coalesce((pago->>'recargo_cuotas')::numeric,0)<>0 THEN RAISE EXCEPTION 'taller_recargo_invalido'; END IF;
    INSERT INTO public.presupuesto_pagos(comercio_id,presupuesto_id,tipo_pago,monto,banco_id,tarjeta_id,cuotas,cheque_id,recargo_cuotas)
    VALUES(o.comercio_id,p.id,(pago->>'tipo_pago')::public.tipo_pago,(pago->>'monto')::numeric,nullif(pago->>'banco_id','')::uuid,nullif(pago->>'tarjeta_id','')::uuid,coalesce((pago->>'cuotas')::integer,1),nullif(pago->>'cheque_id','')::uuid,coalesce((pago->>'recargo_cuotas')::numeric,0));
  END LOOP;
  UPDATE public.presupuestos SET tipo_comprobante=p_tipo,tipo_pago=(p_pagos->0->>'tipo_pago')::public.tipo_pago WHERE id=p.id;
  resultado:=public.confirmar_presupuesto(p.id);
  RETURN resultado;
END $$;

COMMIT;
