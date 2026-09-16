-- Relaciona los egresos creados antes de que existiera gasto_egreso_id.
-- Sólo se vinculan coincidencias uno a uno para no asociar movimientos ambiguos.
WITH coincidencias AS (
  SELECT
    gasto.id AS gasto_id,
    movimiento.id AS movimiento_id,
    count(*) OVER (PARTITION BY gasto.id) AS coincidencias_por_gasto,
    count(*) OVER (PARTITION BY movimiento.id) AS coincidencias_por_movimiento
  FROM public.gastos_egresos AS gasto
  JOIN public.caja_movimientos AS movimiento
    ON movimiento.gasto_egreso_id IS NULL
    AND movimiento.caja_id = gasto.caja_id
    AND movimiento.tipo = 'egreso'
    AND movimiento.concepto = gasto.concepto
    AND movimiento.descripcion = COALESCE(gasto.descripcion, 'Gasto: ' || gasto.categoria)
    AND movimiento.monto = gasto.monto
  WHERE gasto.estado = 'pagado' AND gasto.medio_pago = 'efectivo'
)
UPDATE public.caja_movimientos AS movimiento
SET gasto_egreso_id = coincidencias.gasto_id
FROM coincidencias
WHERE movimiento.id = coincidencias.movimiento_id
  AND coincidencias.coincidencias_por_gasto = 1
  AND coincidencias.coincidencias_por_movimiento = 1;

CREATE OR REPLACE FUNCTION public.sincronizar_egreso_gasto_en_caja()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caja_abierta boolean;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.estado = 'pagado' AND OLD.medio_pago = 'efectivo' THEN
    SELECT estado = 'abierta' INTO caja_abierta FROM public.cajas_diarias WHERE id = OLD.caja_id;
    IF NOT COALESCE(caja_abierta, false) THEN
      RAISE EXCEPTION 'No se puede modificar o eliminar un gasto en efectivo vinculado a una caja cerrada';
    END IF;

    DELETE FROM public.caja_movimientos WHERE gasto_egreso_id = OLD.id;
    IF NOT FOUND THEN
      -- Compatibilidad para una coincidencia histórica que no pudo vincularse automáticamente.
      DELETE FROM public.caja_movimientos
      WHERE id = (
        SELECT id FROM public.caja_movimientos
        WHERE gasto_egreso_id IS NULL
          AND caja_id = OLD.caja_id
          AND tipo = 'egreso'
          AND concepto = OLD.concepto
          AND descripcion = COALESCE(OLD.descripcion, 'Gasto: ' || OLD.categoria)
          AND monto = OLD.monto
        ORDER BY created_at DESC
        LIMIT 1
      );
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.estado = 'pagado' AND NEW.medio_pago = 'efectivo' THEN
    SELECT estado = 'abierta' INTO caja_abierta FROM public.cajas_diarias WHERE id = NEW.caja_id;
    IF NOT COALESCE(caja_abierta, false) THEN
      RAISE EXCEPTION 'El gasto en efectivo requiere una caja abierta';
    END IF;
    INSERT INTO public.caja_movimientos (caja_id, tipo, concepto, descripcion, monto, gasto_egreso_id)
    VALUES (NEW.caja_id, 'egreso', NEW.concepto, COALESCE(NEW.descripcion, 'Gasto: ' || NEW.categoria), NEW.monto, NEW.id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
