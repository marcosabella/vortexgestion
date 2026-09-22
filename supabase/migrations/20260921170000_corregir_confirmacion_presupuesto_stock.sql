BEGIN;

-- Conserva la variante seleccionada sin afectar stock mientras el documento
-- siga siendo un presupuesto.
ALTER TABLE public.presupuesto_items
  ADD COLUMN IF NOT EXISTS producto_variante_id uuid
    REFERENCES public.producto_variantes(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_presupuesto_items_variante
  ON public.presupuesto_items(producto_variante_id)
  WHERE producto_variante_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_presupuesto_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  related_comercio_id uuid;
  related_producto_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'presupuestos' THEN
    IF NEW.cliente_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id
      FROM public.clientes WHERE id = NEW.cliente_id;

      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El cliente pertenece a otro comercio';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'presupuesto_items' THEN
    IF NEW.producto_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id
      FROM public.productos WHERE id = NEW.producto_id;

      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El producto pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.producto_variante_id IS NOT NULL THEN
      SELECT pv.producto_id, p.comercio_id
      INTO related_producto_id, related_comercio_id
      FROM public.producto_variantes AS pv
      JOIN public.productos AS p ON p.id = pv.producto_id
      WHERE pv.id = NEW.producto_variante_id;

      IF related_producto_id IS DISTINCT FROM NEW.producto_id
         OR related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'La variante no pertenece al producto y comercio del presupuesto';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'presupuesto_pagos' THEN
    IF NEW.banco_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id
      FROM public.bancos WHERE id = NEW.banco_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El banco pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.tarjeta_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id
      FROM public.tarjetas_credito WHERE id = NEW.tarjeta_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'La tarjeta pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.cheque_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id
      FROM public.cheques WHERE id = NEW.cheque_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El cheque pertenece a otro comercio';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

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
  v_punto_venta integer;
BEGIN
  SELECT * INTO p
  FROM public.presupuestos
  WHERE id = p_presupuesto_id
  FOR UPDATE;

  IF p.id IS NULL OR NOT public.user_belongs_to_comercio(p.comercio_id) THEN
    RAISE EXCEPTION 'Presupuesto no encontrado';
  END IF;
  IF p.estado <> 'pendiente' OR p.venta_id IS NOT NULL THEN
    RAISE EXCEPTION 'El presupuesto ya fue confirmado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.presupuesto_items WHERE presupuesto_id = p.id) THEN
    RAISE EXCEPTION 'El presupuesto no tiene items';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.presupuesto_pagos WHERE presupuesto_id = p.id) THEN
    RAISE EXCEPTION 'El presupuesto no tiene medios de pago';
  END IF;

  -- Igual que el alta normal de ventas: usa la configuracion comercial activa
  -- y conserva el punto 1 como respaldo cuando todavia no fue creada.
  SELECT punto_venta INTO v_punto_venta
  FROM public.afip_config
  WHERE comercio_id = p.comercio_id AND activo = true;
  v_punto_venta := coalesce(v_punto_venta, 1);

  INSERT INTO public.ventas_numeradores(
    comercio_id, tipo_comprobante, punto_venta, ultimo_numero
  ) VALUES (
    p.comercio_id, p.tipo_comprobante, v_punto_venta, 0
  ) ON CONFLICT (comercio_id, tipo_comprobante, punto_venta) DO NOTHING;

  LOOP
    v_intento := v_intento + 1;
    IF v_intento > 100 THEN
      RAISE EXCEPTION 'ventas_numeracion_no_disponible' USING ERRCODE = '40001';
    END IF;

    UPDATE public.ventas_numeradores
    SET ultimo_numero = ultimo_numero + 1, updated_at = now()
    WHERE comercio_id = p.comercio_id
      AND tipo_comprobante = p.tipo_comprobante
      AND punto_venta = v_punto_venta
    RETURNING ultimo_numero INTO v_numero;

    v_numero_texto := lpad(v_punto_venta::text, 4, '0') || '-' || lpad(v_numero::text, 8, '0');

    BEGIN
      INSERT INTO public.ventas(
        comercio_id, numero_comprobante, fecha_venta, tipo_pago, tipo_comprobante,
        cliente_id, cliente_nombre, moneda, punto_venta, numero_secuencial,
        porcentaje_descuento, monto_descuento, porcentaje_recargo, monto_recargo,
        subtotal, total_iva, total, observaciones
      ) VALUES (
        p.comercio_id, v_numero_texto, now(), p.tipo_pago, p.tipo_comprobante,
        p.cliente_id, p.cliente_nombre, 'ARS', v_punto_venta, v_numero,
        p.porcentaje_descuento, p.monto_descuento, p.porcentaje_recargo, p.monto_recargo,
        p.subtotal, p.total_iva, p.total,
        concat_ws(E'\n', nullif(p.observaciones, ''), 'Generada desde presupuesto ' || p.numero_comprobante)
      ) RETURNING id INTO nueva_venta_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  INSERT INTO public.venta_items(
    venta_id, comercio_id, producto_id, producto_variante_id,
    descripcion_manual, codigo_manual, cantidad, precio_unitario, porcentaje_iva,
    porcentaje_descuento, monto_descuento, porcentaje_recargo, monto_recargo,
    monto_iva, subtotal, total, afecta_stock
  ) SELECT
    nueva_venta_id, p.comercio_id, producto_id, producto_variante_id,
    descripcion_manual, codigo_manual, cantidad, precio_unitario, porcentaje_iva,
    porcentaje_descuento, monto_descuento, porcentaje_recargo, monto_recargo,
    monto_iva, subtotal, total, producto_id IS NOT NULL
  FROM public.presupuesto_items
  WHERE presupuesto_id = p.id;

  INSERT INTO public.pagos_venta(
    venta_id, comercio_id, tipo_pago, monto, banco_id, tarjeta_id, cuotas,
    recargo_cuotas, cheque_id, moneda
  ) SELECT
    nueva_venta_id, p.comercio_id, tipo_pago, monto, banco_id, tarjeta_id, cuotas,
    recargo_cuotas, cheque_id, 'ARS'
  FROM public.presupuesto_pagos
  WHERE presupuesto_id = p.id;

  IF p.cliente_id IS NOT NULL THEN
    INSERT INTO public.cuenta_corriente(
      comercio_id, cliente_id, tipo_movimiento, monto, concepto, venta_id,
      fecha_movimiento, moneda
    ) SELECT
      p.comercio_id, p.cliente_id, 'debito', pp.monto, 'pago_cuenta_corriente',
      nueva_venta_id, now(), 'ARS'
    FROM public.presupuesto_pagos AS pp
    WHERE pp.presupuesto_id = p.id AND pp.tipo_pago = 'cta_cte';
  END IF;

  UPDATE public.presupuestos
  SET estado = 'confirmado', venta_id = nueva_venta_id, confirmado_at = now()
  WHERE id = p.id;

  RETURN nueva_venta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_presupuesto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_presupuesto(uuid) TO authenticated;

COMMENT ON FUNCTION public.confirmar_presupuesto(uuid) IS
  'Confirma un presupuesto como venta usando numeracion comercial y descontando el producto o variante correspondiente.';

COMMIT;
