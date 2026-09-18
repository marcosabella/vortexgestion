-- Estado, reanudacion secuencial y resumen oficial de telemetria neutral.
-- Acumuladores: se suman solo incrementos validos, nunca MAX-MIN.
BEGIN;

CREATE FUNCTION public.campo_telemetria_autorizar_lectura(p_importacion_id uuid, p_operativo boolean DEFAULT false)
RETURNS public.campo_telemetria_importaciones
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v_importacion public.campo_telemetria_importaciones;
BEGIN
  SELECT * INTO v_importacion FROM public.campo_telemetria_importaciones WHERE id = p_importacion_id;
  IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_telemetria_no_disponible' USING ERRCODE = '42501'; END IF;
  IF public.user_is_comercio_admin(v_importacion.comercio_id) THEN RETURN v_importacion; END IF;
  IF p_operativo OR v_importacion.parte_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.comercio_usuarios cu JOIN public.campo_partes_trabajo p
      ON p.comercio_id = cu.comercio_id AND p.id = v_importacion.parte_id
    WHERE cu.comercio_id = v_importacion.comercio_id AND cu.user_id = auth.uid()
      AND cu.rol = 'operador' AND cu.activo AND p.propietario_user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'campo_telemetria_no_autorizado' USING ERRCODE = '42501'; END IF;
  RETURN v_importacion;
END;
$function$;

CREATE FUNCTION public.campo_telemetria_estado_importacion(p_importacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v_importacion public.campo_telemetria_importaciones; v_maxima bigint;
BEGIN
  v_importacion := public.campo_telemetria_autorizar_lectura(p_importacion_id, true);
  SELECT coalesce(max(secuencia), 0) INTO v_maxima FROM public.campo_telemetria_muestras
  WHERE comercio_id = v_importacion.comercio_id AND importacion_id = v_importacion.id;
  RETURN jsonb_build_object('id', v_importacion.id, 'estado', v_importacion.estado,
    'formato', v_importacion.formato, 'origen', v_importacion.origen,
    'maquinaria_id', v_importacion.maquinaria_id, 'orden_id', v_importacion.orden_id,
    'parte_id', v_importacion.parte_id, 'sesion_gps_id', v_importacion.sesion_gps_id,
    'cantidad_recibida', v_importacion.cantidad_muestras, 'secuencia_maxima', v_maxima,
    'proxima_secuencia', v_maxima + 1, 'inicio_at', v_importacion.inicio_at,
    'fin_at', v_importacion.fin_at, 'puede_continuar', v_importacion.estado IN ('iniciada','cargando'),
    'puede_finalizar', v_importacion.estado IN ('iniciada','cargando'));
END;
$function$;

CREATE OR REPLACE FUNCTION public.campo_telemetria_cargar_muestras(p_importacion_id uuid, p_muestras jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v_importacion public.campo_telemetria_importaciones; v_cantidad integer; v_esperada bigint; v_primera bigint; v_ultima bigint; v_insertadas integer;
BEGIN
  SELECT * INTO v_importacion FROM public.campo_telemetria_importaciones WHERE id = p_importacion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campo_telemetria_importacion_no_disponible' USING ERRCODE = '42501'; END IF;
  PERFORM public.campo_telemetria_admin(v_importacion.comercio_id);
  IF v_importacion.estado NOT IN ('iniciada','cargando') OR jsonb_typeof(p_muestras) <> 'array' THEN RAISE EXCEPTION 'campo_telemetria_lote_invalido'; END IF;
  v_cantidad := jsonb_array_length(p_muestras);
  IF v_cantidad < 1 OR v_cantidad > 500 THEN RAISE EXCEPTION 'campo_telemetria_lote_invalido'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_muestras) e(valor)
    WHERE jsonb_typeof(e.valor) <> 'object'
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_muestras) e(valor)
    CROSS JOIN LATERAL jsonb_object_keys(e.valor) k(clave)
    WHERE k.clave NOT IN ('timestamp','latitude','longitude','altitude_m','accuracy_m','speed_kmh','heading_deg','engine_hours','fuel_liters','distance_km','area_ha','engine_on','working','external_id','sequence','extra')
  ) THEN RAISE EXCEPTION 'campo_telemetria_clave_desconocida'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_muestras) AS x(timestamp text, sequence bigint, latitude double precision, longitude double precision, altitude_m double precision, accuracy_m double precision, speed_kmh double precision, heading_deg double precision, engine_hours double precision, fuel_liters double precision, distance_km double precision, area_ha double precision, engine_on boolean, working boolean, external_id text, extra jsonb)
    WHERE timestamp IS NULL OR timestamp::timestamptz < '2000-01-01 00:00:00+00'::timestamptz OR timestamp::timestamptz > now() + interval '2 days' OR sequence IS NULL OR sequence < 1
      OR (latitude IS NULL) <> (longitude IS NULL)
      OR (latitude IS NOT NULL AND NOT (latitude > '-Infinity'::double precision AND latitude < 'Infinity'::double precision AND latitude BETWEEN -90 AND 90))
      OR (longitude IS NOT NULL AND NOT (longitude > '-Infinity'::double precision AND longitude < 'Infinity'::double precision AND longitude BETWEEN -180 AND 180))
      OR (altitude_m IS NOT NULL AND NOT (altitude_m > '-Infinity'::double precision AND altitude_m < 'Infinity'::double precision))
      OR (accuracy_m IS NOT NULL AND NOT (accuracy_m > '-Infinity'::double precision AND accuracy_m < 'Infinity'::double precision AND accuracy_m >= 0))
      OR (speed_kmh IS NOT NULL AND NOT (speed_kmh > '-Infinity'::double precision AND speed_kmh < 'Infinity'::double precision AND speed_kmh BETWEEN 0 AND 500))
      OR (heading_deg IS NOT NULL AND NOT (heading_deg > '-Infinity'::double precision AND heading_deg < 'Infinity'::double precision AND heading_deg >= 0 AND heading_deg < 360))
      OR (engine_hours IS NOT NULL AND NOT (engine_hours > '-Infinity'::double precision AND engine_hours < 'Infinity'::double precision AND engine_hours >= 0))
      OR (fuel_liters IS NOT NULL AND NOT (fuel_liters > '-Infinity'::double precision AND fuel_liters < 'Infinity'::double precision AND fuel_liters >= 0))
      OR (distance_km IS NOT NULL AND NOT (distance_km > '-Infinity'::double precision AND distance_km < 'Infinity'::double precision AND distance_km >= 0))
      OR (area_ha IS NOT NULL AND NOT (area_ha > '-Infinity'::double precision AND area_ha < 'Infinity'::double precision AND area_ha >= 0))
      OR (extra IS NOT NULL AND (jsonb_typeof(extra) <> 'object' OR octet_length(extra::text) > 8192))
  ) THEN RAISE EXCEPTION 'campo_telemetria_muestra_invalida'; END IF;
  SELECT min(sequence), max(sequence) INTO v_primera, v_ultima FROM jsonb_to_recordset(p_muestras) AS x(sequence bigint);
  IF v_ultima - v_primera + 1 <> v_cantidad OR (SELECT count(DISTINCT sequence) FROM jsonb_to_recordset(p_muestras) AS x(sequence bigint)) <> v_cantidad THEN RAISE EXCEPTION 'campo_telemetria_secuencia_invalida'; END IF;
  SELECT coalesce(max(secuencia),0)+1 INTO v_esperada FROM public.campo_telemetria_muestras WHERE comercio_id = v_importacion.comercio_id AND importacion_id = v_importacion.id;
  IF v_primera < v_esperada THEN
    IF v_ultima <> v_esperada - 1 OR EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_muestras) AS x(timestamp text, sequence bigint, latitude double precision, longitude double precision, altitude_m double precision, accuracy_m double precision, speed_kmh double precision, heading_deg double precision, engine_hours double precision, fuel_liters double precision, distance_km double precision, area_ha double precision, engine_on boolean, working boolean, external_id text, extra jsonb)
      LEFT JOIN public.campo_telemetria_muestras m ON m.comercio_id = v_importacion.comercio_id AND m.importacion_id = v_importacion.id AND m.secuencia = x.sequence
      WHERE m.id IS NULL OR m.timestamp_at IS DISTINCT FROM x.timestamp::timestamptz OR m.latitud IS DISTINCT FROM x.latitude OR m.longitud IS DISTINCT FROM x.longitude OR m.altitud_m IS DISTINCT FROM x.altitude_m OR m.precision_m IS DISTINCT FROM x.accuracy_m OR m.velocidad_kmh IS DISTINCT FROM x.speed_kmh OR m.rumbo_grados IS DISTINCT FROM x.heading_deg OR m.horas_motor IS DISTINCT FROM x.engine_hours OR m.combustible_litros IS DISTINCT FROM x.fuel_liters OR m.distancia_acumulada_km IS DISTINCT FROM x.distance_km OR m.superficie_acumulada_ha IS DISTINCT FROM x.area_ha OR m.motor_encendido IS DISTINCT FROM x.engine_on OR m.trabajando IS DISTINCT FROM x.working OR m.identificador_externo IS DISTINCT FROM nullif(x.external_id,'') OR m.datos_adicionales IS DISTINCT FROM coalesce(x.extra,'{}'::jsonb)
    ) THEN RAISE EXCEPTION 'campo_telemetria_reintento_distinto'; END IF;
    RETURN v_cantidad;
  END IF;
  IF v_primera <> v_esperada THEN RAISE EXCEPTION 'campo_telemetria_secuencia_invalida'; END IF;
  INSERT INTO public.campo_telemetria_muestras(comercio_id,importacion_id,timestamp_at,secuencia,latitud,longitud,altitud_m,precision_m,velocidad_kmh,rumbo_grados,horas_motor,combustible_litros,distancia_acumulada_km,superficie_acumulada_ha,motor_encendido,trabajando,identificador_externo,datos_adicionales)
  SELECT v_importacion.comercio_id,v_importacion.id,x.timestamp::timestamptz,x.sequence,x.latitude,x.longitude,x.altitude_m,x.accuracy_m,x.speed_kmh,x.heading_deg,x.engine_hours,x.fuel_liters,x.distance_km,x.area_ha,x.engine_on,x.working,nullif(x.external_id,''),coalesce(x.extra,'{}'::jsonb)
  FROM jsonb_to_recordset(p_muestras) AS x(timestamp text, sequence bigint, latitude double precision, longitude double precision, altitude_m double precision, accuracy_m double precision, speed_kmh double precision, heading_deg double precision, engine_hours double precision, fuel_liters double precision, distance_km double precision, area_ha double precision, engine_on boolean, working boolean, external_id text, extra jsonb);
  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  UPDATE public.campo_telemetria_importaciones SET estado='cargando', cantidad_muestras=cantidad_muestras+v_insertadas, cantidad_validas=cantidad_validas+v_insertadas WHERE id=v_importacion.id AND comercio_id=v_importacion.comercio_id;
  RETURN v_insertadas;
END;
$function$;

CREATE FUNCTION public.campo_telemetria_resumen_importacion(p_importacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v_importacion public.campo_telemetria_importaciones; v_resumen jsonb;
BEGIN
  v_importacion := public.campo_telemetria_autorizar_lectura(p_importacion_id, false);
  WITH muestras_ordenadas AS (
    SELECT m.*, lag(m.timestamp_at) OVER w AS timestamp_anterior, lag(m.latitud) OVER w AS latitud_anterior, lag(m.longitud) OVER w AS longitud_anterior, lag(m.horas_motor) OVER w AS horas_motor_anterior, lag(m.combustible_litros) OVER w AS combustible_anterior, lag(m.distancia_acumulada_km) OVER w AS distancia_anterior, lag(m.superficie_acumulada_ha) OVER w AS superficie_anterior
    FROM public.campo_telemetria_muestras m WHERE m.comercio_id=v_importacion.comercio_id AND m.importacion_id=v_importacion.id WINDOW w AS (ORDER BY m.secuencia,m.timestamp_at)
  ), incrementos AS (
    SELECT mo.*, extract(epoch FROM mo.timestamp_at-mo.timestamp_anterior) AS segundos_intervalo,
      CASE WHEN mo.horas_motor_anterior IS NOT NULL AND mo.horas_motor>=mo.horas_motor_anterior THEN mo.horas_motor-mo.horas_motor_anterior END AS incremento_horas,
      CASE WHEN mo.combustible_anterior IS NOT NULL AND mo.combustible_litros<=mo.combustible_anterior THEN mo.combustible_anterior-mo.combustible_litros END AS consumo_combustible,
      CASE WHEN mo.distancia_anterior IS NOT NULL AND mo.distancia_acumulada_km>=mo.distancia_anterior THEN mo.distancia_acumulada_km-mo.distancia_anterior END AS incremento_distancia,
      CASE WHEN mo.superficie_anterior IS NOT NULL AND mo.superficie_acumulada_ha>=mo.superficie_anterior THEN mo.superficie_acumulada_ha-mo.superficie_anterior END AS incremento_superficie,
      CASE WHEN mo.latitud_anterior IS NOT NULL AND mo.longitud_anterior IS NOT NULL AND mo.latitud IS NOT NULL AND mo.longitud IS NOT NULL AND extract(epoch FROM mo.timestamp_at-mo.timestamp_anterior)>0 THEN public.campo_gps_haversine_metros(mo.latitud_anterior,mo.longitud_anterior,mo.latitud,mo.longitud)/1000.0 END AS segmento_geodesico_km,
      mo.horas_motor_anterior IS NOT NULL AND mo.horas_motor<mo.horas_motor_anterior AS regresion_horas,
      mo.combustible_anterior IS NOT NULL AND mo.combustible_litros>mo.combustible_anterior AS regresion_combustible,
      mo.distancia_anterior IS NOT NULL AND mo.distancia_acumulada_km<mo.distancia_anterior AS regresion_distancia,
      mo.superficie_anterior IS NOT NULL AND mo.superficie_acumulada_ha<mo.superficie_anterior AS regresion_superficie
    FROM muestras_ordenadas mo
  ), resumen_telemetria AS (
    SELECT count(*) AS muestras_totales, count(*) FILTER (WHERE timestamp_anterior IS NULL OR segundos_intervalo>0) AS muestras_validas, count(*) FILTER (WHERE timestamp_anterior IS NOT NULL AND segundos_intervalo<=0) AS muestras_descartadas, min(timestamp_at) AS periodo_inicio, max(timestamp_at) AS periodo_fin,
      coalesce(sum(incremento_horas) FILTER (WHERE incremento_horas>=0),0) AS horas_motor, coalesce(sum(consumo_combustible) FILTER (WHERE consumo_combustible>=0),0) AS combustible_consumido_l, coalesce(sum(incremento_distancia) FILTER (WHERE incremento_distancia>=0),0) AS distancia_informada_km, coalesce(sum(incremento_superficie) FILTER (WHERE incremento_superficie>=0),0) AS superficie_informada_ha, coalesce(sum(segmento_geodesico_km) FILTER (WHERE segmento_geodesico_km>=0 AND segundos_intervalo>0),0) AS distancia_geodesica_km,
      avg(velocidad_kmh) FILTER (WHERE velocidad_kmh>=0) AS velocidad_promedio_kmh, max(velocidad_kmh) FILTER (WHERE velocidad_kmh>=0) AS velocidad_maxima_kmh,
      count(*) FILTER (WHERE regresion_horas OR regresion_combustible OR regresion_distancia OR regresion_superficie) AS regresiones
    FROM incrementos
  ), declarados_por_unidad AS (
    SELECT l.unidad, sum(pl.cantidad_ejecutada)::numeric AS valor_declarado
    FROM public.campo_partes_trabajo p JOIN public.campo_orden_labores l ON l.comercio_id=p.comercio_id AND l.id=p.orden_labor_id AND l.activo JOIN public.campo_parte_lotes pl ON pl.comercio_id=p.comercio_id AND pl.parte_id=p.id AND pl.activo
    WHERE v_importacion.parte_id IS NOT NULL AND p.comercio_id=v_importacion.comercio_id AND p.id=v_importacion.parte_id AND p.estado <> 'anulado' AND (v_importacion.orden_id IS NULL OR p.orden_id=v_importacion.orden_id) GROUP BY l.unidad
  ), declarados AS (
    SELECT max(valor_declarado) FILTER (WHERE unidad='ha') AS ha, max(valor_declarado) FILTER (WHERE unidad='hora') AS hora, max(valor_declarado) FILTER (WHERE unidad='km') AS km FROM declarados_por_unidad
  ), comparaciones AS (
    SELECT jsonb_build_object(
      'ha',jsonb_build_object('unidad','ha','valor_telemetria',rt.superficie_informada_ha,'valor_declarado',d.ha,'diferencia',CASE WHEN d.ha IS NOT NULL THEN rt.superficie_informada_ha-d.ha END,'diferencia_porcentaje',CASE WHEN d.ha>0 THEN (rt.superficie_informada_ha-d.ha)*100/d.ha END,'disponible',d.ha IS NOT NULL,'motivo',CASE WHEN v_importacion.parte_id IS NULL THEN 'sin_parte' WHEN d.ha IS NULL THEN 'unidad_no_comparable' END),
      'hora',jsonb_build_object('unidad','hora','valor_telemetria',rt.horas_motor,'valor_declarado',d.hora,'diferencia',CASE WHEN d.hora IS NOT NULL THEN rt.horas_motor-d.hora END,'diferencia_porcentaje',CASE WHEN d.hora>0 THEN (rt.horas_motor-d.hora)*100/d.hora END,'disponible',d.hora IS NOT NULL,'motivo',CASE WHEN v_importacion.parte_id IS NULL THEN 'sin_parte' WHEN d.hora IS NULL THEN 'unidad_no_comparable' END),
      'km',jsonb_build_object('unidad','km','valor_telemetria',rt.distancia_geodesica_km,'valor_declarado',d.km,'diferencia',CASE WHEN d.km IS NOT NULL THEN rt.distancia_geodesica_km-d.km END,'diferencia_porcentaje',CASE WHEN d.km>0 THEN (rt.distancia_geodesica_km-d.km)*100/d.km END,'disponible',d.km IS NOT NULL,'motivo',CASE WHEN v_importacion.parte_id IS NULL THEN 'sin_parte' WHEN d.km IS NULL THEN 'unidad_no_comparable' END)
    ) AS datos FROM resumen_telemetria rt CROSS JOIN declarados d
  )
  SELECT jsonb_build_object('periodo_inicio',rt.periodo_inicio,'periodo_fin',rt.periodo_fin,'duracion_s',CASE WHEN rt.periodo_inicio IS NOT NULL AND rt.periodo_fin IS NOT NULL THEN extract(epoch FROM rt.periodo_fin-rt.periodo_inicio) END,'muestras_totales',rt.muestras_totales,'muestras_validas',rt.muestras_validas,'muestras_descartadas',rt.muestras_descartadas,'distancia_informada_km',rt.distancia_informada_km,'distancia_geodesica_km',rt.distancia_geodesica_km,'horas_motor',rt.horas_motor,'combustible_consumido_l',rt.combustible_consumido_l,'superficie_informada_ha',rt.superficie_informada_ha,'velocidad_promedio_kmh',rt.velocidad_promedio_kmh,'velocidad_maxima_kmh',rt.velocidad_maxima_kmh,'advertencias',to_jsonb(array_remove(ARRAY[CASE WHEN rt.muestras_totales=0 THEN 'sin_muestras' END,CASE WHEN rt.muestras_descartadas>0 THEN 'intervalos_invalidos' END,CASE WHEN rt.regresiones>0 THEN 'regresion_acumulador' END],NULL)),'comparaciones',c.datos)
  INTO v_resumen FROM resumen_telemetria rt CROSS JOIN comparaciones c;
  RETURN v_resumen;
END;
$function$;

REVOKE ALL ON FUNCTION public.campo_telemetria_autorizar_lectura(uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.campo_telemetria_estado_importacion(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.campo_telemetria_cargar_muestras(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.campo_telemetria_resumen_importacion(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.campo_telemetria_estado_importacion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campo_telemetria_cargar_muestras(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campo_telemetria_resumen_importacion(uuid) TO authenticated;

COMMIT;
