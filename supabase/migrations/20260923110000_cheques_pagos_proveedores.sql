-- Integra cheques propios y de terceros con pagos de cuenta corriente de proveedores.

ALTER TYPE public.estado_cheque ADD VALUE IF NOT EXISTS 'emitido';

ALTER TABLE public.cheques
  ADD COLUMN tipo_cheque text NOT NULL DEFAULT 'tercero'
    CHECK (tipo_cheque IN ('propio', 'tercero')),
  ADD COLUMN proveedor_id uuid REFERENCES public.proveedores(id) ON DELETE SET NULL,
  ADD COLUMN movimiento_proveedor_id uuid REFERENCES public.cuenta_corriente_proveedores(id) ON DELETE SET NULL;

ALTER TABLE public.cuenta_corriente_proveedores
  ADD COLUMN cheque_id uuid REFERENCES public.cheques(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX cheques_movimiento_proveedor_unico
ON public.cheques(movimiento_proveedor_id)
WHERE movimiento_proveedor_id IS NOT NULL;

CREATE UNIQUE INDEX cuenta_proveedor_cheque_unico
ON public.cuenta_corriente_proveedores(cheque_id)
WHERE cheque_id IS NOT NULL;

CREATE INDEX cheques_comercio_tipo_estado
ON public.cheques(comercio_id, tipo_cheque, estado);

CREATE OR REPLACE FUNCTION public.registrar_pago_proveedor_con_cheque(
  p_factura_id uuid,
  p_gasto_id uuid,
  p_monto numeric,
  p_fecha date,
  p_observaciones text,
  p_cheque_id uuid,
  p_cheque_propio jsonb
)
RETURNS public.cuenta_corriente_proveedores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  f public.compras_facturas;
  g public.gastos_egresos;
  ch public.cheques;
  m public.cuenta_corriente_proveedores;
  v_comercio uuid;
  v_proveedor uuid;
  v_saldo numeric;
  v_fecha date := coalesce(p_fecha, current_date);
BEGIN
  IF (p_factura_id IS NULL) = (p_gasto_id IS NULL)
     OR (p_cheque_id IS NULL) = (p_cheque_propio IS NULL)
     OR p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'pago_cheque_proveedor_invalido';
  END IF;

  IF p_factura_id IS NOT NULL THEN
    SELECT * INTO f FROM public.compras_facturas WHERE id = p_factura_id FOR UPDATE;
    IF NOT FOUND OR NOT public.user_belongs_to_comercio(f.comercio_id) THEN
      RAISE EXCEPTION 'factura_compra_no_disponible';
    END IF;
    v_comercio := f.comercio_id;
    v_proveedor := f.proveedor_id;
    SELECT coalesce(sum(CASE WHEN tipo = 'deuda' THEN monto ELSE -monto END), 0)
    INTO v_saldo FROM public.cuenta_corriente_proveedores WHERE factura_id = f.id;
  ELSE
    SELECT * INTO g FROM public.gastos_egresos WHERE id = p_gasto_id FOR UPDATE;
    IF NOT FOUND OR NOT public.user_belongs_to_comercio(g.comercio_id)
       OR g.medio_pago <> 'cuenta_corriente' OR g.proveedor_id IS NULL THEN
      RAISE EXCEPTION 'gasto_cuenta_corriente_no_disponible';
    END IF;
    v_comercio := g.comercio_id;
    v_proveedor := g.proveedor_id;
    SELECT coalesce(sum(CASE WHEN tipo = 'deuda' THEN monto ELSE -monto END), 0)
    INTO v_saldo FROM public.cuenta_corriente_proveedores WHERE gasto_egreso_id = g.id;
  END IF;

  IF p_monto > v_saldo THEN RAISE EXCEPTION 'pago_cheque_supera_saldo'; END IF;

  IF p_cheque_id IS NOT NULL THEN
    SELECT * INTO ch FROM public.cheques WHERE id = p_cheque_id FOR UPDATE;
    IF NOT FOUND OR ch.comercio_id <> v_comercio OR ch.tipo_cheque <> 'tercero'
       OR ch.estado <> 'en_cartera' OR ch.movimiento_proveedor_id IS NOT NULL THEN
      RAISE EXCEPTION 'cheque_cartera_no_disponible';
    END IF;
    IF ch.monto <> p_monto THEN RAISE EXCEPTION 'cheque_monto_pago_diferente'; END IF;
  ELSE
    IF jsonb_typeof(p_cheque_propio) <> 'object'
       OR nullif(trim(p_cheque_propio->>'numero_cheque'), '') IS NULL
       OR nullif(trim(p_cheque_propio->>'banco_emisor'), '') IS NULL
       OR nullif(trim(p_cheque_propio->>'emisor_nombre'), '') IS NULL
       OR nullif(p_cheque_propio->>'fecha_emision', '') IS NULL
       OR nullif(p_cheque_propio->>'fecha_vencimiento', '') IS NULL THEN
      RAISE EXCEPTION 'datos_cheque_propio_incompletos';
    END IF;
    INSERT INTO public.cheques(
      comercio_id, numero_cheque, banco_emisor, monto, fecha_emision,
      fecha_vencimiento, emisor_nombre, emisor_cuit, estado, observaciones,
      tipo_cheque, proveedor_id
    ) VALUES (
      v_comercio, trim(p_cheque_propio->>'numero_cheque'), trim(p_cheque_propio->>'banco_emisor'),
      p_monto, (p_cheque_propio->>'fecha_emision')::date,
      (p_cheque_propio->>'fecha_vencimiento')::date, trim(p_cheque_propio->>'emisor_nombre'),
      nullif(trim(p_cheque_propio->>'emisor_cuit'), ''), 'emitido',
      nullif(trim(p_cheque_propio->>'observaciones'), ''), 'propio', v_proveedor
    ) RETURNING * INTO ch;
  END IF;

  INSERT INTO public.cuenta_corriente_proveedores(
    comercio_id, proveedor_id, factura_id, gasto_egreso_id, tipo, monto,
    fecha, medio_pago, observaciones, cheque_id
  ) VALUES (
    v_comercio, v_proveedor, p_factura_id, p_gasto_id, 'pago', p_monto,
    v_fecha, 'cheque', nullif(trim(p_observaciones), ''), ch.id
  ) RETURNING * INTO m;

  UPDATE public.cheques
  SET estado = CASE WHEN tipo_cheque = 'tercero' THEN 'endosado'::public.estado_cheque ELSE 'emitido'::public.estado_cheque END,
      proveedor_id = v_proveedor,
      movimiento_proveedor_id = m.id,
      observaciones = coalesce(observaciones || E'\n', '') || 'Entregado en pago a proveedor el ' || to_char(v_fecha, 'DD/MM/YYYY')
  WHERE id = ch.id;

  IF p_gasto_id IS NOT NULL THEN
    UPDATE public.gastos_egresos
    SET estado = CASE WHEN p_monto = v_saldo THEN 'pagado' ELSE 'pendiente' END
    WHERE id = p_gasto_id;
  END IF;

  RETURN m;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_pago_proveedor_con_cheque(p_movimiento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  m public.cuenta_corriente_proveedores;
  ch public.cheques;
BEGIN
  SELECT * INTO m FROM public.cuenta_corriente_proveedores
  WHERE id = p_movimiento_id AND tipo = 'pago' AND cheque_id IS NOT NULL FOR UPDATE;
  IF NOT FOUND OR NOT public.user_belongs_to_comercio(m.comercio_id) THEN
    RAISE EXCEPTION 'pago_cheque_proveedor_no_disponible';
  END IF;
  SELECT * INTO ch FROM public.cheques WHERE id = m.cheque_id FOR UPDATE;

  DELETE FROM public.pagos_compra WHERE movimiento_id = m.id;
  DELETE FROM public.cuenta_corriente_proveedores WHERE id = m.id;

  IF m.gasto_egreso_id IS NOT NULL THEN
    UPDATE public.gastos_egresos SET estado = 'pendiente' WHERE id = m.gasto_egreso_id;
  END IF;

  IF ch.tipo_cheque = 'propio' THEN
    DELETE FROM public.cheques WHERE id = ch.id;
  ELSE
    UPDATE public.cheques
    SET estado = 'en_cartera', proveedor_id = NULL, movimiento_proveedor_id = NULL
    WHERE id = ch.id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pago_proveedor_con_cheque(uuid,uuid,numeric,date,text,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.eliminar_pago_proveedor_con_cheque(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pago_proveedor_con_cheque(uuid,uuid,numeric,date,text,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_pago_proveedor_con_cheque(uuid) TO authenticated;

