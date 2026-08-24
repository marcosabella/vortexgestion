-- Los pedidos online requieren una identidad autenticada para garantizar
-- trazabilidad entre auth.users, clientes y pedidos_online.
REVOKE ALL ON FUNCTION public.crear_pedido_online(jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_pedido_online(jsonb,jsonb) TO authenticated;
