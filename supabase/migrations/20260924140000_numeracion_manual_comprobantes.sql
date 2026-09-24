BEGIN;

-- La función queda desactivada para todos los comercios existentes hasta que
-- un administrador la habilite expresamente desde la parametrización.
UPDATE public.comercio_parametrizacion
SET parametros = jsonb_set(
  parametros,
  '{funciones,ingreso_manual_numero_comprobante}',
  'false'::jsonb,
  true
)
WHERE NOT (COALESCE(parametros->'funciones', '{}'::jsonb) ? 'ingreso_manual_numero_comprobante');

CREATE OR REPLACE FUNCTION public.registrar_venta_manual_transaccional(
  p_comercio_id uuid,
  p_tipo_comprobante public.tipo_comprobante,
  p_punto_venta integer,
  p_cliente_id uuid,
  p_cliente_nombre text,
  p_moneda text,
  p_modalidad text,
  p_items jsonb,
  p_pagos jsonb,
  p_idempotency_key uuid,
  p_fecha_venta timestamptz,
  p_observaciones text,
  p_porcentaje_descuento numeric,
  p_monto_descuento numeric,
  p_porcentaje_recargo numeric,
  p_monto_recargo numeric,
  p_numero_comprobante text
)
RETURNS public.ventas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_venta public.ventas;
  v_numero_canonico text;
  v_punto_manual integer;
  v_secuencial_manual bigint;
  v_habilitado boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ventas_auth_requerida' USING ERRCODE = '42501';
  END IF;
  IF p_comercio_id IS NULL OR NOT public.user_is_comercio_admin(p_comercio_id) THEN
    RAISE EXCEPTION 'ventas_no_disponible' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE((cp.parametros #>> '{funciones,ingreso_manual_numero_comprobante}')::boolean, false)
  INTO v_habilitado
  FROM public.comercio_parametrizacion AS cp
  WHERE cp.comercio_id = p_comercio_id;

  IF NOT COALESCE(v_habilitado, false) THEN
    RAISE EXCEPTION 'ventas_numero_manual_no_habilitado' USING ERRCODE = '42501';
  END IF;

  v_numero_canonico := regexp_replace(COALESCE(p_numero_comprobante, ''), '[[:space:]]', '', 'g');
  IF v_numero_canonico !~ '^[0-9]{4}-[0-9]{8}$' THEN
    RAISE EXCEPTION 'ventas_numero_manual_invalido' USING ERRCODE = '22023';
  END IF;

  v_punto_manual := split_part(v_numero_canonico, '-', 1)::integer;
  v_secuencial_manual := split_part(v_numero_canonico, '-', 2)::bigint;
  IF v_punto_manual <= 0 OR v_secuencial_manual <= 0 THEN
    RAISE EXCEPTION 'ventas_numero_manual_invalido' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'ventas:numero-manual:' || p_comercio_id::text || ':' || p_tipo_comprobante::text || ':' || v_numero_canonico,
      0
    )
  );

  SELECT *
  INTO v_venta
  FROM public.ventas AS v
  WHERE v.comercio_id = p_comercio_id
    AND v.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF v_venta.id IS NOT NULL THEN
    IF v_venta.numero_comprobante IS DISTINCT FROM v_numero_canonico THEN
      RAISE EXCEPTION 'ventas_idempotency_conflicto' USING ERRCODE = '22023';
    END IF;
    RETURN v_venta;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ventas AS v
    WHERE v.comercio_id = p_comercio_id
      AND v.tipo_comprobante = p_tipo_comprobante
      AND public.ventas_punto_venta_canonico(v.numero_comprobante) = v_punto_manual
      AND public.ventas_numero_secuencial_canonico(v.numero_comprobante) = v_secuencial_manual
  ) THEN
    RAISE EXCEPTION 'ventas_numero_manual_duplicado' USING ERRCODE = '23505';
  END IF;

  SELECT *
  INTO v_venta
  FROM public.registrar_venta_transaccional(
    p_comercio_id,
    p_tipo_comprobante,
    p_punto_venta,
    p_cliente_id,
    p_cliente_nombre,
    p_moneda,
    p_modalidad,
    p_items,
    p_pagos,
    p_idempotency_key,
    p_fecha_venta,
    p_observaciones,
    p_porcentaje_descuento,
    p_monto_descuento,
    p_porcentaje_recargo,
    p_monto_recargo
  );

  BEGIN
    UPDATE public.ventas
    SET numero_comprobante = v_numero_canonico,
        punto_venta = v_punto_manual,
        numero_secuencial = v_secuencial_manual
    WHERE id = v_venta.id
      AND comercio_id = p_comercio_id
    RETURNING * INTO v_venta;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ventas_numero_manual_duplicado' USING ERRCODE = '23505';
  END;

  INSERT INTO public.ventas_numeradores (
    comercio_id,
    tipo_comprobante,
    punto_venta,
    ultimo_numero
  ) VALUES (
    p_comercio_id,
    p_tipo_comprobante,
    v_punto_manual,
    v_secuencial_manual
  )
  ON CONFLICT (comercio_id, tipo_comprobante, punto_venta)
  DO UPDATE SET
    ultimo_numero = greatest(public.ventas_numeradores.ultimo_numero, EXCLUDED.ultimo_numero),
    updated_at = now();

  RETURN v_venta;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_venta_manual_transaccional(
  uuid, public.tipo_comprobante, integer, uuid, text, text, text, jsonb, jsonb,
  uuid, timestamptz, text, numeric, numeric, numeric, numeric, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.registrar_venta_manual_transaccional(
  uuid, public.tipo_comprobante, integer, uuid, text, text, text, jsonb, jsonb,
  uuid, timestamptz, text, numeric, numeric, numeric, numeric, text
) TO authenticated;

COMMENT ON FUNCTION public.registrar_venta_manual_transaccional(
  uuid, public.tipo_comprobante, integer, uuid, text, text, text, jsonb, jsonb,
  uuid, timestamptz, text, numeric, numeric, numeric, numeric, text
) IS 'Registra una venta con número manual cuando la función está habilitada para el comercio. Valida formato, tenant, duplicados e idempotencia.';

COMMIT;
