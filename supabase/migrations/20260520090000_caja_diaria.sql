CREATE TABLE IF NOT EXISTS public.cajas_diarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid REFERENCES public.comercio(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  estado text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  monto_apertura numeric(12,2) NOT NULL DEFAULT 0,
  monto_cierre_sistema numeric(12,2),
  monto_cierre_real numeric(12,2),
  diferencia numeric(12,2),
  abierto_at timestamp with time zone NOT NULL DEFAULT now(),
  cerrado_at timestamp with time zone,
  observaciones_apertura text,
  observaciones_cierre text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cajas_diarias_comercio_fecha
ON public.cajas_diarias(comercio_id, fecha)
WHERE comercio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cajas_diarias_fecha ON public.cajas_diarias(fecha);
CREATE INDEX IF NOT EXISTS idx_cajas_diarias_estado ON public.cajas_diarias(estado);
CREATE INDEX IF NOT EXISTS idx_cajas_diarias_comercio_id ON public.cajas_diarias(comercio_id);

CREATE TABLE IF NOT EXISTS public.caja_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid REFERENCES public.comercio(id) ON DELETE CASCADE,
  caja_id uuid NOT NULL REFERENCES public.cajas_diarias(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  concepto text NOT NULL,
  descripcion text,
  monto numeric(12,2) NOT NULL CHECK (monto > 0),
  fecha_movimiento timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caja_movimientos_caja_id ON public.caja_movimientos(caja_id);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_fecha ON public.caja_movimientos(fecha_movimiento);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_comercio_id ON public.caja_movimientos(comercio_id);

ALTER TABLE public.cajas_diarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caja_movimientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cajas_diarias_select_por_comercio ON public.cajas_diarias;
DROP POLICY IF EXISTS cajas_diarias_insert_por_comercio ON public.cajas_diarias;
DROP POLICY IF EXISTS cajas_diarias_update_por_comercio ON public.cajas_diarias;
DROP POLICY IF EXISTS cajas_diarias_delete_por_comercio ON public.cajas_diarias;

CREATE POLICY cajas_diarias_select_por_comercio
ON public.cajas_diarias
FOR SELECT
TO authenticated
USING (public.user_belongs_to_comercio(comercio_id));

CREATE POLICY cajas_diarias_insert_por_comercio
ON public.cajas_diarias
FOR INSERT
TO authenticated
WITH CHECK (public.user_belongs_to_comercio(comercio_id));

CREATE POLICY cajas_diarias_update_por_comercio
ON public.cajas_diarias
FOR UPDATE
TO authenticated
USING (public.user_belongs_to_comercio(comercio_id))
WITH CHECK (public.user_belongs_to_comercio(comercio_id));

CREATE POLICY cajas_diarias_delete_por_comercio
ON public.cajas_diarias
FOR DELETE
TO authenticated
USING (public.user_belongs_to_comercio(comercio_id));

DROP POLICY IF EXISTS caja_movimientos_select_por_comercio ON public.caja_movimientos;
DROP POLICY IF EXISTS caja_movimientos_insert_por_comercio ON public.caja_movimientos;
DROP POLICY IF EXISTS caja_movimientos_update_por_comercio ON public.caja_movimientos;
DROP POLICY IF EXISTS caja_movimientos_delete_por_comercio ON public.caja_movimientos;

CREATE POLICY caja_movimientos_select_por_comercio
ON public.caja_movimientos
FOR SELECT
TO authenticated
USING (public.user_belongs_to_comercio(comercio_id));

CREATE POLICY caja_movimientos_insert_por_comercio
ON public.caja_movimientos
FOR INSERT
TO authenticated
WITH CHECK (public.user_belongs_to_comercio(comercio_id));

CREATE POLICY caja_movimientos_update_por_comercio
ON public.caja_movimientos
FOR UPDATE
TO authenticated
USING (public.user_belongs_to_comercio(comercio_id))
WITH CHECK (public.user_belongs_to_comercio(comercio_id));

CREATE POLICY caja_movimientos_delete_por_comercio
ON public.caja_movimientos
FOR DELETE
TO authenticated
USING (public.user_belongs_to_comercio(comercio_id));

DROP TRIGGER IF EXISTS update_cajas_diarias_updated_at ON public.cajas_diarias;
CREATE TRIGGER update_cajas_diarias_updated_at
BEFORE UPDATE ON public.cajas_diarias
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_caja_movimientos_updated_at ON public.caja_movimientos;
CREATE TRIGGER update_caja_movimientos_updated_at
BEFORE UPDATE ON public.caja_movimientos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_cajas_diarias_comercio_id ON public.cajas_diarias;
CREATE TRIGGER set_cajas_diarias_comercio_id
BEFORE INSERT ON public.cajas_diarias
FOR EACH ROW
EXECUTE FUNCTION public.set_comercio_id_from_context();

CREATE OR REPLACE FUNCTION public.set_comercio_id_from_caja()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_comercio_id uuid;
BEGIN
  SELECT comercio_id
  INTO parent_comercio_id
  FROM public.cajas_diarias
  WHERE id = NEW.caja_id;

  IF parent_comercio_id IS NULL THEN
    RAISE EXCEPTION 'No se encontro la caja asociada';
  END IF;

  IF NEW.comercio_id IS NOT NULL AND NEW.comercio_id <> parent_comercio_id THEN
    RAISE EXCEPTION 'El movimiento no pertenece al mismo comercio que la caja';
  END IF;

  NEW.comercio_id := parent_comercio_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_caja_movimientos_comercio_id ON public.caja_movimientos;
CREATE TRIGGER set_caja_movimientos_comercio_id
BEFORE INSERT ON public.caja_movimientos
FOR EACH ROW
EXECUTE FUNCTION public.set_comercio_id_from_caja();
