-- Al eliminar una venta generada desde un presupuesto, permitir que el
-- presupuesto vuelva a editarse y confirmarse.
CREATE OR REPLACE FUNCTION public.reset_presupuesto_on_venta_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.presupuestos
  SET estado = 'pendiente',
      venta_id = NULL,
      confirmado_at = NULL
  WHERE venta_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS reset_presupuesto_on_venta_delete ON public.ventas;
CREATE TRIGGER reset_presupuesto_on_venta_delete
BEFORE DELETE ON public.ventas
FOR EACH ROW
EXECUTE FUNCTION public.reset_presupuesto_on_venta_delete();
