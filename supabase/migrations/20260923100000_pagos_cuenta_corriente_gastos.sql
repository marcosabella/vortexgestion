-- Permite pagos parciales o totales de gastos cargados a cuenta corriente.

DROP INDEX IF EXISTS public.cuenta_corriente_proveedores_gasto_unico;

CREATE UNIQUE INDEX cuenta_corriente_proveedores_gasto_deuda_unica
ON public.cuenta_corriente_proveedores (gasto_egreso_id)
WHERE gasto_egreso_id IS NOT NULL AND tipo = 'deuda';

CREATE OR REPLACE FUNCTION public.sincronizar_gasto_cuenta_corriente_proveedor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_detalle text;
  v_pagado numeric;
BEGIN
  IF NEW.proveedor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.proveedores p
    WHERE p.id = NEW.proveedor_id AND p.comercio_id = NEW.comercio_id
  ) THEN
    RAISE EXCEPTION 'gasto_proveedor_no_disponible';
  END IF;

  IF NEW.medio_pago = 'cuenta_corriente' THEN
    IF NEW.proveedor_id IS NULL THEN
      RAISE EXCEPTION 'gasto_cuenta_corriente_requiere_proveedor';
    END IF;

    SELECT coalesce(sum(monto), 0) INTO v_pagado
    FROM public.cuenta_corriente_proveedores
    WHERE gasto_egreso_id = NEW.id AND tipo = 'pago';
    IF v_pagado > NEW.monto THEN
      RAISE EXCEPTION 'gasto_monto_menor_a_pagos_registrados';
    END IF;

    v_detalle := 'Gasto/egreso: ' || NEW.concepto ||
      CASE WHEN nullif(trim(NEW.numero_comprobante), '') IS NOT NULL
        THEN ' · Comprobante ' || trim(NEW.numero_comprobante) ELSE '' END;

    INSERT INTO public.cuenta_corriente_proveedores (
      comercio_id, proveedor_id, gasto_egreso_id, tipo, monto, fecha, medio_pago, observaciones
    ) VALUES (
      NEW.comercio_id, NEW.proveedor_id, NEW.id, 'deuda', NEW.monto, NEW.fecha,
      'cuenta_corriente', v_detalle
    )
    ON CONFLICT (gasto_egreso_id) WHERE gasto_egreso_id IS NOT NULL AND tipo = 'deuda'
    DO UPDATE SET
      comercio_id = EXCLUDED.comercio_id,
      proveedor_id = EXCLUDED.proveedor_id,
      monto = EXCLUDED.monto,
      fecha = EXCLUDED.fecha,
      medio_pago = EXCLUDED.medio_pago,
      observaciones = EXCLUDED.observaciones;

    UPDATE public.cuenta_corriente_proveedores
    SET comercio_id = NEW.comercio_id, proveedor_id = NEW.proveedor_id
    WHERE gasto_egreso_id = NEW.id;

    UPDATE public.gastos_egresos
    SET estado = CASE WHEN v_pagado = NEW.monto THEN 'pagado' ELSE 'pendiente' END
    WHERE id = NEW.id AND estado IS DISTINCT FROM CASE WHEN v_pagado = NEW.monto THEN 'pagado' ELSE 'pendiente' END;
  ELSE
    DELETE FROM public.cuenta_corriente_proveedores WHERE gasto_egreso_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_pago_gasto_egreso(
  p_gasto_id uuid,
  p_monto numeric,
  p_fecha date,
  p_medio_pago text,
  p_observaciones text DEFAULT NULL
)
RETURNS public.cuenta_corriente_proveedores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  g public.gastos_egresos;
  m public.cuenta_corriente_proveedores;
  s numeric;
BEGIN
  SELECT * INTO g FROM public.gastos_egresos WHERE id = p_gasto_id FOR UPDATE;
  IF NOT FOUND OR NOT public.user_belongs_to_comercio(g.comercio_id)
    OR g.medio_pago <> 'cuenta_corriente' OR g.proveedor_id IS NULL THEN
    RAISE EXCEPTION 'gasto_cuenta_corriente_no_disponible';
  END IF;

  SELECT coalesce(sum(CASE WHEN tipo = 'deuda' THEN monto ELSE -monto END), 0)
  INTO s FROM public.cuenta_corriente_proveedores WHERE gasto_egreso_id = g.id;

  IF p_monto IS NULL OR p_monto <= 0 OR p_monto > s OR nullif(trim(p_medio_pago), '') IS NULL THEN
    RAISE EXCEPTION 'pago_gasto_invalido';
  END IF;

  INSERT INTO public.cuenta_corriente_proveedores (
    comercio_id, proveedor_id, gasto_egreso_id, tipo, monto, fecha, medio_pago, observaciones
  ) VALUES (
    g.comercio_id, g.proveedor_id, g.id, 'pago', p_monto, coalesce(p_fecha, current_date),
    trim(p_medio_pago), coalesce(nullif(trim(p_observaciones), ''), 'Pago de gasto/egreso ' || g.concepto)
  ) RETURNING * INTO m;

  IF p_monto = s THEN
    UPDATE public.gastos_egresos SET estado = 'pagado' WHERE id = g.id;
  ELSE
    UPDATE public.gastos_egresos SET estado = 'pendiente' WHERE id = g.id;
  END IF;

  RETURN m;
END;
$$;

CREATE OR REPLACE FUNCTION public.editar_pago_gasto_egreso(
  p_movimiento_id uuid,
  p_monto numeric,
  p_fecha date,
  p_medio_pago text,
  p_observaciones text DEFAULT NULL
)
RETURNS public.cuenta_corriente_proveedores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actual public.cuenta_corriente_proveedores;
  actualizado public.cuenta_corriente_proveedores;
  s numeric;
BEGIN
  SELECT * INTO actual FROM public.cuenta_corriente_proveedores
  WHERE id = p_movimiento_id AND tipo = 'pago' AND gasto_egreso_id IS NOT NULL FOR UPDATE;
  IF NOT FOUND OR NOT public.user_belongs_to_comercio(actual.comercio_id) THEN
    RAISE EXCEPTION 'pago_gasto_no_disponible';
  END IF;

  SELECT coalesce(sum(CASE WHEN tipo = 'deuda' THEN monto ELSE -monto END), 0) + actual.monto
  INTO s FROM public.cuenta_corriente_proveedores WHERE gasto_egreso_id = actual.gasto_egreso_id;

  IF p_monto IS NULL OR p_monto <= 0 OR p_monto > s OR nullif(trim(p_medio_pago), '') IS NULL THEN
    RAISE EXCEPTION 'pago_gasto_invalido';
  END IF;

  UPDATE public.cuenta_corriente_proveedores SET
    monto = p_monto,
    fecha = coalesce(p_fecha, current_date),
    medio_pago = trim(p_medio_pago),
    observaciones = nullif(trim(p_observaciones), '')
  WHERE id = actual.id RETURNING * INTO actualizado;

  UPDATE public.gastos_egresos
  SET estado = CASE WHEN p_monto = s THEN 'pagado' ELSE 'pendiente' END
  WHERE id = actual.gasto_egreso_id;

  RETURN actualizado;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_pago_gasto_egreso(p_movimiento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actual public.cuenta_corriente_proveedores;
BEGIN
  SELECT * INTO actual FROM public.cuenta_corriente_proveedores
  WHERE id = p_movimiento_id AND tipo = 'pago' AND gasto_egreso_id IS NOT NULL FOR UPDATE;
  IF NOT FOUND OR NOT public.user_belongs_to_comercio(actual.comercio_id) THEN
    RAISE EXCEPTION 'pago_gasto_no_disponible';
  END IF;

  DELETE FROM public.cuenta_corriente_proveedores WHERE id = actual.id;
  UPDATE public.gastos_egresos SET estado = 'pendiente' WHERE id = actual.gasto_egreso_id;
END;
$$;

-- Alinea el estado de los gastos ya existentes con su saldo real.
UPDATE public.gastos_egresos g
SET estado = CASE
  WHEN coalesce((
    SELECT sum(CASE WHEN m.tipo = 'deuda' THEN m.monto ELSE -m.monto END)
    FROM public.cuenta_corriente_proveedores m
    WHERE m.gasto_egreso_id = g.id
  ), 0) <= 0 THEN 'pagado'
  ELSE 'pendiente'
END
WHERE g.medio_pago = 'cuenta_corriente';

REVOKE ALL ON FUNCTION public.registrar_pago_gasto_egreso(uuid,numeric,date,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.editar_pago_gasto_egreso(uuid,numeric,date,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.eliminar_pago_gasto_egreso(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pago_gasto_egreso(uuid,numeric,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.editar_pago_gasto_egreso(uuid,numeric,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_pago_gasto_egreso(uuid) TO authenticated;
