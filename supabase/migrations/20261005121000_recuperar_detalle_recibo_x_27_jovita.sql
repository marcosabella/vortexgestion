-- Reparacion de datos separada del cambio estructural. Ejecutar con autorizacion.
-- Fuente comprobada: idempotency_payload original de esta venta.
BEGIN;
DO $$
DECLARE
  v_venta public.ventas;
BEGIN
  SELECT * INTO v_venta FROM public.ventas
  WHERE id = '3a357436-95de-40f0-a6bf-7d2e2da58cd9'
    AND comercio_id = '037c362e-555b-4b19-b257-5fd9c3a82203' FOR UPDATE;
  -- No afecta otros entornos ni duplica un detalle ya recuperado.
  IF NOT FOUND THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.venta_items WHERE venta_id = v_venta.id) THEN RETURN; END IF;
  IF v_venta.numero_comprobante <> '0001-00000027' OR v_venta.tipo_comprobante <> 'recibo_x'
     OR v_venta.total <> 200000 OR v_venta.fecha_venta <> '2026-10-01 10:57:00+00'::timestamptz
     OR btrim(v_venta.cliente_nombre) <> 'COOPERATIVA ELECTRICA JOVITA LIMITADA'
     OR NULLIF(btrim(v_venta.cae), '') IS NOT NULL
     OR v_venta.idempotency_payload->'items' IS DISTINCT FROM '[{
       "afecta_stock":false,"cantidad":1,"descripcion_manual":"MANTENIMIENTO HOSTING WEB - SEPTIEMBRE 2026",
       "monto_descuento":0,"monto_recargo":0,"porcentaje_descuento":0,"porcentaje_iva":0,
       "porcentaje_recargo":0,"precio_unitario":200000
     }]'::jsonb THEN
    RAISE EXCEPTION 'recuperacion_recibo_x_27_datos_no_coinciden';
  END IF;
  INSERT INTO public.venta_items (
    comercio_id, venta_id, descripcion_manual, cantidad, precio_unitario, porcentaje_iva,
    porcentaje_descuento, monto_descuento, porcentaje_recargo, monto_recargo, monto_iva, subtotal, total, afecta_stock
  ) VALUES (
    v_venta.comercio_id, v_venta.id, 'MANTENIMIENTO HOSTING WEB - SEPTIEMBRE 2026', 1, 200000, 0,
    0, 0, 0, 0, 0, 200000, 200000, false
  );
END;
$$;
COMMIT;
