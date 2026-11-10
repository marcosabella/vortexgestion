-- Ajuste autorizado expresamente por el usuario el 10/11/2026.
-- Stock fisico informado: una unidad de MONO SIMONE, Negro L.
-- Conciliar solo el total general (2 -> 1); no registra una venta.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE
  p public.productos;
  variantes jsonb;
BEGIN
  SELECT * INTO STRICT p FROM public.productos
    WHERE id='299602fa-d15a-4d0b-b7ee-e40e1e585b1d' FOR UPDATE;
  IF p.comercio_id IS DISTINCT FROM '0987ef9c-c602-40cf-84c3-64d2f644428d'::uuid
    OR p.cod_producto IS DISTINCT FROM '385'
    OR btrim(p.descripcion) IS DISTINCT FROM 'MONO SIMONE'
    OR p.stock IS DISTINCT FROM 2
    OR p.updated_at IS DISTINCT FROM '2026-11-06T18:30:09.53249+00:00'::timestamptz THEN
    RAISE EXCEPTION 'El producto cambio desde la revision; no se aplica el ajuste';
  END IF;
  PERFORM 1 FROM public.producto_variantes WHERE producto_id=p.id ORDER BY id FOR UPDATE;
  SELECT jsonb_agg(jsonb_build_object('id',id,'stock',stock) ORDER BY id)
    INTO variantes FROM public.producto_variantes WHERE producto_id=p.id;
  IF variantes IS DISTINCT FROM '[{"id":"df660d60-4110-49fc-b863-fa0fca0eda79","stock":1}]'::jsonb
    OR NOT EXISTS (
      SELECT 1 FROM public.producto_variantes v
      JOIN public.producto_colores c ON c.id=v.color_id
      JOIN public.producto_talles t ON t.id=v.talle_id
      WHERE v.id='df660d60-4110-49fc-b863-fa0fca0eda79' AND v.producto_id=p.id
        AND c.comercio_id=p.comercio_id
        AND t.comercio_id=p.comercio_id AND lower(c.nombre)='negro' AND t.nombre='L'
    ) THEN
    RAISE EXCEPTION 'Las variantes cambiaron desde la revision; no se aplica el ajuste';
  END IF;
  UPDATE public.productos SET stock=1 WHERE id=p.id;
  IF (SELECT stock FROM public.productos WHERE id=p.id) IS DISTINCT FROM 1
    OR (SELECT sum(stock) FROM public.producto_variantes WHERE producto_id=p.id) IS DISTINCT FROM 1::bigint
    OR (SELECT jsonb_agg(jsonb_build_object('id',id,'stock',stock) ORDER BY id)
        FROM public.producto_variantes WHERE producto_id=p.id) IS DISTINCT FROM variantes
    OR (SELECT to_jsonb(x)-'stock'-'updated_at' FROM public.productos x WHERE id=p.id)
        IS DISTINCT FROM (to_jsonb(p)-'stock'-'updated_at') THEN
    RAISE EXCEPTION 'La verificacion del ajuste fallo; se revierte la transaccion';
  END IF;
END $$;
COMMIT;
