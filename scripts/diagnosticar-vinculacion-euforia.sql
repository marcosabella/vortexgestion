-- Solo lectura. Ejecutar con acceso administrativo autorizado.
-- Busca tanto nombre/apellido separados como un nombre completo en nombre.
SELECT c.id AS cliente_id, c.nombre, c.apellido, c.email,
  cu.user_id AS cuenta_vinculada, cu.metodo,
  p.id AS pedido_id, p.numero, p.estado, p.estado_pago,
  p.venta_id, v.numero_comprobante, v.tipo_comprobante,
  p.cliente_user_id AS cuenta_del_pedido, u.email AS email_cuenta,
  u.email_confirmed_at, vinculo.cliente_id AS ficha_de_la_cuenta
FROM public.clientes c
LEFT JOIN public.cliente_usuarios cu ON cu.comercio_id=c.comercio_id AND cu.cliente_id=c.id
LEFT JOIN public.pedidos_online p ON p.comercio_id=c.comercio_id AND p.cliente_id=c.id
LEFT JOIN public.ventas v ON v.id=p.venta_id AND v.comercio_id=p.comercio_id
LEFT JOIN auth.users u ON u.id=p.cliente_user_id
LEFT JOIN public.cliente_usuarios vinculo ON vinculo.comercio_id=c.comercio_id AND vinculo.user_id=p.cliente_user_id
WHERE c.comercio_id='0987ef9c-c602-40cf-84c3-64d2f644428d'
  AND translate(lower(concat_ws(' ',c.nombre,c.apellido)),'áéíóú','aeiou') LIKE '%martin%abella%'
ORDER BY p.created_at DESC NULLS LAST, c.id
LIMIT 50;
