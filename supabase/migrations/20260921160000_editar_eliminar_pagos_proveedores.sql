-- Independiza la compra de sus pagos: editar la compra conserva los pagos y
-- editar/eliminar un pago ajusta únicamente la cuenta corriente.
ALTER TABLE public.pagos_compra
  ADD COLUMN IF NOT EXISTS movimiento_id uuid
  REFERENCES public.cuenta_corriente_proveedores(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pagos_compra_movimiento_id_uidx
  ON public.pagos_compra(movimiento_id)
  WHERE movimiento_id IS NOT NULL;

-- Las compras pagadas al confirmarse tienen un único pago por factura.
UPDATE public.pagos_compra pc
SET movimiento_id = (
  SELECT m.id
  FROM public.cuenta_corriente_proveedores m
  WHERE m.factura_id = pc.factura_id
    AND m.comercio_id = pc.comercio_id
    AND m.tipo = 'pago'
    AND m.monto = pc.monto
    AND m.fecha = pc.fecha
    AND m.medio_pago = pc.tipo_pago
  ORDER BY m.created_at, m.id
  LIMIT 1
)
WHERE pc.movimiento_id IS NULL;

CREATE OR REPLACE FUNCTION public.vincular_pago_compra_movimiento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.movimiento_id IS NULL THEN
    SELECT m.id INTO NEW.movimiento_id
    FROM public.cuenta_corriente_proveedores m
    WHERE m.factura_id = NEW.factura_id
      AND m.comercio_id = NEW.comercio_id
      AND m.tipo = 'pago'
      AND m.monto = NEW.monto
      AND m.fecha = NEW.fecha
      AND m.medio_pago = NEW.tipo_pago
      AND NOT EXISTS (
        SELECT 1 FROM public.pagos_compra pc
        WHERE pc.movimiento_id = m.id
      )
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vincular_pago_compra_movimiento ON public.pagos_compra;
CREATE TRIGGER vincular_pago_compra_movimiento
BEFORE INSERT ON public.pagos_compra
FOR EACH ROW EXECUTE FUNCTION public.vincular_pago_compra_movimiento();

CREATE OR REPLACE FUNCTION public.editar_pago_factura_compra(
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
  v_movimiento public.cuenta_corriente_proveedores;
BEGIN
  SELECT * INTO v_movimiento
  FROM public.cuenta_corriente_proveedores
  WHERE id = p_movimiento_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_movimiento.tipo <> 'pago'
     OR NOT public.user_belongs_to_comercio(v_movimiento.comercio_id) THEN
    RAISE EXCEPTION 'pago_proveedor_no_disponible';
  END IF;

  IF p_monto IS NULL OR p_monto <= 0
     OR p_medio_pago NOT IN ('contado','transferencia','tarjeta','cheque') THEN
    RAISE EXCEPTION 'pago_proveedor_invalido';
  END IF;

  UPDATE public.cuenta_corriente_proveedores
  SET monto = p_monto,
      fecha = coalesce(p_fecha, current_date),
      medio_pago = p_medio_pago,
      observaciones = nullif(trim(p_observaciones), '')
  WHERE id = v_movimiento.id
  RETURNING * INTO v_movimiento;

  UPDATE public.pagos_compra
  SET monto = v_movimiento.monto,
      fecha = v_movimiento.fecha,
      tipo_pago = v_movimiento.medio_pago
  WHERE movimiento_id = v_movimiento.id;

  RETURN v_movimiento;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_pago_factura_compra(p_movimiento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_movimiento public.cuenta_corriente_proveedores;
BEGIN
  SELECT * INTO v_movimiento
  FROM public.cuenta_corriente_proveedores
  WHERE id = p_movimiento_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_movimiento.tipo <> 'pago'
     OR NOT public.user_belongs_to_comercio(v_movimiento.comercio_id) THEN
    RAISE EXCEPTION 'pago_proveedor_no_disponible';
  END IF;

  DELETE FROM public.pagos_compra WHERE movimiento_id = v_movimiento.id;
  DELETE FROM public.cuenta_corriente_proveedores WHERE id = v_movimiento.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.editar_compra_confirmada(
  p_compra_id uuid,
  p_proveedor_id uuid,
  p_fecha date,
  p_factura_numero text,
  p_fecha_vencimiento date,
  p_modalidad_pago text,
  p_porcentaje_descuento numeric,
  p_monto_descuento numeric,
  p_porcentaje_recargo numeric,
  p_monto_recargo numeric,
  p_items jsonb,
  p_observaciones text DEFAULT NULL
)
RETURNS public.compras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  c public.compras;
  f public.compras_facturas;
  x jsonb;
  p public.productos;
  old_items jsonb;
  old_qty numeric;
  new_qty numeric;
  delta numeric;
  base numeric := 0;
  final_total numeric;
  descuento numeric;
  recargo numeric;
BEGIN
  SELECT * INTO c FROM public.compras WHERE id = p_compra_id FOR UPDATE;
  IF NOT FOUND OR NOT public.user_belongs_to_comercio(c.comercio_id) THEN
    RAISE EXCEPTION 'compra_no_disponible';
  END IF;
  IF NOT EXISTS (
      SELECT 1 FROM public.proveedores
      WHERE id = p_proveedor_id AND comercio_id = c.comercio_id
    )
    OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) = 0
    OR p_modalidad_pago NOT IN ('contado','transferencia','tarjeta','cheque','cta_cte') THEN
    RAISE EXCEPTION 'compra_invalida';
  END IF;

  SELECT * INTO f FROM public.compras_facturas WHERE compra_id = c.id FOR UPDATE;
  SELECT coalesce(
    jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', cantidad_recibida)),
    '[]'::jsonb
  ) INTO old_items
  FROM public.compra_items WHERE compra_id = c.id;

  FOR x IN SELECT value FROM jsonb_array_elements(old_items) LOOP
    old_qty := (x->>'cantidad')::numeric;
    SELECT coalesce(sum((e->>'cantidad')::numeric), 0) INTO new_qty
    FROM jsonb_array_elements(p_items) e
    WHERE e->>'producto_id' = x->>'producto_id';
    delta := new_qty - old_qty;
    IF delta < 0 AND (
      SELECT stock FROM public.productos
      WHERE id = (x->>'producto_id')::uuid FOR UPDATE
    ) < abs(delta) THEN
      RAISE EXCEPTION 'compra_edicion_stock_insuficiente';
    END IF;
    UPDATE public.productos
    SET stock = stock + delta::integer
    WHERE id = (x->>'producto_id')::uuid AND comercio_id = c.comercio_id;
  END LOOP;

  DELETE FROM public.compra_items WHERE compra_id = c.id;
  FOR x IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO p FROM public.productos
    WHERE id = (x->>'producto_id')::uuid AND comercio_id = c.comercio_id;
    IF NOT FOUND OR coalesce((x->>'cantidad')::integer, 0) <= 0
       OR coalesce((x->>'costo_unitario')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'compra_item_invalido';
    END IF;
    SELECT coalesce(sum((e->>'cantidad')::numeric), 0) INTO old_qty
    FROM jsonb_array_elements(old_items) e
    WHERE e->>'producto_id' = x->>'producto_id';
    IF old_qty = 0 THEN
      UPDATE public.productos
      SET stock = stock + (x->>'cantidad')::integer
      WHERE id = p.id;
    END IF;
    INSERT INTO public.compra_items(
      comercio_id, compra_id, producto_id, descripcion,
      cantidad_solicitada, cantidad_recibida, costo_unitario,
      porcentaje_iva, actualizar_costo, subtotal, total
    ) VALUES (
      c.comercio_id, c.id, p.id, p.descripcion,
      (x->>'cantidad')::numeric, (x->>'cantidad')::numeric,
      (x->>'costo_unitario')::numeric,
      coalesce((x->>'porcentaje_iva')::numeric, p.porcentaje_iva, 0),
      coalesce((x->>'actualizar_costo')::boolean, true),
      (x->>'cantidad')::numeric * (x->>'costo_unitario')::numeric,
      (x->>'cantidad')::numeric * (x->>'costo_unitario')::numeric
    );
    UPDATE public.productos
    SET precio_costo = CASE
      WHEN coalesce((x->>'actualizar_costo')::boolean, true)
      THEN (x->>'costo_unitario')::numeric ELSE precio_costo END
    WHERE id = p.id;
    base := base + (x->>'cantidad')::numeric * (x->>'costo_unitario')::numeric;
  END LOOP;

  descuento := least(base, coalesce(p_monto_descuento, 0) + base * coalesce(p_porcentaje_descuento, 0) / 100);
  recargo := coalesce(p_monto_recargo, 0) + base * coalesce(p_porcentaje_recargo, 0) / 100;
  final_total := base - descuento + recargo;

  UPDATE public.compras
  SET proveedor_id = p_proveedor_id,
      fecha = coalesce(p_fecha, current_date),
      factura_numero = coalesce(nullif(trim(p_factura_numero), ''), numero),
      fecha_vencimiento = p_fecha_vencimiento,
      modalidad_pago = p_modalidad_pago,
      subtotal = base,
      porcentaje_descuento = coalesce(p_porcentaje_descuento, 0),
      monto_descuento = descuento,
      porcentaje_recargo = coalesce(p_porcentaje_recargo, 0),
      monto_recargo = recargo,
      total = final_total,
      observaciones = nullif(trim(p_observaciones), '')
  WHERE id = c.id RETURNING * INTO c;

  UPDATE public.compras_facturas
  SET proveedor_id = p_proveedor_id,
      numero_comprobante = c.factura_numero,
      fecha = c.fecha,
      fecha_vencimiento = p_fecha_vencimiento,
      total = final_total
  WHERE id = f.id;

  -- Se modifica la deuda de la factura, pero se conservan todos sus pagos.
  UPDATE public.cuenta_corriente_proveedores
  SET proveedor_id = p_proveedor_id
  WHERE factura_id = f.id;
  UPDATE public.cuenta_corriente_proveedores
  SET monto = final_total,
      fecha = c.fecha,
      observaciones = 'Compra ' || c.numero
  WHERE factura_id = f.id AND tipo = 'deuda';

  RETURN c;
END;
$$;

REVOKE ALL ON FUNCTION public.editar_pago_factura_compra(uuid,numeric,date,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.eliminar_pago_factura_compra(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editar_pago_factura_compra(uuid,numeric,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_pago_factura_compra(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.editar_compra_confirmada(uuid,uuid,date,text,date,text,numeric,numeric,numeric,numeric,jsonb,text) TO authenticated;
