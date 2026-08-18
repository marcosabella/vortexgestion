DROP POLICY IF EXISTS "Comercios gestionan pedidos" ON public.pedidos_online;
REVOKE INSERT, UPDATE, DELETE ON public.pedidos_online FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.pedido_online_items FROM anon, authenticated;

-- La lectura sigue permitida por RLS; toda escritura se realiza exclusivamente
-- mediante las funciones transaccionales crear_pedido_online y
-- actualizar_estado_pedido_online.
