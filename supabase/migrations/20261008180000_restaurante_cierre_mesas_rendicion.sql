BEGIN;
ALTER TABLE public.restaurante_cobros ADD COLUMN recibido_por uuid REFERENCES auth.users(id);
CREATE INDEX restaurante_cobros_receptor ON public.restaurante_cobros(comercio_id,recibido_por,rendicion_id);
-- La autoría del cobro se conserva. La mesa determina quién rinde su efectivo.
CREATE FUNCTION public.restaurante_responsable_cobro(p_cobro uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(c.recibido_por,CASE WHEN p.modalidad='mesa' AND (r.roles && ARRAY['mozo'] OR r.permisos && ARRAY['salon'])
 THEN p.creado_por ELSE c.usuario_id END)
 FROM public.restaurante_cobros c
 JOIN public.restaurante_pedidos p ON p.id=c.pedido_id AND p.comercio_id=c.comercio_id
 LEFT JOIN public.restaurante_permisos r ON r.comercio_id=p.comercio_id AND r.usuario_id=p.creado_por
 WHERE c.id=p_cobro;
$$;
REVOKE ALL ON FUNCTION public.restaurante_responsable_cobro(uuid) FROM PUBLIC,anon,authenticated;

-- Se conserva el resto del circuito transaccional (stock, venta e idempotencia).
DO $migration$
DECLARE definition text; anterior text; siguiente text;
BEGIN
 definition:=pg_get_functiondef('public.restaurante_operar(uuid,text,jsonb,uuid)'::regprocedure);
 anterior:=$old$WHEN p_accion IN ('rendir','cerrar') THEN 'cierre'$old$;
 siguiente:=$new$WHEN p_accion='rendir' THEN 'cierre'
 WHEN p_accion='cerrar' THEN 'cobros'$new$;
 IF position(anterior IN definition)=0 THEN RAISE EXCEPTION 'No se encontró el permiso de cierre esperado'; END IF;
 definition:=replace(definition,anterior,siguiente);
 anterior:=$old$AND NOT(p_accion='cobro' AND public.restaurante_permiso(p_comercio_id,'envios'))$old$;
 siguiente:=$new$AND NOT(p_accion='cobro' AND (public.restaurante_permiso(p_comercio_id,'envios') OR public.restaurante_permiso(p_comercio_id,'salon')))$new$;
 IF position(anterior IN definition)=0 THEN RAISE EXCEPTION 'No se encontró la autorización de cobros esperada'; END IF;
 definition:=replace(definition,anterior,siguiente);
 anterior:=$old$IF permiso='salon' AND p.modalidad<>'mesa' THEN$old$;
 siguiente:=$new$IF p_accion='cobro' AND NOT public.restaurante_permiso(p_comercio_id,'cobros') AND NOT public.restaurante_permiso(p_comercio_id,'envios') AND p.modalidad<>'mesa' THEN RAISE EXCEPTION 'El mozo sólo cobra cuentas de mesa' USING ERRCODE='42501'; END IF;
 IF permiso='salon' AND p.modalidad<>'mesa' THEN$new$;
 IF position(anterior IN definition)=0 THEN RAISE EXCEPTION 'No se encontró la validación de mesa esperada'; END IF;
 definition:=replace(definition,anterior,siguiente);
 anterior:=$old$IF permiso='envios' OR (p_accion='cobro' AND NOT public.restaurante_permiso(p_comercio_id,'cobros')) THEN$old$;
 siguiente:=$new$IF permiso='envios' OR (p_accion='cobro' AND p.modalidad<>'mesa' AND NOT public.restaurante_permiso(p_comercio_id,'cobros')) THEN$new$;
 IF position(anterior IN definition)=0 THEN RAISE EXCEPTION 'No se encontró la autorización de reparto esperada'; END IF;
 definition:=replace(definition,anterior,siguiente);
 anterior:=$old$INSERT INTO public.restaurante_cobros(comercio_id,pedido_id,monto,medio,pagador,usuario_id)
 VALUES(p_comercio_id,p.id,monto,p_datos->>'medio',coalesce(p_datos->>'pagador',''),auth.uid())$old$;
 siguiente:=$new$repartidor:=coalesce(nullif(p_datos->>'recibido_por','')::uuid,auth.uid());
 IF repartidor<>auth.uid() AND (p.modalidad<>'mesa' OR NOT EXISTS(
 SELECT 1 FROM public.comercio_usuarios cu LEFT JOIN public.restaurante_permisos rp ON rp.comercio_id=cu.comercio_id AND rp.usuario_id=cu.user_id
 WHERE cu.comercio_id=p_comercio_id AND cu.user_id=repartidor AND cu.activo
 AND (cu.rol='admin' OR (cu.user_id=p.creado_por AND rp.activo AND (rp.roles && ARRAY['mozo'] OR rp.permisos && ARRAY['salon'])))
 )) THEN RAISE EXCEPTION 'El receptor debe ser el mozo de la mesa o caja del mismo comercio'; END IF;
 INSERT INTO public.restaurante_cobros(comercio_id,pedido_id,monto,medio,pagador,usuario_id,recibido_por)
 VALUES(p_comercio_id,p.id,monto,p_datos->>'medio',coalesce(p_datos->>'pagador',''),auth.uid(),repartidor)$new$;
 IF position(anterior IN definition)=0 THEN RAISE EXCEPTION 'No se encontró el registro de cobro esperado'; END IF;
 definition:=replace(definition,anterior,siguiente);
 anterior:=$old$c.usuario_id=repartidor AND c.medio='contado'$old$;
 siguiente:=$new$public.restaurante_responsable_cobro(c.id)=repartidor AND c.medio='contado'$new$;
 IF position(anterior IN definition)=0 THEN RAISE EXCEPTION 'No se encontró la validación de rendición esperada'; END IF;
 definition:=replace(definition,anterior,siguiente);
 anterior:=$old$IF EXISTS(SELECT 1 FROM public.restaurante_cobros c JOIN public.restaurante_envios e ON e.pedido_id=c.pedido_id WHERE c.id=ANY(ids)$old$;
 siguiente:=$new$IF EXISTS(SELECT 1 FROM public.restaurante_cobros c JOIN public.restaurante_pedidos mesa_p ON mesa_p.id=c.pedido_id AND mesa_p.comercio_id=c.comercio_id WHERE c.id=ANY(ids) AND mesa_p.modalidad='mesa' AND (mesa_p.cuenta<>'cerrada' OR mesa_p.venta_id IS NULL)) THEN RAISE EXCEPTION 'Cerrá la mesa en Cuentas y cobros antes de recibir su rendición'; END IF;
 IF EXISTS(SELECT 1 FROM public.restaurante_cobros c JOIN public.restaurante_envios e ON e.pedido_id=c.pedido_id WHERE c.id=ANY(ids)$new$;
 IF position(anterior IN definition)=0 THEN RAISE EXCEPTION 'No se encontró la validación de entregas esperada'; END IF;
 definition:=replace(definition,anterior,siguiente);
 EXECUTE definition;

 definition:=pg_get_functiondef('public.restaurante_resumen(uuid)'::regprocedure);
 anterior:=$old$SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at) FROM public.restaurante_cobros c$old$;
 siguiente:=$new$SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('responsable_id',public.restaurante_responsable_cobro(c.id)) ORDER BY c.created_at) FROM public.restaurante_cobros c$new$;
 IF position(anterior IN definition)=0 THEN RAISE EXCEPTION 'No se encontró el resumen de cobros esperado'; END IF;
 definition:=replace(definition,anterior,siguiente);
 anterior:=$old$'nombre',u.email,'admin',cu.rol='admin'$old$;
 siguiente:=$new$'nombre',coalesce(nullif(rp.nombre,''),u.email),'admin',cu.rol='admin'$new$;
 IF position(anterior IN definition)=0 THEN RAISE EXCEPTION 'No se encontró el nombre de usuario esperado'; END IF;
 definition:=replace(definition,anterior,siguiente);
 anterior:=$old$JOIN auth.users u ON u.id=cu.user_id WHERE cu.comercio_id=p_comercio_id$old$;
 siguiente:=$new$JOIN auth.users u ON u.id=cu.user_id LEFT JOIN public.restaurante_permisos rp ON rp.comercio_id=cu.comercio_id AND rp.usuario_id=cu.user_id WHERE cu.comercio_id=p_comercio_id$new$;
 IF position(anterior IN definition)=0 THEN RAISE EXCEPTION 'No se encontró la lista de usuarios esperada'; END IF;
 definition:=replace(definition,anterior,siguiente);
 anterior:=$old$OR u.id=auth.uid())),'[]')$old$;
 siguiente:=$new$OR u.id=auth.uid() OR (cu.rol='admin' AND v_permisos && ARRAY['salon','cobros']))),'[]')$new$;
 IF position(anterior IN definition)=0 THEN RAISE EXCEPTION 'No se encontró el filtro de usuarios esperado'; END IF;
 definition:=replace(definition,anterior,siguiente);
 EXECUTE definition;
END $migration$;
COMMIT;
