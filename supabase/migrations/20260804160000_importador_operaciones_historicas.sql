CREATE TABLE public.migracion_staging_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migracion_id uuid NOT NULL REFERENCES public.migraciones(id) ON DELETE CASCADE,
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  modulo text NOT NULL CHECK (modulo IN ('ventas','items','pagos','cheques')),
  source_id text NOT NULL,
  datos jsonb NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','valido','error','aplicado')),
  errores text[] NOT NULL DEFAULT '{}',
  destino_id uuid,
  UNIQUE (migracion_id, modulo, source_id)
);
ALTER TABLE public.migracion_staging_operaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY migracion_staging_operaciones_admin ON public.migracion_staging_operaciones
  FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE INDEX idx_migracion_staging_operaciones ON public.migracion_staging_operaciones(migracion_id, modulo);

CREATE FUNCTION public.migracion_crear_operaciones(p_comercio_id uuid, p_archivo_nombre text, p_archivo_hash text, p_archivo_tamano bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.migracion_assert_admin();
  IF NOT EXISTS (SELECT 1 FROM public.comercio WHERE id=p_comercio_id) THEN RAISE EXCEPTION 'Comercio inexistente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.migraciones WHERE comercio_id=p_comercio_id AND estado='completado' AND resumen->>'tipo'='maestros') THEN
    RAISE EXCEPTION 'El comercio no tiene una migracion de maestros completada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.migraciones WHERE comercio_id=p_comercio_id AND archivo_hash=p_archivo_hash AND estado='completado' AND resumen->>'tipo'='operaciones') THEN
    RAISE EXCEPTION 'Las operaciones de este archivo ya fueron migradas al comercio';
  END IF;
  INSERT INTO public.migraciones(comercio_id,archivo_nombre,archivo_hash,archivo_tamano,estado,resumen)
  VALUES(p_comercio_id,p_archivo_nombre,p_archivo_hash,p_archivo_tamano,'borrador',jsonb_build_object('tipo','operaciones','version',1)) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE FUNCTION public.migracion_cargar_staging_operaciones(p_migracion_id uuid,p_modulo text,p_filas jsonb,p_reemplazar boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_comercio uuid; v_count integer;
BEGIN
  PERFORM public.migracion_assert_admin();
  IF p_modulo NOT IN ('ventas','items','pagos','cheques') OR jsonb_typeof(p_filas)<>'array' THEN RAISE EXCEPTION 'Carga operativa invalida'; END IF;
  SELECT comercio_id INTO v_comercio FROM public.migraciones WHERE id=p_migracion_id AND resumen->>'tipo'='operaciones' AND estado IN ('borrador','subido','analizando','listo') FOR UPDATE;
  IF v_comercio IS NULL THEN RAISE EXCEPTION 'Migracion operativa inexistente o cerrada'; END IF;
  IF p_reemplazar THEN DELETE FROM public.migracion_staging_operaciones WHERE migracion_id=p_migracion_id AND modulo=p_modulo; END IF;
  INSERT INTO public.migracion_staging_operaciones(migracion_id,comercio_id,modulo,source_id,datos)
  SELECT p_migracion_id,v_comercio,p_modulo,btrim(x->>'sourceId'),x->'data' FROM jsonb_array_elements(p_filas)x
  WHERE btrim(coalesce(x->>'sourceId',''))<>''
  ON CONFLICT(migracion_id,modulo,source_id) DO UPDATE SET datos=excluded.datos,estado='pendiente',errores='{}',destino_id=NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  INSERT INTO public.migracion_modulos(migracion_id,modulo,tabla_origen,tabla_destino,dependencias,registros_origen)
  VALUES(p_migracion_id,p_modulo,p_modulo,CASE p_modulo WHEN 'items' THEN 'venta_items' WHEN 'pagos' THEN 'cuenta_corriente' ELSE p_modulo END,
    CASE p_modulo WHEN 'items' THEN ARRAY['ventas','productos'] WHEN 'pagos' THEN ARRAY['clientes'] ELSE '{}'::text[] END,
    (SELECT count(*) FROM public.migracion_staging_operaciones WHERE migracion_id=p_migracion_id AND modulo=p_modulo))
  ON CONFLICT(migracion_id,modulo) DO UPDATE SET registros_origen=excluded.registros_origen,estado='pendiente';
  UPDATE public.migraciones SET estado='subido' WHERE id=p_migracion_id;
  RETURN v_count;
END $$;

CREATE FUNCTION public.migracion_simular_operaciones(p_migracion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_comercio uuid; v_result jsonb;
BEGIN
  PERFORM public.migracion_assert_admin();
  SELECT comercio_id INTO v_comercio FROM public.migraciones WHERE id=p_migracion_id AND resumen->>'tipo'='operaciones' FOR UPDATE;
  IF v_comercio IS NULL THEN RAISE EXCEPTION 'Migracion operativa inexistente'; END IF;
  UPDATE public.migracion_staging_operaciones SET estado='valido',errores='{}',destino_id=NULL WHERE migracion_id=p_migracion_id;
  UPDATE public.migracion_staging_operaciones SET errores=array_append(errores,'Fecha invalida')
    WHERE migracion_id=p_migracion_id AND modulo IN ('ventas','pagos','cheques') AND nullif(datos->>'fecha','') IS NULL;
  UPDATE public.migracion_staging_operaciones SET errores=array_append(errores,'Monto invalido')
    WHERE migracion_id=p_migracion_id AND modulo IN ('ventas','pagos','cheques') AND coalesce((datos->>'monto')::numeric,(datos->>'total')::numeric,0)<=0;
  UPDATE public.migracion_staging_operaciones s SET errores=array_append(errores,'Venta de origen inexistente')
    WHERE s.migracion_id=p_migracion_id AND s.modulo='items' AND NOT EXISTS(SELECT 1 FROM public.migracion_staging_operaciones v WHERE v.migracion_id=s.migracion_id AND v.modulo='ventas' AND v.source_id=s.datos->>'venta_source_id');
  UPDATE public.migracion_staging_operaciones s SET errores=array_append(errores,'Producto de origen sin equivalencia')
    WHERE s.migracion_id=p_migracion_id AND s.modulo='items' AND NOT EXISTS(SELECT 1 FROM public.migracion_id_map m WHERE m.comercio_id=v_comercio AND m.entidad='productos' AND m.id_origen=s.datos->>'producto_source_id');
  UPDATE public.migracion_staging_operaciones s SET errores=array_append(errores,'Cliente de pago sin equivalencia')
    WHERE s.migracion_id=p_migracion_id AND s.modulo='pagos' AND NOT EXISTS(SELECT 1 FROM public.migracion_id_map m WHERE m.comercio_id=v_comercio AND m.entidad='clientes' AND m.id_origen=s.datos->>'cliente_source_id');
  UPDATE public.migracion_staging_operaciones s SET errores=array_append(errores,'Venta a cuenta corriente con cliente eliminado')
    WHERE s.migracion_id=p_migracion_id AND s.modulo='ventas' AND s.datos->>'tipo_pago'='cta_cte' AND NOT EXISTS(SELECT 1 FROM public.migracion_id_map m WHERE m.comercio_id=v_comercio AND m.entidad='clientes' AND m.id_origen=s.datos->>'cliente_source_id');
  UPDATE public.migracion_staging_operaciones SET estado='error' WHERE migracion_id=p_migracion_id AND cardinality(errores)>0;
  UPDATE public.migracion_modulos mm SET registros_validos=(SELECT count(*) FROM public.migracion_staging_operaciones s WHERE s.migracion_id=mm.migracion_id AND s.modulo=mm.modulo AND s.estado='valido'),
    errores=(SELECT count(*) FROM public.migracion_staging_operaciones s WHERE s.migracion_id=mm.migracion_id AND s.modulo=mm.modulo AND s.estado='error'),
    estado=CASE WHEN EXISTS(SELECT 1 FROM public.migracion_staging_operaciones s WHERE s.migracion_id=mm.migracion_id AND s.modulo=mm.modulo AND s.estado='error') THEN 'requiere_revision'::public.migracion_modulo_estado ELSE 'listo'::public.migracion_modulo_estado END
    WHERE mm.migracion_id=p_migracion_id;
  UPDATE public.migraciones SET estado='listo' WHERE id=p_migracion_id;
  SELECT jsonb_build_object('total',count(*),'validos',count(*)FILTER(WHERE estado='valido'),'omitidos',0,'errores',count(*)FILTER(WHERE estado='error'),
    'por_modulo',(SELECT jsonb_object_agg(modulo,j) FROM(SELECT modulo,jsonb_build_object('total',count(*),'validos',count(*)FILTER(WHERE estado='valido'),'errores',count(*)FILTER(WHERE estado='error'))j FROM public.migracion_staging_operaciones WHERE migracion_id=p_migracion_id GROUP BY modulo)x))
    INTO v_result FROM public.migracion_staging_operaciones WHERE migracion_id=p_migracion_id;
  RETURN v_result;
END $$;

CREATE FUNCTION public.migracion_aplicar_operaciones(p_migracion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_comercio uuid; v_insertados integer;
BEGIN
  PERFORM public.migracion_assert_admin();
  SELECT comercio_id INTO v_comercio FROM public.migraciones WHERE id=p_migracion_id AND estado='listo' AND resumen->>'tipo'='operaciones' FOR UPDATE;
  IF v_comercio IS NULL OR EXISTS(SELECT 1 FROM public.migracion_staging_operaciones WHERE migracion_id=p_migracion_id AND estado='error') THEN RAISE EXCEPTION 'La migracion operativa no esta lista'; END IF;
  UPDATE public.migraciones SET estado='importando' WHERE id=p_migracion_id;
  UPDATE public.migracion_staging_operaciones SET destino_id=gen_random_uuid() WHERE migracion_id=p_migracion_id;

  INSERT INTO public.ventas(id,comercio_id,numero_comprobante,fecha_venta,tipo_pago,tipo_comprobante,cliente_id,cliente_nombre,subtotal,total_iva,total,porcentaje_descuento,porcentaje_recargo,monto_descuento,monto_recargo,observaciones)
  SELECT s.destino_id,v_comercio,'HIST-'||s.source_id,(s.datos->>'fecha')::timestamptz,(s.datos->>'tipo_pago')::public.tipo_pago,(s.datos->>'tipo_comprobante')::public.tipo_comprobante,
    cm.id_destino,CASE WHEN cm.id_destino IS NULL THEN 'Cliente historico eliminado #'||(s.datos->>'cliente_source_id') ELSE NULL END,
    (s.datos->>'subtotal')::numeric,0,(s.datos->>'total')::numeric,(s.datos->>'porcentaje_descuento')::numeric,(s.datos->>'porcentaje_recargo')::numeric,
    greatest(0,-(s.datos->>'ajuste')::numeric),greatest(0,(s.datos->>'ajuste')::numeric),concat_ws(' | ',nullif(s.datos->>'observaciones',''),'Migrado de Access; comprobante origen '||(s.datos->>'comprobante_origen'))
  FROM public.migracion_staging_operaciones s LEFT JOIN LATERAL(SELECT id_destino FROM public.migracion_id_map WHERE comercio_id=v_comercio AND entidad='clientes' AND id_origen=s.datos->>'cliente_source_id' ORDER BY created_at DESC LIMIT 1)cm ON true
  WHERE s.migracion_id=p_migracion_id AND s.modulo='ventas';
  INSERT INTO public.migracion_id_map(migracion_id,comercio_id,entidad,id_origen,id_destino,accion) SELECT p_migracion_id,v_comercio,'ventas',source_id,destino_id,'insertado' FROM public.migracion_staging_operaciones WHERE migracion_id=p_migracion_id AND modulo='ventas';

  INSERT INTO public.venta_items(id,comercio_id,venta_id,producto_id,cantidad,precio_unitario,porcentaje_iva,monto_iva,subtotal,total)
  SELECT s.destino_id,v_comercio,vs.destino_id,pm.id_destino,(s.datos->>'cantidad')::integer,(s.datos->>'precio_unitario')::numeric,(s.datos->>'porcentaje_iva')::numeric,0,(s.datos->>'total')::numeric,(s.datos->>'total')::numeric
  FROM public.migracion_staging_operaciones s JOIN public.migracion_staging_operaciones vs ON vs.migracion_id=s.migracion_id AND vs.modulo='ventas' AND vs.source_id=s.datos->>'venta_source_id'
  JOIN LATERAL(SELECT id_destino FROM public.migracion_id_map WHERE comercio_id=v_comercio AND entidad='productos' AND id_origen=s.datos->>'producto_source_id' ORDER BY created_at DESC LIMIT 1)pm ON true
  WHERE s.migracion_id=p_migracion_id AND s.modulo='items';
  INSERT INTO public.migracion_id_map(migracion_id,comercio_id,entidad,id_origen,id_destino,accion) SELECT p_migracion_id,v_comercio,'items',source_id,destino_id,'insertado' FROM public.migracion_staging_operaciones WHERE migracion_id=p_migracion_id AND modulo='items';

  INSERT INTO public.cuenta_corriente(id,comercio_id,cliente_id,tipo_movimiento,monto,concepto,venta_id,fecha_movimiento,observaciones)
  SELECT gen_random_uuid(),v_comercio,cm.id_destino,'debito',(s.datos->>'total')::numeric,'Venta historica HIST-'||s.source_id,s.destino_id,(s.datos->>'fecha')::timestamptz,'Migrado de Access'
  FROM public.migracion_staging_operaciones s JOIN LATERAL(SELECT id_destino FROM public.migracion_id_map WHERE comercio_id=v_comercio AND entidad='clientes' AND id_origen=s.datos->>'cliente_source_id' ORDER BY created_at DESC LIMIT 1)cm ON true
  WHERE s.migracion_id=p_migracion_id AND s.modulo='ventas' AND s.datos->>'tipo_pago'='cta_cte';
  INSERT INTO public.cuenta_corriente(id,comercio_id,cliente_id,tipo_movimiento,monto,concepto,fecha_movimiento,observaciones)
  SELECT s.destino_id,v_comercio,cm.id_destino,'credito',(s.datos->>'monto')::numeric,'Pago historico #'||s.source_id,(s.datos->>'fecha')::timestamptz,concat_ws(' | ',s.datos->>'observaciones','Medio: '||(s.datos->>'tipo_pago'))
  FROM public.migracion_staging_operaciones s JOIN LATERAL(SELECT id_destino FROM public.migracion_id_map WHERE comercio_id=v_comercio AND entidad='clientes' AND id_origen=s.datos->>'cliente_source_id' ORDER BY created_at DESC LIMIT 1)cm ON true
  WHERE s.migracion_id=p_migracion_id AND s.modulo='pagos';
  INSERT INTO public.migracion_id_map(migracion_id,comercio_id,entidad,id_origen,id_destino,accion) SELECT p_migracion_id,v_comercio,'pagos',source_id,destino_id,'insertado' FROM public.migracion_staging_operaciones WHERE migracion_id=p_migracion_id AND modulo='pagos';

  INSERT INTO public.cheques(id,comercio_id,numero_cheque,banco_emisor,monto,fecha_emision,fecha_vencimiento,emisor_nombre,estado,observaciones)
  SELECT destino_id,v_comercio,datos->>'numero',datos->>'banco',(datos->>'monto')::numeric,(datos->>'fecha')::date,(datos->>'vencimiento')::date,datos->>'emisor',(datos->>'estado')::public.estado_cheque,'Cheque historico migrado de Access'
  FROM public.migracion_staging_operaciones WHERE migracion_id=p_migracion_id AND modulo='cheques';
  INSERT INTO public.migracion_id_map(migracion_id,comercio_id,entidad,id_origen,id_destino,accion) SELECT p_migracion_id,v_comercio,'cheques',source_id,destino_id,'insertado' FROM public.migracion_staging_operaciones WHERE migracion_id=p_migracion_id AND modulo='cheques';
  UPDATE public.migracion_staging_operaciones SET estado='aplicado' WHERE migracion_id=p_migracion_id;
  SELECT count(*) INTO v_insertados FROM public.migracion_staging_operaciones WHERE migracion_id=p_migracion_id;
  UPDATE public.migracion_modulos SET estado='completado',insertados=registros_validos WHERE migracion_id=p_migracion_id;
  UPDATE public.migraciones SET estado='completado',resumen=resumen||jsonb_build_object('aplicado_at',now(),'insertados',v_insertados) WHERE id=p_migracion_id;
  RETURN jsonb_build_object('insertados',v_insertados);
END $$;

CREATE FUNCTION public.migracion_revertir_operaciones(p_migracion_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_comercio uuid; v_count integer;
BEGIN
  PERFORM public.migracion_assert_admin(); SELECT comercio_id INTO v_comercio FROM public.migraciones WHERE id=p_migracion_id AND estado='completado' AND resumen->>'tipo'='operaciones' FOR UPDATE;
  IF v_comercio IS NULL THEN RAISE EXCEPTION 'Migracion operativa no reversible'; END IF;
  DELETE FROM public.cheques WHERE comercio_id=v_comercio AND id IN(SELECT id_destino FROM public.migracion_id_map WHERE migracion_id=p_migracion_id AND entidad='cheques');
  DELETE FROM public.cuenta_corriente WHERE comercio_id=v_comercio AND (id IN(SELECT id_destino FROM public.migracion_id_map WHERE migracion_id=p_migracion_id AND entidad='pagos') OR venta_id IN(SELECT id_destino FROM public.migracion_id_map WHERE migracion_id=p_migracion_id AND entidad='ventas'));
  DELETE FROM public.venta_items WHERE comercio_id=v_comercio AND id IN(SELECT id_destino FROM public.migracion_id_map WHERE migracion_id=p_migracion_id AND entidad='items');
  DELETE FROM public.ventas WHERE comercio_id=v_comercio AND id IN(SELECT id_destino FROM public.migracion_id_map WHERE migracion_id=p_migracion_id AND entidad='ventas');
  SELECT count(*) INTO v_count FROM public.migracion_id_map WHERE migracion_id=p_migracion_id; DELETE FROM public.migracion_id_map WHERE migracion_id=p_migracion_id;
  UPDATE public.migracion_staging_operaciones SET estado='valido',destino_id=NULL WHERE migracion_id=p_migracion_id; UPDATE public.migraciones SET estado='cancelado' WHERE id=p_migracion_id;
  RETURN jsonb_build_object('eliminados',v_count);
END $$;

GRANT SELECT ON public.migracion_staging_operaciones TO authenticated;
GRANT EXECUTE ON FUNCTION public.migracion_crear_operaciones(uuid,text,text,bigint),public.migracion_cargar_staging_operaciones(uuid,text,jsonb,boolean),public.migracion_simular_operaciones(uuid),public.migracion_aplicar_operaciones(uuid),public.migracion_revertir_operaciones(uuid) TO authenticated;
