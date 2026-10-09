-- Reduce la respuesta de usuarios exclusivos de cocina/barra al trabajo del sector.
-- Conserva la firma del RPC y las validaciones de tenant, permisos y operaciones.
BEGIN;
DO $migration$
DECLARE definition text; marker text := ' RETURN resultado;'; replacement text;
BEGIN
  definition := pg_get_functiondef('public.restaurante_resumen(uuid)'::regprocedure);
  IF position(marker IN definition) = 0 OR position('cocina_sola' IN definition) = 0 THEN
    RAISE EXCEPTION 'La definición de restaurante_resumen no es compatible con la actualización de cocina';
  END IF;
  replacement := $body$
 IF cocina_sola AND NOT es_admin THEN
   -- El filtro de sector se aplica en el servidor; el frontend no decide el acceso.
   resultado := resultado || jsonb_build_object(
     'sectores', coalesce((SELECT jsonb_agg(s) FROM jsonb_array_elements(resultado->'sectores') s
       WHERE sector IS NULL OR s->>'id'=sector::text), '[]'::jsonb),
     'carta', '[]'::jsonb, 'adicionales', '[]'::jsonb,
     'envios', '[]'::jsonb, 'cobros', '[]'::jsonb, 'cobro_items', '[]'::jsonb,
     'rendiciones', '[]'::jsonb,
     'pedidos', coalesce((SELECT jsonb_agg(
       (p - ARRAY['creditos_cierre','creado_por','unido_a','iva_envio','costo_envio']) ||
       jsonb_build_object('cliente_id',NULL,'cliente_nombre','Pedido '||(p->>'numero'),
         'direccion','','telefono','','instrucciones_envio','','total',0,'cobrado',0,
         'costo_envio',0,'iva_envio',0,'venta_id',NULL,'creado_por','','unido_a',NULL)
       ) FROM jsonb_array_elements(resultado->'pedidos') p
       WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(resultado->'comandas') c WHERE c->>'pedido_id'=p->>'id')), '[]'::jsonb),
     'items', coalesce((SELECT jsonb_agg(i || jsonb_build_object('precio',0,'iva',0,
       'adicionales',coalesce((SELECT jsonb_agg(a || jsonb_build_object('precio',0))
         FROM jsonb_array_elements(i->'adicionales') a),'[]'::jsonb)))
       FROM jsonb_array_elements(resultado->'items') i), '[]'::jsonb)
   );
   resultado := resultado || jsonb_build_object(
     'cuenta_mesas',coalesce((SELECT jsonb_agg(m) FROM jsonb_array_elements(resultado->'cuenta_mesas') m
       WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(resultado->'pedidos') p WHERE p->>'id'=m->>'pedido_id')), '[]'::jsonb),
     'eventos',coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(resultado->'eventos') e
       WHERE e->>'accion' IN ('cancelar','cancelar_item')
       AND EXISTS(SELECT 1 FROM jsonb_array_elements(resultado->'pedidos') p WHERE p->>'id'=e->>'pedido_id')
       AND (e->>'accion'='cancelar' OR EXISTS(SELECT 1 FROM jsonb_array_elements(resultado->'items') i WHERE i->>'id'=e->'datos'->>'item_id'))), '[]'::jsonb)
   );
 END IF;
 RETURN resultado;
$body$;
  EXECUTE replace(definition, marker, replacement);
END;
$migration$;
REVOKE ALL ON FUNCTION public.restaurante_resumen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurante_resumen(uuid) TO authenticated;

-- La lectura directa y Realtime de eventos también deben respetar el sector.
CREATE FUNCTION public.restaurante_evento_visible_sector(
  p_comercio_id uuid, p_pedido_id uuid, p_accion text, p_datos jsonb
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v_permisos text[]; v_sector uuid;
BEGIN
  IF public.restaurante_acceso(p_comercio_id) IS DISTINCT FROM true THEN RETURN false; END IF;
  IF public.user_is_comercio_admin(p_comercio_id) THEN RETURN true; END IF;
  SELECT permisos,sector_id INTO v_permisos,v_sector FROM public.restaurante_permisos
    WHERE comercio_id=p_comercio_id AND usuario_id=auth.uid() AND activo;
  IF v_permisos IS DISTINCT FROM ARRAY['cocina']::text[] THEN RETURN true; END IF;
  IF p_pedido_id IS NULL OR p_accion NOT IN ('enviar','aceptar','preparar','listo','cancelar','cancelar_item','reconocer') THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.restaurante_comandas c WHERE c.comercio_id=p_comercio_id
    AND c.pedido_id=p_pedido_id AND (v_sector IS NULL OR c.sector_id=v_sector)) THEN RETURN false; END IF;
  IF p_datos ? 'item_id' AND NOT EXISTS(SELECT 1 FROM public.restaurante_items i WHERE i.comercio_id=p_comercio_id
    AND i.pedido_id=p_pedido_id AND i.id::text=p_datos->>'item_id'
    AND (v_sector IS NULL OR i.sector_id=v_sector)) THEN RETURN false; END IF;
  IF p_datos ? 'comanda_id' AND NOT EXISTS(SELECT 1 FROM public.restaurante_comandas c WHERE c.comercio_id=p_comercio_id
    AND c.pedido_id=p_pedido_id AND c.id::text=p_datos->>'comanda_id'
    AND (v_sector IS NULL OR c.sector_id=v_sector)) THEN RETURN false; END IF;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.restaurante_evento_visible_sector(uuid,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restaurante_evento_visible_sector(uuid,uuid,text,jsonb) TO authenticated;
CREATE POLICY restaurante_eventos_sector ON public.restaurante_eventos
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING(public.restaurante_evento_visible_sector(comercio_id,pedido_id,accion,datos));
COMMIT;
