CREATE TABLE public.historial_legacy(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
 migracion_id uuid NOT NULL REFERENCES public.migraciones(id) ON DELETE CASCADE, tipo text NOT NULL, source_id text NOT NULL,
 fecha timestamptz, datos jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(migracion_id,tipo,source_id));
ALTER TABLE public.historial_legacy ENABLE ROW LEVEL SECURITY;
CREATE POLICY historial_legacy_comercio ON public.historial_legacy FOR SELECT TO authenticated USING(public.user_belongs_to_comercio(comercio_id) OR public.is_app_admin());

CREATE FUNCTION public.migracion_simular_cierre(p_comercio_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e integer:=0; total integer;
BEGIN
 PERFORM public.migracion_assert_admin();
 IF NOT EXISTS(SELECT 1 FROM public.migraciones WHERE comercio_id=p_comercio_id AND estado='completado' AND resumen->>'tipo'='operaciones') THEN RAISE EXCEPTION 'Falta completar el historial operativo'; END IF;
 SELECT jsonb_array_length(p_payload->'presupuestos')+jsonb_array_length(p_payload->'items')+jsonb_array_length(p_payload->'archivo') INTO total;
 SELECT count(*) INTO e FROM jsonb_array_elements(p_payload->'presupuestos')x WHERE NOT EXISTS(SELECT 1 FROM public.migracion_id_map m WHERE m.comercio_id=p_comercio_id AND m.entidad='clientes' AND m.id_origen=x->'data'->>'cliente_source_id');
 e:=e+(SELECT count(*) FROM jsonb_array_elements(p_payload->'items')x WHERE NOT EXISTS(SELECT 1 FROM public.migracion_id_map m WHERE m.comercio_id=p_comercio_id AND m.entidad='productos' AND m.id_origen=x->'data'->>'producto_source_id'));
 RETURN jsonb_build_object('total',total,'validos',total-e,'omitidos',0,'errores',e);
END $$;

CREATE FUNCTION public.migracion_aplicar_cierre(p_comercio_id uuid,p_archivo_nombre text,p_archivo_hash text,p_archivo_tamano bigint,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE mid uuid; r jsonb; bid uuid; pid uuid; cid uuid; result jsonb;
BEGIN
 PERFORM public.migracion_assert_admin(); result:=public.migracion_simular_cierre(p_comercio_id,p_payload);
 IF (result->>'errores')::int>0 THEN RAISE EXCEPTION 'El cierre contiene referencias sin equivalencia'; END IF;
 IF EXISTS(SELECT 1 FROM public.migraciones WHERE comercio_id=p_comercio_id AND archivo_hash=p_archivo_hash AND estado='completado' AND resumen->>'tipo'='cierre') THEN RAISE EXCEPTION 'El cierre de este archivo ya fue aplicado'; END IF;
 INSERT INTO public.migraciones(comercio_id,archivo_nombre,archivo_hash,archivo_tamano,estado,resumen) VALUES(p_comercio_id,p_archivo_nombre,p_archivo_hash,p_archivo_tamano,'importando',jsonb_build_object('tipo','cierre','version',1)) RETURNING id INTO mid;
 FOR r IN SELECT * FROM jsonb_array_elements(p_payload->'presupuestos') LOOP
  bid:=gen_random_uuid(); SELECT id_destino INTO cid FROM public.migracion_id_map WHERE comercio_id=p_comercio_id AND entidad='clientes' AND id_origen=r->'data'->>'cliente_source_id' ORDER BY created_at DESC LIMIT 1;
  INSERT INTO public.presupuestos(id,comercio_id,numero_comprobante,fecha_venta,tipo_pago,tipo_comprobante,cliente_id,cliente_nombre,porcentaje_descuento,porcentaje_recargo,subtotal,total,observaciones,estado)
  SELECT bid,p_comercio_id,r->>'sourceId',(r->'data'->>'fecha')::timestamptz,'contado','recibo_x',cid,btrim(concat_ws(' ',c.nombre,nullif(c.apellido,''))),(r->'data'->>'descuento')::numeric,(r->'data'->>'recargo')::numeric,(r->'data'->>'total')::numeric,(r->'data'->>'total')::numeric,r->'data'->>'observaciones','pendiente' FROM public.clientes c WHERE c.id=cid;
  INSERT INTO public.migracion_id_map(migracion_id,comercio_id,entidad,id_origen,id_destino,accion)VALUES(mid,p_comercio_id,'presupuestos',r->>'sourceId',bid,'insertado');
 END LOOP;
 FOR r IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
  SELECT id_destino INTO bid FROM public.migracion_id_map WHERE migracion_id=mid AND entidad='presupuestos' AND id_origen=r->'data'->>'presupuesto_source_id';
  SELECT id_destino INTO pid FROM public.migracion_id_map WHERE comercio_id=p_comercio_id AND entidad='productos' AND id_origen=r->'data'->>'producto_source_id' ORDER BY created_at DESC LIMIT 1;
  INSERT INTO public.presupuesto_items(id,comercio_id,presupuesto_id,producto_id,cantidad,precio_unitario,subtotal,total)VALUES(gen_random_uuid(),p_comercio_id,bid,pid,(r->'data'->>'cantidad')::integer,(r->'data'->>'precio')::numeric,(r->'data'->>'cantidad')::numeric*(r->'data'->>'precio')::numeric,(r->'data'->>'cantidad')::numeric*(r->'data'->>'precio')::numeric);
 END LOOP;
 INSERT INTO public.historial_legacy(comercio_id,migracion_id,tipo,source_id,fecha,datos) SELECT p_comercio_id,mid,x->>'tipo',x->>'sourceId',nullif(x->>'fecha','')::timestamptz,x->'data' FROM jsonb_array_elements(p_payload->'archivo')x;
 UPDATE public.migraciones SET estado='completado',resumen=resumen||result||jsonb_build_object('aplicado_at',now()) WHERE id=mid;
 RETURN result||jsonb_build_object('migracion_id',mid);
END $$;
GRANT SELECT ON public.historial_legacy TO authenticated;
GRANT EXECUTE ON FUNCTION public.migracion_simular_cierre(uuid,jsonb),public.migracion_aplicar_cierre(uuid,text,text,bigint,jsonb) TO authenticated;
