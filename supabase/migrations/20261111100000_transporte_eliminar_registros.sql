-- Operación nueva. No elimina datos al aplicar esta migración.
BEGIN;
CREATE FUNCTION public.transporte_eliminar_registro(c uuid,seccion text,registro uuid,version_esperada integer) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tabla text; fila jsonb;
BEGIN
 IF public.transporte_admin(c) IS DISTINCT FROM true OR public.vortex_permiso(c,'transporte','editar') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'No tenés permiso para eliminar registros de Transporte' USING ERRCODE='42501';
 END IF;
 IF registro IS NULL OR seccion IS NULL OR seccion NOT IN ('unidades','choferes','tarifas','planes','servicios','mantenimientos') THEN
  RAISE EXCEPTION 'transporte_eliminacion_no_permitida';
 END IF;
 tabla:='transporte_'||seccion;
 -- La lista cerrada limita los identificadores; el tenant siempre se verifica aquí.
 EXECUTE format('SELECT to_jsonb(r) FROM public.%I r WHERE comercio_id=$1 AND id=$2 FOR UPDATE',tabla) INTO fila USING c,registro;
 IF fila IS NULL THEN RAISE EXCEPTION 'transporte_registro_no_disponible'; END IF;
 IF seccion='servicios' THEN
  IF (fila->>'version')::integer IS DISTINCT FROM version_esperada THEN RAISE EXCEPTION 'transporte_version_desactualizada'; END IF;
  IF fila->>'estado'<>'solicitado' OR fila->>'presupuesto_id' IS NOT NULL OR fila->>'venta_id' IS NOT NULL OR fila->>'km_salida' IS NOT NULL
   OR EXISTS(SELECT 1 FROM public.transporte_eventos WHERE comercio_id=c AND servicio_id=registro AND estado<>'solicitado')
   OR EXISTS(SELECT 1 FROM public.transporte_adjuntos WHERE comercio_id=c AND servicio_id=registro)
   OR EXISTS(SELECT 1 FROM public.transporte_lecturas WHERE comercio_id=c AND servicio_id=registro)
   OR EXISTS(SELECT 1 FROM public.transporte_gastos WHERE comercio_id=c AND servicio_id=registro) THEN
   RAISE EXCEPTION 'Solo se eliminan solicitudes sin actividad ni documentación vinculada';
  END IF;
  DELETE FROM public.transporte_eventos WHERE comercio_id=c AND servicio_id=registro;
 ELSIF seccion='unidades' THEN
  IF (SELECT count(*) FROM public.transporte_lecturas WHERE comercio_id=c AND unidad_id=registro)>1
   OR EXISTS(SELECT 1 FROM public.transporte_lecturas WHERE comercio_id=c AND unidad_id=registro AND (servicio_id IS NOT NULL OR motivo<>'Alta de unidad'))
   OR EXISTS(SELECT 1 FROM public.transporte_servicios WHERE comercio_id=c AND (unidad_id=registro OR equipo_id=registro))
   OR EXISTS(SELECT 1 FROM public.transporte_planes WHERE comercio_id=c AND unidad_id=registro)
   OR EXISTS(SELECT 1 FROM public.transporte_mantenimientos WHERE comercio_id=c AND unidad_id=registro)
   OR EXISTS(SELECT 1 FROM public.transporte_gastos WHERE comercio_id=c AND unidad_id=registro) THEN
   RAISE EXCEPTION 'La unidad tiene registros vinculados. Podés desactivarla desde Editar';
  END IF;
  DELETE FROM public.transporte_lecturas WHERE comercio_id=c AND unidad_id=registro AND servicio_id IS NULL AND motivo='Alta de unidad';
 ELSIF seccion='mantenimientos' AND (fila->>'estado'<>'programado' OR fila->>'gasto_id' IS NOT NULL) THEN
  RAISE EXCEPTION 'Solo se eliminan mantenimientos programados sin gasto vinculado';
 END IF;
 -- Las FK impiden eliminar catálogos utilizados, incluso con escrituras concurrentes.
 EXECUTE format('DELETE FROM public.%I WHERE comercio_id=$1 AND id=$2',tabla) USING c,registro;
 RETURN registro;
EXCEPTION WHEN foreign_key_violation THEN
 RAISE EXCEPTION 'El registro tiene vínculos y no se puede eliminar. Podés desactivarlo desde Editar';
END $$;
REVOKE ALL ON FUNCTION public.transporte_eliminar_registro(uuid,text,uuid,integer) FROM PUBLIC,anon,authenticated;

-- Reutiliza la RPC y sus validaciones de acceso centrales. Una eliminación
-- requiere Administrar módulo y Editar; nunca concede permisos por el frontend.
DO $$ DECLARE definicion text; BEGIN
 SELECT pg_get_functiondef('public.transporte_operar(uuid,text,uuid,integer,jsonb)'::regprocedure) INTO definicion;
 IF position('IF p_accion=''unidad'' THEN' IN definicion)=0 THEN RAISE EXCEPTION 'Revisar integración de transporte_operar'; END IF;
 definicion:=replace(definicion,'IF p_accion=''unidad'' THEN',
  'IF p_accion=''eliminar'' THEN RETURN public.transporte_eliminar_registro(c,d->>''seccion'',p_id,p_version); ELSIF p_accion=''unidad'' THEN');
 EXECUTE definicion;
END $$;
COMMIT;
