-- El indice ventas_numeracion_canonica_unica evalua estas funciones con el
-- rol que escribe ventas, incluso desde una RPC SECURITY INVOKER.
-- Ambas solo interpretan el texto recibido: no leen tablas ni datos privados.
-- Conserva RLS, el permiso admin de la RPC y la proteccion de ventas con CAE.
BEGIN;

GRANT EXECUTE ON FUNCTION public.ventas_punto_venta_canonico(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ventas_numero_secuencial_canonico(text) TO authenticated;

COMMIT;
