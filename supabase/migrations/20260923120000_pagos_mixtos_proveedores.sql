-- Registra múltiples medios de pago de proveedor en una única transacción.

CREATE OR REPLACE FUNCTION public.registrar_pagos_proveedor_mixtos(
  p_factura_id uuid,
  p_gasto_id uuid,
  p_fecha date,
  p_observaciones text,
  p_pagos jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  f public.compras_facturas;
  g public.gastos_egresos;
  x jsonb;
  v_saldo numeric;
  v_total numeric := 0;
  v_tipo text;
  v_monto numeric;
BEGIN
  IF (p_factura_id IS NULL) = (p_gasto_id IS NULL)
     OR jsonb_typeof(p_pagos) <> 'array' OR jsonb_array_length(p_pagos) = 0 THEN
    RAISE EXCEPTION 'pagos_proveedor_mixtos_invalidos';
  END IF;

  IF p_factura_id IS NOT NULL THEN
    SELECT * INTO f FROM public.compras_facturas WHERE id = p_factura_id FOR UPDATE;
    IF NOT FOUND OR NOT public.user_belongs_to_comercio(f.comercio_id) THEN
      RAISE EXCEPTION 'factura_compra_no_disponible';
    END IF;
    SELECT coalesce(sum(CASE WHEN tipo = 'deuda' THEN monto ELSE -monto END), 0)
    INTO v_saldo FROM public.cuenta_corriente_proveedores WHERE factura_id = f.id;
  ELSE
    SELECT * INTO g FROM public.gastos_egresos WHERE id = p_gasto_id FOR UPDATE;
    IF NOT FOUND OR NOT public.user_belongs_to_comercio(g.comercio_id)
       OR g.medio_pago <> 'cuenta_corriente' OR g.proveedor_id IS NULL THEN
      RAISE EXCEPTION 'gasto_cuenta_corriente_no_disponible';
    END IF;
    SELECT coalesce(sum(CASE WHEN tipo = 'deuda' THEN monto ELSE -monto END), 0)
    INTO v_saldo FROM public.cuenta_corriente_proveedores WHERE gasto_egreso_id = g.id;
  END IF;

  FOR x IN SELECT value FROM jsonb_array_elements(p_pagos) LOOP
    v_tipo := x->>'tipo';
    v_monto := coalesce((x->>'monto')::numeric, 0);
    IF v_tipo NOT IN ('contado', 'transferencia', 'tarjeta', 'cheque') OR v_monto <= 0 THEN
      RAISE EXCEPTION 'pago_proveedor_mixto_item_invalido';
    END IF;
    IF v_tipo = 'cheque' AND ((x ? 'cheque_id') = (x ? 'cheque_propio')) THEN
      RAISE EXCEPTION 'pago_proveedor_mixto_cheque_invalido';
    END IF;
    v_total := v_total + v_monto;
  END LOOP;

  IF v_total > v_saldo THEN RAISE EXCEPTION 'pagos_proveedor_superan_saldo'; END IF;

  FOR x IN SELECT value FROM jsonb_array_elements(p_pagos) LOOP
    v_tipo := x->>'tipo';
    v_monto := (x->>'monto')::numeric;
    IF v_tipo = 'cheque' THEN
      PERFORM public.registrar_pago_proveedor_con_cheque(
        p_factura_id, p_gasto_id, v_monto, coalesce(p_fecha, current_date),
        coalesce(nullif(trim(x->>'observaciones'), ''), p_observaciones),
        CASE WHEN x ? 'cheque_id' THEN (x->>'cheque_id')::uuid ELSE NULL END,
        CASE WHEN x ? 'cheque_propio' THEN x->'cheque_propio' ELSE NULL END
      );
    ELSIF p_factura_id IS NOT NULL THEN
      PERFORM public.registrar_pago_factura_compra(
        p_factura_id, v_monto, coalesce(p_fecha, current_date), v_tipo,
        coalesce(nullif(trim(x->>'observaciones'), ''), p_observaciones)
      );
    ELSE
      PERFORM public.registrar_pago_gasto_egreso(
        p_gasto_id, v_monto, coalesce(p_fecha, current_date), v_tipo,
        coalesce(nullif(trim(x->>'observaciones'), ''), p_observaciones)
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pagos_proveedor_mixtos(uuid,uuid,date,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pagos_proveedor_mixtos(uuid,uuid,date,text,jsonb) TO authenticated;

