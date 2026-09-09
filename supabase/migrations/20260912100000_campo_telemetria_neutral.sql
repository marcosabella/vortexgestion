-- Telemetria neutral: CSV canonico y GPX/API normalizados fuera de PostgreSQL.
-- CSV futuro: timestamp,latitude,longitude,altitude_m,accuracy_m,speed_kmh,
-- heading_deg,engine_hours,fuel_liters,distance_km,area_ha,engine_on,working,external_id.
BEGIN;

CREATE TABLE public.campo_telemetria_importaciones (
  id uuid PRIMARY KEY, comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  maquinaria_id uuid NOT NULL, orden_id uuid, parte_id uuid, sesion_gps_id uuid,
  formato text NOT NULL, origen text NOT NULL, proveedor text, identificador_externo text,
  nombre_archivo text, hash_sha256 text NOT NULL, estado text NOT NULL DEFAULT 'iniciada',
  inicio_at timestamptz, fin_at timestamptz, cantidad_muestras integer NOT NULL DEFAULT 0,
  cantidad_validas integer NOT NULL DEFAULT 0, cantidad_descartadas integer NOT NULL DEFAULT 0,
  imported_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), finalizada_at timestamptz, cancelada_at timestamptz,
  CONSTRAINT campo_telemetria_importaciones_comercio_id_id_key UNIQUE(comercio_id,id),
  CONSTRAINT campo_telemetria_importaciones_hash_unico UNIQUE(comercio_id,hash_sha256,maquinaria_id),
  CONSTRAINT campo_telemetria_importaciones_formato CHECK(formato IN('csv','gpx')),
  CONSTRAINT campo_telemetria_importaciones_origen CHECK(origen IN('manual','fabricante','api')),
  CONSTRAINT campo_telemetria_importaciones_estado CHECK(estado IN('iniciada','cargando','finalizada','cancelada')),
  CONSTRAINT campo_telemetria_importaciones_hash CHECK(hash_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT campo_telemetria_importaciones_nombre_seguro CHECK(nombre_archivo IS NULL OR (nombre_archivo !~ '[/\\]' AND nombre_archivo !~ '[[:cntrl:]]' AND length(nombre_archivo)<=255)),
  CONSTRAINT campo_telemetria_importaciones_maquinaria_fkey FOREIGN KEY(comercio_id,maquinaria_id) REFERENCES public.campo_maquinarias(comercio_id,id) ON DELETE RESTRICT,
  CONSTRAINT campo_telemetria_importaciones_orden_fkey FOREIGN KEY(comercio_id,orden_id) REFERENCES public.campo_ordenes_trabajo(comercio_id,id) ON DELETE RESTRICT,
  CONSTRAINT campo_telemetria_importaciones_parte_fkey FOREIGN KEY(comercio_id,parte_id) REFERENCES public.campo_partes_trabajo(comercio_id,id) ON DELETE RESTRICT,
  CONSTRAINT campo_telemetria_importaciones_sesion_fkey FOREIGN KEY(comercio_id,sesion_gps_id) REFERENCES public.campo_gps_sesiones(comercio_id,id) ON DELETE RESTRICT
);

CREATE TABLE public.campo_telemetria_muestras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL, importacion_id uuid NOT NULL,
  timestamp_at timestamptz NOT NULL, secuencia bigint NOT NULL, latitud double precision, longitud double precision, altitud_m double precision, precision_m double precision, velocidad_kmh double precision, rumbo_grados double precision,
  horas_motor double precision, combustible_litros double precision, distancia_acumulada_km double precision, superficie_acumulada_ha double precision, motor_encendido boolean, trabajando boolean, identificador_externo text, datos_adicionales jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campo_telemetria_muestras_importacion_fkey FOREIGN KEY(comercio_id,importacion_id) REFERENCES public.campo_telemetria_importaciones(comercio_id,id) ON DELETE RESTRICT,
  CONSTRAINT campo_telemetria_muestras_secuencia_unica UNIQUE(importacion_id,secuencia), CONSTRAINT campo_telemetria_muestras_externo_unico UNIQUE(importacion_id,identificador_externo),
  CONSTRAINT campo_telemetria_muestras_secuencia CHECK(secuencia>0), CONSTRAINT campo_telemetria_muestras_coordenadas CHECK((latitud IS NULL)=(longitud IS NULL)),
  CONSTRAINT campo_telemetria_muestras_lat CHECK(latitud IS NULL OR (latitud > '-Infinity'::float8 AND latitud < 'Infinity'::float8 AND latitud BETWEEN -90 AND 90)),
  CONSTRAINT campo_telemetria_muestras_lon CHECK(longitud IS NULL OR (longitud > '-Infinity'::float8 AND longitud < 'Infinity'::float8 AND longitud BETWEEN -180 AND 180)),
  CONSTRAINT campo_telemetria_muestras_numeros CHECK((altitud_m IS NULL OR (altitud_m > '-Infinity'::float8 AND altitud_m < 'Infinity'::float8)) AND (precision_m IS NULL OR (precision_m > '-Infinity'::float8 AND precision_m < 'Infinity'::float8 AND precision_m>=0)) AND (velocidad_kmh IS NULL OR (velocidad_kmh > '-Infinity'::float8 AND velocidad_kmh < 'Infinity'::float8 AND velocidad_kmh>=0 AND velocidad_kmh<=500)) AND (rumbo_grados IS NULL OR (rumbo_grados > '-Infinity'::float8 AND rumbo_grados < 'Infinity'::float8 AND rumbo_grados>=0 AND rumbo_grados<360)) AND (horas_motor IS NULL OR (horas_motor > '-Infinity'::float8 AND horas_motor < 'Infinity'::float8 AND horas_motor>=0)) AND (combustible_litros IS NULL OR (combustible_litros > '-Infinity'::float8 AND combustible_litros < 'Infinity'::float8 AND combustible_litros>=0)) AND (distancia_acumulada_km IS NULL OR (distancia_acumulada_km > '-Infinity'::float8 AND distancia_acumulada_km < 'Infinity'::float8 AND distancia_acumulada_km>=0)) AND (superficie_acumulada_ha IS NULL OR (superficie_acumulada_ha > '-Infinity'::float8 AND superficie_acumulada_ha < 'Infinity'::float8 AND superficie_acumulada_ha>=0))),
  CONSTRAINT campo_telemetria_muestras_datos CHECK(jsonb_typeof(datos_adicionales)='object' AND octet_length(datos_adicionales::text)<=8192)
);
CREATE INDEX campo_telemetria_importaciones_consulta ON public.campo_telemetria_importaciones(comercio_id,maquinaria_id,created_at DESC);
CREATE INDEX campo_telemetria_importaciones_parte ON public.campo_telemetria_importaciones(comercio_id,parte_id,created_at DESC) WHERE parte_id IS NOT NULL;
CREATE INDEX campo_telemetria_muestras_periodo ON public.campo_telemetria_muestras(comercio_id,importacion_id,timestamp_at,secuencia);

CREATE FUNCTION public.campo_telemetria_validar_importacion() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
DECLARE p public.campo_partes_trabajo; s public.campo_gps_sesiones; m public.campo_maquinarias;
BEGIN
 IF TG_OP='UPDATE' AND OLD.estado IN('finalizada','cancelada') THEN RAISE EXCEPTION 'campo_telemetria_importacion_inmutable'; END IF;
 SELECT * INTO m FROM public.campo_maquinarias WHERE comercio_id=NEW.comercio_id AND id=NEW.maquinaria_id AND activo; IF NOT FOUND THEN RAISE EXCEPTION 'campo_telemetria_maquinaria_invalida'; END IF;
 IF NEW.parte_id IS NOT NULL THEN SELECT * INTO p FROM public.campo_partes_trabajo WHERE comercio_id=NEW.comercio_id AND id=NEW.parte_id; IF NOT FOUND OR (NEW.orden_id IS NOT NULL AND p.orden_id<>NEW.orden_id) THEN RAISE EXCEPTION 'campo_telemetria_parte_orden_invalida'; END IF; END IF;
 IF NEW.sesion_gps_id IS NOT NULL THEN SELECT * INTO s FROM public.campo_gps_sesiones WHERE comercio_id=NEW.comercio_id AND id=NEW.sesion_gps_id; IF NOT FOUND OR NEW.parte_id IS NULL OR s.parte_id<>NEW.parte_id THEN RAISE EXCEPTION 'campo_telemetria_sesion_invalida'; END IF; END IF;
 NEW.updated_at:=now(); RETURN NEW;
END;$function$;
CREATE FUNCTION public.campo_telemetria_proteger_muestra() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
BEGIN IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'campo_telemetria_muestra_inmutable'; END IF; RETURN NEW; END;$function$;
CREATE TRIGGER campo_telemetria_importaciones_validate BEFORE INSERT OR UPDATE ON public.campo_telemetria_importaciones FOR EACH ROW EXECUTE FUNCTION public.campo_telemetria_validar_importacion();
CREATE TRIGGER campo_telemetria_muestras_protect BEFORE INSERT OR UPDATE OR DELETE ON public.campo_telemetria_muestras FOR EACH ROW EXECUTE FUNCTION public.campo_telemetria_proteger_muestra();

CREATE FUNCTION public.campo_telemetria_admin(p_comercio uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN IF auth.uid() IS NULL OR public.user_is_comercio_admin(p_comercio) IS DISTINCT FROM true THEN RAISE EXCEPTION 'campo_telemetria_no_autorizado' USING ERRCODE='42501'; END IF; END;$function$;
CREATE FUNCTION public.campo_telemetria_iniciar_importacion(p_id uuid,p_maquinaria_id uuid,p_orden_id uuid DEFAULT NULL,p_parte_id uuid DEFAULT NULL,p_sesion_gps_id uuid DEFAULT NULL,p_formato text DEFAULT 'csv',p_origen text DEFAULT 'manual',p_proveedor text DEFAULT NULL,p_identificador_externo text DEFAULT NULL,p_nombre_archivo text DEFAULT NULL,p_hash_sha256 text DEFAULT NULL)
RETURNS public.campo_telemetria_importaciones LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v public.campo_telemetria_importaciones; v_comercio uuid;
BEGIN SELECT comercio_id INTO v_comercio FROM public.campo_maquinarias WHERE id=p_maquinaria_id; PERFORM public.campo_telemetria_admin(v_comercio); SELECT * INTO v FROM public.campo_telemetria_importaciones WHERE comercio_id=v_comercio AND id=p_id; IF FOUND THEN RETURN v; END IF; INSERT INTO public.campo_telemetria_importaciones(id,comercio_id,maquinaria_id,orden_id,parte_id,sesion_gps_id,formato,origen,proveedor,identificador_externo,nombre_archivo,hash_sha256,imported_by) VALUES(p_id,v_comercio,p_maquinaria_id,p_orden_id,p_parte_id,p_sesion_gps_id,p_formato,p_origen,p_proveedor,p_identificador_externo,p_nombre_archivo,lower(p_hash_sha256),auth.uid()) RETURNING * INTO v; RETURN v; END;$function$;
CREATE FUNCTION public.campo_telemetria_cargar_muestras(p_importacion_id uuid,p_muestras jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE i public.campo_telemetria_importaciones; n integer; inserted integer;
BEGIN SELECT * INTO i FROM public.campo_telemetria_importaciones WHERE id=p_importacion_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'campo_telemetria_importacion_no_disponible'; END IF; PERFORM public.campo_telemetria_admin(i.comercio_id); IF i.estado NOT IN('iniciada','cargando') OR jsonb_typeof(p_muestras)<>'array' THEN RAISE EXCEPTION 'campo_telemetria_lote_invalido'; END IF; n:=jsonb_array_length(p_muestras); IF n<1 OR n>500 THEN RAISE EXCEPTION 'campo_telemetria_lote_invalido'; END IF; IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_muestras) x WHERE jsonb_object_keys(x) NOT IN('timestamp','latitude','longitude','altitude_m','accuracy_m','speed_kmh','heading_deg','engine_hours','fuel_liters','distance_km','area_ha','engine_on','working','external_id','sequence','extra')) THEN RAISE EXCEPTION 'campo_telemetria_clave_desconocida'; END IF; INSERT INTO public.campo_telemetria_muestras(comercio_id,importacion_id,timestamp_at,secuencia,latitud,longitud,altitud_m,precision_m,velocidad_kmh,rumbo_grados,horas_motor,combustible_litros,distancia_acumulada_km,superficie_acumulada_ha,motor_encendido,trabajando,identificador_externo,datos_adicionales) SELECT i.comercio_id,i.id,(x->>'timestamp')::timestamptz,(x->>'sequence')::bigint,(x->>'latitude')::float8,(x->>'longitude')::float8,(x->>'altitude_m')::float8,(x->>'accuracy_m')::float8,(x->>'speed_kmh')::float8,(x->>'heading_deg')::float8,(x->>'engine_hours')::float8,(x->>'fuel_liters')::float8,(x->>'distance_km')::float8,(x->>'area_ha')::float8,(x->>'engine_on')::boolean,(x->>'working')::boolean,nullif(x->>'external_id',''),coalesce(x->'extra','{}'::jsonb) FROM jsonb_array_elements(p_muestras) x ON CONFLICT(importacion_id,secuencia) DO NOTHING; GET DIAGNOSTICS inserted=ROW_COUNT; UPDATE public.campo_telemetria_importaciones SET estado='cargando',cantidad_muestras=cantidad_muestras+inserted,cantidad_validas=cantidad_validas+inserted WHERE id=i.id; RETURN inserted; END;$function$;
CREATE FUNCTION public.campo_telemetria_finalizar_importacion(p_importacion_id uuid,p_cancelar boolean DEFAULT false) RETURNS public.campo_telemetria_importaciones LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE i public.campo_telemetria_importaciones; BEGIN SELECT * INTO i FROM public.campo_telemetria_importaciones WHERE id=p_importacion_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'campo_telemetria_importacion_no_disponible'; END IF; PERFORM public.campo_telemetria_admin(i.comercio_id); UPDATE public.campo_telemetria_importaciones SET estado=CASE WHEN p_cancelar THEN 'cancelada' ELSE 'finalizada' END,finalizada_at=CASE WHEN p_cancelar THEN NULL ELSE now() END,cancelada_at=CASE WHEN p_cancelar THEN now() ELSE NULL END,inicio_at=(SELECT min(timestamp_at) FROM public.campo_telemetria_muestras WHERE importacion_id=i.id),fin_at=(SELECT max(timestamp_at) FROM public.campo_telemetria_muestras WHERE importacion_id=i.id) WHERE id=i.id RETURNING * INTO i; RETURN i; END;$function$;
ALTER TABLE public.campo_telemetria_importaciones ENABLE ROW LEVEL SECURITY; ALTER TABLE public.campo_telemetria_muestras ENABLE ROW LEVEL SECURITY;
CREATE POLICY campo_telemetria_importaciones_select ON public.campo_telemetria_importaciones FOR SELECT TO authenticated USING(public.user_is_comercio_admin(comercio_id) OR (parte_id IS NOT NULL AND imported_by<>auth.uid() AND EXISTS(SELECT 1 FROM public.campo_partes_trabajo p WHERE p.comercio_id=comercio_id AND p.id=parte_id AND p.propietario_user_id=auth.uid())));
CREATE POLICY campo_telemetria_muestras_select ON public.campo_telemetria_muestras FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.campo_telemetria_importaciones i WHERE i.id=importacion_id AND i.comercio_id=comercio_id AND (public.user_is_comercio_admin(i.comercio_id) OR EXISTS(SELECT 1 FROM public.campo_partes_trabajo p WHERE p.comercio_id=i.comercio_id AND p.id=i.parte_id AND p.propietario_user_id=auth.uid()))));
REVOKE ALL ON TABLE public.campo_telemetria_importaciones,public.campo_telemetria_muestras FROM PUBLIC,anon,authenticated; GRANT SELECT ON TABLE public.campo_telemetria_importaciones,public.campo_telemetria_muestras TO authenticated;
REVOKE ALL ON FUNCTION public.campo_telemetria_admin(uuid) FROM PUBLIC,anon,authenticated; REVOKE ALL ON FUNCTION public.campo_telemetria_iniciar_importacion(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text),public.campo_telemetria_cargar_muestras(uuid,jsonb),public.campo_telemetria_finalizar_importacion(uuid,boolean) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.campo_telemetria_iniciar_importacion(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text),public.campo_telemetria_cargar_muestras(uuid,jsonb),public.campo_telemetria_finalizar_importacion(uuid,boolean) TO authenticated;
COMMIT;
