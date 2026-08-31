-- Identifica snapshots ya generados para conservarlos cuando se edita una venta no fiscal.
ALTER TABLE public.pagos_venta
  ADD COLUMN IF NOT EXISTS comision_snapshot_at TIMESTAMP WITH TIME ZONE;

UPDATE public.pagos_venta
SET comision_snapshot_at = COALESCE(comision_snapshot_at, created_at, now())
WHERE tipo_pago::text = 'tarjeta';

CREATE OR REPLACE FUNCTION public.calcular_snapshot_comision_tarjeta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_porcentaje NUMERIC(5,2) := 0;
BEGIN
  IF NEW.tipo_pago::text = 'tarjeta' AND NEW.tarjeta_id IS NOT NULL THEN
    IF NEW.comision_snapshot_at IS NULL THEN
      SELECT COALESCE(t.porcentaje_comision, 0)
        INTO v_porcentaje
        FROM public.tarjetas_credito t
       WHERE t.id = NEW.tarjeta_id;

      NEW.porcentaje_comision_aplicado := COALESCE(v_porcentaje, 0);
      NEW.monto_comision_estimado := ROUND(COALESCE(NEW.monto, 0) * NEW.porcentaje_comision_aplicado / 100, 2);
      NEW.monto_neto_estimado := ROUND(COALESCE(NEW.monto, 0) - NEW.monto_comision_estimado, 2);
      NEW.estado_conciliacion := 'pendiente';
      NEW.comision_snapshot_at := now();
    END IF;
  ELSE
    NEW.porcentaje_comision_aplicado := 0;
    NEW.monto_comision_estimado := 0;
    NEW.monto_neto_estimado := COALESCE(NEW.monto, 0);
    NEW.estado_conciliacion := 'no_aplica';
    NEW.comision_snapshot_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_delete_conciliated_card_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.estado_conciliacion IN ('conciliada', 'con_diferencia') THEN
    RAISE EXCEPTION 'El pago con tarjeta ya fue conciliado y no puede eliminarse desde la venta';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_delete_conciliated_card_payment ON public.pagos_venta;
CREATE TRIGGER prevent_delete_conciliated_card_payment
BEFORE DELETE ON public.pagos_venta
FOR EACH ROW
EXECUTE FUNCTION public.prevent_delete_conciliated_card_payment();
