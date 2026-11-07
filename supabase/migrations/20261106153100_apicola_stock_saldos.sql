BEGIN;
CREATE FUNCTION public.apicola_stock_base(p_comercio uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH frascos AS (
  SELECT f.*,f.unidades-coalesce((SELECT sum(s.pendiente) FROM public.apicola_salidas_netas s WHERE s.comercio_id=p_comercio AND s.fraccionamiento_id=f.id),0) disponibles
  FROM public.apicola_fraccionamientos f WHERE f.comercio_id=p_comercio AND f.estado='vigente'
 ), tambores AS (
  SELECT t.id,t.lote_id,t.codigo,t.estado,t.fecha,t.ubicacion,t.neto,
   t.neto-coalesce((SELECT sum(f.consumido_kg) FROM public.apicola_fraccionamientos f WHERE f.comercio_id=p_comercio AND f.tambor_id=t.id AND f.estado='vigente'),0)
    -coalesce((SELECT sum(s.kg_netos) FROM public.apicola_salidas_netas s WHERE s.comercio_id=p_comercio AND s.tambor_id=t.id),0) disponible_kg
  FROM public.apicola_tambores t WHERE t.comercio_id=p_comercio AND t.estado='vigente'
 ), lotes AS (
  SELECT l.id,l.codigo,l.estado_calidad,e.campana_id,e.fecha,e.estado,e.kg producidos_kg,
   e.kg-coalesce((SELECT sum(t.neto) FROM tambores t WHERE t.lote_id=l.id),0)
    -coalesce((SELECT sum(f.consumido_kg) FROM frascos f WHERE f.lote_id=l.id AND f.tambor_id IS NULL),0)
    -coalesce((SELECT sum(s.kg_netos) FROM public.apicola_salidas_netas s WHERE s.comercio_id=p_comercio AND s.lote_id=l.id AND s.tambor_id IS NULL AND s.fraccionamiento_id IS NULL),0) sin_envasar_kg,
   coalesce((SELECT sum(t.disponible_kg) FROM tambores t WHERE t.lote_id=l.id),0) tambores_kg,
   coalesce((SELECT sum(f.disponibles*f.peso_kg) FROM frascos f WHERE f.lote_id=l.id),0) fraccionado_kg,
   coalesce((SELECT sum(f.merma_kg) FROM frascos f WHERE f.lote_id=l.id),0) merma_kg,
   coalesce((SELECT sum(s.kg_netos) FROM public.apicola_salidas_netas s WHERE s.comercio_id=p_comercio AND s.lote_id=l.id),0) despachados_kg
  FROM public.apicola_lotes l JOIN public.apicola_extracciones e ON e.comercio_id=l.comercio_id AND e.id=l.extraccion_id
  WHERE l.comercio_id=p_comercio AND e.estado='vigente'
 ) SELECT jsonb_build_object('lotes',coalesce((SELECT jsonb_agg(to_jsonb(l)||jsonb_build_object('disponible_kg',l.sin_envasar_kg+l.tambores_kg+l.fraccionado_kg) ORDER BY l.codigo) FROM lotes l),'[]'),
 'tambores',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.codigo) FROM tambores t),'[]'),
 'fraccionamientos',coalesce((SELECT jsonb_agg(to_jsonb(f)-ARRAY['creado_por','created_at','updated_at','motivo_anulacion'] ORDER BY f.codigo) FROM frascos f),'[]'));
$$;
REVOKE ALL ON FUNCTION public.apicola_stock_base(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.apicola_stock_consultar(p_comercio uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.apicola_permiso(p_comercio) THEN RAISE EXCEPTION 'Sin permiso de lectura apícola' USING ERRCODE='42501'; END IF;
 RETURN public.apicola_stock_base(p_comercio);
END $$;
REVOKE ALL ON FUNCTION public.apicola_stock_consultar(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apicola_stock_consultar(uuid) TO authenticated;

CREATE FUNCTION public.apicola_validar_stock(p_comercio uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE saldos jsonb:=public.apicola_stock_base(p_comercio);
BEGIN
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(saldos->'lotes') l WHERE (l->>'sin_envasar_kg')::numeric<0)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(saldos->'tambores') t WHERE (t->>'disponible_kg')::numeric<0)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(saldos->'fraccionamientos') f WHERE (f->>'disponibles')::numeric<0)
  OR EXISTS(SELECT 1 FROM public.apicola_salidas_netas WHERE comercio_id=p_comercio AND pendiente<0) THEN RAISE EXCEPTION 'Stock insuficiente o devolución superior a la salida'; END IF;
 -- No se puede quitar un origen con consumo/historial vigente dependiente.
 IF EXISTS(SELECT 1 FROM public.apicola_fraccionamientos f JOIN public.apicola_lotes l ON l.comercio_id=f.comercio_id AND l.id=f.lote_id JOIN public.apicola_extracciones e ON e.comercio_id=l.comercio_id AND e.id=l.extraccion_id LEFT JOIN public.apicola_tambores t ON t.comercio_id=f.comercio_id AND t.id=f.tambor_id
  WHERE f.comercio_id=p_comercio AND f.estado='vigente' AND (e.estado<>'vigente' OR f.tambor_id IS NOT NULL AND t.estado<>'vigente'))
 OR EXISTS(SELECT 1 FROM public.apicola_salidas s JOIN public.apicola_lotes l ON l.comercio_id=s.comercio_id AND l.id=s.lote_id JOIN public.apicola_extracciones e ON e.comercio_id=l.comercio_id AND e.id=l.extraccion_id LEFT JOIN public.apicola_tambores t ON t.comercio_id=s.comercio_id AND t.id=s.tambor_id LEFT JOIN public.apicola_fraccionamientos f ON f.comercio_id=s.comercio_id AND f.id=s.fraccionamiento_id
  WHERE s.comercio_id=p_comercio AND s.estado='vigente' AND (e.estado<>'vigente' OR s.tambor_id IS NOT NULL AND t.estado<>'vigente' OR s.fraccionamiento_id IS NOT NULL AND f.estado<>'vigente'))
 THEN RAISE EXCEPTION 'El origen tiene fraccionamientos o salidas vigentes'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.apicola_validar_stock(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.apicola_control_stock_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.apicola_validar_stock(NEW.comercio_id); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.apicola_control_stock_trigger() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER apicola_control_stock AFTER INSERT OR UPDATE ON public.apicola_tambores FOR EACH ROW EXECUTE FUNCTION public.apicola_control_stock_trigger();
CREATE TRIGGER apicola_control_stock AFTER UPDATE ON public.apicola_extracciones FOR EACH ROW EXECUTE FUNCTION public.apicola_control_stock_trigger();
COMMIT;
