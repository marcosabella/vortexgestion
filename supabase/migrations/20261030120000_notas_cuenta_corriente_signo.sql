-- Cambio estructural: no modifica movimientos existentes.
-- Se centraliza la imputacion para las RPC de alta/edicion y altas directas.
BEGIN;

CREATE FUNCTION public.normalizar_comprobante_cuenta_corriente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_venta public.ventas;
BEGIN
  -- Los cobros, cheques y ajustes conservan su signo y concepto propios.
  IF NEW.venta_id IS NULL OR NEW.concepto NOT IN
    ('pago_cuenta_corriente', 'venta_credito', 'nota_credito', 'nota_debito') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_venta FROM public.ventas WHERE id = NEW.venta_id;
  IF NOT FOUND OR v_venta.comercio_id IS DISTINCT FROM NEW.comercio_id
     OR v_venta.cliente_id IS DISTINCT FROM NEW.cliente_id THEN
    RAISE EXCEPTION 'comprobante_cuenta_corriente_referencias_invalidas' USING ERRCODE = '42501';
  END IF;

  IF v_venta.tipo_comprobante::text IN ('nota_credito_a', 'nota_credito_b', 'nota_credito_c') THEN
    NEW.tipo_movimiento := 'credito';
    NEW.concepto := 'nota_credito';
  ELSIF v_venta.tipo_comprobante::text IN ('nota_debito_a', 'nota_debito_b', 'nota_debito_c') THEN
    NEW.tipo_movimiento := 'debito';
    NEW.concepto := 'nota_debito';
  ELSE
    NEW.tipo_movimiento := 'debito';
    NEW.concepto := 'pago_cuenta_corriente';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalizar_comprobante_cuenta_corriente() FROM PUBLIC, anon, authenticated;

-- Corre antes de las validaciones y sin omitir la proteccion de documentos con CAE.
CREATE TRIGGER normalizar_comprobante_cuenta_corriente
BEFORE INSERT OR UPDATE ON public.cuenta_corriente
FOR EACH ROW EXECUTE FUNCTION public.normalizar_comprobante_cuenta_corriente();

COMMIT;
