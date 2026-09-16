ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS origen_orden_trabajo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ventas.origen_orden_trabajo IS
  'Las ventas generadas desde ordenes de trabajo descuentan stock aunque el resultado sea negativo.';

CREATE OR REPLACE FUNCTION public.apply_venta_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_rows integer;
  permite_stock_negativo boolean := false;
  venta_origen_id uuid;
BEGIN
  IF current_setting('app.skip_stock_movements', true) = 'on' THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    venta_origen_id := OLD.venta_id;
  ELSE
    venta_origen_id := NEW.venta_id;
  END IF;

  SELECT origen_orden_trabajo
  INTO permite_stock_negativo
  FROM public.ventas
  WHERE id = venta_origen_id;

  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    IF OLD.producto_variante_id IS NOT NULL THEN
      UPDATE public.producto_variantes SET stock = stock + OLD.cantidad WHERE id = OLD.producto_variante_id;
    ELSIF OLD.producto_id IS NOT NULL THEN
      UPDATE public.productos SET stock = stock + OLD.cantidad WHERE id = OLD.producto_id;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.producto_variante_id IS NOT NULL THEN
      UPDATE public.producto_variantes
      SET stock = stock - NEW.cantidad
      WHERE id = NEW.producto_variante_id
        AND (permite_stock_negativo OR stock >= NEW.cantidad);
      GET DIAGNOSTICS affected_rows = ROW_COUNT;
    ELSIF NEW.producto_id IS NOT NULL THEN
      UPDATE public.productos
      SET stock = stock - NEW.cantidad
      WHERE id = NEW.producto_id
        AND (permite_stock_negativo OR stock >= NEW.cantidad);
      GET DIAGNOSTICS affected_rows = ROW_COUNT;
    ELSE
      affected_rows := 1;
    END IF;

    IF affected_rows = 0 THEN
      RAISE EXCEPTION 'Stock insuficiente para el producto o variante seleccionada';
    END IF;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;
