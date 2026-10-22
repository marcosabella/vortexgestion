-- La entrega y la facturacion son independientes. Conserva el estado y la fecha de entrega.
BEGIN;

CREATE OR REPLACE FUNCTION public.taller_generar_presupuesto(p_orden_id uuid,p_version integer) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.taller_ordenes%ROWTYPE; resultado uuid; neto numeric; importe numeric; v_nombre text; v public.taller_vehiculos%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.taller_ordenes WHERE id=p_orden_id FOR UPDATE;
  PERFORM public.taller_exigir_admin(o.comercio_id);
  IF o.presupuesto_id IS NOT NULL AND o.estado<>'cancelado' THEN RETURN o.presupuesto_id; END IF;
  IF o.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'taller_version_desactualizada' USING ERRCODE='40001'; END IF;
  IF o.estado NOT IN ('recibido','diagnostico','presupuestado','aprobado','en_reparacion','listo','entregado') OR o.venta_id IS NOT NULL THEN RAISE EXCEPTION 'taller_transicion_invalida'; END IF;
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

CREATE OR REPLACE FUNCTION public.taller_proteger_presupuesto() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.taller_ordenes%ROWTYPE; presupuesto uuid;
BEGIN
  IF TG_TABLE_NAME='presupuestos' THEN
    presupuesto:=OLD.id;
  ELSE
    presupuesto:=CASE WHEN TG_OP='INSERT' THEN NEW.presupuesto_id ELSE OLD.presupuesto_id END;
  END IF;
  SELECT * INTO o FROM public.taller_ordenes WHERE presupuesto_id=presupuesto FOR UPDATE;
  IF o.id IS NULL AND TG_TABLE_NAME<>'presupuestos' AND TG_OP='UPDATE' THEN
    SELECT * INTO o FROM public.taller_ordenes WHERE presupuesto_id=NEW.presupuesto_id FOR UPDATE;
  END IF;
  IF o.id IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  PERFORM public.taller_exigir_admin(o.comercio_id);
  IF TG_TABLE_NAME='presupuestos' AND TG_OP='UPDATE' THEN
    IF NEW.tipo_comprobante::text NOT IN ('recibo_x','factura_a','factura_b','factura_c') THEN RAISE EXCEPTION 'taller_comprobante_invalido'; END IF;
    IF (to_jsonb(NEW)-ARRAY['estado','venta_id','confirmado_at','updated_at','tipo_pago','tipo_comprobante']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['estado','venta_id','confirmado_at','updated_at','tipo_pago','tipo_comprobante']) THEN RAISE EXCEPTION 'taller_presupuesto_protegido'; END IF;
    IF NEW.estado='confirmado' AND OLD.estado='pendiente' THEN
      IF o.estado NOT IN ('listo','entregado') OR NEW.venta_id IS NULL OR o.venta_id IS NOT NULL THEN RAISE EXCEPTION 'taller_orden_no_lista'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.ventas WHERE id=NEW.venta_id AND comercio_id=o.comercio_id AND cliente_id=o.cliente_id AND total=OLD.total) THEN RAISE EXCEPTION 'taller_venta_incompatible'; END IF;
      UPDATE public.taller_ordenes SET venta_id=NEW.venta_id,version=version+1,updated_at=now() WHERE id=o.id;
      INSERT INTO public.taller_orden_eventos(comercio_id,orden_id,estado_anterior,estado_nuevo,detalle,user_id) VALUES(o.comercio_id,o.id,o.estado,o.estado,'Venta vinculada: '||NEW.venta_id,auth.uid());
    ELSIF NEW.estado IS DISTINCT FROM OLD.estado OR NEW.venta_id IS DISTINCT FROM OLD.venta_id THEN RAISE EXCEPTION 'taller_presupuesto_protegido'; END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME='presupuesto_pagos' AND o.estado IN ('listo','entregado') AND o.venta_id IS NULL THEN
    IF TG_OP='UPDATE' AND (NEW.presupuesto_id IS DISTINCT FROM OLD.presupuesto_id OR NEW.comercio_id IS DISTINCT FROM OLD.comercio_id) THEN RAISE EXCEPTION 'taller_presupuesto_protegido'; END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'taller_presupuesto_protegido';
END $$;

CREATE OR REPLACE FUNCTION public.taller_facturar_orden(p_orden_id uuid,p_tipo public.tipo_comprobante,p_pagos jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.taller_ordenes%ROWTYPE; p public.presupuestos%ROWTYPE; pago jsonb; resultado uuid; suma numeric;
BEGIN
  SELECT * INTO o FROM public.taller_ordenes WHERE id=p_orden_id FOR UPDATE;
  PERFORM public.taller_exigir_admin(o.comercio_id);
  IF o.venta_id IS NOT NULL THEN RETURN o.venta_id; END IF;
  IF o.estado NOT IN ('listo','entregado') THEN RAISE EXCEPTION 'taller_orden_no_lista'; END IF;
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
