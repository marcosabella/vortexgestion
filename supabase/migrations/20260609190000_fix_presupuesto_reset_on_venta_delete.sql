-- El trigger debe poder restaurar el presupuesto aunque la actualizacion se
-- ejecute durante una eliminacion sujeta a RLS.
CREATE OR REPLACE FUNCTION public.reset_presupuesto_on_venta_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Repara presupuestos de ventas que se eliminaron antes de esta correccion.
UPDATE public.presupuestos
SET estado = 'pendiente',
    confirmado_at = NULL
WHERE estado = 'confirmado'
  AND venta_id IS NULL;
