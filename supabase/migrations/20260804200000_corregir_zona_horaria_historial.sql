-- Access almacena estas fechas como fecha civil sin zona. Fueron extraidas a
-- las 00:00 UTC, que en Argentina se visualiza a las 21:00 del dia anterior.
UPDATE public.ventas AS v
SET fecha_venta = v.fecha_venta + interval '3 hours'
FROM public.migracion_id_map AS m
WHERE m.entidad = 'ventas'
  AND m.id_destino = v.id
  AND v.fecha_venta::time = time '00:00:00';

UPDATE public.cuenta_corriente AS cc
SET fecha_movimiento = cc.fecha_movimiento + interval '3 hours'
WHERE cc.fecha_movimiento::time = time '00:00:00'
  AND (
    EXISTS (SELECT 1 FROM public.migracion_id_map m WHERE m.entidad='pagos' AND m.id_destino=cc.id)
    OR EXISTS (SELECT 1 FROM public.migracion_id_map m WHERE m.entidad='ventas' AND m.id_destino=cc.venta_id)
  );
