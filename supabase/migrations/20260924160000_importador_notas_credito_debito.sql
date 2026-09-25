-- Conserva el tipo fiscal de las notas historicas y aplica su signo correcto
-- en cuenta corriente. La funcion v2 mantiene todas las reparaciones previas
-- del importador (stock, nombre/numero historico e IVA).
ALTER FUNCTION public.migracion_aplicar_operaciones(uuid)
RENAME TO migracion_aplicar_operaciones_v2;

CREATE FUNCTION public.migracion_aplicar_operaciones(p_migracion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.migracion_assert_admin();
  v_result := public.migracion_aplicar_operaciones_v2(p_migracion_id);

  UPDATE public.cuenta_corriente AS cc
  SET tipo_movimiento = CASE
        WHEN s.datos->>'tipo_movimiento_cuenta' = 'credito' THEN 'credito'
        ELSE 'debito'
      END,
      concepto = CASE
        WHEN s.datos->>'tipo_movimiento_cuenta' = 'credito'
          THEN 'Nota de credito historica ' || v.numero_comprobante
        WHEN s.datos->>'tipo_comprobante' LIKE 'nota_debito_%'
          THEN 'Nota de debito historica ' || v.numero_comprobante
        ELSE cc.concepto
      END
  FROM public.migracion_staging_operaciones AS s
  JOIN public.migracion_id_map AS m
    ON m.migracion_id = s.migracion_id
   AND m.entidad = 'ventas'
   AND m.id_origen = s.source_id
  JOIN public.ventas AS v ON v.id = m.id_destino
  WHERE s.migracion_id = p_migracion_id
    AND s.modulo = 'ventas'
    AND cc.venta_id = m.id_destino
    AND cc.comercio_id = s.comercio_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.migracion_aplicar_operaciones(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.migracion_aplicar_operaciones(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.migracion_aplicar_operaciones_v2(uuid) FROM PUBLIC, authenticated;

