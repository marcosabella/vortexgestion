-- Mensaje de validación previo al CHECK. Conserva la restricción y los datos.
BEGIN;
DO $$
DECLARE definicion text;
 ancla text:='IF previo.id IS NOT NULL AND previo.estado NOT IN (''solicitado'',''asignado'') AND';
BEGIN
 SELECT pg_get_functiondef('public.transporte_operar(uuid,text,uuid,integer,jsonb)'::regprocedure) INTO definicion;
 IF position(ancla IN definicion)=0 THEN RAISE EXCEPTION 'Revisar integración de validación de equipo de Transporte'; END IF;
 definicion:=replace(definicion,ancla,
  'IF uid IS NOT NULL AND uid=equipo THEN RAISE EXCEPTION ''La unidad principal y el equipo adicional deben ser distintos. Si no usás un acoplado, dejá Equipo / acoplado sin seleccionar.''; END IF; '||ancla);
 EXECUTE definicion;
END $$;
COMMIT;
