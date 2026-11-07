BEGIN;
CREATE FUNCTION public.apicola_produccion_operar(p_comercio uuid,p_accion text,p_datos jsonb,p_clave uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE d jsonb:=p_datos; resultado jsonb; operacion public.apicola_operaciones;
 c public.apicola_cosechas; e public.apicola_extracciones; l public.apicola_lotes; t public.apicola_tambores;
 cid uuid; rid uuid; f date; origen jsonb; usados integer; total numeric; tabla text;
 s public.apicola_salas; a public.apicola_analisis;
BEGIN
 IF NOT public.apicola_permiso(p_comercio,'operar') THEN RAISE EXCEPTION 'El módulo no está habilitado o no tenés permiso' USING ERRCODE='42501'; END IF;
 IF p_clave IS NULL OR jsonb_typeof(d) IS DISTINCT FROM 'object' OR pg_column_size(d)>65536 THEN RAISE EXCEPTION 'Datos de operación inválidos'; END IF;
 IF p_accion<>'cosecha' AND NOT public.apicola_permiso(p_comercio,'admin') THEN RAISE EXCEPTION 'Esta operación requiere administración' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('apicola:'||p_comercio::text,0));
 SELECT * INTO operacion FROM public.apicola_operaciones WHERE comercio_id=p_comercio AND clave=p_clave;
 IF FOUND THEN
  IF operacion.usuario_id<>auth.uid() OR operacion.accion<>'produccion:'||p_accion OR operacion.datos<>d THEN RAISE EXCEPTION 'La clave de operación ya se usó con otros datos'; END IF;
  RETURN operacion.resultado;
 END IF;
 IF p_accion IN ('cosecha','extraccion') THEN
  cid:=(d->>'campana_id')::uuid; f:=(d->>'fecha')::date;
  IF f IS NULL OR f>current_date OR NOT EXISTS(SELECT 1 FROM public.apicola_campanas WHERE comercio_id=p_comercio AND id=cid AND estado='abierta' AND f BETWEEN fecha_inicio AND fecha_fin) THEN RAISE EXCEPTION 'Se requiere fecha válida dentro de una campaña abierta'; END IF;
 END IF;
 IF p_accion='sala' THEN
  INSERT INTO public.apicola_salas(comercio_id,codigo,nombre,tipo,habilitacion,contacto,creado_por)
  VALUES(p_comercio,btrim(d->>'codigo'),btrim(d->>'nombre'),d->>'tipo',coalesce(d->>'habilitacion',''),coalesce(d->>'contacto',''),auth.uid()) RETURNING to_jsonb(apicola_salas.*) INTO resultado;
 ELSIF p_accion='cosecha' THEN
  IF NOT EXISTS(SELECT 1 FROM public.apicola_apiarios WHERE comercio_id=p_comercio AND id=(d->>'apiario_id')::uuid AND activo) THEN RAISE EXCEPTION 'Apiario inválido o inactivo'; END IF;
  INSERT INTO public.apicola_cosechas(comercio_id,campana_id,apiario_id,fecha,codigo,alzas,responsable,observaciones,creado_por)
  VALUES(p_comercio,cid,(d->>'apiario_id')::uuid,f,btrim(d->>'codigo'),(d->>'alzas')::integer,btrim(d->>'responsable'),coalesce(d->>'observaciones',''),auth.uid()) RETURNING to_jsonb(apicola_cosechas.*) INTO resultado;
 ELSIF p_accion='extraccion' THEN
  IF jsonb_typeof(d->'origenes') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'origenes') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Seleccioná entre 1 y 100 cosechas de origen'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(d->'origenes'))<>(SELECT count(DISTINCT v->>'cosecha_id') FROM jsonb_array_elements(d->'origenes') v) THEN RAISE EXCEPTION 'Cosechas repetidas'; END IF;
  SELECT * INTO s FROM public.apicola_salas WHERE comercio_id=p_comercio AND id=(d->>'sala_id')::uuid AND activo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sala inválida o inactiva'; END IF;
  INSERT INTO public.apicola_extracciones(comercio_id,campana_id,fecha,codigo,sala_id,sala,responsable,kg,observaciones,creado_por)
  VALUES(p_comercio,cid,f,btrim(d->>'codigo'),s.id,s.nombre,btrim(d->>'responsable'),(d->>'kg')::numeric,coalesce(d->>'observaciones',''),auth.uid()) RETURNING * INTO e;
  FOR origen IN SELECT value FROM jsonb_array_elements(d->'origenes') LOOP
   SELECT * INTO c FROM public.apicola_cosechas WHERE comercio_id=p_comercio AND id=(origen->>'cosecha_id')::uuid;
   IF NOT FOUND OR c.estado<>'vigente' OR c.campana_id<>cid OR c.fecha>f THEN RAISE EXCEPTION 'Cosecha de origen inválida, anulada o de otra campaña/fecha'; END IF;
   SELECT coalesce(sum(o.alzas),0) INTO usados FROM public.apicola_extraccion_origenes o JOIN public.apicola_extracciones x ON x.comercio_id=o.comercio_id AND x.id=o.extraccion_id WHERE o.comercio_id=p_comercio AND o.cosecha_id=c.id AND x.estado='vigente';
   IF (origen->>'alzas')::integer IS NULL OR (origen->>'alzas')::integer<=0 OR usados+(origen->>'alzas')::integer>c.alzas THEN RAISE EXCEPTION 'Alzas insuficientes en la cosecha %',c.codigo; END IF;
   INSERT INTO public.apicola_extraccion_origenes VALUES(p_comercio,e.id,c.id,(origen->>'alzas')::integer);
  END LOOP;
  INSERT INTO public.apicola_lotes(comercio_id,extraccion_id,codigo,floracion,humedad,creado_por)
  VALUES(p_comercio,e.id,btrim(d->>'lote_codigo'),coalesce(d->>'floracion',''),nullif(d->>'humedad','')::numeric,auth.uid()) RETURNING * INTO l;
  resultado:=to_jsonb(e)||jsonb_build_object('lote_id',l.id,'lote_codigo',l.codigo);
 ELSIF p_accion='tambor' THEN
  SELECT * INTO l FROM public.apicola_lotes WHERE comercio_id=p_comercio AND id=(d->>'lote_id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote inválido'; END IF;
  SELECT * INTO e FROM public.apicola_extracciones WHERE comercio_id=p_comercio AND id=l.extraccion_id;
  f:=(d->>'fecha')::date;
  IF e.estado<>'vigente' OR f IS NULL OR f<e.fecha OR f>current_date OR NOT EXISTS(SELECT 1 FROM public.apicola_campanas WHERE comercio_id=p_comercio AND id=e.campana_id AND estado='abierta' AND f BETWEEN fecha_inicio AND fecha_fin) THEN RAISE EXCEPTION 'Fecha, extracción o campaña inválida/cerrada'; END IF;
  SELECT coalesce(sum(neto),0) INTO total FROM public.apicola_tambores WHERE comercio_id=p_comercio AND lote_id=l.id AND estado='vigente';
  -- Comparar exactamente los pesos que se persistirán, redondeados a gramos.
  IF total+(d->>'bruto')::numeric(14,3)-(d->>'tara')::numeric(14,3)>e.kg THEN RAISE EXCEPTION 'Los kilos netos superan el saldo del lote'; END IF;
  INSERT INTO public.apicola_tambores(comercio_id,lote_id,codigo,fecha,bruto,tara,ubicacion,creado_por)
  VALUES(p_comercio,l.id,btrim(d->>'codigo'),f,(d->>'bruto')::numeric,(d->>'tara')::numeric,btrim(d->>'ubicacion'),auth.uid()) RETURNING to_jsonb(apicola_tambores.*) INTO resultado;
 ELSIF p_accion IN ('analisis','liberar_lote','bloquear_lote') THEN
  SELECT * INTO l FROM public.apicola_lotes WHERE comercio_id=p_comercio AND id=(d->>'lote_id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote inválido'; END IF;
  SELECT * INTO e FROM public.apicola_extracciones WHERE comercio_id=p_comercio AND id=l.extraccion_id;
  IF e.estado<>'vigente' THEN RAISE EXCEPTION 'Extracción anulada'; END IF;
  IF p_accion='analisis' THEN
   f:=(d->>'fecha')::date;
   IF f IS NULL OR f<e.fecha OR f>current_date THEN RAISE EXCEPTION 'Fecha de análisis inválida'; END IF;
   INSERT INTO public.apicola_analisis(comercio_id,lote_id,fecha,muestra,laboratorio,resultado,humedad,informe,creado_por)
   VALUES(p_comercio,l.id,f,btrim(d->>'muestra'),btrim(d->>'laboratorio'),d->>'resultado',nullif(d->>'humedad','')::numeric,btrim(d->>'informe'),auth.uid()) RETURNING * INTO a;
   -- Cada nuevo informe requiere revisión administrativa antes de liberar nuevamente.
   UPDATE public.apicola_lotes SET estado_calidad=CASE WHEN a.resultado='no_conforme' THEN 'bloqueado' ELSE 'pendiente' END,version=version+1,updated_at=now() WHERE id=l.id;
   resultado:=to_jsonb(a);
  ELSE
   IF l.version IS DISTINCT FROM (d->>'version')::integer THEN RAISE EXCEPTION 'El lote cambió. Actualizá la pantalla'; END IF;
   IF coalesce(length(btrim(d->>'motivo')),0) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'Indicá el motivo de la decisión'; END IF;
   SELECT * INTO a FROM public.apicola_analisis WHERE comercio_id=p_comercio AND lote_id=l.id ORDER BY created_at DESC,id DESC LIMIT 1;
   IF p_accion='liberar_lote' AND (a.id IS NULL OR a.resultado<>'conforme') THEN RAISE EXCEPTION 'Se requiere un último informe conforme para liberar'; END IF;
   UPDATE public.apicola_lotes SET estado_calidad=CASE WHEN p_accion='liberar_lote' THEN 'liberado' ELSE 'bloqueado' END,version=version+1,updated_at=now() WHERE id=l.id RETURNING to_jsonb(apicola_lotes.*) INTO resultado;
  END IF;
 ELSIF p_accion IN ('anular_cosecha','anular_extraccion','anular_tambor') THEN
  IF coalesce(length(btrim(d->>'motivo')),0) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'Indicá un motivo de anulación de 5 a 1000 caracteres'; END IF;
  rid:=(d->>'id')::uuid;
  IF p_accion='anular_cosecha' THEN
   tabla:='apicola_cosechas';
   IF EXISTS(SELECT 1 FROM public.apicola_extraccion_origenes o JOIN public.apicola_extracciones x ON x.comercio_id=o.comercio_id AND x.id=o.extraccion_id WHERE o.comercio_id=p_comercio AND o.cosecha_id=rid AND x.estado='vigente') THEN RAISE EXCEPTION 'La cosecha tiene extracciones vigentes'; END IF;
  ELSIF p_accion='anular_extraccion' THEN
   tabla:='apicola_extracciones';
   IF EXISTS(SELECT 1 FROM public.apicola_tambores b JOIN public.apicola_lotes z ON z.comercio_id=b.comercio_id AND z.id=b.lote_id WHERE z.comercio_id=p_comercio AND z.extraccion_id=rid AND b.estado='vigente') THEN RAISE EXCEPTION 'La extracción tiene tambores vigentes'; END IF;
  ELSE tabla:='apicola_tambores'; END IF;
  EXECUTE format('UPDATE public.%I SET estado=''anulado'',motivo_anulacion=$1,version=version+1,updated_at=now() WHERE comercio_id=$2 AND id=$3 AND version=$4 AND estado=''vigente'' RETURNING to_jsonb(%I.*)',tabla,tabla)
   INTO resultado USING btrim(d->>'motivo'),p_comercio,rid,(d->>'version')::integer;
  IF resultado IS NULL THEN RAISE EXCEPTION 'El registro cambió o no está disponible. Actualizá la pantalla'; END IF;
 ELSE RAISE EXCEPTION 'Operación de producción no válida'; END IF;
 INSERT INTO public.apicola_operaciones VALUES(p_comercio,p_clave,'produccion:'||p_accion,d,resultado,auth.uid(),now());
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.apicola_produccion_operar(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apicola_produccion_operar(uuid,text,jsonb,uuid) TO authenticated;
COMMIT;
