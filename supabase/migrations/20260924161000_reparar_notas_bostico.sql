-- Reparacion de datos separada para la importacion de BDsiagro.mdb realizada
-- el 24/09/2026. Se limita al comercio y a la ejecucion operativa de Bostico.
-- Se suspenden solo los dos triggers de inmutabilidad involucrados durante esta
-- transaccion administrativa. Si cualquier control falla, PostgreSQL revierte
-- tambien la suspension y ninguna fila queda modificada parcialmente.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.ventas'::regclass
      AND tgname = 'prevent_authorized_venta_changes'
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.cuenta_corriente'::regclass
      AND tgname = 'prevent_authorized_cuenta_corriente_changes'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'reparacion_notas_bostico_protecciones_no_disponibles';
  END IF;
END;
$$;

ALTER TABLE public.ventas
DISABLE TRIGGER prevent_authorized_venta_changes;

ALTER TABLE public.cuenta_corriente
DISABLE TRIGGER prevent_authorized_cuenta_corriente_changes;

DO $$
DECLARE
  v_comercio constant uuid := 'a4983b26-4f3d-46e0-8e4f-46bd34fec838';
  v_migracion constant uuid := '88f57fac-b439-4148-b4f5-21e039a00169';
  v_ventas integer;
  v_movimientos integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.migraciones
    WHERE id = v_migracion AND comercio_id = v_comercio
      AND estado = 'completado' AND resumen->>'tipo' = 'operaciones'
  ) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_ventas
  FROM public.migracion_staging_operaciones AS s
  WHERE s.migracion_id = v_migracion
    AND s.modulo = 'ventas'
    AND s.datos->>'comprobante_origen' IN ('2', '3', '8');

  SELECT count(*) INTO v_movimientos
  FROM public.migracion_staging_operaciones AS s
  JOIN public.migracion_id_map AS m
    ON m.migracion_id = s.migracion_id
   AND m.entidad = 'ventas'
   AND m.id_origen = s.source_id
  JOIN public.cuenta_corriente AS cc
    ON cc.venta_id = m.id_destino
   AND cc.comercio_id = v_comercio
  WHERE s.migracion_id = v_migracion
    AND s.modulo = 'ventas'
    AND s.datos->>'comprobante_origen' IN ('2', '3', '8');

  IF v_ventas <> 86 OR v_movimientos <> 77 THEN
    RAISE EXCEPTION 'reparacion_notas_bostico_conteos_inesperados: ventas %, movimientos %', v_ventas, v_movimientos;
  END IF;

  UPDATE public.ventas AS v
  SET tipo_comprobante = CASE s.datos->>'comprobante_origen'
        WHEN '2' THEN 'nota_debito_a'::public.tipo_comprobante
        WHEN '3' THEN 'nota_credito_a'::public.tipo_comprobante
        WHEN '8' THEN 'nota_credito_b'::public.tipo_comprobante
      END
  FROM public.migracion_staging_operaciones AS s
  JOIN public.migracion_id_map AS m
    ON m.migracion_id = s.migracion_id
   AND m.entidad = 'ventas'
   AND m.id_origen = s.source_id
  WHERE s.migracion_id = v_migracion
    AND s.modulo = 'ventas'
    AND s.datos->>'comprobante_origen' IN ('2', '3', '8')
    AND v.id = m.id_destino
    AND v.comercio_id = v_comercio;

  UPDATE public.cuenta_corriente AS cc
  SET tipo_movimiento = CASE
        WHEN s.datos->>'comprobante_origen' IN ('3', '8') THEN 'credito'
        ELSE 'debito'
      END,
      concepto = CASE
        WHEN s.datos->>'comprobante_origen' IN ('3', '8')
          THEN 'Nota de credito historica ' || v.numero_comprobante
        ELSE 'Nota de debito historica ' || v.numero_comprobante
      END
  FROM public.migracion_staging_operaciones AS s
  JOIN public.migracion_id_map AS m
    ON m.migracion_id = s.migracion_id
   AND m.entidad = 'ventas'
   AND m.id_origen = s.source_id
  JOIN public.ventas AS v ON v.id = m.id_destino
  WHERE s.migracion_id = v_migracion
    AND s.modulo = 'ventas'
    AND s.datos->>'comprobante_origen' IN ('2', '3', '8')
    AND cc.venta_id = m.id_destino
    AND cc.comercio_id = v_comercio;

  UPDATE public.migraciones
  SET resumen = resumen || jsonb_build_object(
        'notas_reparadas_at', now(),
        'notas_ventas_reclasificadas', v_ventas,
        'notas_movimientos_reparados', v_movimientos,
        'notas_credito_total', 8234352.31
      ),
      updated_at = now()
  WHERE id = v_migracion AND comercio_id = v_comercio;
END;
$$;

ALTER TABLE public.ventas
ENABLE TRIGGER prevent_authorized_venta_changes;

ALTER TABLE public.cuenta_corriente
ENABLE TRIGGER prevent_authorized_cuenta_corriente_changes;

COMMIT;
