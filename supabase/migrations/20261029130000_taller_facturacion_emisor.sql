-- Infraestructura de Taller: no modifica datos ni configuraciones de comercios.
BEGIN;

-- Helpers privados: PostgreSQL valida pertenencia y disponibilidad del emisor.
CREATE FUNCTION public.taller_punto_venta_emisor(p_comercio_id uuid,p_emisor_fiscal_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE multi boolean; punto integer;
BEGIN
  PERFORM public.taller_exigir_admin(p_comercio_id);
  SELECT coalesce(parametros->'funciones'->>'multiples_cuit','false')='true' INTO multi
    FROM public.comercio_parametrizacion WHERE comercio_id=p_comercio_id;
  IF p_emisor_fiscal_id IS NULL THEN
    IF coalesce(multi,false) THEN RAISE EXCEPTION 'emisor_fiscal_requerido'; END IF;
    SELECT punto_venta INTO punto FROM public.afip_config WHERE comercio_id=p_comercio_id AND activo;
    RETURN coalesce(punto,1);
  END IF;
  IF NOT coalesce(multi,false) THEN RAISE EXCEPTION 'emisor_fiscal_no_disponible'; END IF;
  SELECT punto_venta INTO punto FROM public.emisores_fiscales
    WHERE id=p_emisor_fiscal_id AND comercio_id=p_comercio_id AND activo FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'emisor_fiscal_no_disponible'; END IF;
  RETURN punto;
END $$;

CREATE FUNCTION public.taller_reservar_numero(p_comercio_id uuid,p_tipo public.tipo_comprobante,p_punto integer,p_emisor_fiscal_id uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE numero bigint;
BEGIN
  IF p_punto IS DISTINCT FROM public.taller_punto_venta_emisor(p_comercio_id,p_emisor_fiscal_id) THEN RAISE EXCEPTION 'emisor_punto_venta_invalido'; END IF;
  IF p_emisor_fiscal_id IS NULL THEN
    INSERT INTO public.ventas_numeradores(comercio_id,tipo_comprobante,punto_venta,ultimo_numero)
    VALUES(p_comercio_id,p_tipo,p_punto,0) ON CONFLICT DO NOTHING;
    UPDATE public.ventas_numeradores SET ultimo_numero=ultimo_numero+1,updated_at=now()
    WHERE comercio_id=p_comercio_id AND tipo_comprobante=p_tipo AND punto_venta=p_punto RETURNING ultimo_numero INTO numero;
  ELSE
    INSERT INTO public.ventas_numeradores_emisores(comercio_id,emisor_fiscal_id,tipo_comprobante,punto_venta,ultimo_numero)
    VALUES(p_comercio_id,p_emisor_fiscal_id,p_tipo,p_punto,0) ON CONFLICT DO NOTHING;
    UPDATE public.ventas_numeradores_emisores SET ultimo_numero=greatest(ultimo_numero,coalesce((
      SELECT max(public.ventas_numero_secuencial_canonico(numero_comprobante)) FROM public.ventas
      WHERE comercio_id=p_comercio_id AND emisor_fiscal_id=p_emisor_fiscal_id AND tipo_comprobante=p_tipo
    ),0))+1,updated_at=now()
    WHERE comercio_id=p_comercio_id AND emisor_fiscal_id=p_emisor_fiscal_id AND tipo_comprobante=p_tipo AND punto_venta=p_punto RETURNING ultimo_numero INTO numero;
  END IF;
  IF numero>99999999 THEN RAISE EXCEPTION 'ventas_numeracion_no_disponible'; END IF;
  RETURN numero;
END $$;

CREATE OR REPLACE FUNCTION public.taller_confirmar_presupuesto_emisor(p_presupuesto_id uuid, p_emisor_fiscal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  p public.presupuestos%ROWTYPE;
  nueva_venta_id uuid;
  v_numero bigint;
  v_numero_texto text;
  v_intento integer := 0;
  v_punto_venta integer;
BEGIN
  SELECT * INTO p
  FROM public.presupuestos
  WHERE id = p_presupuesto_id
  FOR UPDATE;

  IF p.id IS NULL OR NOT public.user_belongs_to_comercio(p.comercio_id) THEN
    RAISE EXCEPTION 'Presupuesto no encontrado';
  END IF;
  PERFORM public.taller_exigir_admin(p.comercio_id);
  IF NOT EXISTS(SELECT 1 FROM public.taller_ordenes WHERE presupuesto_id=p.id AND comercio_id=p.comercio_id) THEN RAISE EXCEPTION 'taller_presupuesto_protegido'; END IF;
  IF p.estado <> 'pendiente' OR p.venta_id IS NOT NULL THEN
    RAISE EXCEPTION 'El presupuesto ya fue confirmado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.presupuesto_items WHERE presupuesto_id = p.id) THEN
    RAISE EXCEPTION 'El presupuesto no tiene items';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.presupuesto_pagos WHERE presupuesto_id = p.id) THEN
    RAISE EXCEPTION 'El presupuesto no tiene medios de pago';
  END IF;

  v_punto_venta := public.taller_punto_venta_emisor(p.comercio_id,p_emisor_fiscal_id);

  LOOP
    v_intento := v_intento + 1;
    IF v_intento > 100 THEN
      RAISE EXCEPTION 'ventas_numeracion_no_disponible' USING ERRCODE = '40001';
    END IF;

    v_numero := public.taller_reservar_numero(p.comercio_id,p.tipo_comprobante,v_punto_venta,p_emisor_fiscal_id);

    v_numero_texto := lpad(v_punto_venta::text, 4, '0') || '-' || lpad(v_numero::text, 8, '0');

    BEGIN
      INSERT INTO public.ventas(
        comercio_id, emisor_fiscal_id, numero_comprobante, fecha_venta, tipo_pago, tipo_comprobante,
        cliente_id, cliente_nombre, moneda, punto_venta, numero_secuencial,
        porcentaje_descuento, monto_descuento, porcentaje_recargo, monto_recargo,
        subtotal, total_iva, total, observaciones
      ) VALUES (
        p.comercio_id, p_emisor_fiscal_id, v_numero_texto, now(), p.tipo_pago, p.tipo_comprobante,
        p.cliente_id, p.cliente_nombre, 'ARS', v_punto_venta, v_numero,
        p.porcentaje_descuento, p.monto_descuento, p.porcentaje_recargo, p.monto_recargo,
        p.subtotal, p.total_iva, p.total,
        concat_ws(E'\n', nullif(p.observaciones, ''), 'Generada desde presupuesto ' || p.numero_comprobante)
      ) RETURNING id INTO nueva_venta_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  INSERT INTO public.venta_items(
    venta_id, comercio_id, producto_id, producto_variante_id,
    descripcion_manual, codigo_manual, cantidad, precio_unitario, porcentaje_iva,
    porcentaje_descuento, monto_descuento, porcentaje_recargo, monto_recargo,
    monto_iva, subtotal, total, afecta_stock
  ) SELECT
    nueva_venta_id, p.comercio_id, producto_id, producto_variante_id,
    descripcion_manual, codigo_manual, cantidad, precio_unitario, porcentaje_iva,
    porcentaje_descuento, monto_descuento, porcentaje_recargo, monto_recargo,
    monto_iva, subtotal, total, producto_id IS NOT NULL
  FROM public.presupuesto_items
  WHERE presupuesto_id = p.id;

  INSERT INTO public.pagos_venta(
    venta_id, comercio_id, tipo_pago, monto, banco_id, tarjeta_id, cuotas,
    recargo_cuotas, cheque_id, moneda
  ) SELECT
    nueva_venta_id, p.comercio_id, tipo_pago, monto, banco_id, tarjeta_id, cuotas,
    recargo_cuotas, cheque_id, 'ARS'
  FROM public.presupuesto_pagos
  WHERE presupuesto_id = p.id;

  IF p.cliente_id IS NOT NULL THEN
    INSERT INTO public.cuenta_corriente(
      comercio_id, cliente_id, tipo_movimiento, monto, concepto, venta_id,
      fecha_movimiento, moneda
    ) SELECT
      p.comercio_id, p.cliente_id, 'debito', pp.monto, 'pago_cuenta_corriente',
      nueva_venta_id, now(), 'ARS'
    FROM public.presupuesto_pagos AS pp
    WHERE pp.presupuesto_id = p.id AND pp.tipo_pago = 'cta_cte';
  END IF;

  UPDATE public.presupuestos
  SET estado = 'confirmado', venta_id = nueva_venta_id, confirmado_at = now()
  WHERE id = p.id;

  RETURN nueva_venta_id;
END;
$$;

CREATE FUNCTION public.taller_facturar_directa(p_orden_id uuid,p_tipo public.tipo_comprobante,p_pagos jsonb,p_emisor_fiscal_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.taller_ordenes%ROWTYPE; v_venta public.ventas%ROWTYPE;
  importe numeric; suma numeric; pago jsonb; nombre text; punto integer;
  neto numeric; total_final numeric; numero bigint; numero_texto text; intento integer:=0;
BEGIN
  SELECT * INTO o FROM public.taller_ordenes WHERE id=p_orden_id FOR UPDATE;
  PERFORM public.taller_exigir_admin(o.comercio_id);
  IF o.venta_id IS NOT NULL THEN RETURN o.venta_id; END IF;
  IF o.estado NOT IN ('listo','entregado') OR o.presupuesto_id IS NOT NULL THEN RAISE EXCEPTION 'taller_orden_no_lista'; END IF;
  IF p_tipo IS NULL OR p_tipo::text NOT IN ('recibo_x','factura_a','factura_b','factura_c') THEN RAISE EXCEPTION 'taller_comprobante_invalido'; END IF;
  SELECT sum(total),sum(round(total/(1+porcentaje_iva/100),2)) INTO importe,neto FROM public.taller_orden_items WHERE orden_id=o.id AND comercio_id=o.comercio_id;
  IF importe IS NULL OR importe<=0 THEN RAISE EXCEPTION 'taller_detalle_vacio'; END IF;
  IF jsonb_typeof(p_pagos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_pagos)=0 THEN RAISE EXCEPTION 'taller_pagos_invalidos'; END IF;
  FOR pago IN SELECT value FROM jsonb_array_elements(p_pagos) LOOP
    IF jsonb_typeof(pago) IS DISTINCT FROM 'object' OR pago->>'tipo_pago' IS NULL OR pago->>'monto' IS NULL
       OR (pago->>'monto')::numeric<=0 OR (pago->>'monto')::numeric::text IN ('NaN','Infinity','-Infinity')
       OR pago->>'tipo_pago' NOT IN ('contado','transferencia','tarjeta','cheque','cta_cte')
       OR coalesce((pago->>'recargo_cuotas')::numeric,0)<0
       OR coalesce((pago->>'recargo_cuotas')::numeric,0)>=(pago->>'monto')::numeric
       OR (pago->>'tipo_pago'<>'tarjeta' AND coalesce((pago->>'recargo_cuotas')::numeric,0)<>0)
       OR coalesce((pago->>'cuotas')::integer,1) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'taller_pagos_invalidos'; END IF;
    IF pago->>'tipo_pago'='tarjeta' AND nullif(pago->>'tarjeta_id','') IS NULL THEN RAISE EXCEPTION 'taller_tarjeta_requerida'; END IF;
    IF pago->>'tipo_pago'='cheque' AND nullif(pago->>'cheque_id','') IS NULL THEN RAISE EXCEPTION 'taller_cheque_requerido'; END IF;
    IF nullif(pago->>'banco_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bancos WHERE id=(pago->>'banco_id')::uuid AND comercio_id=o.comercio_id) THEN RAISE EXCEPTION 'El banco pertenece a otro comercio'; END IF;
    IF nullif(pago->>'tarjeta_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tarjetas_credito WHERE id=(pago->>'tarjeta_id')::uuid AND comercio_id=o.comercio_id) THEN RAISE EXCEPTION 'La tarjeta pertenece a otro comercio'; END IF;
    IF nullif(pago->>'cheque_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cheques WHERE id=(pago->>'cheque_id')::uuid AND comercio_id=o.comercio_id) THEN RAISE EXCEPTION 'El cheque pertenece a otro comercio'; END IF;
  END LOOP;
  SELECT sum((value->>'monto')::numeric-coalesce((value->>'recargo_cuotas')::numeric,0)) INTO suma FROM jsonb_array_elements(p_pagos);
  IF suma IS DISTINCT FROM importe THEN RAISE EXCEPTION 'taller_pagos_no_coinciden'; END IF;
  SELECT sum((value->>'monto')::numeric) INTO total_final FROM jsonb_array_elements(p_pagos);
  neto:=round(neto*total_final/importe,2);
  SELECT concat_ws(' ',c.nombre,c.apellido) INTO nombre FROM public.clientes c WHERE c.id=o.cliente_id AND c.comercio_id=o.comercio_id;
  punto:=public.taller_punto_venta_emisor(o.comercio_id,p_emisor_fiscal_id);
  LOOP
    intento:=intento+1;
    IF intento>100 THEN RAISE EXCEPTION 'ventas_numeracion_no_disponible' USING ERRCODE='40001'; END IF;
    numero:=public.taller_reservar_numero(o.comercio_id,p_tipo,punto,p_emisor_fiscal_id);
    numero_texto:=lpad(punto::text,4,'0')||'-'||lpad(numero::text,8,'0');
    BEGIN
      INSERT INTO public.ventas(comercio_id,emisor_fiscal_id,numero_comprobante,fecha_venta,tipo_pago,tipo_comprobante,
        cliente_id,cliente_nombre,moneda,punto_venta,numero_secuencial,
        porcentaje_descuento,monto_descuento,porcentaje_recargo,monto_recargo,subtotal,total_iva,total,observaciones)
      VALUES(o.comercio_id,p_emisor_fiscal_id,numero_texto,now(),(p_pagos->0->>'tipo_pago')::public.tipo_pago,p_tipo,
        o.cliente_id,nombre,'ARS',punto,numero,0,0,0,0,neto,total_final-neto,total_final,
        'Venta directa desde orden de taller #'||o.numero||E'\n'||o.motivo) RETURNING * INTO v_venta;
      EXIT;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;
  INSERT INTO public.venta_items(venta_id,comercio_id,producto_id,producto_variante_id,descripcion_manual,
    cantidad,precio_unitario,porcentaje_iva,porcentaje_descuento,monto_descuento,porcentaje_recargo,monto_recargo,monto_iva,subtotal,total,afecta_stock)
  SELECT v_venta.id,o.comercio_id,producto_id,producto_variante_id,CASE WHEN producto_id IS NULL THEN descripcion ELSE NULL END,
    cantidad,precio_unitario,porcentaje_iva,0,0,0,0,total-round(total/(1+porcentaje_iva/100),2),round(total/(1+porcentaje_iva/100),2),total,producto_id IS NOT NULL
  FROM public.taller_orden_items WHERE orden_id=o.id AND comercio_id=o.comercio_id;
  INSERT INTO public.pagos_venta(venta_id,comercio_id,tipo_pago,monto,banco_id,tarjeta_id,cuotas,recargo_cuotas,cheque_id,moneda)
  SELECT v_venta.id,o.comercio_id,(value->>'tipo_pago')::public.tipo_pago,(value->>'monto')::numeric,
    nullif(value->>'banco_id','')::uuid,nullif(value->>'tarjeta_id','')::uuid,coalesce((value->>'cuotas')::integer,1),
    coalesce((value->>'recargo_cuotas')::numeric,0),nullif(value->>'cheque_id','')::uuid,'ARS'
  FROM jsonb_array_elements(p_pagos);
  -- Se imputa como deuda exclusivamente la parte elegida en cuenta corriente.
  INSERT INTO public.cuenta_corriente(comercio_id,cliente_id,tipo_movimiento,monto,concepto,venta_id,fecha_movimiento,moneda)
  SELECT o.comercio_id,o.cliente_id,'debito',(value->>'monto')::numeric,'pago_cuenta_corriente',v_venta.id,v_venta.fecha_venta,'ARS'
  FROM jsonb_array_elements(p_pagos) WHERE value->>'tipo_pago'='cta_cte';
  UPDATE public.taller_ordenes SET venta_id=v_venta.id,version=version+1,updated_at=now() WHERE id=o.id;
  INSERT INTO public.taller_orden_eventos(comercio_id,orden_id,estado_anterior,estado_nuevo,detalle,user_id)
  VALUES(o.comercio_id,o.id,o.estado,o.estado,'Venta vinculada: '||v_venta.id,auth.uid());
  RETURN v_venta.id;
END $$;
CREATE OR REPLACE FUNCTION public.taller_facturar_orden(p_orden_id uuid,p_tipo public.tipo_comprobante,p_pagos jsonb,p_emisor_fiscal_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.taller_ordenes%ROWTYPE; p public.presupuestos%ROWTYPE; pago jsonb; resultado uuid; suma numeric;
BEGIN
  SELECT * INTO o FROM public.taller_ordenes WHERE id=p_orden_id FOR UPDATE;
  PERFORM public.taller_exigir_admin(o.comercio_id);
  IF o.venta_id IS NOT NULL THEN RETURN o.venta_id; END IF;
  IF o.estado NOT IN ('listo','entregado') THEN RAISE EXCEPTION 'taller_orden_no_lista'; END IF;
  IF o.presupuesto_id IS NULL THEN
    RETURN public.taller_facturar_directa(o.id,p_tipo,p_pagos,p_emisor_fiscal_id);
  END IF;
  IF p_tipo IS NULL OR p_tipo::text NOT IN ('recibo_x','factura_a','factura_b','factura_c') THEN RAISE EXCEPTION 'taller_comprobante_invalido'; END IF;
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
  resultado:=public.taller_confirmar_presupuesto_emisor(p.id,p_emisor_fiscal_id);
  RETURN resultado;
END $$;


-- Conserva la firma legacy para clientes sin multiples CUIT.
CREATE OR REPLACE FUNCTION public.taller_facturar_orden(p_orden_id uuid,p_tipo public.tipo_comprobante,p_pagos jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  RETURN public.taller_facturar_orden(p_orden_id,p_tipo,p_pagos,NULL);
END $$;
REVOKE ALL ON FUNCTION public.taller_punto_venta_emisor(uuid,uuid),public.taller_reservar_numero(uuid,public.tipo_comprobante,integer,uuid),public.taller_confirmar_presupuesto_emisor(uuid,uuid),public.taller_facturar_directa(uuid,public.tipo_comprobante,jsonb,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.taller_facturar_orden(uuid,public.tipo_comprobante,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.taller_facturar_orden(uuid,public.tipo_comprobante,jsonb,uuid) TO authenticated;
COMMIT;
