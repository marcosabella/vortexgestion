CREATE OR REPLACE FUNCTION public.prevent_authorized_venta_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NULLIF(BTRIM(OLD.cae), '') IS NOT NULL THEN
    RAISE EXCEPTION 'La venta tiene CAE y no puede editarse ni eliminarse';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_authorized_venta_changes ON public.ventas;
CREATE TRIGGER prevent_authorized_venta_changes
BEFORE UPDATE OR DELETE ON public.ventas
FOR EACH ROW
EXECUTE FUNCTION public.prevent_authorized_venta_changes();

CREATE OR REPLACE FUNCTION public.prevent_authorized_venta_relation_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_venta_id uuid;
  new_venta_id uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    old_venta_id := OLD.venta_id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    new_venta_id := NEW.venta_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ventas
    WHERE id IN (old_venta_id, new_venta_id)
      AND NULLIF(BTRIM(cae), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'La venta tiene CAE y sus datos relacionados no pueden modificarse';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_authorized_venta_items_changes ON public.venta_items;
CREATE TRIGGER prevent_authorized_venta_items_changes
BEFORE INSERT OR UPDATE OR DELETE ON public.venta_items
FOR EACH ROW
EXECUTE FUNCTION public.prevent_authorized_venta_relation_changes();

DROP TRIGGER IF EXISTS prevent_authorized_pagos_venta_changes ON public.pagos_venta;
CREATE TRIGGER prevent_authorized_pagos_venta_changes
BEFORE INSERT OR UPDATE OR DELETE ON public.pagos_venta
FOR EACH ROW
EXECUTE FUNCTION public.prevent_authorized_venta_relation_changes();

DROP TRIGGER IF EXISTS prevent_authorized_cuenta_corriente_changes ON public.cuenta_corriente;
CREATE TRIGGER prevent_authorized_cuenta_corriente_changes
BEFORE INSERT OR UPDATE OR DELETE ON public.cuenta_corriente
FOR EACH ROW
EXECUTE FUNCTION public.prevent_authorized_venta_relation_changes();

DROP TRIGGER IF EXISTS prevent_authorized_caja_movimientos_changes ON public.caja_movimientos;
CREATE TRIGGER prevent_authorized_caja_movimientos_changes
BEFORE INSERT OR UPDATE OR DELETE ON public.caja_movimientos
FOR EACH ROW
EXECUTE FUNCTION public.prevent_authorized_venta_relation_changes();
