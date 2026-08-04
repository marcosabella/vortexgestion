UPDATE public.ventas
SET numero_comprobante = substring(numero_comprobante FROM 6)
WHERE numero_comprobante LIKE 'HIST-%';

CREATE OR REPLACE FUNCTION public.migracion_aplicar_operaciones(p_migracion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.migracion_assert_admin();
  PERFORM set_config('app.skip_stock_movements','on',true);
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

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION public.migracion_aplicar_operaciones(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.migracion_aplicar_operaciones(uuid) FROM PUBLIC;
