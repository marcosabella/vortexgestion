-- Permitir items de venta manuales sin producto cargado en el modulo de productos.

ALTER TABLE public.venta_items
  ALTER COLUMN producto_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS descripcion_manual text,
  ADD COLUMN IF NOT EXISTS codigo_manual text;

ALTER TABLE public.venta_items
  DROP CONSTRAINT IF EXISTS venta_items_producto_o_descripcion_check;

ALTER TABLE public.venta_items
  ADD CONSTRAINT venta_items_producto_o_descripcion_check
  CHECK (
    producto_id IS NOT NULL
    OR length(trim(coalesce(descripcion_manual, ''))) > 0
  );

CREATE OR REPLACE FUNCTION public.validate_same_comercio_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  related_comercio_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'productos' THEN
    IF NEW.proveedor_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.proveedores WHERE id = NEW.proveedor_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El proveedor pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.marca_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.marcas WHERE id = NEW.marca_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'La marca pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.rubro_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.rubros WHERE id = NEW.rubro_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El rubro pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.subrubro_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.subrubros WHERE id = NEW.subrubro_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El subrubro pertenece a otro comercio';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'subrubros' THEN
    SELECT comercio_id INTO related_comercio_id FROM public.rubros WHERE id = NEW.rubro_id;
    IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'El rubro pertenece a otro comercio';
    END IF;
  ELSIF TG_TABLE_NAME = 'ventas' THEN
    IF NEW.cliente_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.clientes WHERE id = NEW.cliente_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El cliente pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.banco_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.bancos WHERE id = NEW.banco_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El banco pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.tarjeta_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.tarjetas_credito WHERE id = NEW.tarjeta_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'La tarjeta pertenece a otro comercio';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'venta_items' THEN
    IF NEW.producto_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.productos WHERE id = NEW.producto_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El producto pertenece a otro comercio';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'cuenta_corriente' THEN
    SELECT comercio_id INTO related_comercio_id FROM public.clientes WHERE id = NEW.cliente_id;
    IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'El cliente pertenece a otro comercio';
    END IF;

    IF NEW.venta_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.ventas WHERE id = NEW.venta_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'La venta pertenece a otro comercio';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'cheques' THEN
    IF NEW.cliente_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.clientes WHERE id = NEW.cliente_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El cliente pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.venta_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.ventas WHERE id = NEW.venta_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'La venta pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.cuenta_corriente_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.cuenta_corriente WHERE id = NEW.cuenta_corriente_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El movimiento de cuenta corriente pertenece a otro comercio';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'tarjeta_cuotas' THEN
    SELECT comercio_id INTO related_comercio_id FROM public.tarjetas_credito WHERE id = NEW.tarjeta_id;
    IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'La tarjeta pertenece a otro comercio';
    END IF;
  ELSIF TG_TABLE_NAME = 'pagos_venta' THEN
    IF NEW.banco_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.bancos WHERE id = NEW.banco_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El banco pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.tarjeta_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.tarjetas_credito WHERE id = NEW.tarjeta_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'La tarjeta pertenece a otro comercio';
      END IF;
    END IF;

    IF NEW.cheque_id IS NOT NULL THEN
      SELECT comercio_id INTO related_comercio_id FROM public.cheques WHERE id = NEW.cheque_id;
      IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
        RAISE EXCEPTION 'El cheque pertenece a otro comercio';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

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
    IF NEW.producto_id IS NULL THEN
      RETURN NEW;
    END IF;

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
    IF OLD.producto_id IS NOT NULL THEN
      UPDATE public.productos
      SET stock = stock + OLD.cantidad
      WHERE id = OLD.producto_id;
    END IF;

    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.producto_id IS NOT NULL AND OLD.producto_id = NEW.producto_id THEN
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
      IF OLD.producto_id IS NOT NULL THEN
        UPDATE public.productos
        SET stock = stock + OLD.cantidad
        WHERE id = OLD.producto_id;
      END IF;

      IF NEW.producto_id IS NOT NULL THEN
        UPDATE public.productos
        SET stock = stock - NEW.cantidad
        WHERE id = NEW.producto_id
          AND stock >= NEW.cantidad;

        GET DIAGNOSTICS affected_rows = ROW_COUNT;
        IF affected_rows = 0 THEN
          RAISE EXCEPTION 'Stock insuficiente para el producto seleccionado';
        END IF;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;
