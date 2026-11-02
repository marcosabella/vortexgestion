-- Solo lectura. Confirmar IDs y todos los movimientos antes de preparar
-- una reimputacion. El numero de comprobante por si solo no identifica al emisor.
BEGIN TRANSACTION READ ONLY;

SELECT lc.comercio_id AS emisor_id,
       lc.destinatario_comercio_id,
       d.nombre_comercio AS destinatario,
       d.cuit AS destinatario_cuit,
       lc.periodo,
       v.id AS venta_id,
       v.numero_comprobante,
       v.fecha_venta,
       v.tipo_comprobante,
       v.total,
       v.cliente_nombre,
       v.cliente_id AS venta_cliente_id,
       c.nombre AS cliente_nombre_actual,
       c.apellido AS cliente_apellido_actual,
       c.cuit AS cliente_cuit,
       l.cliente_id AS licencia_cliente_id,
       cc.id AS movimiento_id,
       cc.cliente_id AS movimiento_cliente_id,
       cc.tipo_movimiento,
       cc.monto
FROM public.licencias_comprobantes lc
JOIN public.comercio d ON d.id=lc.destinatario_comercio_id
JOIN public.ventas v ON v.id=lc.venta_id AND v.comercio_id=lc.comercio_id
JOIN public.licencias_comercios l ON l.comercio_id=lc.comercio_id
  AND l.destinatario_comercio_id=lc.destinatario_comercio_id
LEFT JOIN public.clientes c ON c.id=v.cliente_id AND c.comercio_id=v.comercio_id
LEFT JOIN public.cuenta_corriente cc ON cc.venta_id=v.id AND cc.comercio_id=v.comercio_id
WHERE upper(btrim(d.nombre_comercio))='BERRA EXTINTORES'
  AND lc.periodo='2026-11-01'::date
  AND v.tipo_comprobante='recibo_x'
  AND v.total=55000
ORDER BY v.id,cc.id;

ROLLBACK;
