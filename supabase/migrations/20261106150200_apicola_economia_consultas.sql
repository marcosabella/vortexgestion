BEGIN;
CREATE FUNCTION public.apicola_economia_documentos(p_comercio uuid,p_origen text,p_busqueda text DEFAULT '',p_pagina integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE resultado jsonb;
BEGIN
 IF NOT public.apicola_permiso(p_comercio,'admin') THEN RAISE EXCEPTION 'La economía apícola requiere administración y módulo habilitado' USING ERRCODE='42501'; END IF;
 IF p_origen IS NULL OR p_origen NOT IN ('compra','gasto','venta') OR p_pagina IS NULL OR p_pagina<0 OR p_pagina>100000 OR p_busqueda IS NULL OR length(p_busqueda)>100 THEN RAISE EXCEPTION 'Filtros de documentos inválidos'; END IF;
 WITH documentos AS (
  SELECT c.id,'compra'::text origen,c.numero numero,c.fecha::date fecha,'ARS'::text moneda,c.total total,''::text detalle FROM public.compras c WHERE p_origen='compra' AND c.comercio_id=p_comercio AND c.estado='recibida'
  UNION ALL SELECT g.id,'gasto',coalesce(nullif(g.numero_comprobante,''),g.concepto),g.fecha::date,'ARS',g.monto,g.concepto FROM public.gastos_egresos g WHERE p_origen='gasto' AND g.comercio_id=p_comercio
  UNION ALL SELECT v.id,'venta',v.numero_comprobante,(v.fecha_venta AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,v.moneda,v.total,coalesce(v.cliente_nombre,'') FROM public.ventas v WHERE p_origen='venta' AND v.comercio_id=p_comercio AND v.anulado_at IS NULL AND v.tipo_comprobante::text NOT LIKE 'nota_%'
   AND NOT EXISTS(SELECT 1 FROM public.ventas n WHERE n.comercio_id=p_comercio AND n.comprobante_asociado_id=v.id AND n.tipo_comprobante::text LIKE 'nota_credito_%')
 ), filtrados AS (
  SELECT d.*,d.total-coalesce((SELECT sum(i.importe) FROM public.apicola_imputaciones i WHERE i.comercio_id=p_comercio AND i.origen=d.origen AND i.estado='vigente' AND coalesce(i.compra_id,i.gasto_id,i.venta_id)=d.id),0) saldo
  FROM documentos d WHERE d.total>0 AND (d.numero ILIKE '%'||p_busqueda||'%' OR d.detalle ILIKE '%'||p_busqueda||'%')
 ) SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM filtrados ORDER BY fecha DESC,id LIMIT 30 OFFSET p_pagina*30) t),'[]'::jsonb),'total',(SELECT count(*) FROM filtrados)) INTO resultado;
 RETURN resultado;
END $$;

CREATE FUNCTION public.apicola_economia_consultar(p_comercio uuid,p_campana uuid DEFAULT NULL,p_apiario uuid DEFAULT NULL,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_tipo text DEFAULT NULL,p_pagina integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE resultado jsonb;
BEGIN
 IF NOT public.apicola_permiso(p_comercio,'admin') THEN RAISE EXCEPTION 'La economía apícola requiere administración y módulo habilitado' USING ERRCODE='42501'; END IF;
 IF p_pagina IS NULL OR p_pagina<0 OR p_pagina>100000 OR p_tipo IS NOT NULL AND p_tipo NOT IN ('costo','ingreso') OR p_desde>p_hasta THEN RAISE EXCEPTION 'Filtros económicos inválidos'; END IF;
 WITH filtradas AS (
  SELECT i.*,c.nombre campana,a.nombre apiario FROM public.apicola_imputaciones i
   JOIN public.apicola_campanas c ON c.comercio_id=i.comercio_id AND c.id=i.campana_id
   LEFT JOIN public.apicola_apiarios a ON a.comercio_id=i.comercio_id AND a.id=i.apiario_id
  WHERE i.comercio_id=p_comercio AND (p_campana IS NULL OR i.campana_id=p_campana) AND (p_apiario IS NULL OR i.apiario_id=p_apiario)
   AND (p_desde IS NULL OR i.fecha>=p_desde) AND (p_hasta IS NULL OR i.fecha<=p_hasta)
 ), resumen AS (
  SELECT moneda,
   coalesce(sum(importe) FILTER(WHERE tipo='ingreso'),0) ingresos,
   coalesce(sum(importe) FILTER(WHERE tipo='costo' AND origen<>'estimado'),0) costos_documentados,
   coalesce(sum(importe) FILTER(WHERE origen='estimado'),0) costos_estimados,
   coalesce(sum(CASE WHEN tipo='ingreso' THEN importe ELSE -importe END),0) resultado_estimado
  FROM filtradas WHERE estado='vigente' GROUP BY moneda
 ), agrupadas AS (
  SELECT campana_id,campana,apiario_id,apiario,moneda,
   coalesce(sum(importe) FILTER(WHERE tipo='ingreso'),0) ingresos,
   coalesce(sum(importe) FILTER(WHERE tipo='costo'),0) costos,
   coalesce(sum(CASE WHEN tipo='ingreso' THEN importe ELSE -importe END),0) resultado_estimado
  FROM filtradas WHERE estado='vigente' GROUP BY campana_id,campana,apiario_id,apiario,moneda
 ), actividades AS (
  SELECT actividad,moneda,sum(importe) importe FROM filtradas WHERE estado='vigente' AND tipo='costo' GROUP BY actividad,moneda
 ) SELECT jsonb_build_object(
  'items',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM filtradas WHERE p_tipo IS NULL OR tipo=p_tipo ORDER BY fecha DESC,created_at DESC,id LIMIT 30 OFFSET p_pagina*30) t),'[]'::jsonb),
  'total',(SELECT count(*) FROM filtradas WHERE p_tipo IS NULL OR tipo=p_tipo),
  'resumen',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY moneda) FROM resumen t),'[]'::jsonb),
  'campanas_apiarios',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY campana,apiario,moneda) FROM agrupadas t),'[]'::jsonb),
  'actividades',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY actividad,moneda) FROM actividades t),'[]'::jsonb)) INTO resultado;
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.apicola_economia_documentos(uuid,text,text,integer),public.apicola_economia_consultar(uuid,uuid,uuid,date,date,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apicola_economia_documentos(uuid,text,text,integer),public.apicola_economia_consultar(uuid,uuid,uuid,date,date,text,integer) TO authenticated;
COMMIT;
