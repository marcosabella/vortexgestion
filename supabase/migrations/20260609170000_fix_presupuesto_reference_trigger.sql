-- Reemplaza versiones desplegadas del trigger que referenciaban por error
-- NEW.produtc_id y bloqueaban incluso la insercion de la cabecera.

CREATE OR REPLACE FUNCTION public.validate_presupuesto_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  related_comercio_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'presupuestos' THEN
    IF NEW.cliente_id IS NOT NULL THEN
      SELECT comercio_id
      INTO related_comercio_id
      FROM public.clientes
      WHERE id = NEW.cliente_id;

      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El cliente pertenece a otro comercio';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'presupuesto_items' THEN
    IF NEW.producto_id IS NOT NULL THEN
      SELECT comercio_id
      INTO related_comercio_id
      FROM public.productos
      WHERE id = NEW.producto_id;

      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El producto pertenece a otro comercio';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'presupuesto_pagos' THEN
    IF NEW.banco_id IS NOT NULL THEN
      SELECT comercio_id
      INTO related_comercio_id
      FROM public.bancos
      WHERE id = NEW.banco_id;

      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El banco pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.tarjeta_id IS NOT NULL THEN
      SELECT comercio_id
      INTO related_comercio_id
      FROM public.tarjetas_credito
      WHERE id = NEW.tarjeta_id;

      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'La tarjeta pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.cheque_id IS NOT NULL THEN
      SELECT comercio_id
      INTO related_comercio_id
      FROM public.cheques
      WHERE id = NEW.cheque_id;

      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El cheque pertenece a otro comercio';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_presupuestos_references ON public.presupuestos;
CREATE TRIGGER validate_presupuestos_references
BEFORE INSERT OR UPDATE ON public.presupuestos
FOR EACH ROW EXECUTE FUNCTION public.validate_presupuesto_references();

DROP TRIGGER IF EXISTS validate_presupuesto_items_references ON public.presupuesto_items;
CREATE TRIGGER validate_presupuesto_items_references
BEFORE INSERT OR UPDATE ON public.presupuesto_items
FOR EACH ROW EXECUTE FUNCTION public.validate_presupuesto_references();

DROP TRIGGER IF EXISTS validate_presupuesto_pagos_references ON public.presupuesto_pagos;
CREATE TRIGGER validate_presupuesto_pagos_references
BEFORE INSERT OR UPDATE ON public.presupuesto_pagos
FOR EACH ROW EXECUTE FUNCTION public.validate_presupuesto_references();
