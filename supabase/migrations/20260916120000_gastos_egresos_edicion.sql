-- Vincula cada salida de caja con el gasto que la originó para que editar o eliminar
-- un gasto en efectivo mantenga el saldo de Caja diaria correctamente actualizado.
ALTER TABLE public.caja_movimientos
ADD COLUMN IF NOT EXISTS gasto_egreso_id uuid REFERENCES public.gastos_egresos(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_caja_movimientos_gasto_egreso_id_unica
ON public.caja_movimientos(gasto_egreso_id)
WHERE gasto_egreso_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sincronizar_egreso_gasto_en_caja()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caja_abierta boolean;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.estado = 'pagado' AND OLD.medio_pago = 'efectivo' THEN
    SELECT estado = 'abierta' INTO caja_abierta FROM public.cajas_diarias WHERE id = OLD.caja_id;
    IF NOT COALESCE(caja_abierta, false) THEN
      RAISE EXCEPTION 'No se puede modificar o eliminar un gasto en efectivo vinculado a una caja cerrada';
    END IF;
    DELETE FROM public.caja_movimientos WHERE gasto_egreso_id = OLD.id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.estado = 'pagado' AND NEW.medio_pago = 'efectivo' THEN
    SELECT estado = 'abierta' INTO caja_abierta FROM public.cajas_diarias WHERE id = NEW.caja_id;
    IF NOT COALESCE(caja_abierta, false) THEN
      RAISE EXCEPTION 'El gasto en efectivo requiere una caja abierta';
    END IF;
    INSERT INTO public.caja_movimientos (caja_id, tipo, concepto, descripcion, monto, gasto_egreso_id)
    VALUES (NEW.caja_id, 'egreso', NEW.concepto, COALESCE(NEW.descripcion, 'Gasto: ' || NEW.categoria), NEW.monto, NEW.id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS registrar_egreso_gasto_en_caja ON public.gastos_egresos;
DROP TRIGGER IF EXISTS sincronizar_egreso_gasto_en_caja ON public.gastos_egresos;
CREATE TRIGGER sincronizar_egreso_gasto_en_caja
AFTER INSERT OR UPDATE OR DELETE ON public.gastos_egresos
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_egreso_gasto_en_caja();
