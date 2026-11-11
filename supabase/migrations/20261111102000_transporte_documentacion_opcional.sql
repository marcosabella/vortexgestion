-- Habilita liquidación directa sin presupuesto ni documentación obligatorios.
-- Conserva la revisión explícita por autorización, observación o rechazo.
-- No modifica presentaciones ni otros datos de servicios existentes.
BEGIN;
DO $$
DECLARE definicion text;
 ancla text:='(estado<>''finalizado'' OR presentacion<>''listo'' OR total<=0)';
BEGIN
 SELECT pg_get_functiondef('public.transporte_operar(uuid,text,uuid,integer,jsonb)'::regprocedure) INTO definicion;
 IF position(ancla IN definicion)=0 THEN RAISE EXCEPTION 'Revisar integración de liquidación directa de Transporte'; END IF;
 definicion:=replace(definicion,ancla,'(estado<>''finalizado'' OR presentacion NOT IN (''listo'',''pendiente_documentacion'') OR total<=0)');
 definicion:=replace(definicion,'transporte_finalice_y_complete_la_presentacion','Finalizá el servicio y revisá que no tenga autorización pendiente, observaciones o rechazo. La documentación es opcional.');
 EXECUTE definicion;
END $$;
COMMIT;
