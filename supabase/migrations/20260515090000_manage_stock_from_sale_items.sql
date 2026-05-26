-- Gestionar stock automaticamente desde los items de venta.
-- INSERT resta stock, DELETE lo repone y UPDATE ajusta la diferencia.

CREATE OR REPLACE FUNCTION public.apply_venta_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_rows integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.productos
    SET stock = stock - NEW.cantidad
    WHERE id = NEW.producto_id
      AND stock >= NEW.cantidad;

    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    IF affected_rows = 0 THEN
      RAISE EXCEPTION 'Stock insuficiente para el producto seleccionado';
    END IF;

    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.productos
    SET stock = stock + OLD.cantidad
    WHERE id = OLD.producto_id;

    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.producto_id = NEW.producto_id THEN
      IF NEW.cantidad > OLD.cantidad THEN
        UPDATE public.productos
        SET stock = stock - (NEW.cantidad - OLD.cantidad)
        WHERE id = NEW.producto_id
          AND stock >= (NEW.cantidad - OLD.cantidad);

        GET DIAGNOSTICS affected_rows = ROW_COUNT;
        IF affected_rows = 0 THEN
          RAISE EXCEPTION 'Stock insuficiente para el producto seleccionado';
        END IF;
      ELSIF NEW.cantidad < OLD.cantidad THEN
        UPDATE public.productos
        SET stock = stock + (OLD.cantidad - NEW.cantidad)
        WHERE id = NEW.producto_id;
      END IF;
    ELSE
      UPDATE public.productos
      SET stock = stock + OLD.cantidad
      WHERE id = OLD.producto_id;

      UPDATE public.productos
      SET stock = stock - NEW.cantidad
      WHERE id = NEW.producto_id
        AND stock >= NEW.cantidad;

      GET DIAGNOSTICS affected_rows = ROW_COUNT;
      IF affected_rows = 0 THEN
        RAISE EXCEPTION 'Stock insuficiente para el producto seleccionado';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS apply_venta_item_stock_insert ON public.venta_items;
CREATE TRIGGER apply_venta_item_stock_insert
AFTER INSERT ON public.venta_items
FOR EACH ROW
EXECUTE FUNCTION public.apply_venta_item_stock();

DROP TRIGGER IF EXISTS apply_venta_item_stock_update ON public.venta_items;
CREATE TRIGGER apply_venta_item_stock_update
AFTER UPDATE OF producto_id, cantidad ON public.venta_items
FOR EACH ROW
WHEN (OLD.producto_id IS DISTINCT FROM NEW.producto_id OR OLD.cantidad IS DISTINCT FROM NEW.cantidad)
EXECUTE FUNCTION public.apply_venta_item_stock();

DROP TRIGGER IF EXISTS apply_venta_item_stock_delete ON public.venta_items;
CREATE TRIGGER apply_venta_item_stock_delete
AFTER DELETE ON public.venta_items
FOR EACH ROW
EXECUTE FUNCTION public.apply_venta_item_stock();
