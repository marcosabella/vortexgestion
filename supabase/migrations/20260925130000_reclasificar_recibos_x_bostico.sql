-- Reclasifica como Recibo X las ventas historicas de Bostico cuyo comprobante
-- de origen Access es 121. La reparacion se limita al comercio y a la
-- migracion operativa originales, y aborta ante cualquier diferencia entre el
-- staging, el mapa de IDs y las ventas actualmente almacenadas.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.ventas'::regclass
      AND tgname = 'prevent_authorized_venta_changes'
      AND NOT tgisinternal
      AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'reclasificar_recibos_x_bostico_proteccion_no_disponible';
  END IF;
END;
$$;

DO $$
DECLARE
  v_comercio constant uuid := 'a4983b26-4f3d-46e0-8e4f-46bd34fec838';
  v_migracion constant uuid := '88f57fac-b439-4148-b4f5-21e039a00169';
  v_staging integer;
  v_mapeadas integer;
  v_recibos_c integer;
  v_con_cae integer;
  v_elegibles integer;
  v_actualizadas integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.migraciones
    WHERE id = v_migracion
      AND comercio_id = v_comercio
      AND estado = 'completado'
      AND resumen->>'tipo' = 'operaciones'
  ) THEN
    RAISE EXCEPTION 'reclasificar_recibos_x_bostico_migracion_no_disponible';
  END IF;

  SELECT count(*)
  INTO v_staging
  FROM public.migracion_staging_operaciones AS s
  WHERE s.migracion_id = v_migracion
    AND s.comercio_id = v_comercio
    AND s.modulo = 'ventas'
    AND s.datos->>'comprobante_origen' = '121'
    AND s.datos->>'tipo_comprobante' = 'recibo_c';

  SELECT count(*)
  INTO v_mapeadas
  FROM public.migracion_staging_operaciones AS s
  JOIN public.migracion_id_map AS m
    ON m.migracion_id = s.migracion_id
   AND m.comercio_id = v_comercio
   AND m.entidad = 'ventas'
   AND m.id_origen = s.source_id
  JOIN public.ventas AS v
    ON v.id = m.id_destino
   AND v.comercio_id = v_comercio
  WHERE s.migracion_id = v_migracion
    AND s.comercio_id = v_comercio
    AND s.modulo = 'ventas'
    AND s.datos->>'comprobante_origen' = '121';

  SELECT count(*)
  INTO v_recibos_c
  FROM public.migracion_staging_operaciones AS s
  JOIN public.migracion_id_map AS m
    ON m.migracion_id = s.migracion_id
   AND m.comercio_id = v_comercio
   AND m.entidad = 'ventas'
   AND m.id_origen = s.source_id
  JOIN public.ventas AS v
    ON v.id = m.id_destino
   AND v.comercio_id = v_comercio
  WHERE s.migracion_id = v_migracion
    AND s.comercio_id = v_comercio
    AND s.modulo = 'ventas'
    AND s.datos->>'comprobante_origen' = '121'
    AND v.tipo_comprobante = 'recibo_c';

  SELECT count(*)
  INTO v_con_cae
  FROM public.migracion_staging_operaciones AS s
  JOIN public.migracion_id_map AS m
    ON m.migracion_id = s.migracion_id
   AND m.comercio_id = v_comercio
   AND m.entidad = 'ventas'
   AND m.id_origen = s.source_id
  JOIN public.ventas AS v
    ON v.id = m.id_destino
   AND v.comercio_id = v_comercio
  WHERE s.migracion_id = v_migracion
    AND s.comercio_id = v_comercio
    AND s.modulo = 'ventas'
    AND s.datos->>'comprobante_origen' = '121'
    AND v.tipo_comprobante = 'recibo_c'
    AND NULLIF(btrim(v.cae), '') IS NOT NULL;

  v_elegibles := v_staging - v_con_cae;

  IF v_staging = 0
     OR v_mapeadas <> v_staging
     OR v_recibos_c <> v_staging
     OR v_elegibles <= 0 THEN
    RAISE EXCEPTION
      'reclasificar_recibos_x_bostico_conteos_inesperados: staging %, mapeadas %, recibos_c %, con_cae %, elegibles %',
      v_staging, v_mapeadas, v_recibos_c, v_con_cae, v_elegibles;
  END IF;

  UPDATE public.ventas AS v
  SET tipo_comprobante = 'recibo_x'::public.tipo_comprobante
  FROM public.migracion_staging_operaciones AS s
  JOIN public.migracion_id_map AS m
    ON m.migracion_id = s.migracion_id
   AND m.comercio_id = v_comercio
   AND m.entidad = 'ventas'
   AND m.id_origen = s.source_id
  WHERE s.migracion_id = v_migracion
    AND s.comercio_id = v_comercio
    AND s.modulo = 'ventas'
    AND s.datos->>'comprobante_origen' = '121'
    AND v.id = m.id_destino
    AND v.comercio_id = v_comercio
    AND v.tipo_comprobante = 'recibo_c'
    AND NULLIF(btrim(v.cae), '') IS NULL;

  GET DIAGNOSTICS v_actualizadas = ROW_COUNT;

  IF v_actualizadas <> v_elegibles THEN
    RAISE EXCEPTION
      'reclasificar_recibos_x_bostico_actualizacion_incompleta: esperadas %, actualizadas %',
      v_elegibles, v_actualizadas;
  END IF;

  UPDATE public.migracion_staging_operaciones AS s
  SET datos = jsonb_set(s.datos, '{tipo_comprobante}', '"recibo_x"'::jsonb)
  FROM public.migracion_id_map AS m
  JOIN public.ventas AS v
    ON v.id = m.id_destino
   AND v.comercio_id = v_comercio
  WHERE s.migracion_id = v_migracion
    AND s.comercio_id = v_comercio
    AND s.modulo = 'ventas'
    AND s.datos->>'comprobante_origen' = '121'
    AND s.datos->>'tipo_comprobante' = 'recibo_c'
    AND m.migracion_id = s.migracion_id
    AND m.comercio_id = v_comercio
    AND m.entidad = 'ventas'
    AND m.id_origen = s.source_id
    AND NULLIF(btrim(v.cae), '') IS NULL;

  UPDATE public.migraciones
  SET resumen = resumen || jsonb_build_object(
        'recibos_x_reclasificados_at', now(),
        'recibos_x_reclasificados', v_actualizadas,
        'recibos_c_con_cae_conservados', v_con_cae
      ),
      updated_at = now()
  WHERE id = v_migracion
    AND comercio_id = v_comercio;
END;
$$;

COMMIT;
