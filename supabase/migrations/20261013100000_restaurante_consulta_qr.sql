-- Consulta pública de solo lectura. No modifica datos ni habilita comercios existentes.
BEGIN;

ALTER TABLE public.restaurante_cuenta_mesas ADD CONSTRAINT restaurante_cuenta_mesas_tenant UNIQUE(id,comercio_id);
CREATE TABLE public.restaurante_mesa_qr (
 mesa_id uuid PRIMARY KEY, comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 qr_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 FOREIGN KEY(mesa_id,comercio_id) REFERENCES public.restaurante_mesas(id,comercio_id)
);
CREATE INDEX restaurante_mesa_qr_comercio ON public.restaurante_mesa_qr(comercio_id);
CREATE TABLE public.restaurante_consulta_aperturas (
 cuenta_mesa_id uuid PRIMARY KEY, comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 pedido_id uuid NOT NULL, token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 revocada boolean NOT NULL DEFAULT false,
 FOREIGN KEY(cuenta_mesa_id,comercio_id) REFERENCES public.restaurante_cuenta_mesas(id,comercio_id),
 FOREIGN KEY(pedido_id,comercio_id) REFERENCES public.restaurante_pedidos(id,comercio_id)
);
CREATE INDEX restaurante_consulta_aperturas_comercio ON public.restaurante_consulta_aperturas(comercio_id,pedido_id);
ALTER TABLE public.restaurante_mesa_qr ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurante_consulta_aperturas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurante_mesa_qr,public.restaurante_consulta_aperturas FROM PUBLIC,anon,authenticated;
CREATE POLICY restaurante_qr_configuracion ON public.restaurante_mesa_qr FOR SELECT TO authenticated
 USING(public.restaurante_permiso(comercio_id,'configuracion'));
CREATE POLICY restaurante_consulta_personal ON public.restaurante_consulta_aperturas FOR SELECT TO authenticated
 USING(public.restaurante_permiso(comercio_id,'salon') OR public.restaurante_permiso(comercio_id,'cobros') OR public.restaurante_permiso(comercio_id,'configuracion'));

-- El vínculo mesa/cuenta representa una apertura. Al mover, cerrar o unir, el acceso anterior se revoca.
CREATE FUNCTION public.restaurante_consulta_ciclo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.activa THEN
   INSERT INTO public.restaurante_consulta_aperturas(cuenta_mesa_id,comercio_id,pedido_id)
   VALUES(NEW.id,NEW.comercio_id,NEW.pedido_id);
  END IF;
 ELSIF NOT NEW.activa OR NEW.pedido_id IS DISTINCT FROM OLD.pedido_id OR NEW.mesa_id IS DISTINCT FROM OLD.mesa_id THEN
  UPDATE public.restaurante_consulta_aperturas SET revocada=true WHERE cuenta_mesa_id=NEW.id;
  IF NEW.pedido_id IS DISTINCT FROM OLD.pedido_id THEN
   UPDATE public.restaurante_consulta_aperturas SET revocada=true WHERE comercio_id=NEW.comercio_id AND pedido_id=NEW.pedido_id;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER restaurante_consulta_ciclo AFTER INSERT OR UPDATE ON public.restaurante_cuenta_mesas
 FOR EACH ROW EXECUTE FUNCTION public.restaurante_consulta_ciclo();

CREATE FUNCTION public.restaurante_qr_mesas(p_comercio_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.restaurante_permiso(p_comercio_id,'configuracion') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Sin permiso para configurar los QR' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.restaurante_mesa_qr(mesa_id,comercio_id)
 SELECT id,comercio_id FROM public.restaurante_mesas WHERE comercio_id=p_comercio_id AND activo
 ON CONFLICT(mesa_id) DO NOTHING;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('mesa_id',m.id,'nombre',m.nombre,'qr_token',q.qr_token) ORDER BY m.nombre)
 FROM public.restaurante_mesas m JOIN public.restaurante_mesa_qr q ON q.mesa_id=m.id AND q.comercio_id=m.comercio_id
 WHERE m.comercio_id=p_comercio_id AND m.activo),'[]'::jsonb);
END $$;

-- Sólo el personal autorizado puede obtener la credencial de la apertura actual.
-- Se crea bajo demanda para aperturas previas a esta migración; no hay backfill productivo.
CREATE FUNCTION public.restaurante_qr_apertura(p_comercio_id uuid,p_mesa_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cm public.restaurante_cuenta_mesas; credencial uuid; qr uuid; nombre_mesa text;
BEGIN
 IF (public.restaurante_permiso(p_comercio_id,'salon') OR public.restaurante_permiso(p_comercio_id,'cobros') OR public.restaurante_permiso(p_comercio_id,'configuracion')) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Sin permiso para consultar la apertura' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('restaurante:'||p_comercio_id::text,0));
 SELECT nombre INTO nombre_mesa FROM public.restaurante_mesas WHERE id=p_mesa_id AND comercio_id=p_comercio_id AND activo;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mesa no disponible'; END IF;
 SELECT c.* INTO cm FROM public.restaurante_cuenta_mesas c JOIN public.restaurante_pedidos p ON p.id=c.pedido_id AND p.comercio_id=c.comercio_id
 WHERE c.mesa_id=p_mesa_id AND c.comercio_id=p_comercio_id AND c.activa AND p.modalidad='mesa'
 AND p.cuenta IN ('abierta','solicitada') AND p.estado NOT IN ('completado','cancelado','unido') AND p.venta_id IS NULL
 FOR UPDATE OF c;
 IF NOT FOUND THEN RAISE EXCEPTION 'La mesa no tiene una apertura vigente'; END IF;
 INSERT INTO public.restaurante_mesa_qr(mesa_id,comercio_id) VALUES(p_mesa_id,p_comercio_id) ON CONFLICT(mesa_id) DO NOTHING;
 SELECT qr_token INTO qr FROM public.restaurante_mesa_qr WHERE mesa_id=p_mesa_id AND comercio_id=p_comercio_id;
 INSERT INTO public.restaurante_consulta_aperturas(cuenta_mesa_id,comercio_id,pedido_id)
 VALUES(cm.id,p_comercio_id,cm.pedido_id) ON CONFLICT(cuenta_mesa_id) DO NOTHING;
 -- Una unión requiere una credencial nueva; nunca se reactiva el token anterior.
 UPDATE public.restaurante_consulta_aperturas SET token=gen_random_uuid(),pedido_id=cm.pedido_id,revocada=false
 WHERE cuenta_mesa_id=cm.id AND (revocada OR pedido_id<>cm.pedido_id);
 SELECT token INTO credencial FROM public.restaurante_consulta_aperturas WHERE cuenta_mesa_id=cm.id AND comercio_id=p_comercio_id;
 RETURN jsonb_build_object('mesa_id',p_mesa_id,'nombre',nombre_mesa,'qr_token',qr,'apertura_token',credencial);
END $$;

-- Capacidad de lectura limitada a QR + apertura. Sin acceso a clientes, cobros, notas o historial.
CREATE FUNCTION public.restaurante_consulta_publica(p_qr_token uuid,p_apertura_token uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE mesa public.restaurante_mesas; cm public.restaurante_cuenta_mesas; resultado jsonb; consumo jsonb; acceso boolean;
BEGIN
 SELECT m.* INTO mesa FROM public.restaurante_mesa_qr q
 JOIN public.restaurante_mesas m ON m.id=q.mesa_id AND m.comercio_id=q.comercio_id
 JOIN public.comercio_parametrizacion cp ON cp.comercio_id=m.comercio_id
 WHERE q.qr_token=p_qr_token AND m.activo AND cp.parametros->'modulos'->>'restaurante'='true'
 AND public.comercio_acceso_vigente(m.comercio_id)
 AND coalesce((SELECT 'mesa'=ANY(c.modalidades) FROM public.restaurante_config c WHERE c.comercio_id=m.comercio_id),true);
 IF NOT FOUND THEN RAISE EXCEPTION 'QR no disponible' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('comercio',(SELECT nombre_comercio FROM public.comercio WHERE id=mesa.comercio_id),'mesa',mesa.nombre,
 'carta',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'descripcion',p.descripcion,'precio',p.precio_venta,'sector',s.nombre) ORDER BY s.nombre,p.descripcion)
 FROM public.restaurante_carta c JOIN public.productos p ON p.id=c.producto_id AND p.comercio_id=c.comercio_id
 JOIN public.restaurante_sectores s ON s.id=c.sector_id AND s.comercio_id=c.comercio_id
 WHERE c.comercio_id=mesa.comercio_id AND c.activo AND s.activo AND p.tipo_moneda='ARS' AND p.precio_venta>0),'[]'::jsonb)) INTO resultado;
 SELECT c.* INTO cm FROM public.restaurante_cuenta_mesas c JOIN public.restaurante_pedidos p ON p.id=c.pedido_id AND p.comercio_id=c.comercio_id
 WHERE c.mesa_id=mesa.id AND c.comercio_id=mesa.comercio_id AND c.activa AND p.modalidad='mesa'
 AND p.cuenta IN ('abierta','solicitada') AND p.estado NOT IN ('completado','cancelado','unido') AND p.venta_id IS NULL;
 acceso:=FOUND AND p_apertura_token IS NOT NULL AND EXISTS(SELECT 1 FROM public.restaurante_consulta_aperturas a
 WHERE a.cuenta_mesa_id=cm.id AND a.comercio_id=mesa.comercio_id AND a.pedido_id=cm.pedido_id AND NOT a.revocada AND a.token=p_apertura_token);
 IF acceso THEN
  SELECT jsonb_build_object('total',coalesce(sum(round(i.cantidad*i.precio,2)),0),
   'items',coalesce(jsonb_agg(jsonb_build_object('id',i.id,'descripcion',i.descripcion,'cantidad',i.cantidad,'precio',i.precio,
    'subtotal',round(i.cantidad*i.precio,2),'adicionales',coalesce((SELECT jsonb_agg(e->>'nombre') FROM jsonb_array_elements(i.adicionales) e),'[]'::jsonb)) ORDER BY i.created_at,i.id),'[]'::jsonb))
  INTO consumo FROM public.restaurante_items i WHERE i.pedido_id=cm.pedido_id AND i.comercio_id=mesa.comercio_id AND i.estado NOT IN ('borrador','cancelada');
 END IF;
 RETURN resultado||jsonb_build_object('estado_consulta',CASE WHEN acceso THEN 'vigente' WHEN p_apertura_token IS NOT NULL THEN 'vencida' WHEN cm.id IS NULL THEN 'sin_apertura' ELSE 'requiere_acceso' END,'consumo',consumo);
END $$;

REVOKE ALL ON FUNCTION public.restaurante_consulta_ciclo(),public.restaurante_qr_mesas(uuid),public.restaurante_qr_apertura(uuid,uuid),public.restaurante_consulta_publica(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.restaurante_qr_mesas(uuid),public.restaurante_qr_apertura(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurante_consulta_publica(uuid,uuid) TO anon,authenticated;
COMMIT;
