-- Modulo de presupuestos. Los items se almacenan en tablas independientes para
-- que no ejecuten los triggers de stock de venta_items.

CREATE TABLE public.presupuestos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  numero_comprobante varchar NOT NULL,
  fecha_venta timestamp with time zone NOT NULL DEFAULT now(),
  tipo_pago public.tipo_pago NOT NULL DEFAULT 'contado',
  tipo_comprobante public.tipo_comprobante NOT NULL DEFAULT 'recibo_x',
  cliente_id uuid REFERENCES public.clientes(id),
  cliente_nombre varchar DEFAULT 'Consumidor Final',
  porcentaje_descuento numeric(10,2) NOT NULL DEFAULT 0,
  monto_descuento numeric(10,2) NOT NULL DEFAULT 0,
  porcentaje_recargo numeric(10,2) NOT NULL DEFAULT 0,
  monto_recargo numeric(10,2) NOT NULL DEFAULT 0,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  total_iva numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  observaciones text,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmado')),
  venta_id uuid REFERENCES public.ventas(id) ON DELETE SET NULL,
  confirmado_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (comercio_id, numero_comprobante)
);

CREATE TABLE public.presupuesto_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  presupuesto_id uuid NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  producto_id uuid REFERENCES public.productos(id),
  descripcion_manual text,
  codigo_manual text,
  cantidad integer NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  precio_unitario numeric(12,2) NOT NULL,
  porcentaje_iva numeric(5,2) NOT NULL DEFAULT 0,
  porcentaje_descuento numeric(10,2) NOT NULL DEFAULT 0,
  monto_descuento numeric(12,2) NOT NULL DEFAULT 0,
  porcentaje_recargo numeric(10,2) NOT NULL DEFAULT 0,
  monto_recargo numeric(12,2) NOT NULL DEFAULT 0,
  monto_iva numeric(12,2) NOT NULL DEFAULT 0,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT presupuesto_items_producto_o_descripcion_check CHECK (
    producto_id IS NOT NULL
    OR length(trim(coalesce(descripcion_manual, ''))) > 0
  )
);

CREATE TABLE public.presupuesto_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  presupuesto_id uuid NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  tipo_pago public.tipo_pago NOT NULL,
  monto numeric(12,2) NOT NULL DEFAULT 0,
  banco_id uuid REFERENCES public.bancos(id),
  tarjeta_id uuid REFERENCES public.tarjetas_credito(id),
  cuotas integer DEFAULT 1,
  recargo_cuotas numeric(12,2) DEFAULT 0,
  cheque_id uuid REFERENCES public.cheques(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_presupuestos_comercio ON public.presupuestos(comercio_id);
CREATE INDEX idx_presupuestos_fecha ON public.presupuestos(fecha_venta);
CREATE INDEX idx_presupuesto_items_presupuesto ON public.presupuesto_items(presupuesto_id);
CREATE INDEX idx_presupuesto_pagos_presupuesto ON public.presupuesto_pagos(presupuesto_id);

ALTER TABLE public.presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presupuesto_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presupuesto_pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY presupuestos_por_comercio ON public.presupuestos FOR ALL TO authenticated
USING (public.user_belongs_to_comercio(comercio_id))
WITH CHECK (public.user_belongs_to_comercio(comercio_id));
CREATE POLICY presupuesto_items_por_comercio ON public.presupuesto_items FOR ALL TO authenticated
USING (public.user_belongs_to_comercio(comercio_id))
WITH CHECK (public.user_belongs_to_comercio(comercio_id));
CREATE POLICY presupuesto_pagos_por_comercio ON public.presupuesto_pagos FOR ALL TO authenticated
USING (public.user_belongs_to_comercio(comercio_id))
WITH CHECK (public.user_belongs_to_comercio(comercio_id));

CREATE TRIGGER update_presupuestos_updated_at BEFORE UPDATE ON public.presupuestos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_presupuesto_items_updated_at BEFORE UPDATE ON public.presupuesto_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_presupuesto_pagos_updated_at BEFORE UPDATE ON public.presupuesto_pagos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.set_comercio_id_from_presupuesto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE parent_comercio_id uuid;
BEGIN
  SELECT comercio_id INTO parent_comercio_id
  FROM public.presupuestos WHERE id = NEW.presupuesto_id;
  IF parent_comercio_id IS NULL THEN
    RAISE EXCEPTION 'No se encontro el presupuesto asociado';
  END IF;
  NEW.comercio_id := parent_comercio_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_presupuestos_comercio_id BEFORE INSERT ON public.presupuestos
FOR EACH ROW EXECUTE FUNCTION public.set_comercio_id_from_context();
CREATE TRIGGER set_presupuesto_items_comercio_id BEFORE INSERT ON public.presupuesto_items
FOR EACH ROW EXECUTE FUNCTION public.set_comercio_id_from_presupuesto();
CREATE TRIGGER set_presupuesto_pagos_comercio_id BEFORE INSERT ON public.presupuesto_pagos
FOR EACH ROW EXECUTE FUNCTION public.set_comercio_id_from_presupuesto();

CREATE OR REPLACE FUNCTION public.validate_presupuesto_references()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE related_comercio_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'presupuestos' AND NEW.cliente_id IS NOT NULL THEN
    SELECT comercio_id INTO related_comercio_id FROM public.clientes WHERE id = NEW.cliente_id;
    IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'El cliente pertenece a otro comercio';
    END IF;
  ELSIF TG_TABLE_NAME = 'presupuesto_items' AND NEW.producto_id IS NOT NULL THEN
    SELECT comercio_id INTO related_comercio_id FROM public.productos WHERE id = NEW.producto_id;
    IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'El producto pertenece a otro comercio';
    END IF;
  ELSIF TG_TABLE_NAME = 'presupuesto_pagos' THEN
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

CREATE TRIGGER validate_presupuestos_references BEFORE INSERT OR UPDATE ON public.presupuestos
FOR EACH ROW EXECUTE FUNCTION public.validate_presupuesto_references();
CREATE TRIGGER validate_presupuesto_items_references BEFORE INSERT OR UPDATE ON public.presupuesto_items
FOR EACH ROW EXECUTE FUNCTION public.validate_presupuesto_references();
CREATE TRIGGER validate_presupuesto_pagos_references BEFORE INSERT OR UPDATE ON public.presupuesto_pagos
FOR EACH ROW EXECUTE FUNCTION public.validate_presupuesto_references();

CREATE OR REPLACE FUNCTION public.confirmar_presupuesto(p_presupuesto_id uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  p public.presupuestos%ROWTYPE;
  nueva_venta_id uuid;
  ultimo_numero integer;
  nuevo_comprobante text;
BEGIN
  SELECT * INTO p FROM public.presupuestos
  WHERE id = p_presupuesto_id FOR UPDATE;

  IF p.id IS NULL OR NOT public.user_belongs_to_comercio(p.comercio_id) THEN
    RAISE EXCEPTION 'Presupuesto no encontrado';
  END IF;
  IF p.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'El presupuesto ya fue confirmado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.presupuesto_items WHERE presupuesto_id = p.id) THEN
    RAISE EXCEPTION 'El presupuesto no tiene items';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.presupuesto_pagos WHERE presupuesto_id = p.id) THEN
    RAISE EXCEPTION 'El presupuesto no tiene medios de pago';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p.comercio_id::text || ':' || p.tipo_comprobante::text));
  SELECT COALESCE(MAX(NULLIF(split_part(numero_comprobante, '-', 2), '')::integer), 0)
  INTO ultimo_numero FROM public.ventas
  WHERE comercio_id = p.comercio_id
    AND tipo_comprobante = p.tipo_comprobante
    AND numero_comprobante ~ '^[0-9]+-[0-9]+$';
  nuevo_comprobante := '0001-' || lpad((ultimo_numero + 1)::text, 8, '0');

  INSERT INTO public.ventas (
    comercio_id, numero_comprobante, fecha_venta, tipo_pago, tipo_comprobante,
    cliente_id, cliente_nombre, porcentaje_descuento, monto_descuento,
    porcentaje_recargo, monto_recargo, subtotal, total_iva, total, observaciones
  ) VALUES (
    p.comercio_id, nuevo_comprobante, now(), p.tipo_pago, p.tipo_comprobante,
    p.cliente_id, p.cliente_nombre, p.porcentaje_descuento, p.monto_descuento,
    p.porcentaje_recargo, p.monto_recargo, p.subtotal, p.total_iva, p.total,
    concat_ws(E'\n', NULLIF(p.observaciones, ''), 'Generada desde presupuesto ' || p.numero_comprobante)
  ) RETURNING id INTO nueva_venta_id;

  INSERT INTO public.venta_items (
    venta_id, comercio_id, producto_id, descripcion_manual, codigo_manual, cantidad,
    precio_unitario, porcentaje_iva, porcentaje_descuento, monto_descuento,
    porcentaje_recargo, monto_recargo, monto_iva, subtotal, total
  ) SELECT
    nueva_venta_id, p.comercio_id, producto_id, descripcion_manual, codigo_manual, cantidad,
    precio_unitario, porcentaje_iva, porcentaje_descuento, monto_descuento,
    porcentaje_recargo, monto_recargo, monto_iva, subtotal, total
  FROM public.presupuesto_items WHERE presupuesto_id = p.id;

  INSERT INTO public.pagos_venta (
    venta_id, comercio_id, tipo_pago, monto, banco_id, tarjeta_id, cuotas,
    recargo_cuotas, cheque_id
  ) SELECT
    nueva_venta_id, p.comercio_id, tipo_pago, monto, banco_id, tarjeta_id, cuotas,
    recargo_cuotas, cheque_id
  FROM public.presupuesto_pagos WHERE presupuesto_id = p.id;

  IF p.cliente_id IS NOT NULL THEN
    INSERT INTO public.cuenta_corriente (
      comercio_id, cliente_id, tipo_movimiento, monto, concepto, venta_id, fecha_movimiento
    ) SELECT
      p.comercio_id, p.cliente_id, 'debito', pp.monto, 'pago_cuenta_corriente',
      nueva_venta_id, now()
    FROM public.presupuesto_pagos pp
    WHERE pp.presupuesto_id = p.id AND pp.tipo_pago = 'cta_cte';
  END IF;

  UPDATE public.presupuestos
  SET estado = 'confirmado', venta_id = nueva_venta_id, confirmado_at = now()
  WHERE id = p.id;

  RETURN nueva_venta_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_presupuesto(uuid) TO authenticated;

UPDATE public.comercio_parametrizacion
SET parametros = jsonb_set(parametros, '{modulos,presupuestos}', 'true'::jsonb, true),
    updated_at = now();
