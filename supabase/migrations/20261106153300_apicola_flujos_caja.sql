BEGIN;
CREATE TABLE public.apicola_flujos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),comercio_id uuid NOT NULL REFERENCES public.comercio(id),campana_id uuid NOT NULL,apiario_id uuid,
 origen text NOT NULL CHECK(origen IN ('cobro_venta','reembolso_venta','cobro_cuenta','pago_proveedor','gasto_pagado')),
 pago_venta_id uuid REFERENCES public.pagos_venta(id) ON DELETE RESTRICT,cuenta_cliente_id uuid REFERENCES public.cuenta_corriente(id) ON DELETE RESTRICT,
 cuenta_proveedor_id uuid REFERENCES public.cuenta_corriente_proveedores(id) ON DELETE RESTRICT,gasto_id uuid REFERENCES public.gastos_egresos(id) ON DELETE RESTRICT,
 fecha date NOT NULL,moneda text NOT NULL CHECK(moneda IN ('ARS','USD')),tipo text NOT NULL CHECK(tipo IN ('ingreso','egreso')),
 importe numeric(14,2) NOT NULL CHECK(importe>0 AND importe<1000000000000),referencia text NOT NULL,criterio text NOT NULL CHECK(length(btrim(criterio)) BETWEEN 5 AND 1000),
 estado text NOT NULL DEFAULT 'vigente' CHECK(estado IN ('vigente','anulado')),motivo_anulacion text,
 version integer NOT NULL DEFAULT 1,creado_por uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(comercio_id,id),FOREIGN KEY(comercio_id,campana_id) REFERENCES public.apicola_campanas(comercio_id,id),FOREIGN KEY(comercio_id,apiario_id) REFERENCES public.apicola_apiarios(comercio_id,id),
 CHECK((origen IN ('cobro_venta','reembolso_venta') AND pago_venta_id IS NOT NULL AND cuenta_cliente_id IS NULL AND cuenta_proveedor_id IS NULL AND gasto_id IS NULL)
 OR (origen='cobro_cuenta' AND cuenta_cliente_id IS NOT NULL AND pago_venta_id IS NULL AND cuenta_proveedor_id IS NULL AND gasto_id IS NULL)
 OR (origen='pago_proveedor' AND cuenta_proveedor_id IS NOT NULL AND pago_venta_id IS NULL AND cuenta_cliente_id IS NULL AND gasto_id IS NULL)
 OR (origen='gasto_pagado' AND gasto_id IS NOT NULL AND pago_venta_id IS NULL AND cuenta_cliente_id IS NULL AND cuenta_proveedor_id IS NULL)),
 CHECK((origen IN ('cobro_venta','cobro_cuenta') AND tipo='ingreso') OR (origen NOT IN ('cobro_venta','cobro_cuenta') AND tipo='egreso'))
);
CREATE INDEX apicola_flujos_periodo ON public.apicola_flujos(comercio_id,campana_id,fecha,apiario_id);
CREATE INDEX apicola_flujos_pago ON public.apicola_flujos(pago_venta_id,origen,estado);
CREATE INDEX apicola_flujos_cliente ON public.apicola_flujos(cuenta_cliente_id,estado);
CREATE INDEX apicola_flujos_proveedor ON public.apicola_flujos(cuenta_proveedor_id,estado);
CREATE INDEX apicola_flujos_gasto ON public.apicola_flujos(gasto_id,estado);
ALTER TABLE public.apicola_flujos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apicola_flujos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.apicola_flujos TO authenticated;
CREATE POLICY apicola_flujos_admin ON public.apicola_flujos FOR SELECT TO authenticated USING(public.apicola_permiso(comercio_id,'admin'));
CREATE TRIGGER apicola_auditoria AFTER INSERT OR UPDATE ON public.apicola_flujos FOR EACH ROW EXECUTE FUNCTION public.apicola_auditar();

CREATE FUNCTION public.apicola_fuentes_caja(p_comercio uuid) RETURNS TABLE(origen text,id uuid,numero text,fecha date,moneda text,tipo text,importe numeric,detalle text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT 'cobro_venta',p.id,v.numero_comprobante,(p.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,p.moneda::text,'ingreso',p.monto,coalesce(v.cliente_nombre,'')||' · '||p.tipo_pago::text
 FROM public.pagos_venta p JOIN public.ventas v ON v.id=p.venta_id AND v.comercio_id=p.comercio_id WHERE p.comercio_id=p_comercio AND p.tipo_pago::text<>'cta_cte' AND NOT p.es_reembolso AND p.monto>0
 UNION ALL
 SELECT 'reembolso_venta',p.id,v.numero_comprobante,(p.updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,p.moneda::text,'egreso',p.reembolso_confirmado,'Reembolso confirmado · '||coalesce(v.cliente_nombre,'')
 FROM public.pagos_venta p JOIN public.ventas v ON v.id=p.venta_id AND v.comercio_id=p.comercio_id
 WHERE p.comercio_id=p_comercio AND p.reembolso_confirmado>0 AND (p.es_reembolso OR NOT EXISTS(
  SELECT 1 FROM public.ventas n JOIN public.pagos_venta np ON np.venta_id=n.id AND np.comercio_id=n.comercio_id WHERE n.comercio_id=p_comercio AND n.comprobante_asociado_id=v.id AND np.es_reembolso AND np.reembolso_confirmado>0))
 UNION ALL
 SELECT 'cobro_cuenta',m.id,v.numero_comprobante,(m.fecha_movimiento AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,m.moneda::text,'ingreso',m.monto,coalesce(v.cliente_nombre,'')||' · '||m.concepto
 FROM public.cuenta_corriente m JOIN public.ventas v ON v.id=m.venta_id AND v.comercio_id=m.comercio_id WHERE m.comercio_id=p_comercio AND m.tipo_movimiento='credito' AND m.concepto IN ('pago_efectivo','pago_transferencia','pago_tarjeta','pago_cheque') AND m.monto>0
 UNION ALL
 SELECT 'pago_proveedor',m.id,coalesce(f.numero_comprobante,g.numero_comprobante,g.concepto,'Pago a proveedor'),m.fecha,'ARS','egreso',m.monto,coalesce(m.medio_pago,'')
 FROM public.cuenta_corriente_proveedores m LEFT JOIN public.compras_facturas f ON f.id=m.factura_id AND f.comercio_id=m.comercio_id LEFT JOIN public.gastos_egresos g ON g.id=m.gasto_egreso_id AND g.comercio_id=m.comercio_id
 WHERE m.comercio_id=p_comercio AND m.tipo='pago' AND m.monto>0 AND (f.id IS NOT NULL OR g.id IS NOT NULL)
 UNION ALL
 SELECT 'gasto_pagado',g.id,coalesce(nullif(g.numero_comprobante,''),g.concepto),g.fecha,'ARS','egreso',g.monto,g.concepto||' · '||g.medio_pago
 FROM public.gastos_egresos g WHERE g.comercio_id=p_comercio AND g.estado='pagado' AND g.medio_pago<>'cuenta_corriente';
$$;
REVOKE ALL ON FUNCTION public.apicola_fuentes_caja(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.apicola_caja_operar(p_comercio uuid,p_accion text,p_datos jsonb,p_clave uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE d jsonb:=p_datos;o public.apicola_operaciones;r public.apicola_flujos;fuente record;asignado numeric;resultado jsonb;doc uuid;
BEGIN
 IF NOT public.apicola_permiso(p_comercio,'admin') THEN RAISE EXCEPTION 'La caja apícola requiere administración y módulo habilitado' USING ERRCODE='42501'; END IF;
 IF p_clave IS NULL OR jsonb_typeof(d) IS DISTINCT FROM 'object' OR pg_column_size(d)>16384 THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('apicola:'||p_comercio::text,0));
 SELECT * INTO o FROM public.apicola_operaciones WHERE comercio_id=p_comercio AND clave=p_clave;
 IF FOUND THEN
  IF o.usuario_id<>auth.uid() OR o.accion<>'caja:'||p_accion OR o.datos<>d THEN RAISE EXCEPTION 'La clave ya se usó con otros datos'; END IF;
  RETURN o.resultado;
 END IF;
 IF p_accion='asignar' THEN
  doc:=(d->>'documento_id')::uuid;
  IF d->>'origen' IN ('cobro_venta','reembolso_venta') THEN PERFORM 1 FROM public.pagos_venta WHERE comercio_id=p_comercio AND id=doc FOR UPDATE;
  ELSIF d->>'origen'='cobro_cuenta' THEN PERFORM 1 FROM public.cuenta_corriente WHERE comercio_id=p_comercio AND id=doc FOR UPDATE;
  ELSIF d->>'origen'='pago_proveedor' THEN PERFORM 1 FROM public.cuenta_corriente_proveedores WHERE comercio_id=p_comercio AND id=doc FOR UPDATE;
  ELSIF d->>'origen'='gasto_pagado' THEN PERFORM 1 FROM public.gastos_egresos WHERE comercio_id=p_comercio AND id=doc FOR UPDATE;
  ELSE RAISE EXCEPTION 'Origen de caja inválido'; END IF;
  SELECT * INTO fuente FROM public.apicola_fuentes_caja(p_comercio) q WHERE q.origen=d->>'origen' AND q.id=doc;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cobro o pago no disponible'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.apicola_campanas WHERE comercio_id=p_comercio AND id=(d->>'campana_id')::uuid AND estado='abierta') THEN RAISE EXCEPTION 'Seleccioná una campaña abierta'; END IF;
  IF nullif(d->>'apiario_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.apicola_apiarios WHERE comercio_id=p_comercio AND id=(d->>'apiario_id')::uuid AND activo) THEN RAISE EXCEPTION 'Apiario inválido'; END IF;
  IF (d->>'importe')::numeric IS NULL OR (d->>'importe')::numeric<=0 OR (d->>'importe')::numeric>=1000000000000 OR (d->>'importe')::numeric<>round((d->>'importe')::numeric,2) THEN RAISE EXCEPTION 'Importe inválido'; END IF;
  SELECT coalesce(sum(importe),0) INTO asignado FROM public.apicola_flujos WHERE comercio_id=p_comercio AND origen=fuente.origen AND estado='vigente' AND coalesce(pago_venta_id,cuenta_cliente_id,cuenta_proveedor_id,gasto_id)=doc;
  IF asignado+(d->>'importe')::numeric>fuente.importe THEN RAISE EXCEPTION 'El importe supera el saldo del cobro o pago'; END IF;
  INSERT INTO public.apicola_flujos(comercio_id,campana_id,apiario_id,origen,pago_venta_id,cuenta_cliente_id,cuenta_proveedor_id,gasto_id,fecha,moneda,tipo,importe,referencia,criterio,creado_por)
  VALUES(p_comercio,(d->>'campana_id')::uuid,nullif(d->>'apiario_id','')::uuid,fuente.origen,
   CASE WHEN fuente.origen IN ('cobro_venta','reembolso_venta') THEN doc END,CASE WHEN fuente.origen='cobro_cuenta' THEN doc END,CASE WHEN fuente.origen='pago_proveedor' THEN doc END,CASE WHEN fuente.origen='gasto_pagado' THEN doc END,
   fuente.fecha,fuente.moneda,fuente.tipo,(d->>'importe')::numeric,fuente.numero,btrim(d->>'criterio'),auth.uid()) RETURNING * INTO r;
 ELSIF p_accion='anular' THEN
  IF coalesce(length(btrim(d->>'motivo')),0) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'Indicá un motivo de anulación'; END IF;
  UPDATE public.apicola_flujos SET estado='anulado',motivo_anulacion=btrim(d->>'motivo'),version=version+1,updated_at=now()
   WHERE comercio_id=p_comercio AND id=(d->>'id')::uuid AND version=(d->>'version')::integer AND estado='vigente' RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'El flujo cambió o no está disponible'; END IF;
 ELSE RAISE EXCEPTION 'Operación de caja inválida'; END IF;
 resultado:=to_jsonb(r);INSERT INTO public.apicola_operaciones VALUES(p_comercio,p_clave,'caja:'||p_accion,d,resultado,auth.uid(),now());RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.apicola_caja_operar(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apicola_caja_operar(uuid,text,jsonb,uuid) TO authenticated;
COMMIT;
