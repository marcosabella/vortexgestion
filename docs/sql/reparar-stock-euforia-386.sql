-- Reparacion de datos separada de las migraciones. Requiere autorizacion expresa.
-- Solo el stock general de VESTIDO CASSY (386), Euforia. No altera variantes.
-- Aplicada el 04/11/2026: general=3, suma_variantes=3, nueve variantes conservadas.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$
DECLARE p public.productos; variantes jsonb; suma integer;
BEGIN
  SELECT * INTO p FROM public.productos WHERE id='dceb866e-ef52-4f17-b641-e374e2e6cc6d' FOR UPDATE;
  IF NOT FOUND OR p.comercio_id IS DISTINCT FROM '0987ef9c-c602-40cf-84c3-64d2f644428d'::uuid OR p.cod_producto IS DISTINCT FROM '386'
    OR p.stock NOT IN (3,4) THEN RAISE EXCEPTION 'El producto o su stock cambiaron desde la revision'; END IF;
  PERFORM 1 FROM public.producto_variantes WHERE producto_id=p.id ORDER BY id FOR UPDATE;
  SELECT jsonb_agg(jsonb_build_object('id',id,'stock',stock) ORDER BY id),sum(stock) INTO variantes,suma
  FROM public.producto_variantes WHERE producto_id=p.id;
  IF suma IS DISTINCT FROM 3 OR variantes IS DISTINCT FROM '[
    {"id":"53e94bee-9762-4cd9-9a56-a0e2faaca2e1","stock":0},
    {"id":"59d780b1-6956-4898-92a7-de2c9651cee8","stock":1},
    {"id":"5cae1098-e370-4de8-bb41-d03c8835d1d7","stock":1},
    {"id":"5d6ed42d-1f1a-4bd5-9db8-f096e39dee9d","stock":1},
    {"id":"5ff53f39-bba3-4d07-ad1f-1898e1f6d650","stock":0},
    {"id":"62654ab7-350e-4c85-adc3-9076bc1d4180","stock":0},
    {"id":"a1bba327-44ae-4d58-b569-43a9094702bc","stock":0},
    {"id":"a53c4fe3-ede2-4fb7-81a3-6a502502e3b6","stock":0},
    {"id":"ed00d2b7-4b3c-41f5-8ee1-33e46dc7cc52","stock":0}]'::jsonb THEN RAISE EXCEPTION 'La distribucion por talle/color cambio; revisar antes de corregir'; END IF;
  UPDATE public.productos SET stock=3 WHERE id=p.id AND stock=4;
  IF (SELECT stock FROM public.productos WHERE id=p.id) IS DISTINCT FROM 3 OR
    (SELECT jsonb_agg(jsonb_build_object('id',id,'stock',stock) ORDER BY id) FROM public.producto_variantes WHERE producto_id=p.id) IS DISTINCT FROM variantes THEN
    RAISE EXCEPTION 'La correccion altero la distribucion; se revierte la transaccion';
  END IF;
END $$;
SELECT p.cod_producto,p.descripcion,p.stock AS stock_general,
  (SELECT sum(v.stock) FROM public.producto_variantes v WHERE v.producto_id=p.id) AS suma_variantes
FROM public.productos p WHERE p.id='dceb866e-ef52-4f17-b641-e374e2e6cc6d';
COMMIT;
