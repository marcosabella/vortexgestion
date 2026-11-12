-- Cambio estructural: cobro por km facturables con precio final por km.
-- NULL conserva las tarifas e importes fijos de los servicios existentes.
BEGIN;
ALTER TABLE public.transporte_servicios ADD COLUMN precio_km numeric(12,2)
  CHECK (precio_km IS NULL OR (precio_km>0 AND precio_km::text NOT IN ('NaN','Infinity','-Infinity')));
ALTER TABLE public.transporte_servicios ADD CONSTRAINT transporte_precio_km_coherente CHECK (
  precio_km IS NULL OR (precio_manual IS NULL AND tarifa_id IS NULL AND km_facturables>0 AND horas_espera=0)
);
DO $migration$
DECLARE
  definicion text;
  anterior text := 'IF s.precio_manual IS NULL AND t.id IS NULL THEN RAISE EXCEPTION ''transporte_indique_tarifa_o_precio_acordado''; END IF;';
  calculo text := 'importe:=round(coalesce(s.precio_manual,t.base+greatest(0,coalesce(s.km_facturables,0)-t.km_incluidos)*t.precio_km+coalesce(s.horas_espera,0)*t.precio_hora)+coalesce(s.adicionales,0),2);';
BEGIN
  SELECT pg_get_functiondef('public.transporte_operar(uuid,text,uuid,integer,jsonb)'::regprocedure) INTO definicion;
  IF position(anterior IN definicion)=0 OR position(calculo IN definicion)=0
    OR position('precio_manual=s.precio_manual,' IN definicion)=0 THEN
    RAISE EXCEPTION 'Revisar integración del cálculo por km de Transporte';
  END IF;
  definicion:=replace(definicion,anterior,$validation$
  IF s.precio_km IS NOT NULL THEN
    IF s.precio_km<=0 OR s.precio_km::text IN ('NaN','Infinity','-Infinity')
      OR coalesce(s.km_facturables,0)<=0 OR s.km_facturables::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'Ingresá un precio por km y kilómetros facturables mayores a cero.';
    END IF;
    IF s.precio_manual IS NOT NULL OR tar IS NOT NULL OR coalesce(s.horas_espera,0)<>0 THEN
      RAISE EXCEPTION 'El precio por km no se combina con importe fijo, tarifa ni horas de espera. Usá una tarifa si necesitás cobrar espera.';
    END IF;
    IF (d->>'precio_km')::numeric<>s.precio_km OR (d->>'km_facturables')::numeric<>s.km_facturables
      OR coalesce((d->>'adicionales')::numeric,0)<>coalesce(s.adicionales,0) THEN
      RAISE EXCEPTION 'Usá hasta dos decimales para importes y uno para kilómetros facturables.';
    END IF;
  ELSIF s.precio_manual IS NULL AND t.id IS NULL THEN
    RAISE EXCEPTION 'Indicá un precio por kilómetro, una tarifa o un importe total fijo.';
  END IF;
  $validation$);
  definicion:=replace(definicion,calculo,
    'importe:=round(coalesce(s.precio_km*s.km_facturables,s.precio_manual,t.base+greatest(0,coalesce(s.km_facturables,0)-t.km_incluidos)*t.precio_km+coalesce(s.horas_espera,0)*t.precio_hora)+coalesce(s.adicionales,0),2);');
  definicion:=replace(definicion,'precio_manual=s.precio_manual,','precio_manual=s.precio_manual,precio_km=s.precio_km,');
  EXECUTE definicion;
  -- Mantiene la privacidad de importes para operadores: to_jsonb(s) incluye la nueva columna.
  SELECT pg_get_functiondef('public.transporte_datos(uuid)'::regprocedure) INTO definicion;
  IF position('''precio_manual'',' IN definicion)=0 THEN
    RAISE EXCEPTION 'Revisar privacidad de precios de Transporte';
  END IF;
  definicion:=replace(definicion,'''precio_manual'',','''precio_manual'',''precio_km'',');
  EXECUTE definicion;
END $migration$;
COMMENT ON COLUMN public.transporte_servicios.precio_km IS 'Precio final por km, IVA incluido. Se multiplica por km_facturables; no utiliza el recorrido operativo. NULL conserva importe fijo o tarifa.';
COMMIT;
