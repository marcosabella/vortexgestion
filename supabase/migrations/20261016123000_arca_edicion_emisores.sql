-- Configuration only: no production data repair or historical sale changes.
BEGIN;
CREATE OR REPLACE FUNCTION public.guardar_emisor_fiscal(p_comercio_id uuid,p_datos jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
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
  IF e.cuit_emisor<>p_datos->>'cuit_emisor' OR e.punto_venta<>(p_datos->>'punto_venta')::integer OR e.ambiente<>p_datos->>'ambiente' THEN
   -- Preserve the identity and credentials referenced by existing sales.
   -- Future sales use a new configuration; historical snapshots remain unchanged.
   IF EXISTS(SELECT 1 FROM public.ventas WHERE comercio_id=p_comercio_id AND emisor_fiscal_id=e.id) THEN
    target:=gen_random_uuid();
   END IF;
   IF e.cuit_emisor<>p_datos->>'cuit_emisor' OR e.ambiente<>p_datos->>'ambiente' THEN
    e.certificado_crt:=NULL;e.certificado_key:=NULL;e.certificado_vencimiento:=NULL;
    IF NOT (p_datos ? 'certificado_crt') THEN p_datos:=p_datos-'certificado_vencimiento';END IF;
   END IF;
  END IF;
 END IF;
 IF (p_datos ? 'certificado_crt' AND coalesce(p_datos->>'certificado_crt','') NOT LIKE '%-----BEGIN CERTIFICATE-----%') OR (p_datos ? 'certificado_key' AND coalesce(p_datos->>'certificado_key','') !~ '-----BEGIN (RSA |EC )?PRIVATE KEY-----') THEN RAISE EXCEPTION 'emisor_certificado_invalido';END IF;
 por_defecto:=coalesce((p_datos->>'predeterminado')::boolean,false);
 IF por_defecto THEN UPDATE public.emisores_fiscales SET predeterminado=false WHERE comercio_id=p_comercio_id AND predeterminado;END IF;
 INSERT INTO public.emisores_fiscales(id,comercio_id,cuit_emisor,razon_social,punto_venta,ambiente,situacion_afip,domicilio,localidad,provincia,ingresos_brutos,fecha_inicio_actividad,activo,predeterminado,certificado_crt,certificado_key,certificado_vencimiento)
 VALUES(target,p_comercio_id,p_datos->>'cuit_emisor',p_datos->>'razon_social',(p_datos->>'punto_venta')::integer,p_datos->>'ambiente',p_datos->>'situacion_afip',coalesce(p_datos->>'domicilio',''),coalesce(p_datos->>'localidad',''),coalesce(p_datos->>'provincia',''),coalesce(p_datos->>'ingresos_brutos',''),(nullif(p_datos->>'fecha_inicio_actividad',''))::date,coalesce((p_datos->>'activo')::boolean,true),por_defecto,coalesce(p_datos->>'certificado_crt',e.certificado_crt),coalesce(p_datos->>'certificado_key',e.certificado_key),coalesce((nullif(p_datos->>'certificado_vencimiento',''))::date,e.certificado_vencimiento))
 ON CONFLICT(id) DO UPDATE SET cuit_emisor=EXCLUDED.cuit_emisor,punto_venta=EXCLUDED.punto_venta,ambiente=EXCLUDED.ambiente,razon_social=EXCLUDED.razon_social,situacion_afip=EXCLUDED.situacion_afip,domicilio=EXCLUDED.domicilio,localidad=EXCLUDED.localidad,provincia=EXCLUDED.provincia,ingresos_brutos=EXCLUDED.ingresos_brutos,fecha_inicio_actividad=EXCLUDED.fecha_inicio_actividad,activo=EXCLUDED.activo,predeterminado=EXCLUDED.predeterminado,certificado_crt=EXCLUDED.certificado_crt,certificado_key=EXCLUDED.certificado_key,certificado_vencimiento=EXCLUDED.certificado_vencimiento,updated_at=now();
 IF coalesce((p_datos->>'eliminar_certificados')::boolean,false) THEN
  UPDATE public.emisores_fiscales SET certificado_crt=NULL,certificado_key=NULL,certificado_vencimiento=NULL WHERE id=target AND comercio_id=p_comercio_id;
 END IF;
 RETURN target;
END $$;
REVOKE ALL ON FUNCTION public.guardar_emisor_fiscal(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.guardar_emisor_fiscal(uuid,jsonb) TO authenticated;
COMMIT;
