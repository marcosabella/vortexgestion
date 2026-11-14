-- Carga administrativa atómica. No modifica servicios ni lecturas existentes.
BEGIN;
DO $migration$
DECLARE
 definicion text;
 ancla text := 'ELSIF p_accion=''servicio'' THEN';
 evento text := 'IF previo.id IS NULL THEN INSERT INTO public.transporte_eventos(comercio_id,servicio_id,estado,detalle,user_id) VALUES(c,v_id,''solicitado'',''Alta del servicio'',auth.uid()); END IF;';
BEGIN
 SELECT pg_get_functiondef('public.transporte_operar(uuid,text,uuid,integer,jsonb)'::regprocedure) INTO definicion;
 IF position(ancla IN definicion)=0 OR position(evento IN definicion)=0 THEN
  RAISE EXCEPTION 'Revisar integración de carga administrativa de Transporte';
 END IF;
 definicion:=replace(definicion,ancla,$branch$
 ELSIF p_accion IN ('servicio','viaje_realizado') THEN
  IF p_accion='viaje_realizado' THEN
   IF p_id IS NOT NULL OR public.vortex_permiso(c,'transporte','crear') IS DISTINCT FROM true
      OR public.vortex_permiso(c,'transporte','operar') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'No tenés permiso para registrar viajes realizados' USING ERRCODE='42501';
   END IF;
   v_id:=nullif(d->>'registro_id','')::uuid;
   IF v_id IS NULL THEN RAISE EXCEPTION 'Falta el identificador de la carga'; END IF;
   -- Serializa reintentos sin duplicar viajes ante pérdida de respuesta.
   PERFORM pg_advisory_xact_lock(hashtextextended(v_id::text,0));
   IF EXISTS(SELECT 1 FROM public.transporte_servicios WHERE id=v_id) THEN
    IF EXISTS(SELECT 1 FROM public.transporte_servicios WHERE id=v_id AND comercio_id=c
      AND EXISTS(SELECT 1 FROM public.transporte_eventos e WHERE e.servicio_id=v_id AND e.comercio_id=c AND e.detalle LIKE 'Carga administrativa de viaje realizado%' AND right(e.detalle,32)=md5(d::text))) THEN
     RETURN v_id;
    END IF;
    RAISE EXCEPTION 'La carga ya existe o el identificador no está disponible. Revisá Servicios antes de volver a cargar el viaje';
   END IF;
   IF nullif(d->>'programado_at','') IS NULL OR NOT isfinite((d->>'programado_at')::timestamptz)
      OR (d->>'programado_at')::timestamptz>now() THEN
    RAISE EXCEPTION 'Indicá la fecha real del viaje, que no puede ser futura';
   END IF;
   IF nullif(d->>'unidad_id','') IS NULL OR nullif(d->>'chofer_id','') IS NULL THEN
    RAISE EXCEPTION 'transporte_asigne_unidad_y_chofer';
   END IF;
   IF (nullif(d->>'km_salida','') IS NULL) <> (nullif(d->>'km_llegada','') IS NULL) THEN
    RAISE EXCEPTION 'Completá ambos odómetros o dejá ambos vacíos';
   END IF;
   FOREACH nombre IN ARRAY ARRAY['km_salida','km_llegada','km_aproximacion','km_traslado','km_retorno'] LOOP
    IF nullif(d->>nombre,'') IS NOT NULL AND ((d->>nombre)::numeric<0
       OR (d->>nombre)::numeric::text IN ('NaN','Infinity','-Infinity')
       OR (d->>nombre)::numeric<>round((d->>nombre)::numeric,1)) THEN
     RAISE EXCEPTION 'Ingresá kilómetros válidos con hasta un decimal';
    END IF;
   END LOOP;
   IF (d->>'km_llegada')::numeric < (d->>'km_salida')::numeric THEN
    RAISE EXCEPTION 'transporte_kilometraje_invalido';
   END IF;
   IF coalesce((d->>'km_aproximacion')::numeric,0)+coalesce((d->>'km_traslado')::numeric,0)+coalesce((d->>'km_retorno')::numeric,0)
      > (d->>'km_llegada')::numeric-(d->>'km_salida')::numeric THEN
    RAISE EXCEPTION 'transporte_tramos_superan_recorrido_real';
   END IF;
  END IF;
 $branch$);
 definicion:=replace(definicion,evento,$event$
 IF previo.id IS NULL THEN
  IF p_accion='viaje_realizado' THEN
   UPDATE public.transporte_servicios SET estado='finalizado',
    km_salida=(d->>'km_salida')::numeric,km_llegada=(d->>'km_llegada')::numeric,
    km_aproximacion=coalesce((d->>'km_aproximacion')::numeric,0),
    km_traslado=coalesce((d->>'km_traslado')::numeric,0),km_retorno=coalesce((d->>'km_retorno')::numeric,0)
   WHERE id=v_id AND comercio_id=c;
   -- Las lecturas retrospectivas quedan en el servicio: no alteran el odómetro actual.
   INSERT INTO public.transporte_eventos(comercio_id,servicio_id,estado,detalle,user_id)
   VALUES(c,v_id,'finalizado','Carga administrativa de viaje realizado. Fecha real: '||(d->>'programado_at')||'. Sin horarios de etapas intermedias. Referencia: '||md5(d::text),auth.uid());
  ELSE
   INSERT INTO public.transporte_eventos(comercio_id,servicio_id,estado,detalle,user_id) VALUES(c,v_id,'solicitado','Alta del servicio',auth.uid());
  END IF;
 END IF;
 $event$);
 EXECUTE definicion;
END $migration$;
COMMIT;
