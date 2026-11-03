-- Corrección de datos autorizada el 03/11/2026.
-- Conteo físico confirmado: 12 dorados y 5 plateados; total correcto 17.
-- No modifica variantes, ventas ni el esquema. Cancela ante cambios concurrentes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

DO $repair$
DECLARE
  v_producto public.productos;
  v_cantidad integer;
  v_suma bigint;
BEGIN
  SELECT * INTO STRICT v_producto
  FROM public.productos
  WHERE id = '7fff7c78-ddf1-4309-9f58-a8a517ee2525'
    AND comercio_id = '0987ef9c-c602-40cf-84c3-64d2f644428d'
    AND cod_producto = '339'
  FOR UPDATE;

  IF v_producto.stock IS DISTINCT FROM 16 THEN
    RAISE EXCEPTION 'El stock general cambió; revisar antes de corregir';
  END IF;

  PERFORM 1 FROM public.producto_variantes
  WHERE producto_id = v_producto.id ORDER BY id FOR UPDATE;

  SELECT count(*), sum(stock) INTO v_cantidad, v_suma
  FROM public.producto_variantes WHERE producto_id = v_producto.id;

  IF v_cantidad <> 2 OR v_suma IS DISTINCT FROM 17
    OR NOT EXISTS (
      SELECT 1 FROM public.producto_variantes
      WHERE producto_id = v_producto.id
        AND id = '80efafd1-526e-4c18-9c04-c95926aa2d53'
        AND color_id = 'a115bfb9-da44-49fe-a64d-9dfbaecf2a64'
        AND talle_id IS NULL AND stock = 12
    ) OR NOT EXISTS (
      SELECT 1 FROM public.producto_variantes
      WHERE producto_id = v_producto.id
        AND id = '84885b13-b18f-413e-b010-823f47b4198b'
        AND color_id = '123fdc42-ea66-40bc-ad00-a258277aa3ca'
        AND talle_id IS NULL AND stock = 5
    ) THEN
    RAISE EXCEPTION 'Las variantes cambiaron; revisar antes de corregir';
  END IF;

  UPDATE public.productos SET stock = 17
  WHERE id = v_producto.id AND comercio_id = v_producto.comercio_id;

  IF NOT EXISTS (SELECT 1 FROM public.productos WHERE id = v_producto.id AND stock = 17) THEN
    RAISE EXCEPTION 'No se confirmó el total corregido';
  END IF;
END;
$repair$;
COMMIT;

SELECT p.id, p.cod_producto, p.descripcion, p.stock AS stock_gestion,
  (SELECT sum(v.stock) FROM public.producto_variantes v WHERE v.producto_id = p.id) AS stock_variantes
FROM public.productos p
WHERE p.id = '7fff7c78-ddf1-4309-9f58-a8a517ee2525'
  AND p.comercio_id = '0987ef9c-c602-40cf-84c3-64d2f644428d';
