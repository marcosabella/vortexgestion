-- Permitir cargar productos sin proveedor, marca, rubro ni subrubro.

ALTER TABLE public.productos
  ALTER COLUMN proveedor_id DROP NOT NULL,
  ALTER COLUMN marca_id DROP NOT NULL,
  ALTER COLUMN rubro_id DROP NOT NULL,
  ALTER COLUMN subrubro_id DROP NOT NULL;

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
    SELECT comercio_id INTO related_comercio_id FROM public.productos WHERE id = NEW.producto_id;
    IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'El producto pertenece a otro comercio';
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
