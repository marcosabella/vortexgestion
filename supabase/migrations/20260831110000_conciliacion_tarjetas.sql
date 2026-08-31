-- Congela el costo de tarjeta en cada pago y permite conciliarlo con la acreditacion real.
ALTER TABLE public.pagos_venta
  ADD COLUMN IF NOT EXISTS porcentaje_comision_aplicado NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_comision_estimado NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_neto_estimado NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_comision_real NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS monto_neto_acreditado NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS fecha_acreditacion DATE,
  ADD COLUMN IF NOT EXISTS referencia_liquidacion TEXT,
  ADD COLUMN IF NOT EXISTS observaciones_conciliacion TEXT,
  ADD COLUMN IF NOT EXISTS estado_conciliacion TEXT NOT NULL DEFAULT 'no_aplica';

ALTER TABLE public.pagos_venta
  DROP CONSTRAINT IF EXISTS pagos_venta_estado_conciliacion_check;

ALTER TABLE public.pagos_venta
  ADD CONSTRAINT pagos_venta_estado_conciliacion_check
  CHECK (estado_conciliacion IN ('no_aplica', 'pendiente', 'conciliada', 'con_diferencia', 'anulada'));

CREATE OR REPLACE FUNCTION public.calcular_snapshot_comision_tarjeta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_porcentaje NUMERIC(5,2) := 0;
BEGIN
  IF NEW.tipo_pago::text = 'tarjeta' AND NEW.tarjeta_id IS NOT NULL THEN
    SELECT COALESCE(t.porcentaje_comision, 0)
      INTO v_porcentaje
      FROM public.tarjetas_credito t
     WHERE t.id = NEW.tarjeta_id;

    NEW.porcentaje_comision_aplicado := COALESCE(v_porcentaje, 0);
    NEW.monto_comision_estimado := ROUND(COALESCE(NEW.monto, 0) * NEW.porcentaje_comision_aplicado / 100, 2);
    NEW.monto_neto_estimado := ROUND(COALESCE(NEW.monto, 0) - NEW.monto_comision_estimado, 2);
    NEW.estado_conciliacion := 'pendiente';
  ELSE
    NEW.porcentaje_comision_aplicado := 0;
    NEW.monto_comision_estimado := 0;
    NEW.monto_neto_estimado := COALESCE(NEW.monto, 0);
    NEW.estado_conciliacion := 'no_aplica';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshot_comision_tarjeta_pago ON public.pagos_venta;
CREATE TRIGGER snapshot_comision_tarjeta_pago
BEFORE INSERT ON public.pagos_venta
FOR EACH ROW
EXECUTE FUNCTION public.calcular_snapshot_comision_tarjeta();

-- Una venta con CAE conserva inmutables todos sus datos fiscales, pero la
-- conciliacion bancaria ocurre despues y debe poder completar solo sus campos administrativos.
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
    IF TG_TABLE_NAME = 'pagos_venta'
       AND TG_OP = 'UPDATE'
       AND OLD.id IS NOT DISTINCT FROM NEW.id
       AND OLD.venta_id IS NOT DISTINCT FROM NEW.venta_id
       AND OLD.comercio_id IS NOT DISTINCT FROM NEW.comercio_id
       AND OLD.tipo_pago IS NOT DISTINCT FROM NEW.tipo_pago
       AND OLD.monto IS NOT DISTINCT FROM NEW.monto
       AND OLD.banco_id IS NOT DISTINCT FROM NEW.banco_id
       AND OLD.tarjeta_id IS NOT DISTINCT FROM NEW.tarjeta_id
       AND OLD.cuotas IS NOT DISTINCT FROM NEW.cuotas
       AND OLD.recargo_cuotas IS NOT DISTINCT FROM NEW.recargo_cuotas
       AND OLD.cheque_id IS NOT DISTINCT FROM NEW.cheque_id
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'La venta tiene CAE y sus datos relacionados no pueden modificarse';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- Las operaciones existentes se inicializan con la configuracion vigente al migrar.
-- Desde este punto el porcentaje queda congelado en cada pago.
UPDATE public.pagos_venta pv
SET porcentaje_comision_aplicado = COALESCE(t.porcentaje_comision, 0),
    monto_comision_estimado = ROUND(COALESCE(pv.monto, 0) * COALESCE(t.porcentaje_comision, 0) / 100, 2),
    monto_neto_estimado = ROUND(COALESCE(pv.monto, 0) - (COALESCE(pv.monto, 0) * COALESCE(t.porcentaje_comision, 0) / 100), 2),
    estado_conciliacion = 'pendiente'
FROM public.tarjetas_credito t
WHERE pv.tipo_pago::text = 'tarjeta'
  AND pv.tarjeta_id = t.id;

UPDATE public.pagos_venta
SET monto_neto_estimado = COALESCE(monto, 0),
    estado_conciliacion = 'no_aplica'
WHERE tipo_pago::text <> 'tarjeta';

CREATE INDEX IF NOT EXISTS idx_pagos_venta_conciliacion
  ON public.pagos_venta(comercio_id, estado_conciliacion, fecha_acreditacion);

COMMENT ON COLUMN public.pagos_venta.porcentaje_comision_aplicado IS
  'Copia historica del porcentaje vigente al registrar el pago; no se recalcula si cambia la tarjeta.';
