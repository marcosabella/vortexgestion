-- Integra variantes, conceptos manuales decimales y ventas desde ordenes.
-- No modifica datos historicos: las diferencias existentes se concilian aparte.
BEGIN;

CREATE OR REPLACE FUNCTION public.apply_venta_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  affected_rows integer;
  permite_stock_negativo boolean := false;
BEGIN
  IF current_setting('app.skip_stock_movements', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Reponer el movimiento anterior tambien al cambiar solamente talle/color.
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    IF OLD.afecta_stock AND OLD.producto_id IS NOT NULL THEN
      IF OLD.producto_variante_id IS NOT NULL THEN
        UPDATE public.producto_variantes v SET stock = v.stock + OLD.cantidad::integer
        FROM public.productos p
        WHERE v.id = OLD.producto_variante_id AND v.producto_id = OLD.producto_id
          AND p.id = v.producto_id AND p.comercio_id = OLD.comercio_id;
      ELSE
        UPDATE public.productos SET stock = stock + OLD.cantidad::integer
        WHERE id = OLD.producto_id AND comercio_id = OLD.comercio_id;
      END IF;
      GET DIAGNOSTICS affected_rows = ROW_COUNT;
      IF affected_rows <> 1 THEN RAISE EXCEPTION 'ventas_producto_no_disponible' USING ERRCODE='42501'; END IF;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.afecta_stock AND NEW.producto_id IS NOT NULL THEN
      IF NEW.producto_variante_id IS NOT NULL THEN
        -- El trigger de variantes recalcula el total. No descontarlo otra vez.
        UPDATE public.producto_variantes v SET stock = v.stock - NEW.cantidad::integer
        FROM public.productos p
        WHERE v.id = NEW.producto_variante_id AND v.producto_id = NEW.producto_id
          AND p.id = v.producto_id AND p.comercio_id = NEW.comercio_id
          AND v.stock >= NEW.cantidad::integer;
      ELSE
        SELECT origen_orden_trabajo INTO permite_stock_negativo
        FROM public.ventas WHERE id = NEW.venta_id AND comercio_id = NEW.comercio_id;
        UPDATE public.productos SET stock = stock - NEW.cantidad::integer
        WHERE id = NEW.producto_id AND comercio_id = NEW.comercio_id
          AND (coalesce(permite_stock_negativo, false) OR stock >= NEW.cantidad::integer);
      END IF;
      GET DIAGNOSTICS affected_rows = ROW_COUNT;
      IF affected_rows <> 1 THEN RAISE EXCEPTION 'Stock insuficiente para el producto o variante seleccionada'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_venta_item_stock() FROM PUBLIC, anon, authenticated;

COMMIT;
