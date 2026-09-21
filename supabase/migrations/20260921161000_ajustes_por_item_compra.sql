-- Descuentos y recargos propios por cada producto de una compra.
ALTER TABLE public.compra_items
  ADD COLUMN IF NOT EXISTS porcentaje_descuento numeric(7,3) NOT NULL DEFAULT 0 CHECK (porcentaje_descuento >= 0),
  ADD COLUMN IF NOT EXISTS monto_descuento numeric(14,2) NOT NULL DEFAULT 0 CHECK (monto_descuento >= 0),
  ADD COLUMN IF NOT EXISTS porcentaje_recargo numeric(7,3) NOT NULL DEFAULT 0 CHECK (porcentaje_recargo >= 0),
  ADD COLUMN IF NOT EXISTS monto_recargo numeric(14,2) NOT NULL DEFAULT 0 CHECK (monto_recargo >= 0);

CREATE OR REPLACE FUNCTION public.registrar_compra_confirmada_v2(
  p_comercio_id uuid, p_proveedor_id uuid, p_fecha date,
  p_factura_numero text, p_fecha_vencimiento date, p_modalidad_pago text,
  p_porcentaje_descuento numeric, p_monto_descuento numeric,
  p_porcentaje_recargo numeric, p_monto_recargo numeric,
  p_items jsonb, p_observaciones text DEFAULT NULL
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
  n text;
  comprobante text;
  base numeric := 0;
  bruto_item numeric;
  descuento_item numeric;
  recargo_item numeric;
  total_item numeric;
  final_total numeric;
  descuento numeric;
  recargo numeric;
BEGIN
  IF NOT public.user_belongs_to_comercio(p_comercio_id)
     OR NOT EXISTS (SELECT 1 FROM public.proveedores WHERE id = p_proveedor_id AND comercio_id = p_comercio_id) THEN
    RAISE EXCEPTION 'compra_no_autorizada';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0
     OR p_modalidad_pago NOT IN ('contado','transferencia','tarjeta','cheque','cta_cte') THEN
    RAISE EXCEPTION 'compra_invalida';
  END IF;

  n := 'CP-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  comprobante := coalesce(nullif(trim(p_factura_numero), ''), n);
  INSERT INTO public.compras(
    comercio_id, proveedor_id, numero, fecha, estado, factura_numero,
    fecha_vencimiento, modalidad_pago, observaciones
  ) VALUES (
    p_comercio_id, p_proveedor_id, n, coalesce(p_fecha, current_date),
    'recibida', comprobante, p_fecha_vencimiento, p_modalidad_pago,
    nullif(trim(p_observaciones), '')
  ) RETURNING * INTO c;

  FOR x IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO p FROM public.productos
    WHERE id = (x->>'producto_id')::uuid AND comercio_id = p_comercio_id;
    IF NOT FOUND OR coalesce((x->>'cantidad')::integer, 0) <= 0
       OR coalesce((x->>'costo_unitario')::numeric, -1) < 0
       OR coalesce((x->>'porcentaje_descuento')::numeric, 0) < 0
       OR coalesce((x->>'monto_descuento')::numeric, 0) < 0
       OR coalesce((x->>'porcentaje_recargo')::numeric, 0) < 0
       OR coalesce((x->>'monto_recargo')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'compra_item_invalido';
    END IF;

    bruto_item := round((x->>'cantidad')::numeric * (x->>'costo_unitario')::numeric, 2);
    descuento_item := least(
      bruto_item,
      round(bruto_item * coalesce((x->>'porcentaje_descuento')::numeric, 0) / 100 + coalesce((x->>'monto_descuento')::numeric, 0), 2)
    );
    recargo_item := round(bruto_item * coalesce((x->>'porcentaje_recargo')::numeric, 0) / 100 + coalesce((x->>'monto_recargo')::numeric, 0), 2);
    total_item := greatest(round(bruto_item - descuento_item + recargo_item, 2), 0);

    INSERT INTO public.compra_items(
      comercio_id, compra_id, producto_id, descripcion, cantidad_solicitada,
      cantidad_recibida, costo_unitario, porcentaje_iva,
      porcentaje_descuento, monto_descuento, porcentaje_recargo, monto_recargo,
      actualizar_costo, subtotal, total
    ) VALUES (
      p_comercio_id, c.id, p.id, p.descripcion, (x->>'cantidad')::numeric,
      (x->>'cantidad')::numeric, (x->>'costo_unitario')::numeric,
      coalesce((x->>'porcentaje_iva')::numeric, p.porcentaje_iva, 0),
      coalesce((x->>'porcentaje_descuento')::numeric, 0), coalesce((x->>'monto_descuento')::numeric, 0),
      coalesce((x->>'porcentaje_recargo')::numeric, 0), coalesce((x->>'monto_recargo')::numeric, 0),
      coalesce((x->>'actualizar_costo')::boolean, true), bruto_item, total_item
    );
    UPDATE public.productos
    SET stock = stock + (x->>'cantidad')::integer,
        precio_costo = CASE WHEN coalesce((x->>'actualizar_costo')::boolean, true)
          THEN (x->>'costo_unitario')::numeric ELSE precio_costo END
    WHERE id = p.id;
    base := base + total_item;
  END LOOP;

  descuento := least(base, round(coalesce(p_monto_descuento, 0) + base * coalesce(p_porcentaje_descuento, 0) / 100, 2));
  recargo := round(coalesce(p_monto_recargo, 0) + base * coalesce(p_porcentaje_recargo, 0) / 100, 2);
  final_total := greatest(round(base - descuento + recargo, 2), 0);
  UPDATE public.compras SET
    subtotal = base, porcentaje_descuento = coalesce(p_porcentaje_descuento, 0),
    monto_descuento = descuento, porcentaje_recargo = coalesce(p_porcentaje_recargo, 0),
    monto_recargo = recargo, total = final_total
  WHERE id = c.id RETURNING * INTO c;

  INSERT INTO public.compras_facturas(
    comercio_id, compra_id, proveedor_id, numero_comprobante,
    fecha, fecha_vencimiento, total, observaciones
  ) VALUES (
    p_comercio_id, c.id, p_proveedor_id, comprobante, c.fecha,
    p_fecha_vencimiento, final_total, 'Compra ' || c.numero
  ) RETURNING * INTO f;
  INSERT INTO public.cuenta_corriente_proveedores(
    comercio_id, proveedor_id, factura_id, tipo, monto, fecha, observaciones
  ) VALUES (p_comercio_id, p_proveedor_id, f.id, 'deuda', final_total, c.fecha, 'Compra ' || c.numero);
  IF p_modalidad_pago <> 'cta_cte' THEN
    INSERT INTO public.cuenta_corriente_proveedores(
      comercio_id, proveedor_id, factura_id, tipo, monto, fecha, medio_pago, observaciones
    ) VALUES (p_comercio_id, p_proveedor_id, f.id, 'pago', final_total, c.fecha, p_modalidad_pago, 'Pago de compra ' || c.numero);
    INSERT INTO public.pagos_compra(comercio_id, compra_id, factura_id, tipo_pago, monto, fecha)
    VALUES (p_comercio_id, c.id, f.id, p_modalidad_pago, final_total, c.fecha);
  END IF;
  RETURN c;
END;
$$;

CREATE OR REPLACE FUNCTION public.editar_compra_confirmada(
  p_compra_id uuid, p_proveedor_id uuid, p_fecha date,
  p_factura_numero text, p_fecha_vencimiento date, p_modalidad_pago text,
  p_porcentaje_descuento numeric, p_monto_descuento numeric,
  p_porcentaje_recargo numeric, p_monto_recargo numeric,
  p_items jsonb, p_observaciones text DEFAULT NULL
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
  bruto_item numeric;
  descuento_item numeric;
  recargo_item numeric;
  total_item numeric;
  final_total numeric;
  descuento numeric;
  recargo numeric;
BEGIN
  SELECT * INTO c FROM public.compras WHERE id = p_compra_id FOR UPDATE;
  IF NOT FOUND OR NOT public.user_belongs_to_comercio(c.comercio_id) THEN
    RAISE EXCEPTION 'compra_no_disponible';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.proveedores WHERE id = p_proveedor_id AND comercio_id = c.comercio_id)
     OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0
     OR p_modalidad_pago NOT IN ('contado','transferencia','tarjeta','cheque','cta_cte') THEN
    RAISE EXCEPTION 'compra_invalida';
  END IF;

  SELECT * INTO f FROM public.compras_facturas WHERE compra_id = c.id FOR UPDATE;
  SELECT coalesce(jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', cantidad_recibida)), '[]'::jsonb)
  INTO old_items FROM public.compra_items WHERE compra_id = c.id;

  FOR x IN SELECT value FROM jsonb_array_elements(old_items) LOOP
    old_qty := (x->>'cantidad')::numeric;
    SELECT coalesce(sum((e->>'cantidad')::numeric), 0) INTO new_qty
    FROM jsonb_array_elements(p_items) e WHERE e->>'producto_id' = x->>'producto_id';
    delta := new_qty - old_qty;
    IF delta < 0 AND (SELECT stock FROM public.productos WHERE id = (x->>'producto_id')::uuid FOR UPDATE) < abs(delta) THEN
      RAISE EXCEPTION 'compra_edicion_stock_insuficiente';
    END IF;
    UPDATE public.productos SET stock = stock + delta::integer
    WHERE id = (x->>'producto_id')::uuid AND comercio_id = c.comercio_id;
  END LOOP;

  DELETE FROM public.compra_items WHERE compra_id = c.id;
  FOR x IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO p FROM public.productos
    WHERE id = (x->>'producto_id')::uuid AND comercio_id = c.comercio_id;
    IF NOT FOUND OR coalesce((x->>'cantidad')::integer, 0) <= 0
       OR coalesce((x->>'costo_unitario')::numeric, -1) < 0
       OR coalesce((x->>'porcentaje_descuento')::numeric, 0) < 0
       OR coalesce((x->>'monto_descuento')::numeric, 0) < 0
       OR coalesce((x->>'porcentaje_recargo')::numeric, 0) < 0
       OR coalesce((x->>'monto_recargo')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'compra_item_invalido';
    END IF;
    SELECT coalesce(sum((e->>'cantidad')::numeric), 0) INTO old_qty
    FROM jsonb_array_elements(old_items) e WHERE e->>'producto_id' = x->>'producto_id';
    IF old_qty = 0 THEN
      UPDATE public.productos SET stock = stock + (x->>'cantidad')::integer WHERE id = p.id;
    END IF;

    bruto_item := round((x->>'cantidad')::numeric * (x->>'costo_unitario')::numeric, 2);
    descuento_item := least(
      bruto_item,
      round(bruto_item * coalesce((x->>'porcentaje_descuento')::numeric, 0) / 100 + coalesce((x->>'monto_descuento')::numeric, 0), 2)
    );
    recargo_item := round(bruto_item * coalesce((x->>'porcentaje_recargo')::numeric, 0) / 100 + coalesce((x->>'monto_recargo')::numeric, 0), 2);
    total_item := greatest(round(bruto_item - descuento_item + recargo_item, 2), 0);
    INSERT INTO public.compra_items(
      comercio_id, compra_id, producto_id, descripcion, cantidad_solicitada,
      cantidad_recibida, costo_unitario, porcentaje_iva,
      porcentaje_descuento, monto_descuento, porcentaje_recargo, monto_recargo,
      actualizar_costo, subtotal, total
    ) VALUES (
      c.comercio_id, c.id, p.id, p.descripcion, (x->>'cantidad')::numeric,
      (x->>'cantidad')::numeric, (x->>'costo_unitario')::numeric,
      coalesce((x->>'porcentaje_iva')::numeric, p.porcentaje_iva, 0),
      coalesce((x->>'porcentaje_descuento')::numeric, 0), coalesce((x->>'monto_descuento')::numeric, 0),
      coalesce((x->>'porcentaje_recargo')::numeric, 0), coalesce((x->>'monto_recargo')::numeric, 0),
      coalesce((x->>'actualizar_costo')::boolean, true), bruto_item, total_item
    );
    UPDATE public.productos SET precio_costo = CASE
      WHEN coalesce((x->>'actualizar_costo')::boolean, true)
      THEN (x->>'costo_unitario')::numeric ELSE precio_costo END
    WHERE id = p.id;
    base := base + total_item;
  END LOOP;

  descuento := least(base, round(coalesce(p_monto_descuento, 0) + base * coalesce(p_porcentaje_descuento, 0) / 100, 2));
  recargo := round(coalesce(p_monto_recargo, 0) + base * coalesce(p_porcentaje_recargo, 0) / 100, 2);
  final_total := greatest(round(base - descuento + recargo, 2), 0);
  UPDATE public.compras SET
    proveedor_id = p_proveedor_id, fecha = coalesce(p_fecha, current_date),
    factura_numero = coalesce(nullif(trim(p_factura_numero), ''), numero),
    fecha_vencimiento = p_fecha_vencimiento, modalidad_pago = p_modalidad_pago,
    subtotal = base, porcentaje_descuento = coalesce(p_porcentaje_descuento, 0),
    monto_descuento = descuento, porcentaje_recargo = coalesce(p_porcentaje_recargo, 0),
    monto_recargo = recargo, total = final_total,
    observaciones = nullif(trim(p_observaciones), '')
  WHERE id = c.id RETURNING * INTO c;

  UPDATE public.compras_facturas SET
    proveedor_id = p_proveedor_id, numero_comprobante = c.factura_numero,
    fecha = c.fecha, fecha_vencimiento = p_fecha_vencimiento, total = final_total
  WHERE id = f.id;
  UPDATE public.cuenta_corriente_proveedores SET proveedor_id = p_proveedor_id WHERE factura_id = f.id;
  UPDATE public.cuenta_corriente_proveedores SET
    monto = final_total, fecha = c.fecha, observaciones = 'Compra ' || c.numero
  WHERE factura_id = f.id AND tipo = 'deuda';
  RETURN c;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_compra_confirmada_v2(uuid,uuid,date,text,date,text,numeric,numeric,numeric,numeric,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.editar_compra_confirmada(uuid,uuid,date,text,date,text,numeric,numeric,numeric,numeric,jsonb,text) TO authenticated;
