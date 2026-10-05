BEGIN;
SET LOCAL lock_timeout='10s';
-- Reparación limitada al dato descriptivo de presupuestos vinculados a Taller.
-- El bloqueo impide escrituras concurrentes durante la pausa del trigger.
LOCK TABLE public.presupuestos IN ACCESS EXCLUSIVE MODE;
ALTER TABLE public.presupuestos DISABLE TRIGGER taller_presupuesto_protegido;
UPDATE public.presupuestos p SET taller_vehiculo=jsonb_build_object(
  'patente',v.patente,'marca',v.marca,'modelo',v.modelo,'anio',v.anio,'kilometraje',o.kilometraje)
FROM public.taller_ordenes o JOIN public.taller_vehiculos v ON v.id=o.vehiculo_id AND v.comercio_id=o.comercio_id
WHERE p.id=o.presupuesto_id AND p.comercio_id=o.comercio_id AND p.taller_vehiculo IS NULL;
ALTER TABLE public.presupuestos ENABLE TRIGGER taller_presupuesto_protegido;
COMMIT;
