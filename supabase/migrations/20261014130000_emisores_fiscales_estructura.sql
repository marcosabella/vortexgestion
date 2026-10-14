-- Estructura local preparada. No aplica reparaciones ni reclasifica historicos.
BEGIN;
CREATE TABLE public.emisores_fiscales (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
 cuit_emisor text NOT NULL CHECK(cuit_emisor ~ '^[0-9]{11}$'), razon_social text NOT NULL CHECK(length(trim(razon_social))>0),
 punto_venta integer NOT NULL CHECK(punto_venta BETWEEN 1 AND 9999), ambiente text NOT NULL CHECK(ambiente IN ('homologacion','produccion')),
 situacion_afip text NOT NULL CHECK(situacion_afip IN ('Responsable Inscripto','IVA Responsable Inscripto','Monotributista','Responsable Monotributo','Exento','IVA Sujeto Exento','No Responsable','Consumidor Final','Responsable No Inscripto','Sujeto No Categorizado','Monotributista Social','Pequeño Contribuyente Eventual','Pequeño Contribuyente Eventual Social')), domicilio text NOT NULL DEFAULT '', localidad text NOT NULL DEFAULT '', provincia text NOT NULL DEFAULT '', ingresos_brutos text NOT NULL DEFAULT '', fecha_inicio_actividad date,
 activo boolean NOT NULL DEFAULT true, predeterminado boolean NOT NULL DEFAULT false,
 certificado_crt text, certificado_key text, certificado_vencimiento date,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,comercio_id), UNIQUE(comercio_id,cuit_emisor,punto_venta,ambiente), CHECK(NOT predeterminado OR activo)
);
CREATE INDEX emisores_fiscales_comercio_idx ON public.emisores_fiscales(comercio_id);
CREATE UNIQUE INDEX emisores_fiscales_default_idx ON public.emisores_fiscales(comercio_id) WHERE predeterminado;
ALTER TABLE public.emisores_fiscales ENABLE ROW LEVEL SECURITY;
CREATE POLICY emisores_fiscales_tenant ON public.emisores_fiscales FOR SELECT TO authenticated USING(public.user_belongs_to_comercio(comercio_id));
REVOKE ALL ON public.emisores_fiscales FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.emisores_fiscales TO service_role;

ALTER TABLE public.ventas ADD COLUMN emisor_fiscal_id uuid, ADD COLUMN emisor_snapshot jsonb;
ALTER TABLE public.ventas ADD CONSTRAINT ventas_emisor_tenant_fk FOREIGN KEY(emisor_fiscal_id,comercio_id) REFERENCES public.emisores_fiscales(id,comercio_id) ON DELETE RESTRICT;
CREATE INDEX ventas_comercio_emisor_idx ON public.ventas(comercio_id,emisor_fiscal_id,fecha_venta);
-- Misma numeracion visible puede existir en dos emisores. Conserva la regla legacy.
DROP INDEX public.ventas_numeracion_canonica_unica;
CREATE UNIQUE INDEX ventas_numeracion_canonica_unica ON public.ventas(comercio_id,tipo_comprobante,public.ventas_punto_venta_canonico(numero_comprobante),public.ventas_numero_secuencial_canonico(numero_comprobante)) WHERE emisor_fiscal_id IS NULL AND public.ventas_punto_venta_canonico(numero_comprobante) IS NOT NULL AND public.ventas_numero_secuencial_canonico(numero_comprobante) IS NOT NULL;
CREATE UNIQUE INDEX ventas_numeracion_emisor_unica ON public.ventas(comercio_id,emisor_fiscal_id,tipo_comprobante,public.ventas_punto_venta_canonico(numero_comprobante),public.ventas_numero_secuencial_canonico(numero_comprobante)) WHERE emisor_fiscal_id IS NOT NULL AND public.ventas_punto_venta_canonico(numero_comprobante) IS NOT NULL AND public.ventas_numero_secuencial_canonico(numero_comprobante) IS NOT NULL;

CREATE TABLE public.ventas_numeradores_emisores (
 comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT, emisor_fiscal_id uuid NOT NULL,
 tipo_comprobante public.tipo_comprobante NOT NULL, punto_venta integer NOT NULL, ultimo_numero bigint NOT NULL DEFAULT 0 CHECK(ultimo_numero>=0), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(comercio_id,emisor_fiscal_id,tipo_comprobante,punto_venta), FOREIGN KEY(emisor_fiscal_id,comercio_id) REFERENCES public.emisores_fiscales(id,comercio_id) ON DELETE RESTRICT
);
ALTER TABLE public.ventas_numeradores_emisores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ventas_numeradores_emisores FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.ventas_numeradores_emisores TO service_role;

CREATE FUNCTION public.validar_emisor_venta() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE e public.emisores_fiscales; multi boolean;
BEGIN
 IF TG_OP='UPDATE' AND OLD.emisor_fiscal_id IS NOT NULL THEN
  IF NEW.emisor_fiscal_id IS DISTINCT FROM OLD.emisor_fiscal_id OR NEW.emisor_snapshot IS DISTINCT FROM OLD.emisor_snapshot THEN RAISE EXCEPTION 'emisor_venta_inmutable';END IF;
  IF NEW.punto_venta IS DISTINCT FROM (OLD.emisor_snapshot->>'punto_venta')::integer OR public.ventas_punto_venta_canonico(NEW.numero_comprobante) IS DISTINCT FROM (OLD.emisor_snapshot->>'punto_venta')::integer THEN RAISE EXCEPTION 'emisor_punto_venta_invalido';END IF;
  RETURN NEW;
 END IF;
 SELECT coalesce((parametros->'funciones'->>'multiples_cuit')::boolean,false) INTO multi FROM public.comercio_parametrizacion WHERE comercio_id=NEW.comercio_id;
 IF NEW.emisor_fiscal_id IS NULL THEN
  IF TG_OP='INSERT' AND coalesce(multi,false) THEN RAISE EXCEPTION 'emisor_fiscal_requerido';END IF;
  IF NEW.emisor_snapshot IS NOT NULL THEN RAISE EXCEPTION 'emisor_snapshot_sin_emisor';END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND (nullif(OLD.cae,'') IS NOT NULL OR EXISTS(SELECT 1 FROM public.afip_cae_intentos WHERE venta_id=OLD.id)) THEN RAISE EXCEPTION 'emisor_venta_fiscal_bloqueado';END IF;
 SELECT * INTO e FROM public.emisores_fiscales WHERE id=NEW.emisor_fiscal_id AND comercio_id=NEW.comercio_id AND activo;
 IF NOT FOUND OR NOT coalesce(multi,false) THEN RAISE EXCEPTION 'emisor_fiscal_no_disponible';END IF;
 IF NEW.punto_venta IS NOT NULL AND NEW.punto_venta<>e.punto_venta THEN RAISE EXCEPTION 'emisor_punto_venta_invalido';END IF;
 IF public.ventas_punto_venta_canonico(NEW.numero_comprobante) IS DISTINCT FROM e.punto_venta THEN RAISE EXCEPTION 'emisor_punto_venta_invalido';END IF;
 NEW.punto_venta:=e.punto_venta;
 NEW.emisor_snapshot:=jsonb_build_object('id',e.id,'cuit_emisor',e.cuit_emisor,'razon_social',e.razon_social,'punto_venta',e.punto_venta,'ambiente',e.ambiente,'situacion_afip',e.situacion_afip,'domicilio',e.domicilio,'localidad',e.localidad,'provincia',e.provincia,'ingresos_brutos',e.ingresos_brutos,'fecha_inicio_actividad',e.fecha_inicio_actividad);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validar_emisor_venta() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_validar_emisor_venta BEFORE INSERT OR UPDATE ON public.ventas FOR EACH ROW EXECUTE FUNCTION public.validar_emisor_venta();

CREATE FUNCTION public.listar_emisores_fiscales(p_comercio_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.user_belongs_to_comercio(p_comercio_id) THEN RAISE EXCEPTION 'emisores_no_autorizado' USING ERRCODE='42501';END IF;
 RETURN (SELECT coalesce(jsonb_agg((to_jsonb(e)-ARRAY['certificado_crt','certificado_key'])||jsonb_build_object('tiene_certificados',nullif(e.certificado_crt,'') IS NOT NULL AND nullif(e.certificado_key,'') IS NOT NULL) ORDER BY e.predeterminado DESC,e.razon_social,e.punto_venta),'[]') FROM public.emisores_fiscales e WHERE e.comercio_id=p_comercio_id);
END $$;

CREATE FUNCTION public.guardar_emisor_fiscal(p_comercio_id uuid,p_datos jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE e public.emisores_fiscales; target uuid; nuevo boolean; por_defecto boolean;
BEGIN
 IF NOT public.user_is_comercio_admin(p_comercio_id) THEN RAISE EXCEPTION 'emisores_no_autorizado' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.comercio_parametrizacion WHERE comercio_id=p_comercio_id AND parametros->'funciones'->>'multiples_cuit'='true') THEN RAISE EXCEPTION 'multiples_cuit_no_habilitado';END IF;
 IF jsonb_typeof(p_datos)<>'object' OR coalesce(p_datos->>'razon_social','')='' OR coalesce(p_datos->>'cuit_emisor','') !~ '^[0-9]{11}$' THEN RAISE EXCEPTION 'emisor_datos_invalidos';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('emisores:'||p_comercio_id::text,0));
 target:=coalesce((p_datos->>'id')::uuid,gen_random_uuid());nuevo:=NOT(p_datos ? 'id');
 IF NOT nuevo THEN
  SELECT * INTO e FROM public.emisores_fiscales WHERE id=target AND comercio_id=p_comercio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'emisor_fiscal_no_disponible';END IF;
  IF e.cuit_emisor<>p_datos->>'cuit_emisor' OR e.punto_venta<>(p_datos->>'punto_venta')::integer OR e.ambiente<>p_datos->>'ambiente' THEN RAISE EXCEPTION 'emisor_identidad_inmutable';END IF;
 END IF;
 IF (p_datos ? 'certificado_crt' AND coalesce(p_datos->>'certificado_crt','') NOT LIKE '%-----BEGIN CERTIFICATE-----%') OR (p_datos ? 'certificado_key' AND coalesce(p_datos->>'certificado_key','') !~ '-----BEGIN (RSA |EC )?PRIVATE KEY-----') THEN RAISE EXCEPTION 'emisor_certificado_invalido';END IF;
 por_defecto:=coalesce((p_datos->>'predeterminado')::boolean,false);
 IF por_defecto THEN UPDATE public.emisores_fiscales SET predeterminado=false WHERE comercio_id=p_comercio_id AND predeterminado;END IF;
 INSERT INTO public.emisores_fiscales(id,comercio_id,cuit_emisor,razon_social,punto_venta,ambiente,situacion_afip,domicilio,localidad,provincia,ingresos_brutos,fecha_inicio_actividad,activo,predeterminado,certificado_crt,certificado_key,certificado_vencimiento)
 VALUES(target,p_comercio_id,p_datos->>'cuit_emisor',p_datos->>'razon_social',(p_datos->>'punto_venta')::integer,p_datos->>'ambiente',p_datos->>'situacion_afip',coalesce(p_datos->>'domicilio',''),coalesce(p_datos->>'localidad',''),coalesce(p_datos->>'provincia',''),coalesce(p_datos->>'ingresos_brutos',''),(nullif(p_datos->>'fecha_inicio_actividad',''))::date,coalesce((p_datos->>'activo')::boolean,true),por_defecto,coalesce(p_datos->>'certificado_crt',e.certificado_crt),coalesce(p_datos->>'certificado_key',e.certificado_key),coalesce((nullif(p_datos->>'certificado_vencimiento',''))::date,e.certificado_vencimiento))
 ON CONFLICT(id) DO UPDATE SET razon_social=EXCLUDED.razon_social,situacion_afip=EXCLUDED.situacion_afip,domicilio=EXCLUDED.domicilio,localidad=EXCLUDED.localidad,provincia=EXCLUDED.provincia,ingresos_brutos=EXCLUDED.ingresos_brutos,fecha_inicio_actividad=EXCLUDED.fecha_inicio_actividad,activo=EXCLUDED.activo,predeterminado=EXCLUDED.predeterminado,certificado_crt=EXCLUDED.certificado_crt,certificado_key=EXCLUDED.certificado_key,certificado_vencimiento=EXCLUDED.certificado_vencimiento,updated_at=now();
 RETURN target;
END $$;
REVOKE ALL ON FUNCTION public.listar_emisores_fiscales(uuid),public.guardar_emisor_fiscal(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.listar_emisores_fiscales(uuid),public.guardar_emisor_fiscal(uuid,jsonb) TO authenticated;
COMMIT;
