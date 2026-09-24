-- Las bases Access guardan los precios históricos con IVA incluido.
-- Después de aplicar el historial, descomponemos cada total por su alícuota
-- para que Factura A muestre neto + IVA sin modificar el importe final.
CREATE OR REPLACE FUNCTION public.migracion_aplicar_operaciones(p_migracion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.migracion_assert_admin();
  PERFORM set_config('app.skip_stock_movements', 'on', true);
  v_result := public.migracion_aplicar_operaciones_v1(p_migracion_id);

  UPDATE public.ventas AS v
  SET numero_comprobante = m.id_origen
  FROM public.migracion_id_map AS m
  WHERE m.migracion_id = p_migracion_id
    AND m.entidad = 'ventas'
    AND m.id_destino = v.id;

  UPDATE public.ventas AS v
  SET cliente_nombre = btrim(concat_ws(' ', c.nombre, nullif(c.apellido, '')))
  FROM public.clientes AS c, public.migracion_id_map AS m
  WHERE m.migracion_id = p_migracion_id
    AND m.entidad = 'ventas'
    AND m.id_destino = v.id
    AND v.cliente_id = c.id;

  UPDATE public.venta_items AS i
  SET subtotal = round(i.total / (1 + i.porcentaje_iva / 100), 2),
      monto_iva = i.total - round(i.total / (1 + i.porcentaje_iva / 100), 2)
  FROM public.migracion_id_map AS m
  WHERE m.migracion_id = p_migracion_id
    AND m.entidad = 'items'
    AND m.id_destino = i.id;

  UPDATE public.ventas AS v
  SET subtotal = round(totales.subtotal_items * CASE WHEN totales.total_items > 0 THEN v.total / totales.total_items ELSE 1 END, 2),
      total_iva = v.total - round(totales.subtotal_items * CASE WHEN totales.total_items > 0 THEN v.total / totales.total_items ELSE 1 END, 2)
  FROM (
    SELECT i.venta_id,
           sum(i.subtotal) AS subtotal_items,
           sum(i.total) AS total_items
    FROM public.venta_items AS i
    JOIN public.migracion_id_map AS m
      ON m.migracion_id = p_migracion_id
     AND m.entidad = 'items'
     AND m.id_destino = i.id
    GROUP BY i.venta_id
  ) AS totales
  WHERE v.id = totales.venta_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.migracion_aplicar_operaciones(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.migracion_aplicar_operaciones(uuid) FROM PUBLIC;
