BEGIN;

CREATE FUNCTION public.taller_clave_nombre(p_nombre text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
  SELECT translate(upper(regexp_replace(btrim(p_nombre),'\s+',' ','g')),'ÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜáàâäãåéèêëíìîïóòôöõúùûü','AAAAAAEEEEIIIIOOOOOUUUUAAAAAAEEEEIIIIOOOOOUUUU');
$$;
REVOKE ALL ON FUNCTION public.taller_clave_nombre(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.taller_clave_nombre(text) TO authenticated;

CREATE TABLE public.taller_marcas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  nombre text NOT NULL CHECK(length(btrim(nombre)) BETWEEN 1 AND 100),
  clave text GENERATED ALWAYS AS (public.taller_clave_nombre(nombre)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(comercio_id,clave), UNIQUE(id,comercio_id)
);
CREATE TABLE public.taller_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  marca_id uuid NOT NULL,
  nombre text NOT NULL CHECK(length(btrim(nombre)) BETWEEN 1 AND 100),
  clave text GENERATED ALWAYS AS (public.taller_clave_nombre(nombre)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(marca_id,comercio_id) REFERENCES public.taller_marcas(id,comercio_id),
  UNIQUE(comercio_id,marca_id,clave), UNIQUE(id,marca_id,comercio_id)
);
ALTER TABLE public.taller_vehiculos ADD COLUMN marca_id uuid, ADD COLUMN modelo_id uuid;
ALTER TABLE public.taller_vehiculos ADD CONSTRAINT taller_vehiculo_marca_fk FOREIGN KEY(marca_id,comercio_id) REFERENCES public.taller_marcas(id,comercio_id);
ALTER TABLE public.taller_vehiculos ADD CONSTRAINT taller_vehiculo_modelo_fk FOREIGN KEY(modelo_id,marca_id,comercio_id) REFERENCES public.taller_modelos(id,marca_id,comercio_id);
CREATE INDEX taller_vehiculos_marca_modelo_idx ON public.taller_vehiculos(comercio_id,marca_id,modelo_id);
ALTER TABLE public.taller_marcas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taller_modelos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.taller_marcas,public.taller_modelos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.taller_marcas,public.taller_modelos TO authenticated;
CREATE POLICY taller_marcas_consulta ON public.taller_marcas FOR SELECT TO authenticated USING(public.taller_habilitado(comercio_id));
CREATE POLICY taller_modelos_consulta ON public.taller_modelos FOR SELECT TO authenticated USING(public.taller_habilitado(comercio_id));

CREATE FUNCTION public.taller_guardar_marca_modelo(p_comercio_id uuid,p_tipo text,p_nombre text,p_marca_id uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE resultado uuid; nombre_normalizado text;
BEGIN
  PERFORM public.taller_exigir_admin(p_comercio_id);
  nombre_normalizado:=upper(regexp_replace(btrim(p_nombre),'\s+',' ','g'));
  IF nombre_normalizado IS NULL OR length(nombre_normalizado) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'taller_nombre_invalido'; END IF;
  IF p_tipo='marca' THEN
    INSERT INTO public.taller_marcas(comercio_id,nombre) VALUES(p_comercio_id,nombre_normalizado)
      ON CONFLICT(comercio_id,clave) DO UPDATE SET nombre=taller_marcas.nombre RETURNING id INTO resultado;
  ELSIF p_tipo='modelo' THEN
    IF NOT EXISTS(SELECT 1 FROM public.taller_marcas WHERE id=p_marca_id AND comercio_id=p_comercio_id) THEN RAISE EXCEPTION 'taller_marca_otro_comercio'; END IF;
    INSERT INTO public.taller_modelos(comercio_id,marca_id,nombre) VALUES(p_comercio_id,p_marca_id,nombre_normalizado)
      ON CONFLICT(comercio_id,marca_id,clave) DO UPDATE SET nombre=taller_modelos.nombre RETURNING id INTO resultado;
  ELSE RAISE EXCEPTION 'taller_catalogo_invalido'; END IF;
  RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.taller_guardar_marca_modelo(uuid,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.taller_guardar_marca_modelo(uuid,text,text,uuid) TO authenticated;

CREATE FUNCTION public.taller_validar_marca_modelo_vehiculo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  -- Compatibilidad con formularios anteriores: resolver el texto al catálogo.
  IF NEW.marca_id IS NULL THEN NEW.marca_id:=public.taller_guardar_marca_modelo(NEW.comercio_id,'marca',NEW.marca,NULL); END IF;
  IF NEW.modelo_id IS NULL THEN NEW.modelo_id:=public.taller_guardar_marca_modelo(NEW.comercio_id,'modelo',NEW.modelo,NEW.marca_id); END IF;
  SELECT nombre INTO NEW.marca FROM public.taller_marcas WHERE id=NEW.marca_id AND comercio_id=NEW.comercio_id;
  SELECT nombre INTO NEW.modelo FROM public.taller_modelos WHERE id=NEW.modelo_id AND marca_id=NEW.marca_id AND comercio_id=NEW.comercio_id;
  IF NEW.marca IS NULL OR NEW.modelo IS NULL THEN RAISE EXCEPTION 'taller_marca_modelo_inconsistente'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.taller_validar_marca_modelo_vehiculo() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER taller_validar_marca_modelo BEFORE INSERT OR UPDATE OF marca,modelo,marca_id,modelo_id,comercio_id ON public.taller_vehiculos FOR EACH ROW EXECUTE FUNCTION public.taller_validar_marca_modelo_vehiculo();

CREATE OR REPLACE FUNCTION public.taller_guardar_catalogo(p_comercio_id uuid,p_tipo text,p_id uuid,p_datos jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE resultado uuid;
BEGIN
  PERFORM public.taller_exigir_admin(p_comercio_id);
  IF p_tipo='vehiculo' THEN
    IF p_id IS NULL THEN
      INSERT INTO public.taller_vehiculos(comercio_id,cliente_id,patente,marca,modelo,marca_id,modelo_id,anio,vin,kilometraje,observaciones)
      VALUES(p_comercio_id,(p_datos->>'cliente_id')::uuid,upper(regexp_replace(p_datos->>'patente','[^A-Za-z0-9]','','g')),p_datos->>'marca',p_datos->>'modelo',nullif(p_datos->>'marca_id','')::uuid,nullif(p_datos->>'modelo_id','')::uuid,nullif(p_datos->>'anio','')::integer,nullif(p_datos->>'vin',''),coalesce((p_datos->>'kilometraje')::integer,0),coalesce(p_datos->>'observaciones','')) RETURNING id INTO resultado;
    ELSE
      UPDATE public.taller_vehiculos SET cliente_id=(p_datos->>'cliente_id')::uuid,patente=upper(regexp_replace(p_datos->>'patente','[^A-Za-z0-9]','','g')),marca=p_datos->>'marca',modelo=p_datos->>'modelo',marca_id=nullif(p_datos->>'marca_id','')::uuid,modelo_id=nullif(p_datos->>'modelo_id','')::uuid,anio=nullif(p_datos->>'anio','')::integer,vin=nullif(p_datos->>'vin',''),kilometraje=coalesce((p_datos->>'kilometraje')::integer,0),observaciones=coalesce(p_datos->>'observaciones',''),activo=coalesce((p_datos->>'activo')::boolean,true),updated_at=now()
      WHERE id=p_id AND comercio_id=p_comercio_id RETURNING id INTO resultado;
    END IF;
  ELSIF p_tipo='tecnico' THEN
    IF p_id IS NULL THEN
      INSERT INTO public.taller_tecnicos(comercio_id,nombre,telefono,especialidad) VALUES(p_comercio_id,p_datos->>'nombre',coalesce(p_datos->>'telefono',''),coalesce(p_datos->>'especialidad','')) RETURNING id INTO resultado;
    ELSE
      UPDATE public.taller_tecnicos SET nombre=p_datos->>'nombre',telefono=coalesce(p_datos->>'telefono',''),especialidad=coalesce(p_datos->>'especialidad',''),activo=coalesce((p_datos->>'activo')::boolean,true),updated_at=now() WHERE id=p_id AND comercio_id=p_comercio_id RETURNING id INTO resultado;
    END IF;
  ELSE RAISE EXCEPTION 'taller_catalogo_invalido'; END IF;
  IF resultado IS NULL THEN RAISE EXCEPTION 'taller_registro_no_disponible'; END IF;
  RETURN resultado;
END $$;

COMMIT;
