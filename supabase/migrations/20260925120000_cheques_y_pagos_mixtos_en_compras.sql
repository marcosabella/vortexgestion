-- Permite registrar, en la misma transacción de la compra, pagos mixtos y
-- cheques propios o de terceros reutilizando el circuito de proveedores.

ALTER TABLE public.compras
  DROP CONSTRAINT IF EXISTS compras_modalidad_pago_check;
ALTER TABLE public.compras
  ADD CONSTRAINT compras_modalidad_pago_check
  CHECK (modalidad_pago IN ('contado','transferencia','tarjeta','cheque','cta_cte','multiple'));

CREATE OR REPLACE FUNCTION public.registrar_compra_confirmada_con_pagos(
  p_comercio_id uuid,
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
  p_observaciones text,
  p_pagos jsonb
)
RETURNS public.compras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_compra public.compras;
  v_factura public.compras_facturas;
BEGIN
  IF p_modalidad_pago NOT IN ('cheque', 'multiple')
     OR jsonb_typeof(p_pagos) <> 'array'
     OR jsonb_array_length(p_pagos) = 0 THEN
    RAISE EXCEPTION 'compra_pagos_invalidos';
  END IF;

  IF p_modalidad_pago = 'cheque' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_pagos) AS pago
    WHERE pago->>'tipo' IS DISTINCT FROM 'cheque'
  ) THEN
    RAISE EXCEPTION 'compra_pago_cheque_invalido';
  END IF;

  -- Se crea inicialmente a cuenta corriente para que exista una deuda contra
  -- la cual imputar cada pago mediante las validaciones ya existentes.
  v_compra := public.registrar_compra_confirmada_v2(
    p_comercio_id, p_proveedor_id, p_fecha, p_factura_numero,
    p_fecha_vencimiento, 'cta_cte', p_porcentaje_descuento,
    p_monto_descuento, p_porcentaje_recargo, p_monto_recargo,
    p_items, p_observaciones
  );

  SELECT * INTO STRICT v_factura
  FROM public.compras_facturas
  WHERE compra_id = v_compra.id;

  PERFORM public.registrar_pagos_proveedor_mixtos(
    v_factura.id, NULL, coalesce(p_fecha, current_date),
    'Pago al registrar compra ' || v_compra.numero, p_pagos
  );

  -- El registro auxiliar mantiene la misma trazabilidad que los demás pagos
  -- originados al confirmar una compra, incluidos los realizados con cheque.
  INSERT INTO public.pagos_compra(
    comercio_id, compra_id, factura_id, tipo_pago, monto, fecha, movimiento_id
  )
  SELECT movimiento.comercio_id, v_compra.id, v_factura.id,
    movimiento.medio_pago, movimiento.monto, movimiento.fecha, movimiento.id
  FROM public.cuenta_corriente_proveedores AS movimiento
  WHERE movimiento.factura_id = v_factura.id
    AND movimiento.tipo = 'pago'
    AND NOT EXISTS (
      SELECT 1 FROM public.pagos_compra AS pago_compra
      WHERE pago_compra.movimiento_id = movimiento.id
    );

  UPDATE public.compras
  SET modalidad_pago = p_modalidad_pago
  WHERE id = v_compra.id
  RETURNING * INTO v_compra;

  RETURN v_compra;
END;
$$;

CREATE OR REPLACE FUNCTION public.editar_compra_confirmada_v2(
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
  v_compra public.compras;
BEGIN
  IF p_modalidad_pago NOT IN ('contado','transferencia','tarjeta','cheque','cta_cte','multiple') THEN
    RAISE EXCEPTION 'compra_invalida';
  END IF;

  v_compra := public.editar_compra_confirmada(
    p_compra_id, p_proveedor_id, p_fecha, p_factura_numero,
    p_fecha_vencimiento,
    CASE WHEN p_modalidad_pago = 'multiple' THEN 'cta_cte' ELSE p_modalidad_pago END,
    p_porcentaje_descuento, p_monto_descuento, p_porcentaje_recargo,
    p_monto_recargo, p_items, p_observaciones
  );

  IF p_modalidad_pago = 'multiple' THEN
    UPDATE public.compras SET modalidad_pago = 'multiple'
    WHERE id = v_compra.id RETURNING * INTO v_compra;
  END IF;

  UPDATE public.cheques AS cheque
  SET proveedor_id = p_proveedor_id
  FROM public.cuenta_corriente_proveedores AS movimiento,
       public.compras_facturas AS factura
  WHERE cheque.movimiento_proveedor_id = movimiento.id
    AND movimiento.factura_id = factura.id
    AND factura.compra_id = v_compra.id;

  RETURN v_compra;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_compra_confirmada_con_cheques(p_compra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_compra public.compras;
  v_cheque public.cheques;
BEGIN
  SELECT * INTO v_compra FROM public.compras WHERE id = p_compra_id FOR UPDATE;
  IF NOT FOUND OR NOT public.user_belongs_to_comercio(v_compra.comercio_id) THEN
    RAISE EXCEPTION 'compra_no_disponible';
  END IF;

  FOR v_cheque IN
    SELECT cheque.*
    FROM public.cheques AS cheque
    JOIN public.cuenta_corriente_proveedores AS movimiento
      ON movimiento.id = cheque.movimiento_proveedor_id
    JOIN public.compras_facturas AS factura
      ON factura.id = movimiento.factura_id
    WHERE factura.compra_id = p_compra_id
    FOR UPDATE OF cheque
  LOOP
    IF v_cheque.tipo_cheque = 'propio' THEN
      DELETE FROM public.cheques WHERE id = v_cheque.id;
    ELSE
      UPDATE public.cheques
      SET estado = 'en_cartera', proveedor_id = NULL, movimiento_proveedor_id = NULL
      WHERE id = v_cheque.id;
    END IF;
  END LOOP;

  PERFORM public.eliminar_compra_confirmada(p_compra_id);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_compra_confirmada_con_pagos(uuid,uuid,date,text,date,text,numeric,numeric,numeric,numeric,jsonb,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.editar_compra_confirmada_v2(uuid,uuid,date,text,date,text,numeric,numeric,numeric,numeric,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.eliminar_compra_confirmada_con_cheques(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_compra_confirmada_con_pagos(uuid,uuid,date,text,date,text,numeric,numeric,numeric,numeric,jsonb,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.editar_compra_confirmada_v2(uuid,uuid,date,text,date,text,numeric,numeric,numeric,numeric,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_compra_confirmada_con_cheques(uuid) TO authenticated;
