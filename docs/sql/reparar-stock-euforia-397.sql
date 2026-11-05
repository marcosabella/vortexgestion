-- Reparacion historica autorizada el 05/11/2026: el usuario confirma MARRON S.
-- El total 7 ya fue descontado. Solo conciliar la variante y corregir el item.
-- Separada de la migracion estructural. No cambia importes ni el payload original.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE
  p public.productos;
  venta public.ventas;
  item public.venta_items;
  antes jsonb;
  esperado jsonb;
  despues jsonb;
  omitir_previo text := current_setting('app.skip_stock_movements',true);
BEGIN
  SELECT * INTO STRICT venta FROM public.ventas
    WHERE id='54b99669-8bc3-4a26-a48e-c795bfc364d3' FOR UPDATE;
  SELECT * INTO STRICT p FROM public.productos
    WHERE id='3bfbb59e-9701-49a6-833b-b5bb90867985' FOR UPDATE;
  SELECT * INTO STRICT item FROM public.venta_items
    WHERE id='9e18e23f-84cf-409e-9a87-e9ff0e222f86' FOR UPDATE;
  IF venta.comercio_id IS DISTINCT FROM '0987ef9c-c602-40cf-84c3-64d2f644428d'::uuid
    OR p.comercio_id IS DISTINCT FROM venta.comercio_id OR item.comercio_id IS DISTINCT FROM venta.comercio_id
    OR p.cod_producto IS DISTINCT FROM '397' OR p.stock IS DISTINCT FROM 7
    OR venta.numero_comprobante IS DISTINCT FROM '0001-00000186'
    OR nullif(btrim(venta.cae),'') IS NOT NULL OR venta.anulado_at IS NOT NULL
    OR venta.origen_pedido_online_id IS NOT NULL OR venta.total IS DISTINCT FROM 22000::numeric
    OR item.venta_id IS DISTINCT FROM venta.id OR item.producto_id IS DISTINCT FROM p.id
    OR item.producto_variante_id IS DISTINCT FROM '4a0c841b-f2d3-426e-99f2-9af14520db69'::uuid
    OR item.cantidad IS DISTINCT FROM 1::numeric OR item.afecta_stock IS DISTINCT FROM true
    OR item.updated_at IS DISTINCT FROM '2026-11-04T23:36:10.132131+00:00'::timestamptz THEN
    RAISE EXCEPTION 'El producto o la venta cambiaron desde la revision';
  END IF;
  PERFORM 1 FROM public.producto_variantes WHERE producto_id=p.id ORDER BY id FOR UPDATE;
  SELECT jsonb_agg(jsonb_build_object('id',id,'stock',stock) ORDER BY id) INTO antes
    FROM public.producto_variantes WHERE producto_id=p.id;
  IF antes IS DISTINCT FROM '[
    {"id":"45a8003c-a21e-456f-922f-a7644d2b0160","stock":1},
    {"id":"4a0c841b-f2d3-426e-99f2-9af14520db69","stock":1},
    {"id":"8181093e-d2a3-4007-988f-9b3ef3c7fadd","stock":1},
    {"id":"a3cbcc53-c9b3-4a4e-8c0a-26f09f485053","stock":1},
    {"id":"ac2f915d-f1df-45fc-adeb-f4bd8cca2ed6","stock":0},
    {"id":"b6701de2-7850-458c-81a9-a1bff7f4a47b","stock":1},
    {"id":"b7da50a3-3580-4726-81d8-4f4a6a43fadb","stock":1},
    {"id":"c66aeca7-47be-4518-88bf-b3cd930b53f8","stock":1},
    {"id":"f6db0cab-5014-46c4-b057-b19ce3594ad2","stock":0},
    {"id":"fba69f4d-db6a-45ed-88fe-17dbd2fc0313","stock":1}]'::jsonb
    OR NOT EXISTS (
      SELECT 1 FROM public.producto_variantes v
      JOIN public.producto_colores c ON c.id=v.color_id
      JOIN public.producto_talles t ON t.id=v.talle_id
      WHERE v.id='a3cbcc53-c9b3-4a4e-8c0a-26f09f485053' AND v.producto_id=p.id
        AND c.comercio_id=p.comercio_id AND t.comercio_id=p.comercio_id
        AND c.nombre='MARRON' AND t.nombre='S'
    ) THEN RAISE EXCEPTION 'Las variantes cambiaron desde la revision'; END IF;

  -- La variante Negro S nunca fue descontada: no reponerla al cambiar el item.
  PERFORM set_config('app.skip_stock_movements','on',true);
  UPDATE public.venta_items SET producto_variante_id='a3cbcc53-c9b3-4a4e-8c0a-26f09f485053'
    WHERE id=item.id;
  PERFORM set_config('app.skip_stock_movements',coalesce(omitir_previo,'off'),true);
  UPDATE public.producto_variantes SET stock=0
    WHERE id='a3cbcc53-c9b3-4a4e-8c0a-26f09f485053' AND producto_id=p.id AND stock=1;
  -- La sincronizacion recalcula 7: nunca descontar nuevamente el total.
  SELECT jsonb_agg(CASE WHEN e->>'id'='a3cbcc53-c9b3-4a4e-8c0a-26f09f485053'
    THEN jsonb_set(e,'{stock}','0') ELSE e END ORDER BY e->>'id') INTO esperado
    FROM jsonb_array_elements(antes) e;
  SELECT jsonb_agg(jsonb_build_object('id',id,'stock',stock) ORDER BY id) INTO despues
    FROM public.producto_variantes WHERE producto_id=p.id;
  IF despues IS DISTINCT FROM esperado
    OR (SELECT stock FROM public.productos WHERE id=p.id) IS DISTINCT FROM 7
    OR (SELECT to_jsonb(v) FROM public.ventas v WHERE id=venta.id) IS DISTINCT FROM to_jsonb(venta)
    OR (SELECT to_jsonb(i)-'producto_variante_id'-'updated_at' FROM public.venta_items i WHERE id=item.id)
       IS DISTINCT FROM (to_jsonb(item)-'producto_variante_id'-'updated_at')
    OR (SELECT producto_variante_id FROM public.venta_items WHERE id=item.id)
       IS DISTINCT FROM 'a3cbcc53-c9b3-4a4e-8c0a-26f09f485053'::uuid THEN
    RAISE EXCEPTION 'La verificacion no coincide: se revierte toda la reparacion';
  END IF;
END $$;
COMMIT;
