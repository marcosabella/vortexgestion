BEGIN;
ALTER TABLE public.distribucion_repartos
 ADD COLUMN ruta_version integer NOT NULL DEFAULT 1,
 ADD COLUMN ruta_origen text NOT NULL DEFAULT '',
 ADD COLUMN ruta_latitud double precision,
 ADD COLUMN ruta_longitud double precision,
 ADD COLUMN ruta_regreso boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT distribucion_origen_coordenadas CHECK (
  (ruta_latitud IS NULL AND ruta_longitud IS NULL) OR
  (ruta_latitud IS NOT NULL AND ruta_longitud IS NOT NULL AND ruta_latitud BETWEEN -90 AND 90 AND ruta_longitud BETWEEN -180 AND 180));
ALTER TABLE public.distribucion_paradas
 ADD COLUMN latitud double precision,
 ADD COLUMN longitud double precision,
 ADD COLUMN direccion_mapa text NOT NULL DEFAULT '',
 ADD CONSTRAINT distribucion_parada_coordenadas CHECK (
  (latitud IS NULL AND longitud IS NULL) OR
  (latitud IS NOT NULL AND longitud IS NOT NULL AND latitud BETWEEN -90 AND 90 AND longitud BETWEEN -180 AND 180));

CREATE FUNCTION public.distribucion_version_ruta() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_TABLE_NAME='distribucion_repartos' THEN NEW.ruta_version:=OLD.ruta_version+1; RETURN NEW; END IF;
 UPDATE public.distribucion_repartos SET ruta_version=ruta_version+1
 WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.reparto_id ELSE NEW.reparto_id END;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER distribucion_ruta_version BEFORE UPDATE ON public.distribucion_repartos
 FOR EACH ROW EXECUTE FUNCTION public.distribucion_version_ruta();
CREATE TRIGGER distribucion_ruta_paradas AFTER INSERT OR DELETE OR UPDATE OF orden,latitud,longitud,direccion_mapa ON public.distribucion_paradas
 FOR EACH ROW EXECUTE FUNCTION public.distribucion_version_ruta();
REVOKE ALL ON FUNCTION public.distribucion_version_ruta() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.distribucion_guardar_ruta(p_comercio_id uuid,p_reparto_id uuid,p_version integer,p_datos jsonb,p_clave uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.distribucion_repartos; intento public.distribucion_intentos;
 solicitud jsonb; elemento jsonb; pp public.distribucion_paradas; n integer:=0;
 lat double precision; lng double precision; origen text;
BEGIN
 IF public.distribucion_habilitado(p_comercio_id) IS DISTINCT FROM true OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN
 RAISE EXCEPTION 'La hoja de ruta requiere administracion' USING ERRCODE='42501'; END IF;
 IF p_clave IS NULL OR p_version IS NULL OR jsonb_typeof(p_datos) IS DISTINCT FROM 'object' OR jsonb_typeof(p_datos->'paradas') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Ruta invalida'; END IF;
 solicitud:=jsonb_build_object('reparto_id',p_reparto_id,'version',p_version,'ruta',p_datos);
 PERFORM pg_advisory_xact_lock(hashtextextended('distribucion:'||p_comercio_id::text,0));
 SELECT * INTO intento FROM public.distribucion_intentos WHERE comercio_id=p_comercio_id AND clave=p_clave;
 IF FOUND THEN
 IF intento.usuario_id<>auth.uid() OR intento.accion<>'guardar_ruta' OR intento.datos<>solicitud THEN RAISE EXCEPTION 'Intento reutilizado con otros datos'; END IF;
 RETURN intento.resultado; END IF;
 SELECT * INTO r FROM public.distribucion_repartos WHERE id=p_reparto_id AND comercio_id=p_comercio_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reparto no disponible'; END IF;
 IF r.estado<>'planificado' THEN RAISE EXCEPTION 'La ruta se organiza antes de despachar'; END IF;
 IF r.ruta_version<>p_version THEN RAISE EXCEPTION 'El reparto cambio; actualiza antes de guardar' USING ERRCODE='40001'; END IF;
 IF jsonb_array_length(p_datos->'paradas')<>(SELECT count(*) FROM public.distribucion_paradas WHERE reparto_id=r.id)
 OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_datos->'paradas'))<>jsonb_array_length(p_datos->'paradas') THEN RAISE EXCEPTION 'Inclui todas las paradas una sola vez'; END IF;
 origen:=btrim(coalesce(p_datos->>'origen',''));
 IF length(origen)>500 OR (p_datos ? 'regreso' AND jsonb_typeof(p_datos->'regreso')<>'boolean') THEN RAISE EXCEPTION 'Origen o regreso invalido'; END IF;
 lat:=(p_datos->>'latitud')::double precision; lng:=(p_datos->>'longitud')::double precision;
 IF (lat IS NULL)<>(lng IS NULL) OR (lat IS NOT NULL AND (NOT(lat BETWEEN -90 AND 90) OR NOT(lng BETWEEN -180 AND 180) OR origen='')) THEN RAISE EXCEPTION 'Coordenadas de origen invalidas'; END IF;
 IF coalesce((p_datos->>'regreso')::boolean,false) AND origen='' THEN RAISE EXCEPTION 'Indica el origen para regresar'; END IF;
 UPDATE public.distribucion_repartos SET ruta_origen=origen,ruta_latitud=lat,ruta_longitud=lng,ruta_regreso=coalesce((p_datos->>'regreso')::boolean,false) WHERE id=r.id;
 FOR elemento IN SELECT value FROM jsonb_array_elements(p_datos->'paradas') LOOP
 n:=n+1;
 SELECT * INTO pp FROM public.distribucion_paradas WHERE id=(elemento->>'id')::uuid AND reparto_id=r.id AND comercio_id=p_comercio_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Parada ajena al reparto'; END IF;
 lat:=(elemento->>'latitud')::double precision; lng:=(elemento->>'longitud')::double precision;
 IF (lat IS NULL)<>(lng IS NULL) OR (lat IS NOT NULL AND (NOT(lat BETWEEN -90 AND 90) OR NOT(lng BETWEEN -180 AND 180))) THEN RAISE EXCEPTION 'Coordenadas de parada invalidas'; END IF;
 UPDATE public.distribucion_paradas SET orden=n,latitud=lat,longitud=lng,
 direccion_mapa=CASE WHEN lat IS NULL THEN '' ELSE (SELECT direccion FROM public.distribucion_pedidos WHERE id=pp.pedido_id) END WHERE id=pp.id;
 END LOOP;
 INSERT INTO public.distribucion_eventos(comercio_id,reparto_id,tipo,datos,usuario_id) VALUES(p_comercio_id,r.id,'guardar_ruta',solicitud,auth.uid());
 INSERT INTO public.distribucion_intentos VALUES(p_comercio_id,p_clave,auth.uid(),'guardar_ruta',solicitud,r.id);
 RETURN r.id;
END $$;
REVOKE ALL ON FUNCTION public.distribucion_guardar_ruta(uuid,uuid,integer,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.distribucion_guardar_ruta(uuid,uuid,integer,jsonb,uuid) TO authenticated;
COMMIT;
