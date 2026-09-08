-- Corrige la confirmación histórica de presupuestos para usar la numeración
-- canónica de ventas sin modificar su firma ni su resultado observable.
BEGIN;

CREATE OR REPLACE FUNCTION public.confirmar_presupuesto(p_presupuesto_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  p public.presupuestos%ROWTYPE;
  nueva_venta_id uuid;
  v_numero bigint;
  v_numero_texto text;
  v_intento integer := 0;
BEGIN
  -- Este bloqueo es la garantía primaria contra una segunda confirmación del
  -- mismo presupuesto y se toma antes de decidir si debe crearse una venta.
  SELECT * INTO p
  FROM public.presupuestos
  WHERE id = p_presupuesto_id
  FOR UPDATE;

  IF p.id IS NULL OR NOT public.user_belongs_to_comercio(p.comercio_id) THEN
    RAISE EXCEPTION 'Presupuesto no encontrado';
  END IF;
  -- El contrato histórico informa el mismo error ante una segunda confirmación.
  -- venta_id también protege datos históricos inconsistentes con estado pendiente.
  IF p.estado <> 'pendiente' OR p.venta_id IS NOT NULL THEN
    RAISE EXCEPTION 'El presupuesto ya fue confirmado';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.presupuesto_items WHERE presupuesto_id = p.id
  ) THEN
    RAISE EXCEPTION 'El presupuesto no tiene items';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.presupuesto_pagos WHERE presupuesto_id = p.id
  ) THEN
    RAISE EXCEPTION 'El presupuesto no tiene medios de pago';
  END IF;

  -- Mismo contador y orden de bloqueo que registrar_venta_transaccional:
  -- asegurar la fila, bloquearla con UPDATE y recién entonces insertar la venta.
  INSERT INTO public.ventas_numeradores(
    comercio_id, tipo_comprobante, punto_venta, ultimo_numero
  ) VALUES (
    p.comercio_id, p.tipo_comprobante, 1, 0
  ) ON CONFLICT (comercio_id, tipo_comprobante, punto_venta) DO NOTHING;

  LOOP
    v_intento := v_intento + 1;
    IF v_intento > 100 THEN
      RAISE EXCEPTION 'ventas_numeracion_no_disponible' USING ERRCODE = '40001';
    END IF;

    UPDATE public.ventas_numeradores
    SET ultimo_numero = ultimo_numero + 1,
        updated_at = now()
    WHERE comercio_id = p.comercio_id
      AND tipo_comprobante = p.tipo_comprobante
      AND punto_venta = 1
    RETURNING ultimo_numero INTO v_numero;

    v_numero_texto := lpad('1', 4, '0') || '-' || lpad(v_numero::text, 8, '0');

    BEGIN
      INSERT INTO public.ventas (
        comercio_id, numero_comprobante, fecha_venta, tipo_pago, tipo_comprobante,
        cliente_id, cliente_nombre, moneda, punto_venta, numero_secuencial,
        porcentaje_descuento, monto_descuento, porcentaje_recargo, monto_recargo,
        subtotal, total_iva, total, observaciones
      ) VALUES (
        p.comercio_id, v_numero_texto, now(), p.tipo_pago, p.tipo_comprobante,
        p.cliente_id, p.cliente_nombre, 'ARS', 1, v_numero,
        p.porcentaje_descuento, p.monto_descuento, p.porcentaje_recargo, p.monto_recargo,
        p.subtotal, p.total_iva, p.total,
        concat_ws(E'\n', NULLIF(p.observaciones, ''), 'Generada desde presupuesto ' || p.numero_comprobante)
      ) RETURNING id INTO nueva_venta_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- La clave canónica protege frente a ventas históricas o escritoras
      -- concurrentes ajenas a este flujo; se reserva el siguiente número.
      NULL;
    END;
  END LOOP;

  INSERT INTO public.venta_items (
    venta_id, comercio_id, producto_id, descripcion_manual, codigo_manual, cantidad,
    precio_unitario, porcentaje_iva, porcentaje_descuento, monto_descuento,
    porcentaje_recargo, monto_recargo, monto_iva, subtotal, total, afecta_stock
  ) SELECT
    nueva_venta_id, p.comercio_id, producto_id, descripcion_manual, codigo_manual, cantidad,
    precio_unitario, porcentaje_iva, porcentaje_descuento, monto_descuento,
    porcentaje_recargo, monto_recargo, monto_iva, subtotal, total,
    producto_id IS NOT NULL
  FROM public.presupuesto_items
  WHERE presupuesto_id = p.id;

  INSERT INTO public.pagos_venta (
    venta_id, comercio_id, tipo_pago, monto, banco_id, tarjeta_id, cuotas,
    recargo_cuotas, cheque_id, moneda
  ) SELECT
    nueva_venta_id, p.comercio_id, tipo_pago, monto, banco_id, tarjeta_id, cuotas,
    recargo_cuotas, cheque_id, 'ARS'
  FROM public.presupuesto_pagos
  WHERE presupuesto_id = p.id;

  IF p.cliente_id IS NOT NULL THEN
    INSERT INTO public.cuenta_corriente (
      comercio_id, cliente_id, tipo_movimiento, monto, concepto, venta_id,
      fecha_movimiento, moneda
    ) SELECT
      p.comercio_id, p.cliente_id, 'debito', pp.monto, 'pago_cuenta_corriente',
      nueva_venta_id, now(), 'ARS'
    FROM public.presupuesto_pagos AS pp
    WHERE pp.presupuesto_id = p.id
      AND pp.tipo_pago = 'cta_cte';
  END IF;

  UPDATE public.presupuestos
  SET estado = 'confirmado',
      venta_id = nueva_venta_id,
      confirmado_at = now()
  WHERE id = p.id;

  RETURN nueva_venta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_presupuesto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_presupuesto(uuid) TO authenticated;
COMMENT ON FUNCTION public.confirmar_presupuesto(uuid)
IS 'Confirma un presupuesto creando su venta, con numeración canónica por comercio, tipo y punto de venta.';

COMMIT;
