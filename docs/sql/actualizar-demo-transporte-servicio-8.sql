-- Reparación puntual autorizada: servicio #8 de demo@demo.com.
-- 40 km facturables a $4.400 finales/km = $176.000. No cambia la alícuota.
-- Conserva comprobante, historial operativo y payload original de idempotencia.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $repair$
DECLARE
  c constant uuid := '253d8d21-e5e9-4ceb-92fd-9baa41f731a5';
  servicio constant uuid := '1dec9e40-8dcd-4b49-a48d-e59af908783d';
  venta constant uuid := '00651489-f56d-4704-9c4a-a20e7073fa7b';
  usuario uuid;
  s public.transporte_servicios;
  v public.ventas;
BEGIN
  SELECT au.id INTO STRICT usuario FROM auth.users au
  JOIN public.comercio_usuarios cu ON cu.user_id=au.id
  WHERE lower(au.email)='demo@demo.com' AND cu.comercio_id=c
    AND cu.activo AND cu.rol='admin';
  PERFORM set_config('request.jwt.claim.sub',usuario::text,true);
  SELECT * INTO STRICT s FROM public.transporte_servicios
  WHERE id=servicio AND comercio_id=c AND numero=8 FOR UPDATE;
  SELECT * INTO STRICT v FROM public.ventas WHERE id=venta AND comercio_id=c FOR UPDATE;
  IF s.venta_id IS DISTINCT FROM venta OR s.version<>13 OR s.estado<>'finalizado'
     OR s.total<>4400 OR s.precio_manual IS DISTINCT FROM 4400::numeric
     OR s.km_facturables<>40 OR s.km_salida<>0 OR s.km_llegada<>80
     OR s.iva<>0 OR s.tarifa_id IS NOT NULL OR s.adicionales<>0 OR s.horas_espera<>0
     OR v.total<>4400 OR v.total_iva<>0 OR v.tipo_comprobante::text<>'recibo_x'
     OR v.numero_comprobante<>'0006-00000029' OR v.tipo_pago::text<>'cta_cte'
     OR nullif(trim(v.cae),'') IS NOT NULL OR v.cae_solicitado_at IS NOT NULL
     OR v.anulado_at IS NOT NULL OR v.cliente_id IS DISTINCT FROM s.cliente_id THEN
    RAISE EXCEPTION 'El servicio o la venta cambiaron: revisar antes de corregir';
  END IF;
  IF (SELECT count(*) FROM public.transporte_servicios WHERE venta_id=venta)<>1
     OR (SELECT count(*) FROM public.venta_items WHERE venta_id=venta)<>1
     OR NOT EXISTS(SELECT 1 FROM public.venta_items WHERE venta_id=venta AND comercio_id=c
       AND producto_id IS NULL AND cantidad=1 AND precio_unitario=4400 AND total=4400
       AND porcentaje_iva=0 AND NOT afecta_stock)
     OR (SELECT count(*) FROM public.pagos_venta WHERE venta_id=venta)<>1
     OR NOT EXISTS(SELECT 1 FROM public.pagos_venta WHERE venta_id=venta AND comercio_id=c
       AND tipo_pago='cta_cte' AND monto=4400 AND NOT es_reembolso)
     OR (SELECT count(*) FROM public.cuenta_corriente WHERE venta_id=venta)<>1
     OR NOT EXISTS(SELECT 1 FROM public.cuenta_corriente WHERE venta_id=venta AND comercio_id=c
       AND tipo_movimiento='debito' AND concepto='pago_cuenta_corriente' AND monto=4400) THEN
    RAISE EXCEPTION 'Cambió el detalle, pagos o cuenta corriente: revisar antes de corregir';
  END IF;
END $repair$;
-- Reutiliza la edición transaccional de Gestión con sus permisos y validaciones.
SET LOCAL ROLE authenticated;
SELECT public.actualizar_venta_transaccional(
  v.comercio_id,v.id,
  to_jsonb(v)||jsonb_build_object('observaciones',concat_ws(E'\n',nullif(v.observaciones,''),
    'Servicio #8: 40 km facturables x $4.400 finales/km = $176.000. Base confirmada: km facturables; recorrido operativo: 80 km.')),
  (SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object('cantidad',40,'precio_unitario',4400,
    'subtotal',176000,'total',176000,'monto_iva',0,'descripcion_manual',
    i.descripcion_manual||' | 40 km facturables x $4.400 finales/km'))
    FROM public.venta_items i WHERE i.venta_id=v.id AND i.comercio_id=v.comercio_id),
  (SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('monto',176000))
    FROM public.pagos_venta p WHERE p.venta_id=v.id AND p.comercio_id=v.comercio_id)
)
FROM public.ventas v WHERE v.id='00651489-f56d-4704-9c4a-a20e7073fa7b'
  AND v.comercio_id='253d8d21-e5e9-4ceb-92fd-9baa41f731a5';
RESET ROLE;
UPDATE public.transporte_servicios SET total=176000,precio_manual=176000,version=version+1,
  observaciones=concat_ws(E'\n',nullif(observaciones,''),
    'Base confirmada: 40 km facturables x $4.400 finales/km = $176.000. Recorrido operativo: 80 km. Se cobra sobre km facturables.')
WHERE id='1dec9e40-8dcd-4b49-a48d-e59af908783d' AND comercio_id='253d8d21-e5e9-4ceb-92fd-9baa41f731a5';
INSERT INTO public.transporte_eventos(comercio_id,servicio_id,estado,detalle,user_id)
VALUES('253d8d21-e5e9-4ceb-92fd-9baa41f731a5','1dec9e40-8dcd-4b49-a48d-e59af908783d','finalizado',
  'Corrección de importe autorizada: de $4.400 a $176.000 finales; 40 km facturables x $4.400/km. Se conserva recibo X 0006-00000029 y se actualiza cuenta corriente.',auth.uid());
DO $verify$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.transporte_servicios s JOIN public.ventas v
      ON v.id=s.venta_id AND v.comercio_id=s.comercio_id
    WHERE s.id='1dec9e40-8dcd-4b49-a48d-e59af908783d' AND s.total=176000
      AND s.precio_manual=176000 AND s.km_facturables=40 AND s.km_llegada-s.km_salida=80
      AND s.estado='finalizado' AND v.total=176000 AND v.total_iva=0)
    OR (SELECT sum(total) FROM public.venta_items WHERE venta_id='00651489-f56d-4704-9c4a-a20e7073fa7b')<>176000
    OR (SELECT sum(monto) FROM public.pagos_venta WHERE venta_id='00651489-f56d-4704-9c4a-a20e7073fa7b')<>176000
    OR (SELECT sum(monto) FROM public.cuenta_corriente WHERE venta_id='00651489-f56d-4704-9c4a-a20e7073fa7b' AND tipo_movimiento='debito')<>176000 THEN
    RAISE EXCEPTION 'La verificación de importes falló; se revierte la reparación completa';
  END IF;
END $verify$;
COMMIT;
