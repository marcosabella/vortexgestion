BEGIN;
CREATE FUNCTION public.apicola_comercial_catalogo(p_comercio uuid,p_tipo text,p_busqueda text DEFAULT '',p_pagina integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE resultado jsonb;
BEGIN
 IF NOT public.apicola_permiso(p_comercio,'admin') THEN RAISE EXCEPTION 'Se requiere administración' USING ERRCODE='42501'; END IF;
 IF p_tipo IS NULL OR p_tipo NOT IN ('insumos','items') OR p_pagina IS NULL OR p_pagina<0 OR p_pagina>100000 OR p_busqueda IS NULL OR length(p_busqueda)>100 THEN RAISE EXCEPTION 'Filtros inválidos'; END IF;
 WITH filas AS (
  SELECT p.id,p.cod_producto codigo,p.descripcion descripcion,p.stock::numeric cantidad,NULL::uuid venta_id,''::text comprobante,p.stock::numeric disponible,p.precio_costo::numeric costo,p.tipo_moneda::text moneda
  FROM public.productos p WHERE p_tipo='insumos' AND p.comercio_id=p_comercio AND p.stock>0 AND NOT EXISTS(SELECT 1 FROM public.producto_variantes v WHERE v.producto_id=p.id)
  UNION ALL
  SELECT i.id,coalesce(i.codigo_manual,''),coalesce(i.descripcion_manual,''),i.cantidad,v.id,v.numero_comprobante,i.cantidad-coalesce((SELECT sum(s.pendiente) FROM public.apicola_salidas_netas s WHERE s.comercio_id=p_comercio AND s.venta_item_id=i.id),0),0,v.moneda::text
  FROM public.venta_items i JOIN public.ventas v ON v.comercio_id=i.comercio_id AND v.id=i.venta_id WHERE p_tipo='items' AND i.comercio_id=p_comercio AND i.producto_id IS NULL AND i.afecta_stock=false AND v.anulado_at IS NULL AND v.tipo_comprobante::text NOT LIKE 'nota_%'
   AND NOT EXISTS(SELECT 1 FROM public.ventas n WHERE n.comercio_id=p_comercio AND n.comprobante_asociado_id=v.id AND n.tipo_comprobante::text LIKE 'nota_credito_%')
 ), filtradas AS (SELECT * FROM filas WHERE codigo ILIKE '%'||p_busqueda||'%' OR descripcion ILIKE '%'||p_busqueda||'%' OR comprobante ILIKE '%'||p_busqueda||'%')
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM filtradas ORDER BY comprobante,codigo,id LIMIT 30 OFFSET p_pagina*30) t),'[]'),'total',(SELECT count(*) FROM filtradas)) INTO resultado;
 RETURN resultado;
END $$;
CREATE FUNCTION public.apicola_comercial_consultar(p_comercio uuid,p_tipo text,p_campana uuid DEFAULT NULL,p_apiario uuid DEFAULT NULL,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_pagina integer DEFAULT 0,p_lote uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE resultado jsonb;
BEGIN
 IF NOT public.apicola_permiso(p_comercio) THEN RAISE EXCEPTION 'Sin permiso de lectura apícola' USING ERRCODE='42501'; END IF;
 IF p_tipo IS NULL OR p_tipo NOT IN ('fraccionamientos','salidas','devoluciones') OR p_pagina IS NULL OR p_pagina<0 OR p_pagina>100000 OR p_desde>p_hasta THEN RAISE EXCEPTION 'Filtros inválidos'; END IF;
 WITH operaciones AS (
  SELECT f.id,f.lote_id,f.fecha,f.created_at,to_jsonb(f)||jsonb_build_object('insumos',CASE WHEN public.apicola_permiso(p_comercio,'admin') THEN coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM public.apicola_fraccionado_insumos i WHERE i.comercio_id=p_comercio AND i.fraccionamiento_id=f.id),'[]') ELSE '[]'::jsonb END) datos FROM public.apicola_fraccionamientos f WHERE p_tipo='fraccionamientos' AND f.comercio_id=p_comercio
  UNION ALL SELECT s.id,s.lote_id,s.fecha,s.created_at,to_jsonb(s)||jsonb_build_object('pendiente',coalesce(n.pendiente,0)) FROM public.apicola_salidas s LEFT JOIN public.apicola_salidas_netas n ON n.comercio_id=s.comercio_id AND n.id=s.id WHERE p_tipo='salidas' AND s.comercio_id=p_comercio
  UNION ALL SELECT d.id,s.lote_id,d.fecha,d.created_at,to_jsonb(d)||jsonb_build_object('comprobante',s.comprobante,'unidad',s.unidad) FROM public.apicola_devoluciones d JOIN public.apicola_salidas s ON s.comercio_id=d.comercio_id AND s.id=d.salida_id WHERE p_tipo='devoluciones' AND d.comercio_id=p_comercio
 ), filtradas AS (
  SELECT o.*,l.codigo lote_codigo,e.campana_id FROM operaciones o JOIN public.apicola_lotes l ON l.comercio_id=p_comercio AND l.id=o.lote_id JOIN public.apicola_extracciones e ON e.comercio_id=l.comercio_id AND e.id=l.extraccion_id
  WHERE (p_campana IS NULL OR e.campana_id=p_campana) AND (p_lote IS NULL OR o.lote_id=p_lote) AND (p_desde IS NULL OR o.fecha>=p_desde) AND (p_hasta IS NULL OR o.fecha<=p_hasta)
   AND (p_apiario IS NULL OR EXISTS(SELECT 1 FROM public.apicola_extraccion_origenes x JOIN public.apicola_cosechas c ON c.comercio_id=x.comercio_id AND c.id=x.cosecha_id WHERE x.comercio_id=p_comercio AND x.extraccion_id=e.id AND c.apiario_id=p_apiario))
 ) SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(t.datos||jsonb_build_object('lote_id',t.lote_id,'lote_codigo',t.lote_codigo,'campana_id',t.campana_id)) FROM (SELECT * FROM filtradas ORDER BY fecha DESC,created_at DESC,id LIMIT 30 OFFSET p_pagina*30) t),'[]'),'total',(SELECT count(*) FROM filtradas)) INTO resultado;
 RETURN resultado;
END $$;
CREATE FUNCTION public.apicola_caja_consultar(p_comercio uuid,p_campana uuid DEFAULT NULL,p_apiario uuid DEFAULT NULL,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_pagina integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE resultado jsonb;
BEGIN
 IF NOT public.apicola_permiso(p_comercio,'admin') THEN RAISE EXCEPTION 'Se requiere administración' USING ERRCODE='42501'; END IF;
 IF p_pagina IS NULL OR p_pagina<0 OR p_pagina>100000 OR p_desde>p_hasta THEN RAISE EXCEPTION 'Filtros inválidos'; END IF;
 WITH filas AS (
  SELECT f.*,c.nombre campana,a.nombre apiario FROM public.apicola_flujos f JOIN public.apicola_campanas c ON c.comercio_id=f.comercio_id AND c.id=f.campana_id LEFT JOIN public.apicola_apiarios a ON a.comercio_id=f.comercio_id AND a.id=f.apiario_id
  WHERE f.comercio_id=p_comercio AND (p_campana IS NULL OR f.campana_id=p_campana) AND (p_apiario IS NULL OR f.apiario_id=p_apiario) AND (p_desde IS NULL OR f.fecha>=p_desde) AND (p_hasta IS NULL OR f.fecha<=p_hasta)
 ), totales AS (
  SELECT moneda,coalesce(sum(importe) FILTER(WHERE tipo='ingreso'),0) cobros,coalesce(sum(importe) FILTER(WHERE tipo='egreso'),0) pagos,sum(CASE WHEN tipo='ingreso' THEN importe ELSE -importe END) resultado
  FROM filas WHERE estado='vigente' GROUP BY moneda
 ), destinos AS (
  SELECT campana,apiario,moneda,sum(CASE WHEN tipo='ingreso' THEN importe ELSE -importe END) resultado FROM filas WHERE estado='vigente' GROUP BY campana,apiario,moneda
 ) SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM filas ORDER BY fecha DESC,created_at DESC,id LIMIT 30 OFFSET p_pagina*30) t),'[]'),'total',(SELECT count(*) FROM filas),'resumen',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY moneda) FROM totales t),'[]'),'destinos',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY campana,apiario,moneda) FROM destinos t),'[]')) INTO resultado;
 RETURN resultado;
END $$;
CREATE FUNCTION public.apicola_caja_fuentes(p_comercio uuid,p_busqueda text DEFAULT '',p_pagina integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE resultado jsonb;
BEGIN
 IF NOT public.apicola_permiso(p_comercio,'admin') THEN RAISE EXCEPTION 'Se requiere administración' USING ERRCODE='42501'; END IF;
 IF p_busqueda IS NULL OR length(p_busqueda)>100 OR p_pagina IS NULL OR p_pagina<0 OR p_pagina>100000 THEN RAISE EXCEPTION 'Filtros inválidos'; END IF;
 WITH fuentes AS (
  SELECT q.*,q.importe-coalesce((SELECT sum(f.importe) FROM public.apicola_flujos f WHERE f.comercio_id=p_comercio AND f.estado='vigente' AND f.origen=q.origen AND coalesce(f.pago_venta_id,f.cuenta_cliente_id,f.cuenta_proveedor_id,f.gasto_id)=q.id),0) saldo
  FROM public.apicola_fuentes_caja(p_comercio) q WHERE q.moneda IN ('ARS','USD') AND (q.numero ILIKE '%'||p_busqueda||'%' OR q.detalle ILIKE '%'||p_busqueda||'%')
 ) SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM fuentes ORDER BY fecha DESC,origen,id LIMIT 30 OFFSET p_pagina*30) t),'[]'),'total',(SELECT count(*) FROM fuentes)) INTO resultado;
 RETURN resultado;
END $$;
CREATE FUNCTION public.apicola_valorar_stock(p_comercio uuid,p_campana uuid DEFAULT NULL,p_apiario uuid DEFAULT NULL,p_precio_kg numeric DEFAULT NULL,p_moneda text DEFAULT 'ARS') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE kg numeric;bloqueado numeric;
BEGIN
 IF NOT public.apicola_permiso(p_comercio,'admin') THEN RAISE EXCEPTION 'Se requiere administración' USING ERRCODE='42501'; END IF;
 IF p_moneda IS NULL OR p_moneda NOT IN ('ARS','USD') OR p_precio_kg<0 OR p_precio_kg>=1000000000 THEN RAISE EXCEPTION 'Precio o moneda inválidos'; END IF;
 SELECT coalesce(sum((l->>'disponible_kg')::numeric) FILTER(WHERE l->>'estado_calidad'='liberado'),0),coalesce(sum((l->>'disponible_kg')::numeric) FILTER(WHERE l->>'estado_calidad'<>'liberado'),0) INTO kg,bloqueado
 FROM jsonb_array_elements(public.apicola_stock_base(p_comercio)->'lotes') l
 WHERE (p_campana IS NULL OR (l->>'campana_id')::uuid=p_campana) AND (p_apiario IS NULL OR EXISTS(SELECT 1 FROM public.apicola_lotes z JOIN public.apicola_extraccion_origenes x ON x.comercio_id=z.comercio_id AND x.extraccion_id=z.extraccion_id JOIN public.apicola_cosechas c ON c.comercio_id=x.comercio_id AND c.id=x.cosecha_id WHERE z.comercio_id=p_comercio AND z.id=(l->>'id')::uuid AND c.apiario_id=p_apiario));
 RETURN jsonb_build_object('liberado_kg',kg,'no_liberado_kg',bloqueado,'moneda',p_moneda,'precio_kg',p_precio_kg,'valor_stock',round(kg*p_precio_kg,2));
END $$;
REVOKE ALL ON FUNCTION public.apicola_comercial_catalogo(uuid,text,text,integer),public.apicola_comercial_consultar(uuid,text,uuid,uuid,date,date,integer,uuid),public.apicola_caja_consultar(uuid,uuid,uuid,date,date,integer),public.apicola_caja_fuentes(uuid,text,integer),public.apicola_valorar_stock(uuid,uuid,uuid,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apicola_comercial_catalogo(uuid,text,text,integer),public.apicola_comercial_consultar(uuid,text,uuid,uuid,date,date,integer,uuid),public.apicola_caja_consultar(uuid,uuid,uuid,date,date,integer),public.apicola_caja_fuentes(uuid,text,integer),public.apicola_valorar_stock(uuid,uuid,uuid,numeric,text) TO authenticated;
COMMIT;
