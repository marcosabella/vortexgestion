-- Reparacion acotada. Fuente: logs de obtener-cae-afip del 05/10/2026
-- 10:34:09 UTC y FECompConsultar de 10:38:48 UTC: factura C 0003-00000128,
-- receptor 30545766678, fecha 20261005, total/neto 200000, IVA 0,
-- CAE 86406153097333, vencimiento 20261015, resultado A, EmisionTipo CAE.
-- Los logs tambien registran las facturas 126 y 127 autorizadas para esta
-- misma venta. Su revision fiscal es independiente; aqui no se anulan.
BEGIN;
DO $$
DECLARE v_venta public.ventas;
BEGIN
  SELECT * INTO v_venta FROM public.ventas
  WHERE id='3a357436-95de-40f0-a6bf-7d2e2da58cd9'
    AND comercio_id='037c362e-555b-4b19-b257-5fd9c3a82203' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_venta.cae='86406153097333' AND v_venta.numero_comprobante='0003-00000128'
     AND v_venta.punto_venta=3 AND v_venta.numero_secuencial=128 THEN RETURN; END IF;
  IF NULLIF(btrim(v_venta.cae),'') IS NOT NULL OR v_venta.tipo_comprobante <> 'factura_c'
     OR v_venta.numero_comprobante <> '0001-00000027' OR v_venta.total <> 200000
     OR v_venta.subtotal <> 200000 OR v_venta.total_iva <> 0
     OR (v_venta.fecha_venta AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <> '2026-10-05'::date
     OR NOT EXISTS (SELECT 1 FROM public.clientes WHERE id=v_venta.cliente_id
        AND comercio_id=v_venta.comercio_id AND regexp_replace(cuit,'\D','','g')='30545766678') THEN
    RAISE EXCEPTION 'recuperacion_cae_jovita_datos_no_coinciden';
  END IF;
  UPDATE public.ventas SET numero_comprobante='0003-00000128',punto_venta=3,numero_secuencial=128,
    cae='86406153097333',cae_vencimiento='2026-10-15',cae_error=NULL,
    cae_solicitado_at='2026-10-05 10:34:09.550+00'
  WHERE id=v_venta.id AND comercio_id=v_venta.comercio_id;
END; $$;
COMMIT;
