-- Reparacion de metadatos, separada del cambio estructural. Conserva todos
-- los comprobantes, importes, pagos y vinculos existentes.
BEGIN;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT o.id,o.presupuesto_id
    FROM public.taller_ordenes o JOIN public.presupuestos p ON p.id=o.presupuesto_id AND p.comercio_id=o.comercio_id
    WHERE p.estado='confirmado' AND p.venta_id=o.venta_id AND NOT p.origen_taller_automatico
      AND EXISTS (
        SELECT 1 FROM public.taller_orden_eventos g JOIN public.taller_orden_eventos v
          ON v.orden_id=g.orden_id AND v.comercio_id=g.comercio_id AND v.created_at=g.created_at
        WHERE g.orden_id=o.id AND g.comercio_id=o.comercio_id AND g.detalle='Presupuesto integrado generado'
          AND g.estado_anterior IN ('listo','entregado') AND g.estado_nuevo=g.estado_anterior
          AND v.detalle='Venta vinculada: '||o.venta_id AND p.created_at=g.created_at
      )
    FOR UPDATE OF o,p
  LOOP
    -- Desvinculacion transitoria bajo bloqueo para clasificar el documento
    -- conservando activos los triggers que protegen los presupuestos.
    UPDATE public.taller_ordenes SET presupuesto_id=NULL WHERE id=r.id;
    UPDATE public.presupuestos SET origen_taller_automatico=true WHERE id=r.presupuesto_id;
    UPDATE public.taller_ordenes SET presupuesto_id=r.presupuesto_id WHERE id=r.id;
  END LOOP;
END $$;
COMMIT;
