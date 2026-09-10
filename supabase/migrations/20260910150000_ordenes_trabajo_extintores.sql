CREATE TABLE public.ordenes_trabajo_extintores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  fecha_orden date NOT NULL DEFAULT current_date,
  estado text NOT NULL DEFAULT 'generada' CHECK (estado IN ('generada', 'en_proceso', 'cancelada', 'finalizada')),
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ordenes_trabajo_extintores_detalle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  orden_trabajo_id uuid NOT NULL REFERENCES public.ordenes_trabajo_extintores(id) ON DELETE CASCADE,
  extintor_id uuid NOT NULL REFERENCES public.extintores(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(orden_trabajo_id, extintor_id)
);

CREATE TABLE public.ordenes_trabajo_extintores_productos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  orden_trabajo_id uuid NOT NULL REFERENCES public.ordenes_trabajo_extintores(id) ON DELETE CASCADE,
  producto_id uuid REFERENCES public.productos(id) ON DELETE SET NULL,
  cantidad numeric(12,2) NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  descripcion text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ordenes_trabajo_extintores_comercio_fecha ON public.ordenes_trabajo_extintores(comercio_id, fecha_orden DESC);
CREATE INDEX idx_ordenes_trabajo_extintores_comercio_cliente ON public.ordenes_trabajo_extintores(comercio_id, cliente_id);
CREATE INDEX idx_ordenes_trabajo_extintores_detalle_orden ON public.ordenes_trabajo_extintores_detalle(orden_trabajo_id);
CREATE INDEX idx_ordenes_trabajo_extintores_productos_orden ON public.ordenes_trabajo_extintores_productos(orden_trabajo_id);

CREATE OR REPLACE FUNCTION public.validar_orden_trabajo_extintor_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  orden_comercio uuid;
  orden_cliente uuid;
BEGIN
  SELECT comercio_id, cliente_id INTO orden_comercio, orden_cliente
  FROM public.ordenes_trabajo_extintores WHERE id = NEW.orden_trabajo_id;

  IF orden_comercio IS NULL OR orden_comercio <> NEW.comercio_id THEN
    RAISE EXCEPTION 'La orden de trabajo debe pertenecer al mismo comercio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.extintores WHERE id = NEW.extintor_id AND comercio_id = NEW.comercio_id AND cliente_id = orden_cliente) THEN
    RAISE EXCEPTION 'El extintor debe pertenecer al cliente de la orden';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validar_orden_trabajo_extintor_tenant_trigger
BEFORE INSERT OR UPDATE ON public.ordenes_trabajo_extintores_detalle
FOR EACH ROW EXECUTE FUNCTION public.validar_orden_trabajo_extintor_tenant();

CREATE OR REPLACE FUNCTION public.validar_orden_trabajo_producto_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE orden_comercio uuid;
BEGIN
  SELECT comercio_id INTO orden_comercio FROM public.ordenes_trabajo_extintores WHERE id = NEW.orden_trabajo_id;
  IF orden_comercio IS NULL OR orden_comercio <> NEW.comercio_id THEN RAISE EXCEPTION 'La orden de trabajo debe pertenecer al mismo comercio'; END IF;
  IF NEW.producto_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.productos WHERE id = NEW.producto_id AND comercio_id = NEW.comercio_id) THEN RAISE EXCEPTION 'El producto debe pertenecer al mismo comercio'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validar_orden_trabajo_producto_tenant_trigger
BEFORE INSERT OR UPDATE ON public.ordenes_trabajo_extintores_productos
FOR EACH ROW EXECUTE FUNCTION public.validar_orden_trabajo_producto_tenant();

CREATE TRIGGER update_ordenes_trabajo_extintores_updated_at
BEFORE UPDATE ON public.ordenes_trabajo_extintores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ordenes_trabajo_extintores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_trabajo_extintores_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_trabajo_extintores_productos ENABLE ROW LEVEL SECURITY;

CREATE POLICY ordenes_trabajo_extintores_tenant ON public.ordenes_trabajo_extintores
FOR ALL TO authenticated USING (public.user_belongs_to_comercio(comercio_id)) WITH CHECK (public.user_belongs_to_comercio(comercio_id));
CREATE POLICY ordenes_trabajo_extintores_detalle_tenant ON public.ordenes_trabajo_extintores_detalle
FOR ALL TO authenticated USING (public.user_belongs_to_comercio(comercio_id)) WITH CHECK (public.user_belongs_to_comercio(comercio_id));
CREATE POLICY ordenes_trabajo_extintores_productos_tenant ON public.ordenes_trabajo_extintores_productos
FOR ALL TO authenticated USING (public.user_belongs_to_comercio(comercio_id)) WITH CHECK (public.user_belongs_to_comercio(comercio_id));
