-- Vincula compras confirmadas creadas antes del circuito v2 con su comprobante financiero.
WITH nuevas AS (
  INSERT INTO public.compras_facturas(comercio_id,compra_id,proveedor_id,numero_comprobante,fecha,fecha_vencimiento,total,observaciones)
  SELECT c.comercio_id,c.id,c.proveedor_id,coalesce(nullif(trim(c.factura_numero),''),c.numero),c.fecha,c.fecha_vencimiento,c.total,'Compra '||c.numero
  FROM public.compras c
  WHERE c.estado='recibida' AND c.total>0
    AND NOT EXISTS(SELECT 1 FROM public.compras_facturas f WHERE f.compra_id=c.id)
  ON CONFLICT (compra_id) DO NOTHING
  RETURNING id,comercio_id,compra_id,proveedor_id,total,fecha
)
INSERT INTO public.cuenta_corriente_proveedores(comercio_id,proveedor_id,factura_id,tipo,monto,fecha,observaciones)
SELECT n.comercio_id,n.proveedor_id,n.id,'deuda',n.total,n.fecha,'Compra '||c.numero
FROM nuevas n JOIN public.compras c ON c.id=n.compra_id
WHERE NOT EXISTS(
  SELECT 1 FROM public.cuenta_corriente_proveedores m
  WHERE m.comercio_id=n.comercio_id AND m.proveedor_id=n.proveedor_id AND m.tipo='deuda'
    AND (m.factura_id=n.id OR m.observaciones=('Compra '||c.numero))
);

UPDATE public.cuenta_corriente_proveedores m
SET factura_id=f.id
FROM public.compras_facturas f, public.compras c
WHERE m.factura_id IS NULL AND f.compra_id=c.id AND m.comercio_id=c.comercio_id AND m.proveedor_id=c.proveedor_id
  AND m.observaciones=('Compra '||c.numero);
