-- Historial unificado y seguro para el portal del cliente.
CREATE OR REPLACE FUNCTION public.get_mi_historial_compras()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_comercio constant uuid := '30e79cd0-360d-4a03-b634-bb7414ee505b';
  v_cliente uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debe iniciar sesion'; END IF;
  SELECT cliente_id INTO v_cliente
  FROM public.cliente_usuarios
  WHERE comercio_id = v_comercio AND user_id = v_user;
  IF v_cliente IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN coalesce((
    SELECT jsonb_agg(compra ORDER BY (compra->>'created_at')::timestamptz DESC)
    FROM (
      SELECT jsonb_build_object(
        'id', po.id, 'numero', po.numero::text, 'origen', 'online',
        'estado', po.estado, 'total', po.total, 'created_at', po.created_at,
        'observaciones', po.observaciones,
        'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', poi.id, 'descripcion', poi.descripcion, 'cantidad', poi.cantidad,
          'precio_unitario', poi.precio_unitario, 'subtotal', poi.subtotal
        ) ORDER BY poi.id) FROM public.pedido_online_items poi WHERE poi.pedido_id=po.id),'[]'::jsonb)
      ) AS compra
      FROM public.pedidos_online po
      WHERE po.comercio_id=v_comercio AND po.cliente_id=v_cliente
      UNION ALL
      SELECT jsonb_build_object(
        'id', v.id, 'numero', v.numero_comprobante, 'origen', 'local',
        'estado', 'completada', 'total', v.total, 'created_at', v.fecha_venta,
        'observaciones', v.observaciones,
        'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', vi.id,
          'descripcion', coalesce(p.descripcion, nullif(vi.descripcion_manual,''), 'Producto'),
          'cantidad', vi.cantidad, 'precio_unitario', vi.precio_unitario,
          'subtotal', coalesce(vi.total,vi.subtotal)
        ) ORDER BY vi.id) FROM public.venta_items vi LEFT JOIN public.productos p ON p.id=vi.producto_id WHERE vi.venta_id=v.id),'[]'::jsonb)
      ) AS compra
      FROM public.ventas v
      WHERE v.comercio_id=v_comercio AND v.cliente_id=v_cliente
    ) historial
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_mi_historial_compras() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mi_historial_compras() TO authenticated;
