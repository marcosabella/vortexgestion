-- Reservas: estructura y operaciones; no modifica datos existentes.
BEGIN;
CREATE TABLE public.restaurante_reservas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 mesa_id uuid NOT NULL, cliente_id uuid REFERENCES public.clientes(id),
 nombre text NOT NULL CHECK(length(btrim(nombre)) BETWEEN 1 AND 200),
 telefono text NOT NULL DEFAULT '' CHECK(length(telefono)<=100),
 comensales integer NOT NULL CHECK(comensales BETWEEN 1 AND 100),
 inicio timestamptz NOT NULL, fin timestamptz NOT NULL,
 estado text NOT NULL DEFAULT 'confirmada' CHECK(estado IN ('confirmada','atendida','cancelada','ausente')),
 observaciones text NOT NULL DEFAULT '' CHECK(length(observaciones)<=1000), motivo text NOT NULL DEFAULT '',
 pedido_id uuid, version integer NOT NULL DEFAULT 1,
 creado_por uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(mesa_id,comercio_id) REFERENCES public.restaurante_mesas(id,comercio_id),
 FOREIGN KEY(pedido_id,comercio_id) REFERENCES public.restaurante_pedidos(id,comercio_id),
 CHECK(isfinite(inicio) AND isfinite(fin) AND fin>inicio AND fin<=inicio+interval '24 hours')
);
CREATE INDEX restaurante_reservas_agenda ON public.restaurante_reservas(comercio_id,inicio,estado);
CREATE INDEX restaurante_reservas_mesa ON public.restaurante_reservas(comercio_id,mesa_id,inicio,fin) WHERE estado='confirmada';
CREATE INDEX restaurante_reservas_cliente ON public.restaurante_reservas(comercio_id,cliente_id);
CREATE INDEX restaurante_reservas_pedido ON public.restaurante_reservas(comercio_id,pedido_id);
ALTER TABLE public.restaurante_reservas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurante_reservas FROM anon,authenticated;
CREATE POLICY restaurante_reservas_lectura ON public.restaurante_reservas FOR SELECT TO authenticated USING(public.restaurante_permiso(comercio_id,'salon'));

CREATE FUNCTION public.restaurante_reservas_listar(p_comercio_id uuid,p_desde timestamptz,p_hasta timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF public.restaurante_permiso(p_comercio_id,'salon') IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sin permiso de salón' USING ERRCODE='42501'; END IF;
 IF p_desde IS NULL OR p_hasta IS NULL OR NOT isfinite(p_desde) OR NOT isfinite(p_hasta) OR p_hasta<=p_desde OR p_hasta>p_desde+interval '31 days' THEN RAISE EXCEPTION 'Rango de fechas inválido'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.inicio,r.created_at) FROM public.restaurante_reservas r WHERE r.comercio_id=p_comercio_id AND r.inicio<p_hasta AND r.fin>p_desde),'[]');
END $$;

CREATE FUNCTION public.restaurante_reserva_operar(p_comercio_id uuid,p_accion text,p_datos jsonb,p_clave uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.restaurante_reservas; m public.restaurante_mesas; intento public.restaurante_intentos;
 v_id uuid; v_cliente uuid; v_inicio timestamptz; v_fin timestamptz; v_personas integer; v_nombre text; v_estado text; v_pedido uuid;
BEGIN
 IF public.restaurante_permiso(p_comercio_id,'salon') IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sin permiso de salón' USING ERRCODE='42501'; END IF;
 IF p_clave IS NULL OR jsonb_typeof(p_datos) IS DISTINCT FROM 'object' OR p_accion NOT IN ('reserva_guardar','reserva_cancelar','reserva_ausente','reserva_recibir') THEN RAISE EXCEPTION 'Solicitud inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('restaurante:'||p_comercio_id::text,0));
 SELECT * INTO intento FROM public.restaurante_intentos WHERE comercio_id=p_comercio_id AND clave=p_clave;
 IF FOUND THEN
  IF intento.usuario_id<>auth.uid() OR intento.accion<>p_accion OR intento.datos<>p_datos THEN RAISE EXCEPTION 'Intento reutilizado con otros datos'; END IF;
  RETURN intento.resultado;
 END IF;
 v_id:=nullif(p_datos->>'id','')::uuid;
 IF v_id IS NOT NULL THEN
  SELECT * INTO r FROM public.restaurante_reservas WHERE id=v_id AND comercio_id=p_comercio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no disponible'; END IF;
  IF r.version IS DISTINCT FROM (p_datos->>'version')::integer THEN RAISE EXCEPTION 'La reserva cambió; actualizá la agenda' USING ERRCODE='40001'; END IF;
  IF r.estado<>'confirmada' THEN RAISE EXCEPTION 'La reserva ya está finalizada'; END IF;
 ELSIF p_accion<>'reserva_guardar' THEN RAISE EXCEPTION 'Seleccioná una reserva';
 END IF;
 IF p_accion='reserva_guardar' THEN
  SELECT * INTO m FROM public.restaurante_mesas WHERE id=(p_datos->>'mesa_id')::uuid AND comercio_id=p_comercio_id AND activo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mesa no disponible'; END IF;
  v_inicio:=(p_datos->>'inicio')::timestamptz; v_fin:=(p_datos->>'fin')::timestamptz;
  v_personas:=(p_datos->>'comensales')::integer; v_nombre:=btrim(p_datos->>'nombre'); v_cliente:=nullif(p_datos->>'cliente_id','')::uuid;
  IF v_inicio IS NULL OR v_fin IS NULL OR NOT isfinite(v_inicio) OR NOT isfinite(v_fin) OR v_inicio<now() OR v_fin<=v_inicio OR v_fin>v_inicio+interval '24 hours' THEN RAISE EXCEPTION 'Indicá un horario futuro y una duración de hasta 24 horas'; END IF;
  IF v_personas IS NULL OR v_personas NOT BETWEEN 1 AND m.capacidad THEN RAISE EXCEPTION 'Los comensales superan la capacidad de la mesa'; END IF;
  IF v_nombre IS NULL OR length(v_nombre) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Indicá el nombre de la reserva'; END IF;
  IF v_cliente IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=v_cliente AND comercio_id=p_comercio_id) THEN RAISE EXCEPTION 'Cliente de otro comercio'; END IF;
  IF EXISTS(SELECT 1 FROM public.restaurante_reservas WHERE comercio_id=p_comercio_id AND mesa_id=m.id AND estado='confirmada' AND id IS DISTINCT FROM v_id AND inicio<v_fin AND fin>v_inicio) THEN RAISE EXCEPTION 'La mesa ya tiene una reserva en ese horario'; END IF;
  IF v_id IS NULL THEN
   INSERT INTO public.restaurante_reservas(comercio_id,mesa_id,cliente_id,nombre,telefono,comensales,inicio,fin,observaciones,creado_por)
   VALUES(p_comercio_id,m.id,v_cliente,v_nombre,coalesce(p_datos->>'telefono',''),v_personas,v_inicio,v_fin,coalesce(p_datos->>'observaciones',''),auth.uid()) RETURNING id INTO v_id;
  ELSE
   UPDATE public.restaurante_reservas SET mesa_id=m.id,cliente_id=v_cliente,nombre=v_nombre,telefono=coalesce(p_datos->>'telefono',''),comensales=v_personas,inicio=v_inicio,fin=v_fin,observaciones=coalesce(p_datos->>'observaciones',''),version=version+1 WHERE id=v_id;
  END IF;
 ELSIF p_accion='reserva_recibir' THEN
  -- Apertura y recepción atómicas: la mesa ocupada se rechaza por el circuito existente.
  v_pedido:=public.restaurante_operar(p_comercio_id,'pedido',jsonb_build_object('modalidad','mesa','mesa_id',r.mesa_id,'cliente_id',r.cliente_id,'cliente_nombre',r.nombre,'telefono',r.telefono,'comensales',r.comensales,'observaciones',r.observaciones),gen_random_uuid());
  UPDATE public.restaurante_reservas SET estado='atendida',pedido_id=v_pedido,version=version+1 WHERE id=v_id;
 ELSE
  IF length(btrim(coalesce(p_datos->>'motivo',''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Indicá el motivo'; END IF;
  IF p_accion='reserva_ausente' AND r.inicio>now() THEN RAISE EXCEPTION 'Todavía no llegó el horario de la reserva'; END IF;
  v_estado:=CASE WHEN p_accion='reserva_cancelar' THEN 'cancelada' ELSE 'ausente' END;
  UPDATE public.restaurante_reservas SET estado=v_estado,motivo=btrim(p_datos->>'motivo'),version=version+1 WHERE id=v_id;
 END IF;
 INSERT INTO public.restaurante_eventos(comercio_id,pedido_id,accion,datos,usuario_id) VALUES(p_comercio_id,v_pedido,p_accion,jsonb_build_object('reserva_id',v_id,'motivo',p_datos->>'motivo'),auth.uid());
 INSERT INTO public.restaurante_intentos VALUES(p_comercio_id,p_clave,auth.uid(),p_accion,p_datos,coalesce(v_pedido,v_id));
 RETURN coalesce(v_pedido,v_id);
END $$;
REVOKE ALL ON FUNCTION public.restaurante_reservas_listar(uuid,timestamptz,timestamptz),public.restaurante_reserva_operar(uuid,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restaurante_reservas_listar(uuid,timestamptz,timestamptz),public.restaurante_reserva_operar(uuid,text,jsonb,uuid) TO authenticated;
COMMIT;
