BEGIN;
CREATE FUNCTION public.apicola_comercial_operar(p_comercio uuid,p_accion text,p_datos jsonb,p_clave uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
<<comercial>>
DECLARE d jsonb:=p_datos; o public.apicola_operaciones; l public.apicola_lotes; e public.apicola_extracciones;
 f public.apicola_fraccionamientos; s public.apicola_salidas; dev public.apicola_devoluciones; t public.apicola_tambores;
 v public.ventas; vi public.venta_items; pr public.productos; x jsonb; resultado jsonb; tabla text; origen_fecha date;
 dia date; cantidad numeric; kilos numeric; usados numeric; unidad text; envases integer:=0;
BEGIN
 IF NOT public.apicola_permiso(p_comercio,'admin') THEN RAISE EXCEPTION 'Esta operación requiere administración y módulo apícola habilitado' USING ERRCODE='42501'; END IF;
 IF p_clave IS NULL OR jsonb_typeof(d) IS DISTINCT FROM 'object' OR pg_column_size(d)>65536 THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('apicola:'||p_comercio::text,0));
 SELECT * INTO o FROM public.apicola_operaciones WHERE comercio_id=p_comercio AND clave=p_clave;
 IF FOUND THEN
  IF o.usuario_id<>auth.uid() OR o.accion<>'comercial:'||p_accion OR o.datos<>d THEN RAISE EXCEPTION 'La clave de operación ya se usó con otros datos'; END IF;
  RETURN o.resultado;
 END IF;
 IF p_accion IN ('fraccionar','salida') THEN
  SELECT * INTO l FROM public.apicola_lotes WHERE comercio_id=p_comercio AND id=(d->>'lote_id')::uuid;
  IF NOT FOUND OR l.estado_calidad<>'liberado' THEN RAISE EXCEPTION 'Seleccioná un lote liberado'; END IF;
  SELECT * INTO e FROM public.apicola_extracciones WHERE comercio_id=p_comercio AND id=l.extraccion_id;
  dia:=(d->>'fecha')::date; origen_fecha:=e.fecha;
  IF e.estado<>'vigente' OR dia IS NULL OR dia>current_date OR dia<e.fecha OR NOT EXISTS(SELECT 1 FROM public.apicola_campanas WHERE comercio_id=p_comercio AND id=e.campana_id AND estado='abierta' AND dia BETWEEN fecha_inicio AND fecha_fin) THEN RAISE EXCEPTION 'Fecha, extracción o campaña inválida/cerrada'; END IF;
  IF nullif(d->>'tambor_id','') IS NOT NULL THEN
   SELECT * INTO t FROM public.apicola_tambores WHERE comercio_id=p_comercio AND id=(d->>'tambor_id')::uuid AND lote_id=l.id AND estado='vigente';
   IF NOT FOUND OR dia<t.fecha THEN RAISE EXCEPTION 'Tambor inválido o posterior a la operación'; END IF;
  END IF;
 END IF;
 IF p_accion='fraccionar' THEN
  IF jsonb_typeof(d->'insumos') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'insumos') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Indicá los envases e insumos consumidos'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(d->'insumos'))<>(SELECT count(DISTINCT elem.value->>'producto_id') FROM jsonb_array_elements(d->'insumos') elem(value)) THEN RAISE EXCEPTION 'Insumos repetidos'; END IF;
  IF (d->>'peso_kg')::numeric<>round((d->>'peso_kg')::numeric,3) OR coalesce((d->>'merma_kg')::numeric,0)<>round(coalesce((d->>'merma_kg')::numeric,0),3) THEN RAISE EXCEPTION 'Usá hasta tres decimales en los kilos'; END IF;
  INSERT INTO public.apicola_fraccionamientos(comercio_id,lote_id,tambor_id,fecha,codigo,presentacion,peso_kg,unidades,merma_kg,responsable,creado_por)
  VALUES(p_comercio,l.id,t.id,dia,btrim(d->>'codigo'),btrim(d->>'presentacion'),(d->>'peso_kg')::numeric,(d->>'unidades')::integer,coalesce((d->>'merma_kg')::numeric,0),btrim(d->>'responsable'),auth.uid()) RETURNING * INTO f;
  FOR x IN SELECT value FROM jsonb_array_elements(d->'insumos') ORDER BY value->>'producto_id' LOOP
   SELECT * INTO pr FROM public.productos WHERE comercio_id=p_comercio AND id=(x->>'producto_id')::uuid FOR UPDATE;
   IF NOT FOUND OR coalesce((x->>'cantidad')::integer,0)<=0 OR pr.stock<(x->>'cantidad')::integer THEN RAISE EXCEPTION 'Insumo inválido o stock insuficiente de envases/material'; END IF;
   IF EXISTS(SELECT 1 FROM public.producto_variantes WHERE producto_id=pr.id) THEN RAISE EXCEPTION 'Usá insumos sin variantes de talle/color'; END IF;
   INSERT INTO public.apicola_fraccionado_insumos VALUES(p_comercio,f.id,pr.id,x->>'tipo',(x->>'cantidad')::integer,pr.descripcion,pr.precio_costo,pr.tipo_moneda::text);
   UPDATE public.productos SET stock=stock-(x->>'cantidad')::integer WHERE comercio_id=p_comercio AND id=pr.id;
   IF x->>'tipo'='envase' THEN envases:=envases+(x->>'cantidad')::integer; END IF;
  END LOOP;
  IF envases<f.unidades THEN RAISE EXCEPTION 'Los envases consumidos deben cubrir las unidades obtenidas'; END IF;
  resultado:=to_jsonb(f);
 ELSIF p_accion='salida' THEN
  SELECT * INTO v FROM public.ventas WHERE comercio_id=p_comercio AND id=(d->>'venta_id')::uuid FOR UPDATE;
  IF NOT FOUND OR v.anulado_at IS NOT NULL OR v.tipo_comprobante::text LIKE 'nota_%' OR (v.fecha_venta AT TIME ZONE 'America/Argentina/Buenos_Aires')::date>dia
   OR EXISTS(SELECT 1 FROM public.ventas n WHERE n.comercio_id=p_comercio AND n.comprobante_asociado_id=v.id AND n.tipo_comprobante::text LIKE 'nota_credito_%') THEN RAISE EXCEPTION 'Venta no disponible o con nota de crédito'; END IF;
  SELECT * INTO vi FROM public.venta_items WHERE comercio_id=p_comercio AND venta_id=v.id AND id=(d->>'venta_item_id')::uuid FOR UPDATE;
  IF NOT FOUND OR vi.producto_id IS NOT NULL OR vi.afecta_stock IS DISTINCT FROM false THEN RAISE EXCEPTION 'Elegí un ítem manual sin descuento de stock de Gestión para evitar duplicarlo'; END IF;
  cantidad:=(d->>'cantidad')::numeric;
  IF cantidad IS NULL OR cantidad<=0 OR cantidad>=100000000 OR cantidad<>round(cantidad,3) THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
  unidad:='kg'; kilos:=cantidad;
  IF nullif(d->>'fraccionamiento_id','') IS NOT NULL THEN
   SELECT * INTO f FROM public.apicola_fraccionamientos WHERE comercio_id=p_comercio AND id=(d->>'fraccionamiento_id')::uuid AND lote_id=l.id AND estado='vigente';
   IF NOT FOUND OR t.id IS NOT NULL OR dia<f.fecha OR cantidad<>trunc(cantidad) THEN RAISE EXCEPTION 'Fraccionamiento, fecha o unidades inválidos'; END IF;
   unidad:='unidades'; kilos:=cantidad*f.peso_kg;
  END IF;
  SELECT coalesce(sum(pendiente),0) INTO usados FROM public.apicola_salidas_netas WHERE comercio_id=p_comercio AND venta_item_id=vi.id;
  IF usados+cantidad>vi.cantidad THEN RAISE EXCEPTION 'La cantidad supera el ítem de venta pendiente de vincular'; END IF;
  IF EXISTS(SELECT 1 FROM public.apicola_salidas_netas q LEFT JOIN public.apicola_fraccionamientos qf ON qf.comercio_id=q.comercio_id AND qf.id=q.fraccionamiento_id WHERE q.comercio_id=p_comercio AND q.venta_item_id=vi.id AND q.pendiente>0 AND (q.unidad<>comercial.unidad OR comercial.unidad='unidades' AND qf.peso_kg<>f.peso_kg)) THEN RAISE EXCEPTION 'El ítem ya tiene otra unidad o presentación asignada'; END IF;
  INSERT INTO public.apicola_salidas(comercio_id,lote_id,tambor_id,fraccionamiento_id,venta_id,venta_item_id,fecha,cantidad,unidad,kg,comprobante,cliente,creado_por)
  VALUES(p_comercio,l.id,t.id,f.id,v.id,vi.id,dia,cantidad,unidad,kilos,v.numero_comprobante,coalesce(v.cliente_nombre,''),auth.uid()) RETURNING * INTO s;
  resultado:=to_jsonb(s);
 ELSIF p_accion='devolver' THEN
  SELECT * INTO s FROM public.apicola_salidas WHERE comercio_id=p_comercio AND id=(d->>'salida_id')::uuid AND estado='vigente';
  dia:=(d->>'fecha')::date; cantidad:=(d->>'cantidad')::numeric;
  IF NOT FOUND OR dia IS NULL OR dia<s.fecha OR dia>current_date OR cantidad IS NULL OR cantidad<>round(cantidad,3) OR (s.unidad='unidades' AND cantidad<>trunc(cantidad)) THEN RAISE EXCEPTION 'Salida, fecha o cantidad de devolución inválida'; END IF;
  INSERT INTO public.apicola_devoluciones(comercio_id,salida_id,fecha,cantidad,motivo,creado_por)
  VALUES(p_comercio,s.id,dia,cantidad,btrim(d->>'motivo'),auth.uid()) RETURNING * INTO dev;
  -- El retorno físico no certifica aptitud: requiere revisión antes de otra salida.
  UPDATE public.apicola_lotes SET estado_calidad='bloqueado',version=version+1,updated_at=now() WHERE comercio_id=p_comercio AND id=s.lote_id;
  resultado:=to_jsonb(dev);
 ELSIF p_accion IN ('anular_fraccionamiento','anular_salida','anular_devolucion') THEN
  IF coalesce(length(btrim(d->>'motivo')),0) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'Indicá el motivo de anulación'; END IF;
  IF p_accion='anular_fraccionamiento' THEN
   SELECT * INTO f FROM public.apicola_fraccionamientos WHERE comercio_id=p_comercio AND id=(d->>'id')::uuid AND version=(d->>'version')::integer AND estado='vigente';
   IF NOT FOUND THEN RAISE EXCEPTION 'El registro cambió o no está disponible'; END IF;
   IF EXISTS(SELECT 1 FROM public.apicola_salidas WHERE comercio_id=p_comercio AND fraccionamiento_id=f.id AND estado='vigente') THEN RAISE EXCEPTION 'El fraccionamiento tiene salidas vigentes'; END IF;
   FOR x IN SELECT to_jsonb(i) FROM public.apicola_fraccionado_insumos i WHERE i.comercio_id=p_comercio AND i.fraccionamiento_id=f.id ORDER BY i.producto_id LOOP
    UPDATE public.productos SET stock=stock+(x->>'cantidad')::integer WHERE comercio_id=p_comercio AND id=(x->>'producto_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Insumo fuera del comercio'; END IF;
   END LOOP;
   tabla:='apicola_fraccionamientos';
  ELSIF p_accion='anular_salida' THEN
   IF EXISTS(SELECT 1 FROM public.apicola_devoluciones WHERE comercio_id=p_comercio AND salida_id=(d->>'id')::uuid AND estado='vigente') THEN RAISE EXCEPTION 'Anulá primero las devoluciones de esa salida'; END IF;
   tabla:='apicola_salidas';
  ELSE tabla:='apicola_devoluciones'; END IF;
  EXECUTE format('UPDATE public.%I SET estado=''anulado'',motivo_anulacion=$1,version=version+1,updated_at=now() WHERE comercio_id=$2 AND id=$3 AND version=$4 AND estado=''vigente'' RETURNING to_jsonb(%I.*)',tabla,tabla)
   INTO resultado USING btrim(d->>'motivo'),p_comercio,(d->>'id')::uuid,(d->>'version')::integer;
  IF resultado IS NULL THEN RAISE EXCEPTION 'El registro cambió o no está disponible'; END IF;
 ELSE RAISE EXCEPTION 'Operación comercial inválida'; END IF;
 PERFORM public.apicola_validar_stock(p_comercio);
 INSERT INTO public.apicola_operaciones VALUES(p_comercio,p_clave,'comercial:'||p_accion,d,resultado,auth.uid(),now());
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.apicola_comercial_operar(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apicola_comercial_operar(uuid,text,jsonb,uuid) TO authenticated;

CREATE FUNCTION public.apicola_proteger_salida_venta() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE salida boolean;
BEGIN
 IF TG_TABLE_NAME='venta_items' THEN
  IF (NEW.venta_id IS DISTINCT FROM OLD.venta_id OR NEW.comercio_id IS DISTINCT FROM OLD.comercio_id) AND EXISTS(SELECT 1 FROM public.apicola_salidas WHERE venta_item_id=OLD.id) THEN RAISE EXCEPTION 'El ítem conserva historial apícola y no puede cambiar de venta o comercio'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.apicola_salidas_netas WHERE venta_item_id=OLD.id AND pendiente>0) INTO salida;
  IF salida AND (NEW.venta_id IS DISTINCT FROM OLD.venta_id OR NEW.comercio_id IS DISTINCT FROM OLD.comercio_id OR NEW.cantidad IS DISTINCT FROM OLD.cantidad OR NEW.producto_id IS DISTINCT FROM OLD.producto_id OR NEW.afecta_stock IS DISTINCT FROM OLD.afecta_stock) THEN RAISE EXCEPTION 'El ítem tiene salidas apícolas; registrá la devolución o anulá la salida antes de corregirlo'; END IF;
 ELSE
  IF NEW.comercio_id IS DISTINCT FROM OLD.comercio_id AND EXISTS(SELECT 1 FROM public.apicola_salidas WHERE venta_id=OLD.id) THEN RAISE EXCEPTION 'La venta conserva historial apícola y no puede cambiar de comercio'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.apicola_salidas_netas WHERE venta_id=OLD.id AND pendiente>0) INTO salida;
  IF salida AND (NEW.comercio_id IS DISTINCT FROM OLD.comercio_id OR NEW.tipo_comprobante IS DISTINCT FROM OLD.tipo_comprobante) THEN RAISE EXCEPTION 'La venta tiene salidas apícolas y no puede cambiar de comercio o tipo'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.apicola_proteger_salida_venta() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER apicola_salida_proteger BEFORE UPDATE ON public.venta_items FOR EACH ROW EXECUTE FUNCTION public.apicola_proteger_salida_venta();
CREATE TRIGGER apicola_salida_proteger BEFORE UPDATE ON public.ventas FOR EACH ROW EXECUTE FUNCTION public.apicola_proteger_salida_venta();
-- La anulación financiera/NC no devuelve stock: el retorno físico se registra
-- mediante apicola_devoluciones y conserva la venta y sus líneas históricas.
COMMIT;
