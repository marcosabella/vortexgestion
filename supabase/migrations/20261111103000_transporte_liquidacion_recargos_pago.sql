-- Conserva las validaciones transaccionales de Ventas y contempla el recargo
-- de financiación elegido con el mismo gestor de pagos de Gestión.
BEGIN;
DO $$
DECLARE definicion text;
 ancla text:='IF v.id IS NULL OR v.total IS DISTINCT FROM total_grupo THEN';
BEGIN
 SELECT pg_get_functiondef('public.transporte_operar(uuid,text,uuid,integer,jsonb)'::regprocedure) INTO definicion;
 IF position(ancla IN definicion)=0 THEN RAISE EXCEPTION 'Revisar integración de recargos de liquidación de Transporte'; END IF;
 definicion:=replace(definicion,ancla,
  'IF d->>''modalidad''=''contado'' THEN SELECT total_grupo+coalesce(sum(coalesce((tr_pago.value->>''recargo_cuotas'')::numeric,0)),0) INTO total_grupo FROM jsonb_array_elements(d->''pagos'') AS tr_pago(value); END IF; '||ancla);
 EXECUTE definicion;
END $$;
COMMIT;
