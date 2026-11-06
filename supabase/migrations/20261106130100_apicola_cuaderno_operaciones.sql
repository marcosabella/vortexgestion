-- Operaciones transaccionales del cuaderno. Sin modificaciones de datos existentes.
BEGIN;
CREATE FUNCTION public.apicola_guardar(p_comercio uuid,p_entidad text,d jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tabla text; anterior jsonb; resultado jsonb; ident uuid; campana public.apicola_campanas;
 apiario public.apicola_apiarios; colonia public.apicola_colmenas; registro public.apicola_registros;
 ids uuid[]; stock integer; confirmado boolean; v_fecha date; v_tipo text; v_datos jsonb; n integer;
BEGIN
 tabla:=CASE p_entidad WHEN 'campana' THEN 'apicola_campanas' WHEN 'apiario' THEN 'apicola_apiarios'
   WHEN 'colmena' THEN 'apicola_colmenas' WHEN 'registro' THEN 'apicola_registros' WHEN 'tarea' THEN 'apicola_tareas' END;
 IF tabla IS NULL THEN RAISE EXCEPTION 'Entidad apícola no válida'; END IF;
 IF p_entidad IN ('campana','apiario','colmena') AND NOT public.apicola_permiso(p_comercio,'admin') THEN RAISE EXCEPTION 'Solo administración puede modificar este catálogo' USING ERRCODE='42501'; END IF;
 ident:=nullif(d->>'id','')::uuid;
 IF ident IS NOT NULL THEN
   EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE comercio_id=$1 AND id=$2 FOR UPDATE',tabla) INTO anterior USING p_comercio,ident;
   IF anterior IS NULL THEN RAISE EXCEPTION 'Registro no disponible en este comercio'; END IF;
   IF (d->>'version')::integer IS DISTINCT FROM (anterior->>'version')::integer THEN RAISE EXCEPTION 'El registro cambió. Actualizá la pantalla antes de guardar' USING ERRCODE='40001'; END IF;
 END IF;
 ident:=coalesce(ident,gen_random_uuid());
 IF p_entidad='campana' THEN
   INSERT INTO public.apicola_campanas(id,comercio_id,nombre,fecha_inicio,fecha_fin,estado,observaciones,creado_por)
   VALUES(ident,p_comercio,btrim(d->>'nombre'),(d->>'fecha_inicio')::date,(d->>'fecha_fin')::date,coalesce(d->>'estado','abierta'),coalesce(d->>'observaciones',''),auth.uid())
   ON CONFLICT(id) DO UPDATE SET nombre=EXCLUDED.nombre,fecha_inicio=EXCLUDED.fecha_inicio,fecha_fin=EXCLUDED.fecha_fin,estado=EXCLUDED.estado,observaciones=EXCLUDED.observaciones,version=apicola_campanas.version+1,updated_at=now();
   -- No acortar una campaña dejando registros fuera de su período.
   IF EXISTS(SELECT 1 FROM public.apicola_registros r JOIN public.apicola_campanas c ON c.id=r.campana_id WHERE c.id=ident AND r.fecha NOT BETWEEN c.fecha_inicio AND c.fecha_fin)
     OR EXISTS(SELECT 1 FROM public.apicola_movimientos m JOIN public.apicola_campanas c ON c.id=m.campana_id WHERE c.id=ident AND m.fecha NOT BETWEEN c.fecha_inicio AND c.fecha_fin) THEN RAISE EXCEPTION 'El período deja registros existentes fuera de la campaña'; END IF;
 ELSIF p_entidad='apiario' THEN
   IF coalesce((d->>'activo')::boolean,true)=false AND (EXISTS(SELECT 1 FROM public.apicola_existencias WHERE comercio_id=p_comercio AND apiario_id=ident AND cantidad>0) OR EXISTS(SELECT 1 FROM public.apicola_tareas WHERE comercio_id=p_comercio AND apiario_id=ident AND estado='pendiente') OR EXISTS(SELECT 1 FROM public.apicola_registros WHERE comercio_id=p_comercio AND apiario_id=ident AND estado='pendiente')) THEN RAISE EXCEPTION 'El apiario tiene existencias o pendientes; resolvelos antes de desactivarlo'; END IF;
   INSERT INTO public.apicola_apiarios(id,comercio_id,codigo,nombre,establecimiento,localidad,provincia,direccion,latitud,longitud,contacto,telefono,uso,acuerdo,fecha_instalacion,fecha_retiro,floraciones,agua_acceso,observaciones,activo,creado_por)
   VALUES(ident,p_comercio,upper(btrim(d->>'codigo')),btrim(d->>'nombre'),coalesce(d->>'establecimiento',''),coalesce(d->>'localidad',''),coalesce(d->>'provincia',''),coalesce(d->>'direccion',''),nullif(d->>'latitud','')::numeric,nullif(d->>'longitud','')::numeric,coalesce(d->>'contacto',''),coalesce(d->>'telefono',''),coalesce(d->>'uso','propio'),coalesce(d->>'acuerdo',''),nullif(d->>'fecha_instalacion','')::date,nullif(d->>'fecha_retiro','')::date,coalesce(d->>'floraciones',''),coalesce(d->>'agua_acceso',''),coalesce(d->>'observaciones',''),coalesce((d->>'activo')::boolean,true),auth.uid())
   ON CONFLICT(id) DO UPDATE SET codigo=EXCLUDED.codigo,nombre=EXCLUDED.nombre,establecimiento=EXCLUDED.establecimiento,localidad=EXCLUDED.localidad,provincia=EXCLUDED.provincia,direccion=EXCLUDED.direccion,latitud=EXCLUDED.latitud,longitud=EXCLUDED.longitud,contacto=EXCLUDED.contacto,telefono=EXCLUDED.telefono,uso=EXCLUDED.uso,acuerdo=EXCLUDED.acuerdo,fecha_instalacion=EXCLUDED.fecha_instalacion,fecha_retiro=EXCLUDED.fecha_retiro,floraciones=EXCLUDED.floraciones,agua_acceso=EXCLUDED.agua_acceso,observaciones=EXCLUDED.observaciones,activo=EXCLUDED.activo,version=apicola_apiarios.version+1,updated_at=now();
 ELSIF p_entidad='colmena' THEN
   SELECT * INTO apiario FROM public.apicola_apiarios WHERE comercio_id=p_comercio AND id=(d->>'apiario_id')::uuid AND activo;
   IF NOT FOUND THEN RAISE EXCEPTION 'Apiario no disponible en este comercio'; END IF;
   IF anterior IS NOT NULL AND (anterior->>'apiario_id')::uuid<>apiario.id THEN RAISE EXCEPTION 'Para cambiar de apiario registrá un traslado'; END IF;
   SELECT coalesce(sum(cantidad),0) INTO stock FROM public.apicola_existencias WHERE comercio_id=p_comercio AND apiario_id=apiario.id AND recurso='colonias';
   IF anterior IS NULL AND stock<=(SELECT count(*) FROM public.apicola_colmenas WHERE comercio_id=p_comercio AND apiario_id=apiario.id AND estado IN ('activa','nucleo','huerfana')) THEN RAISE EXCEPTION 'No quedan colonias sin identificar. Registrá primero un alta de existencias'; END IF;
   INSERT INTO public.apicola_colmenas(id,comercio_id,apiario_id,codigo,origen,fecha_alta,material_codigo,reina_identificacion,reina_origen,reina_anio,reina_marca,observaciones,creado_por)
   VALUES(ident,p_comercio,apiario.id,upper(btrim(d->>'codigo')),coalesce(d->>'origen','existente'),coalesce(nullif(d->>'fecha_alta','')::date,current_date),coalesce(d->>'material_codigo',''),coalesce(d->>'reina_identificacion',''),coalesce(d->>'reina_origen',''),nullif(d->>'reina_anio','')::integer,coalesce(d->>'reina_marca',''),coalesce(d->>'observaciones',''),auth.uid())
   ON CONFLICT(id) DO UPDATE SET codigo=EXCLUDED.codigo,origen=EXCLUDED.origen,fecha_alta=EXCLUDED.fecha_alta,material_codigo=EXCLUDED.material_codigo,reina_identificacion=EXCLUDED.reina_identificacion,reina_origen=EXCLUDED.reina_origen,reina_anio=EXCLUDED.reina_anio,reina_marca=EXCLUDED.reina_marca,observaciones=EXCLUDED.observaciones,version=apicola_colmenas.version+1,updated_at=now();
 ELSIF p_entidad IN ('registro','tarea') THEN
   SELECT * INTO campana FROM public.apicola_campanas WHERE comercio_id=p_comercio AND id=(d->>'campana_id')::uuid;
   IF NOT FOUND THEN RAISE EXCEPTION 'Campaña no disponible en este comercio'; END IF;
   SELECT * INTO apiario FROM public.apicola_apiarios WHERE comercio_id=p_comercio AND id=(d->>'apiario_id')::uuid AND activo;
   IF NOT FOUND THEN RAISE EXCEPTION 'Apiario no disponible en este comercio'; END IF;
   IF anterior IS NOT NULL AND NOT public.apicola_permiso(p_comercio,'admin') AND (anterior->>'creado_por')::uuid<>auth.uid() THEN RAISE EXCEPTION 'Solo podés editar tus propios pendientes' USING ERRCODE='42501'; END IF;
   IF p_entidad='tarea' THEN
     IF anterior->>'registro_id' IS NOT NULL AND ((d->>'apiario_id')::uuid IS DISTINCT FROM (anterior->>'apiario_id')::uuid OR (d->>'campana_id')::uuid IS DISTINCT FROM (anterior->>'campana_id')::uuid) THEN RAISE EXCEPTION 'La tarea debe conservar el apiario y campaña del registro'; END IF;
     INSERT INTO public.apicola_tareas(id,comercio_id,campana_id,apiario_id,fecha,descripcion,responsable,prioridad,estado,creado_por)
     VALUES(ident,p_comercio,campana.id,apiario.id,(d->>'fecha')::date,btrim(d->>'descripcion'),btrim(d->>'responsable'),coalesce(d->>'prioridad','normal'),coalesce(d->>'estado','pendiente'),auth.uid())
     ON CONFLICT(id) DO UPDATE SET campana_id=EXCLUDED.campana_id,apiario_id=EXCLUDED.apiario_id,fecha=EXCLUDED.fecha,descripcion=EXCLUDED.descripcion,responsable=EXCLUDED.responsable,prioridad=EXCLUDED.prioridad,estado=EXCLUDED.estado,version=apicola_tareas.version+1,updated_at=now();
   ELSE
     IF campana.estado<>'abierta' THEN RAISE EXCEPTION 'La campaña está cerrada'; END IF;
     v_fecha:=(d->>'fecha')::date;v_tipo:=d->>'tipo';v_datos:=coalesce(d->'datos','{}'::jsonb);n:=(d->>'cantidad')::integer;
     IF v_fecha NOT BETWEEN campana.fecha_inicio AND campana.fecha_fin OR v_fecha>current_date THEN RAISE EXCEPTION 'La fecha debe pertenecer a la campaña y no ser futura'; END IF;
     IF anterior IS NOT NULL AND anterior->>'estado'<>'pendiente' THEN RAISE EXCEPTION 'Un registro confirmado o anulado no se edita. Administración puede anularlo con motivo'; END IF;
     SELECT coalesce(array_agg(value::uuid),'{}'::uuid[]) INTO ids FROM jsonb_array_elements_text(coalesce(d->'colmena_ids','[]'::jsonb));
     IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) OR EXISTS(SELECT 1 FROM unnest(ids) x WHERE NOT EXISTS(SELECT 1 FROM public.apicola_colmenas WHERE comercio_id=p_comercio AND id=x AND apiario_id=apiario.id AND estado IN ('activa','nucleo','huerfana'))) THEN RAISE EXCEPTION 'Hay colmenas repetidas o ajenas al apiario'; END IF;
     SELECT coalesce(sum(cantidad),0) INTO stock FROM public.apicola_existencias WHERE comercio_id=p_comercio AND apiario_id=apiario.id AND recurso='colonias';
     IF n IS NULL OR n<0 OR n>stock OR (d->>'alcance'='colmenas' AND (n<>cardinality(ids) OR n=0)) OR (d->>'alcance'<>'colmenas' AND cardinality(ids)>0) OR (d->>'alcance'='apiario' AND n<>stock) THEN RAISE EXCEPTION 'La cantidad y alcance no coinciden con las colonias del apiario'; END IF;
     IF jsonb_typeof(v_datos)<>'object' THEN RAISE EXCEPTION 'Datos del registro inválidos'; END IF;
     IF v_tipo='alimentacion' OR (v_tipo='sanidad' AND v_datos->>'evento'='tratamiento') THEN
       IF coalesce(v_datos->>'cantidad','')!~'^[0-9]+([.][0-9]{1,3})?$' THEN RAISE EXCEPTION 'La cantidad debe ser un número positivo, con hasta tres decimales'; END IF;
       IF (v_datos->>'cantidad')::numeric<=0 OR (v_datos->>'cantidad')::numeric>1000000000 THEN RAISE EXCEPTION 'Cantidad fuera de rango'; END IF;
     END IF;
     IF v_tipo='visita' THEN
       IF coalesce(v_datos->>'reina','no_revisado') NOT IN ('no_revisado','observada','no_observada') OR coalesce(v_datos->>'fortaleza','no_revisado') NOT IN ('no_revisado','debil','media','fuerte') OR coalesce(v_datos->>'cria','no_revisado') NOT IN ('no_revisado','normal','irregular','ausente') OR coalesce(v_datos->>'reservas','no_revisado') NOT IN ('no_revisado','bajas','medias','altas') THEN RAISE EXCEPTION 'Valores de inspección inválidos'; END IF;
     ELSIF v_tipo='alimentacion' THEN
       IF coalesce(length(btrim(v_datos->>'alimento')),0)=0 OR coalesce((v_datos->>'cantidad')::numeric,0)<=0 OR coalesce(v_datos->>'unidad','') NOT IN ('kg','litros','unidades') OR coalesce(v_datos->>'origen','') NOT IN ('comprado','preparado') THEN RAISE EXCEPTION 'Completá alimento, origen, cantidad y unidad'; END IF;
       IF nullif(v_datos->>'preparada','') IS NOT NULL AND v_datos->>'preparada'!~'^[0-9]+([.][0-9]{1,3})?$' THEN RAISE EXCEPTION 'Cantidad preparada inválida'; END IF;
     ELSIF v_tipo='sanidad' THEN
       IF coalesce(length(btrim(v_datos->>'problema')),0)=0 OR coalesce(v_datos->>'evento','') NOT IN ('observacion','tratamiento','seguimiento') THEN RAISE EXCEPTION 'Completá el evento y problema sanitario'; END IF;
       IF v_datos->>'evento'='tratamiento' AND (coalesce(length(btrim(v_datos->>'producto')),0)=0 OR coalesce((v_datos->>'cantidad')::numeric,0)<=0 OR coalesce(length(btrim(v_datos->>'unidad')),0)=0 OR nullif(v_datos->>'inicio','')::date IS NULL) THEN RAISE EXCEPTION 'Completá los datos del tratamiento registrado'; END IF;
       IF nullif(v_datos->>'retiro','')::date<coalesce(nullif(v_datos->>'inicio','')::date,v_fecha) OR nullif(v_datos->>'vencimiento','')::date<coalesce(nullif(v_datos->>'inicio','')::date,v_fecha) THEN RAISE EXCEPTION 'Revisá las fechas de retiro y vencimiento'; END IF;
     END IF;
     confirmado:=coalesce(d->>'estado','pendiente')='confirmado';
     IF coalesce(d->>'estado','pendiente') NOT IN ('pendiente','confirmado') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
     IF confirmado AND NOT public.apicola_permiso(p_comercio,'admin') THEN RAISE EXCEPTION 'Solo administración puede confirmar registros' USING ERRCODE='42501'; END IF;
     INSERT INTO public.apicola_registros(id,comercio_id,campana_id,apiario_id,tipo,fecha,responsable,alcance,cantidad,existencias_al_registrar,colmena_ids,datos,observaciones,proxima_fecha,proxima_accion,estado,confirmado_por,confirmado_at,creado_por)
     VALUES(ident,p_comercio,campana.id,apiario.id,v_tipo,v_fecha,btrim(d->>'responsable'),d->>'alcance',n,stock,ids,v_datos,coalesce(d->>'observaciones',''),nullif(d->>'proxima_fecha','')::date,coalesce(d->>'proxima_accion',''),CASE WHEN confirmado THEN 'confirmado' ELSE 'pendiente' END,CASE WHEN confirmado THEN auth.uid() END,CASE WHEN confirmado THEN now() END,auth.uid())
     ON CONFLICT(id) DO UPDATE SET campana_id=EXCLUDED.campana_id,apiario_id=EXCLUDED.apiario_id,tipo=EXCLUDED.tipo,fecha=EXCLUDED.fecha,responsable=EXCLUDED.responsable,alcance=EXCLUDED.alcance,cantidad=EXCLUDED.cantidad,existencias_al_registrar=EXCLUDED.existencias_al_registrar,colmena_ids=EXCLUDED.colmena_ids,datos=EXCLUDED.datos,observaciones=EXCLUDED.observaciones,proxima_fecha=EXCLUDED.proxima_fecha,proxima_accion=EXCLUDED.proxima_accion,estado=EXCLUDED.estado,confirmado_por=EXCLUDED.confirmado_por,confirmado_at=EXCLUDED.confirmado_at,version=apicola_registros.version+1,updated_at=now();
     IF confirmado THEN PERFORM public.apicola_agendar_registro(p_comercio,ident); END IF;
   END IF;
 END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE comercio_id=$1 AND id=$2',tabla) INTO resultado USING p_comercio,ident;
 RETURN resultado;
END; $$;

CREATE FUNCTION public.apicola_agendar_registro(p_comercio uuid,p_registro uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.apicola_registros; BEGIN
 SELECT * INTO STRICT r FROM public.apicola_registros WHERE comercio_id=p_comercio AND id=p_registro;
 IF r.proxima_fecha IS NOT NULL AND r.estado='confirmado' THEN
   INSERT INTO public.apicola_tareas(comercio_id,campana_id,apiario_id,registro_id,origen,fecha,descripcion,responsable,creado_por)
   VALUES(p_comercio,r.campana_id,r.apiario_id,r.id,'seguimiento',r.proxima_fecha,coalesce(nullif(btrim(r.proxima_accion),''),'Seguimiento de '||r.tipo),r.responsable,auth.uid()) ON CONFLICT(comercio_id,registro_id,origen) DO NOTHING;
 END IF;
 IF r.estado='confirmado' AND r.tipo='sanidad' AND r.datos->>'evento'='tratamiento' AND nullif(r.datos->>'retiro','') IS NOT NULL THEN
   INSERT INTO public.apicola_tareas(comercio_id,campana_id,apiario_id,registro_id,origen,fecha,descripcion,responsable,creado_por)
   VALUES(p_comercio,r.campana_id,r.apiario_id,r.id,'retiro',(r.datos->>'retiro')::date,'Retiro/seguimiento registrado: '||(r.datos->>'producto'),r.responsable,auth.uid()) ON CONFLICT(comercio_id,registro_id,origen) DO NOTHING;
 END IF;
END; $$;

CREATE FUNCTION public.apicola_mover(p_comercio uuid,d jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
#variable_conflict use_column
<<mov>>
DECLARE ident uuid:=gen_random_uuid();c public.apicola_campanas;fecha date:=(d->>'fecha')::date;
 tipo text:=d->>'tipo';recurso text:=d->>'recurso';origen uuid:=nullif(d->>'origen_apiario_id','')::uuid;
 destino uuid:=nullif(d->>'destino_apiario_id','')::uuid;cantidad integer:=(d->>'cantidad')::integer;
 ids uuid[];nuevos text[];todos uuid[];hijo uuid;padre uuid;cod text;stock integer;identificadas integer;delta_origen integer;delta_destino integer;
BEGIN
 IF NOT public.apicola_permiso(p_comercio,'admin') THEN RAISE EXCEPTION 'Solo administración puede registrar movimientos' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.apicola_campanas WHERE comercio_id=p_comercio AND id=(d->>'campana_id')::uuid AND estado='abierta';
 IF NOT FOUND THEN RAISE EXCEPTION 'Campaña abierta no disponible en este comercio'; END IF;
 IF fecha IS NULL OR fecha>current_date OR fecha NOT BETWEEN c.fecha_inicio AND c.fecha_fin THEN RAISE EXCEPTION 'La fecha debe pertenecer a la campaña y no ser futura'; END IF;
 SELECT coalesce(array_agg(value::uuid),'{}'::uuid[]) INTO ids FROM jsonb_array_elements_text(coalesce(d->'colmena_ids','[]'::jsonb));
 SELECT coalesce(array_agg(upper(btrim(value))),'{}'::text[]) INTO nuevos FROM jsonb_array_elements_text(coalesce(d->'codigos_nuevos','[]'::jsonb));
 IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) OR cardinality(nuevos)<>(SELECT count(DISTINCT x) FROM unnest(nuevos) x) OR EXISTS(SELECT 1 FROM unnest(nuevos) x WHERE length(x) NOT BETWEEN 1 AND 40) THEN RAISE EXCEPTION 'Identificaciones repetidas o inválidas'; END IF;
 IF tipo='alta' THEN origen:=NULL;
 ELSIF tipo='baja' THEN destino:=NULL;
 ELSIF tipo IN ('division','fusion','cambio_material') THEN recurso:='colonias';destino:=origen;
 ELSIF tipo<>'traslado' THEN RAISE EXCEPTION 'Movimiento inválido'; END IF;
 IF (origen IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.apicola_apiarios WHERE comercio_id=p_comercio AND id=origen AND activo))
   OR (destino IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.apicola_apiarios WHERE comercio_id=p_comercio AND id=destino AND activo))
   OR (tipo='alta' AND destino IS NULL) OR (tipo<>'alta' AND origen IS NULL) OR (tipo='traslado' AND (destino IS NULL OR destino=origen)) THEN RAISE EXCEPTION 'Apiarios de origen o destino inválidos'; END IF;
 IF recurso IS NULL OR recurso NOT IN ('colonias','piso','camara','alza','cuadro','techo','otro_material') THEN RAISE EXCEPTION 'Recurso inválido'; END IF;
 IF EXISTS(SELECT 1 FROM public.apicola_existencias_historial WHERE comercio_id=p_comercio AND apiario_id IN (origen,destino) AND recurso=mov.recurso AND apicola_existencias_historial.fecha>mov.fecha) THEN RAISE EXCEPTION 'Registrá los movimientos en orden de fecha para conservar las existencias históricas'; END IF;
 IF recurso<>'colonias' AND (cardinality(ids)>0 OR cardinality(nuevos)>0) THEN RAISE EXCEPTION 'Los materiales no admiten identificaciones de colonias'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ids) x WHERE NOT EXISTS(SELECT 1 FROM public.apicola_colmenas WHERE comercio_id=p_comercio AND id=x AND apiario_id=mov.origen AND estado IN ('activa','nucleo','huerfana'))) THEN RAISE EXCEPTION 'Hay colmenas inactivas o ajenas al apiario de origen'; END IF;
 IF tipo='division' AND (cardinality(ids)<>1 OR cardinality(nuevos)<1) THEN RAISE EXCEPTION 'La división requiere una colonia de origen y códigos nuevos'; END IF;
 IF tipo='fusion' AND (cardinality(ids)<2 OR cardinality(nuevos)<>1) THEN RAISE EXCEPTION 'La fusión requiere al menos dos colonias y un código nuevo'; END IF;
 IF tipo='cambio_material' AND (cardinality(ids)<>1 OR cardinality(nuevos)>0 OR coalesce(length(btrim(d->>'material_codigo')),0)=0) THEN RAISE EXCEPTION 'Indicá una colmena y la identificación del material nuevo'; END IF;
 IF tipo NOT IN ('alta','division','fusion') AND cardinality(nuevos)>0 THEN RAISE EXCEPTION 'Este movimiento no crea códigos nuevos'; END IF;
 IF tipo='alta' AND cardinality(ids)>0 THEN RAISE EXCEPTION 'El alta solo admite códigos nuevos'; END IF;
 IF tipo='division' THEN cantidad:=cardinality(nuevos);
 ELSIF tipo='fusion' THEN cantidad:=cardinality(ids)-1;
 ELSIF tipo='cambio_material' THEN cantidad:=1;
 END IF;
 IF cantidad IS NULL OR cantidad<=0 OR cardinality(ids)>cantidad AND tipo NOT IN ('fusion') OR cardinality(nuevos)>cantidad AND tipo<>'fusion' THEN RAISE EXCEPTION 'Cantidad incompatible con las identificaciones'; END IF;
 IF tipo IN ('baja','traslado') AND recurso='colonias' THEN
   SELECT coalesce(sum(e.cantidad),0) INTO stock FROM public.apicola_existencias e WHERE comercio_id=p_comercio AND apiario_id=origen AND e.recurso='colonias';
   SELECT count(*) INTO identificadas FROM public.apicola_colmenas WHERE comercio_id=p_comercio AND apiario_id=mov.origen AND estado IN ('activa','nucleo','huerfana');
   IF cantidad-cardinality(ids)>stock-identificadas THEN RAISE EXCEPTION 'Seleccioná las colmenas identificadas que se trasladan o dan de baja'; END IF;
 END IF;
 IF tipo='baja' AND coalesce(d->>'estado_baja','baja') NOT IN ('muerta','vendida','baja') THEN RAISE EXCEPTION 'Estado de baja inválido'; END IF;
 todos:=ids;
 INSERT INTO public.apicola_movimientos(id,comercio_id,campana_id,fecha,tipo,recurso,origen_apiario_id,destino_apiario_id,cantidad,colmena_ids,motivo,datos,creado_por)
 VALUES(ident,p_comercio,c.id,fecha,tipo,recurso,origen,destino,cantidad,ids,btrim(d->>'motivo'),d,auth.uid());
 delta_origen:=CASE WHEN tipo IN ('baja','traslado','fusion') THEN -cantidad ELSE 0 END;
 delta_destino:=CASE WHEN tipo IN ('alta','traslado','division') THEN cantidad ELSE 0 END;
 IF delta_origen<>0 THEN
   INSERT INTO public.apicola_existencias(comercio_id,apiario_id,recurso) VALUES(p_comercio,origen,recurso) ON CONFLICT DO NOTHING;
   UPDATE public.apicola_existencias e SET cantidad=e.cantidad+delta_origen WHERE comercio_id=p_comercio AND apiario_id=origen AND e.recurso=mov.recurso AND e.cantidad+delta_origen>=0;
   IF NOT FOUND THEN RAISE EXCEPTION 'Existencias insuficientes'; END IF;
   INSERT INTO public.apicola_existencias_historial VALUES(p_comercio,origen,recurso,ident,fecha,delta_origen);
 END IF;
 IF delta_destino<>0 THEN
   INSERT INTO public.apicola_existencias(comercio_id,apiario_id,recurso,cantidad) VALUES(p_comercio,destino,recurso,delta_destino)
     ON CONFLICT(comercio_id,apiario_id,recurso) DO UPDATE SET cantidad=apicola_existencias.cantidad+EXCLUDED.cantidad;
   INSERT INTO public.apicola_existencias_historial VALUES(p_comercio,destino,recurso,ident,fecha,delta_destino);
 END IF;
 IF tipo='traslado' THEN UPDATE public.apicola_colmenas SET apiario_id=destino,version=version+1,updated_at=now() WHERE comercio_id=p_comercio AND id=ANY(ids);
 ELSIF tipo='baja' THEN UPDATE public.apicola_colmenas SET estado=coalesce(d->>'estado_baja','baja'),version=version+1,updated_at=now() WHERE comercio_id=p_comercio AND id=ANY(ids);
 ELSIF tipo='fusion' THEN UPDATE public.apicola_colmenas SET estado='fusionada',version=version+1,updated_at=now() WHERE comercio_id=p_comercio AND id=ANY(ids);
 ELSIF tipo='cambio_material' THEN UPDATE public.apicola_colmenas SET material_codigo=d->>'material_codigo',version=version+1,updated_at=now() WHERE comercio_id=p_comercio AND id=ANY(ids);
 END IF;
 FOREACH cod IN ARRAY nuevos LOOP
   INSERT INTO public.apicola_colmenas(comercio_id,apiario_id,codigo,origen,estado,fecha_alta,creado_por)
   VALUES(p_comercio,destino,cod,CASE WHEN tipo='division' THEN 'division' WHEN tipo='fusion' THEN 'fusion' ELSE coalesce(d->>'origen_colonias','compra') END,CASE WHEN tipo='division' THEN 'nucleo' ELSE 'activa' END,fecha,auth.uid()) RETURNING id INTO hijo;
   todos:=array_append(todos,hijo);
   IF tipo IN ('division','fusion') THEN FOREACH padre IN ARRAY ids LOOP INSERT INTO public.apicola_parentescos VALUES(p_comercio,padre,hijo,ident); END LOOP; END IF;
 END LOOP;
 UPDATE public.apicola_movimientos SET colmena_ids=todos WHERE id=ident;
 RETURN jsonb_build_object('id',ident);
END; $$;

CREATE FUNCTION public.apicola_operar(p_comercio uuid,p_accion text,p_datos jsonb,p_clave uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE operacion public.apicola_operaciones; resultado jsonb;r public.apicola_registros;
BEGIN
 IF NOT public.apicola_permiso(p_comercio,'operar') THEN RAISE EXCEPTION 'El módulo no está habilitado o no tenés permiso en este comercio' USING ERRCODE='42501'; END IF;
 IF p_clave IS NULL OR jsonb_typeof(p_datos) IS DISTINCT FROM 'object' OR pg_column_size(p_datos)>65536 THEN RAISE EXCEPTION 'Datos de operación inválidos'; END IF;
 -- Serializa operaciones del mismo comercio y evita doble aplicación entre dispositivos.
 PERFORM pg_advisory_xact_lock(hashtextextended('apicola:'||p_comercio::text,0));
 SELECT * INTO operacion FROM public.apicola_operaciones WHERE comercio_id=p_comercio AND clave=p_clave;
 IF FOUND THEN
   IF operacion.usuario_id<>auth.uid() OR operacion.accion<>p_accion OR operacion.datos<>p_datos THEN RAISE EXCEPTION 'La clave de operación ya se usó con otros datos'; END IF;
   RETURN operacion.resultado;
 END IF;
 IF p_accion IN ('campana','apiario','colmena','registro','tarea') THEN resultado:=public.apicola_guardar(p_comercio,p_accion,p_datos);
 ELSIF p_accion='movimiento' THEN resultado:=public.apicola_mover(p_comercio,p_datos);
 ELSIF p_accion IN ('confirmar_registro','anular_registro') THEN
   IF NOT public.apicola_permiso(p_comercio,'admin') THEN RAISE EXCEPTION 'Solo administración puede confirmar o anular registros' USING ERRCODE='42501'; END IF;
   SELECT * INTO r FROM public.apicola_registros WHERE comercio_id=p_comercio AND id=(p_datos->>'id')::uuid FOR UPDATE;
   IF NOT FOUND OR r.version IS DISTINCT FROM (p_datos->>'version')::integer THEN RAISE EXCEPTION 'Registro no disponible o modificado. Actualizá la pantalla'; END IF;
   IF r.estado='anulado' OR p_accion='confirmar_registro' AND r.estado<>'pendiente' THEN RAISE EXCEPTION 'Transición de estado no válida'; END IF;
   IF p_accion='confirmar_registro' THEN
     IF NOT EXISTS(SELECT 1 FROM public.apicola_campanas WHERE comercio_id=p_comercio AND id=r.campana_id AND estado='abierta') THEN RAISE EXCEPTION 'La campaña está cerrada'; END IF;
     UPDATE public.apicola_registros SET estado='confirmado',confirmado_por=auth.uid(),confirmado_at=now(),version=version+1,updated_at=now() WHERE id=r.id;
     PERFORM public.apicola_agendar_registro(p_comercio,r.id);
   ELSE
     IF coalesce(length(btrim(p_datos->>'motivo')),0)<5 THEN RAISE EXCEPTION 'Indicá el motivo de anulación'; END IF;
     UPDATE public.apicola_registros SET estado='anulado',motivo_anulacion=btrim(p_datos->>'motivo'),version=version+1,updated_at=now() WHERE id=r.id;
     UPDATE public.apicola_tareas SET estado='cancelada',version=version+1,updated_at=now() WHERE comercio_id=p_comercio AND registro_id=r.id AND estado='pendiente';
   END IF;
   SELECT to_jsonb(t) INTO resultado FROM public.apicola_registros t WHERE id=r.id;
 ELSE RAISE EXCEPTION 'Operación apícola no válida'; END IF;
 INSERT INTO public.apicola_operaciones VALUES(p_comercio,p_clave,p_accion,p_datos,resultado,auth.uid(),now());
 RETURN resultado;
END; $$;

CREATE FUNCTION public.apicola_informe(p_comercio uuid,p_campana uuid DEFAULT NULL,p_apiario uuid DEFAULT NULL,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE resultado jsonb;
BEGIN
 IF NOT public.apicola_permiso(p_comercio,'lectura') THEN RAISE EXCEPTION 'Sin acceso al módulo apícola' USING ERRCODE='42501'; END IF;
 IF (p_campana IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.apicola_campanas WHERE comercio_id=p_comercio AND id=p_campana)) OR (p_apiario IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.apicola_apiarios WHERE comercio_id=p_comercio AND id=p_apiario)) THEN RAISE EXCEPTION 'Filtro ajeno al comercio'; END IF;
 IF p_desde>p_hasta THEN RAISE EXCEPTION 'Período inválido'; END IF;
 SELECT jsonb_build_object('visitas',count(*) FILTER(WHERE tipo='visita' AND estado='confirmado'),
   'revisiones',coalesce(sum(cantidad) FILTER(WHERE tipo='visita' AND estado='confirmado'),0),
   'sanitarios',count(*) FILTER(WHERE tipo='sanidad' AND estado='confirmado'),
   'registros_pendientes',count(*) FILTER(WHERE estado='pendiente')) INTO resultado
 FROM public.apicola_registros WHERE comercio_id=p_comercio AND (p_campana IS NULL OR campana_id=p_campana) AND (p_apiario IS NULL OR apiario_id=p_apiario) AND (p_desde IS NULL OR fecha>=p_desde) AND (p_hasta IS NULL OR fecha<=p_hasta);
 RETURN resultado||jsonb_build_object(
   'alimentacion',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT datos->>'unidad' AS unidad,sum((datos->>'cantidad')::numeric) AS cantidad FROM public.apicola_registros WHERE comercio_id=p_comercio AND tipo='alimentacion' AND estado='confirmado' AND (p_campana IS NULL OR campana_id=p_campana) AND (p_apiario IS NULL OR apiario_id=p_apiario) AND (p_desde IS NULL OR fecha>=p_desde) AND (p_hasta IS NULL OR fecha<=p_hasta) GROUP BY datos->>'unidad') t),'[]'::jsonb),
   'existencias',coalesce((SELECT jsonb_agg(jsonb_build_object('apiario_id',apiario_id,'recurso',recurso,'cantidad',cantidad)) FROM public.apicola_existencias WHERE comercio_id=p_comercio AND (p_apiario IS NULL OR apiario_id=p_apiario)),'[]'::jsonb),
   'tareas_pendientes',(SELECT count(*) FROM public.apicola_tareas WHERE comercio_id=p_comercio AND estado='pendiente' AND (p_campana IS NULL OR campana_id=p_campana) AND (p_apiario IS NULL OR apiario_id=p_apiario) AND (p_desde IS NULL OR fecha>=p_desde) AND (p_hasta IS NULL OR fecha<=p_hasta)),
   'tareas_vencidas',(SELECT count(*) FROM public.apicola_tareas WHERE comercio_id=p_comercio AND estado='pendiente' AND fecha<current_date AND (p_campana IS NULL OR campana_id=p_campana) AND (p_apiario IS NULL OR apiario_id=p_apiario) AND (p_desde IS NULL OR fecha>=p_desde) AND (p_hasta IS NULL OR fecha<=p_hasta)));
END; $$;
REVOKE ALL ON FUNCTION public.apicola_informe(uuid,uuid,uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apicola_informe(uuid,uuid,uuid,date,date) TO authenticated;
REVOKE ALL ON FUNCTION public.apicola_guardar(uuid,text,jsonb),public.apicola_agendar_registro(uuid,uuid),public.apicola_mover(uuid,jsonb),public.apicola_operar(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apicola_operar(uuid,text,jsonb,uuid) TO authenticated;
COMMIT;
