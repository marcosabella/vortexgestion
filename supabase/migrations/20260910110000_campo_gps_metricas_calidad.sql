-- Vortex Campo GPS etapa 2. Umbrales centralizados: precision 50 m, brecha
-- 300 s, velocidad maxima 200 km/h, minimo 3 puntos y 20 m de desplazamiento.
BEGIN;

CREATE OR REPLACE FUNCTION public.campo_gps_metricas_umbrales()
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $function$
  SELECT '{"precision_max_m":50,"brecha_max_s":300,"velocidad_max_mps":55.555556,"puntos_minimos":3,"distancia_minima_m":20,"precision_buena_m":15}'::jsonb;
$function$;

CREATE OR REPLACE FUNCTION public.campo_gps_haversine_metros(p_lat_1 double precision, p_lon_1 double precision, p_lat_2 double precision, p_lon_2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, public AS $function$
  SELECT 6371008.8 * 2 * asin(
    sqrt(
      least(1::double precision, greatest(0::double precision,
        power(sin(radians((p_lat_2 - p_lat_1) / 2)), 2)
        + cos(radians(p_lat_1)) * cos(radians(p_lat_2))
          * power(sin(radians((p_lon_2 - p_lon_1) / 2)), 2)
      ))
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.campo_gps_metricas_sesion(p_sesion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v_sesion public.campo_gps_sesiones; v_uid uuid := auth.uid(); v_resultado jsonb; v_umbrales jsonb := public.campo_gps_metricas_umbrales();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_sesion FROM public.campo_gps_sesiones WHERE id=p_sesion_id;
  IF NOT FOUND OR NOT (public.user_is_comercio_admin(v_sesion.comercio_id) OR (
    v_sesion.usuario_id=v_uid
    AND EXISTS (SELECT 1 FROM public.comercio_usuarios cu WHERE cu.comercio_id=v_sesion.comercio_id AND cu.user_id=v_uid AND cu.rol='operador' AND cu.activo)
    AND EXISTS (SELECT 1 FROM public.campo_operarios o WHERE o.comercio_id=v_sesion.comercio_id AND o.id=v_sesion.operador_id AND o.user_id=v_uid AND o.activo)
  )) THEN RAISE EXCEPTION 'campo_gps_no_autorizado' USING ERRCODE='42501'; END IF;
  WITH umbral AS (SELECT v_umbrales u),
  puntos AS (SELECT p.*, lag(p.latitud) over w lat_previa, lag(p.longitud) over w lon_previa, lag(p.precision_metros) over w precision_previa, lag(p.registrado_at) over w fecha_previa FROM public.campo_gps_puntos p WHERE p.comercio_id=v_sesion.comercio_id AND p.sesion_id=v_sesion.id WINDOW w AS (ORDER BY p.secuencia,p.registrado_at)),
  clasificados AS (SELECT p.*, (p.precision_metros <= (u->>'precision_max_m')::double precision) valido, CASE WHEN p.lat_previa IS NULL THEN NULL ELSE public.campo_gps_haversine_metros(p.lat_previa,p.lon_previa,p.latitud,p.longitud) END distancia_m, CASE WHEN p.fecha_previa IS NULL THEN NULL ELSE extract(epoch FROM p.registrado_at-p.fecha_previa) END segundos, u FROM puntos p CROSS JOIN umbral),
  segmentos AS (SELECT *, CASE WHEN valido AND precision_previa <= (u->>'precision_max_m')::double precision AND segundos > 0 AND segundos <= (u->>'brecha_max_s')::double precision AND distancia_m is not null AND distancia_m / segundos <= (u->>'velocidad_max_mps')::double precision THEN true ELSE false END segmento_valido FROM clasificados),
  calculo AS (SELECT count(*) puntos_totales, count(*) filter(where valido) puntos_validos, count(*) filter(where not valido) puntos_descartados, coalesce(sum(distancia_m) filter(where segmento_valido),0) distancia_valida, coalesce(sum(distancia_m) filter(where distancia_m is not null and not segmento_valido),0) distancia_descartada, coalesce(max(distancia_m/nullif(segundos,0)) filter(where segmento_valido),0) velocidad_maxima, coalesce(avg(precision_metros) filter(where valido),0) precision_promedio, coalesce(max(precision_metros),0) precision_maxima, count(*) filter(where segundos > (u->>'brecha_max_s')::double precision) brechas, count(*) filter(where distancia_m is not null and segundos > 0 and distancia_m/segundos > (u->>'velocidad_max_mps')::double precision) saltos, max(registrado_at) ultima_at, (array_agg(jsonb_build_object('latitud',latitud,'longitud',longitud,'precision_metros',precision_metros,'registrado_at',registrado_at) order by secuencia desc))[1] ultima_ubicacion FROM segmentos)
  SELECT jsonb_build_object('sesion_id',v_sesion.id,'iniciada_at',v_sesion.iniciada_at,'finalizada_at',v_sesion.finalizada_at,'ultima_ubicacion',ultima_ubicacion,'duracion_total_s',greatest(0,extract(epoch from (coalesce(v_sesion.finalizada_at,now())-v_sesion.iniciada_at))::integer),'duracion_efectiva_s',greatest(0,extract(epoch from (coalesce(v_sesion.finalizada_at,now())-v_sesion.iniciada_at))::integer-v_sesion.segundos_pausados-case when v_sesion.estado='pausada' then extract(epoch from now()-v_sesion.pausada_at)::integer else 0 end),'puntos_totales',puntos_totales,'puntos_validos',puntos_validos,'puntos_descartados',puntos_descartados,'distancia_valida_m',round(distancia_valida::numeric,2),'distancia_descartada_m',round(distancia_descartada::numeric,2),'velocidad_promedio_mps',case when greatest(0,extract(epoch from (coalesce(v_sesion.finalizada_at,now())-v_sesion.iniciada_at))-v_sesion.segundos_pausados)>0 then round((distancia_valida/greatest(1,extract(epoch from (coalesce(v_sesion.finalizada_at,now())-v_sesion.iniciada_at))-v_sesion.segundos_pausados))::numeric,3) else 0 end,'velocidad_maxima_mps',round(velocidad_maxima::numeric,3),'precision_promedio_m',round(precision_promedio::numeric,1),'precision_maxima_m',round(precision_maxima::numeric,1),'calidad',case when puntos_validos < (v_umbrales->>'puntos_minimos')::integer or brechas>0 or saltos>0 then 'deficiente' when precision_promedio <= (v_umbrales->>'precision_buena_m')::double precision then 'buena' when precision_promedio <= (v_umbrales->>'precision_max_m')::double precision then 'aceptable' else 'deficiente' end,'alertas',to_jsonb(array_remove(array[case when precision_maxima > (v_umbrales->>'precision_max_m')::double precision then 'precision_deficiente' end,case when brechas>0 then 'sin_puntos_prolongado' end,case when saltos>0 then 'salto_o_velocidad_improbable' end,case when puntos_validos < (v_umbrales->>'puntos_minimos')::integer then 'puntos_insuficientes' end,case when v_sesion.estado='finalizada' and distancia_valida < (v_umbrales->>'distancia_minima_m')::double precision then 'sin_desplazamiento_significativo' end],null))) INTO v_resultado FROM calculo;
  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.campo_gps_metricas_umbrales(), public.campo_gps_haversine_metros(double precision,double precision,double precision,double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campo_gps_metricas_sesion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campo_gps_metricas_sesion(uuid) TO authenticated;
COMMIT;
