-- Primera versión gastronómica. Sólo estructura; no activa comercios ni modifica datos existentes.
BEGIN;
CREATE TABLE public.restaurante_config (
 comercio_id uuid PRIMARY KEY REFERENCES public.comercio(id),
 modalidades text[] NOT NULL DEFAULT ARRAY['delivery','retiro','mesa'],
 impresion text NOT NULL DEFAULT '58mm' CHECK(impresion IN ('58mm','a4')),
 iva_envio numeric(7,4) NOT NULL DEFAULT 21 CHECK(iva_envio IN (0,10.5,21,27)),
 CHECK(cardinality(modalidades)>0 AND modalidades <@ ARRAY['delivery','retiro','mesa'])
);
CREATE TABLE public.restaurante_permisos (
 comercio_id uuid NOT NULL REFERENCES public.comercio(id), usuario_id uuid NOT NULL REFERENCES auth.users(id),
 permisos text[] NOT NULL DEFAULT '{}', sector_id uuid,
 PRIMARY KEY(comercio_id,usuario_id),
 CHECK(permisos <@ ARRAY['pedidos','salon','cocina','despacho','envios','cobros','cierre','configuracion'])
);
CREATE TABLE public.restaurante_sectores (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 nombre text NOT NULL CHECK(length(btrim(nombre)) BETWEEN 1 AND 100), activo boolean NOT NULL DEFAULT true,
 impresion text CHECK(impresion IN ('58mm','a4')),
 UNIQUE(id,comercio_id), UNIQUE(comercio_id,nombre)
);
ALTER TABLE public.restaurante_permisos ADD FOREIGN KEY(sector_id,comercio_id) REFERENCES public.restaurante_sectores(id,comercio_id);
CREATE TABLE public.restaurante_mesas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 nombre text NOT NULL CHECK(length(btrim(nombre)) BETWEEN 1 AND 100), capacidad integer NOT NULL CHECK(capacidad BETWEEN 1 AND 100),
 activo boolean NOT NULL DEFAULT true, UNIQUE(id,comercio_id), UNIQUE(comercio_id,nombre)
);
CREATE TABLE public.restaurante_carta (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 producto_id uuid NOT NULL REFERENCES public.productos(id), sector_id uuid NOT NULL,
 afecta_stock boolean NOT NULL DEFAULT false, activo boolean NOT NULL DEFAULT true,
 FOREIGN KEY(sector_id,comercio_id) REFERENCES public.restaurante_sectores(id,comercio_id),
 UNIQUE(id,comercio_id), UNIQUE(comercio_id,producto_id)
);
CREATE TABLE public.restaurante_adicionales (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 nombre text NOT NULL CHECK(length(btrim(nombre)) BETWEEN 1 AND 100),
 precio numeric(12,2) NOT NULL CHECK(precio>=0 AND precio::text NOT IN ('NaN','Infinity','-Infinity')),
 activo boolean NOT NULL DEFAULT true, UNIQUE(id,comercio_id)
);
CREATE TABLE public.restaurante_pedidos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 numero bigint GENERATED ALWAYS AS IDENTITY, modalidad text NOT NULL CHECK(modalidad IN ('delivery','retiro','mesa')),
 cliente_id uuid REFERENCES public.clientes(id), cliente_nombre text NOT NULL DEFAULT 'Consumidor Final',
 direccion text NOT NULL DEFAULT '', telefono text NOT NULL DEFAULT '', comensales integer NOT NULL DEFAULT 1 CHECK(comensales BETWEEN 1 AND 100),
 prometido_at timestamptz, prioridad boolean NOT NULL DEFAULT false, observaciones text NOT NULL DEFAULT '', instrucciones_envio text NOT NULL DEFAULT '',
 costo_envio numeric(12,2) NOT NULL DEFAULT 0 CHECK(costo_envio>=0 AND costo_envio::text NOT IN ('NaN','Infinity','-Infinity')),
 iva_envio numeric(7,4) NOT NULL DEFAULT 21 CHECK(iva_envio IN (0,10.5,21,27)),
 estado text NOT NULL DEFAULT 'borrador' CHECK(estado IN ('borrador','confirmado','en_atencion','completado','cancelado','unido')),
 cuenta text NOT NULL DEFAULT 'abierta' CHECK(cuenta IN ('abierta','solicitada','cerrada')),
 armado boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 venta_id uuid REFERENCES public.ventas(id) ON DELETE RESTRICT, unido_a uuid,
 creditos_cierre uuid[] NOT NULL DEFAULT '{}',
 creado_por uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,comercio_id), FOREIGN KEY(unido_a,comercio_id) REFERENCES public.restaurante_pedidos(id,comercio_id),
 CHECK((modalidad='delivery') OR costo_envio=0)
);
CREATE TABLE public.restaurante_cuenta_mesas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id), pedido_id uuid NOT NULL, mesa_id uuid NOT NULL,
 activa boolean NOT NULL DEFAULT true,
 FOREIGN KEY(pedido_id,comercio_id) REFERENCES public.restaurante_pedidos(id,comercio_id),
 FOREIGN KEY(mesa_id,comercio_id) REFERENCES public.restaurante_mesas(id,comercio_id)
);
CREATE UNIQUE INDEX restaurante_mesa_ocupada ON public.restaurante_cuenta_mesas(comercio_id,mesa_id) WHERE activa;
CREATE UNIQUE INDEX restaurante_mesa_cuenta ON public.restaurante_cuenta_mesas(pedido_id,mesa_id) WHERE activa;
CREATE TABLE public.restaurante_comandas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 numero bigint GENERATED ALWAYS AS IDENTITY, pedido_id uuid NOT NULL, sector_id uuid NOT NULL,
 impresiones integer NOT NULL DEFAULT 0, aviso_cancelacion boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(pedido_id,comercio_id) REFERENCES public.restaurante_pedidos(id,comercio_id),
 FOREIGN KEY(sector_id,comercio_id) REFERENCES public.restaurante_sectores(id,comercio_id), UNIQUE(id,comercio_id)
);
CREATE TABLE public.restaurante_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id), pedido_id uuid NOT NULL,
 carta_id uuid NOT NULL, sector_id uuid NOT NULL, comanda_id uuid, producto_id uuid NOT NULL REFERENCES public.productos(id),
 descripcion text NOT NULL, cantidad integer NOT NULL CHECK(cantidad BETWEEN 1 AND 1000),
 precio numeric(16,4) NOT NULL CHECK(precio>0 AND precio::text NOT IN ('NaN','Infinity','-Infinity')),
 iva numeric(7,4) NOT NULL CHECK(iva BETWEEN 0 AND 100), afecta_stock boolean NOT NULL,
 adicionales jsonb NOT NULL DEFAULT '[]', observaciones text NOT NULL DEFAULT '',
 estado text NOT NULL DEFAULT 'borrador' CHECK(estado IN ('borrador','pendiente','aceptada','preparacion','lista','entregada','cancelada')),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(pedido_id,comercio_id) REFERENCES public.restaurante_pedidos(id,comercio_id),
 FOREIGN KEY(carta_id,comercio_id) REFERENCES public.restaurante_carta(id,comercio_id),
 FOREIGN KEY(sector_id,comercio_id) REFERENCES public.restaurante_sectores(id,comercio_id),
 FOREIGN KEY(comanda_id,comercio_id) REFERENCES public.restaurante_comandas(id,comercio_id), UNIQUE(id,comercio_id)
);
CREATE TABLE public.restaurante_envios (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id), pedido_id uuid NOT NULL,
 repartidor_id uuid NOT NULL REFERENCES auth.users(id),
 estado text NOT NULL DEFAULT 'asignado' CHECK(estado IN ('asignado','en_camino','entregado','incidencia','cancelado')),
 observaciones text NOT NULL DEFAULT '', salida_at timestamptz, entrega_at timestamptz,
 FOREIGN KEY(pedido_id,comercio_id) REFERENCES public.restaurante_pedidos(id,comercio_id), UNIQUE(pedido_id), UNIQUE(id,comercio_id)
);
CREATE TABLE public.restaurante_rendiciones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 usuario_id uuid NOT NULL REFERENCES auth.users(id), esperado numeric(14,2) NOT NULL, recibido numeric(14,2) NOT NULL CHECK(recibido>=0),
 diferencia numeric(14,2) NOT NULL, observaciones text NOT NULL DEFAULT '', creado_por uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,comercio_id)
);
CREATE TABLE public.restaurante_cobros (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id), pedido_id uuid NOT NULL,
 monto numeric(14,2) NOT NULL CHECK(monto>0 AND monto::text NOT IN ('NaN','Infinity','-Infinity')),
 medio text NOT NULL CHECK(medio IN ('contado','transferencia','tarjeta')),
 pagador text NOT NULL DEFAULT '', usuario_id uuid NOT NULL REFERENCES auth.users(id),
 anulado boolean NOT NULL DEFAULT false, motivo_anulacion text NOT NULL DEFAULT '', rendicion_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(pedido_id,comercio_id) REFERENCES public.restaurante_pedidos(id,comercio_id),
 FOREIGN KEY(rendicion_id,comercio_id) REFERENCES public.restaurante_rendiciones(id,comercio_id), UNIQUE(id,comercio_id)
);
CREATE TABLE public.restaurante_cobro_items (
 comercio_id uuid NOT NULL REFERENCES public.comercio(id), cobro_id uuid NOT NULL, item_id uuid NOT NULL,
 cantidad integer NOT NULL CHECK(cantidad>0), PRIMARY KEY(cobro_id,item_id),
 FOREIGN KEY(cobro_id,comercio_id) REFERENCES public.restaurante_cobros(id,comercio_id),
 FOREIGN KEY(item_id,comercio_id) REFERENCES public.restaurante_items(id,comercio_id)
);
CREATE TABLE public.restaurante_eventos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id), pedido_id uuid,
 accion text NOT NULL, datos jsonb NOT NULL, usuario_id uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(pedido_id,comercio_id) REFERENCES public.restaurante_pedidos(id,comercio_id)
);
CREATE TABLE public.restaurante_intentos (
 comercio_id uuid NOT NULL REFERENCES public.comercio(id), clave uuid NOT NULL, usuario_id uuid NOT NULL REFERENCES auth.users(id),
 accion text NOT NULL, datos jsonb NOT NULL, resultado uuid NOT NULL, PRIMARY KEY(comercio_id,clave)
);
CREATE INDEX restaurante_pedidos_estado ON public.restaurante_pedidos(comercio_id,estado,created_at);
CREATE INDEX restaurante_pedidos_cliente ON public.restaurante_pedidos(comercio_id,cliente_id);
CREATE INDEX restaurante_items_pedido ON public.restaurante_items(comercio_id,pedido_id,estado);
CREATE INDEX restaurante_items_comanda ON public.restaurante_items(comercio_id,comanda_id);
CREATE INDEX restaurante_comandas_sector ON public.restaurante_comandas(comercio_id,sector_id,created_at);
CREATE INDEX restaurante_envios_usuario ON public.restaurante_envios(comercio_id,repartidor_id,estado);
CREATE INDEX restaurante_cobros_pedido ON public.restaurante_cobros(comercio_id,pedido_id);
CREATE INDEX restaurante_cobros_rendir ON public.restaurante_cobros(comercio_id,usuario_id,rendicion_id);
CREATE INDEX restaurante_eventos_pedido ON public.restaurante_eventos(comercio_id,pedido_id,created_at);
CREATE INDEX restaurante_cuenta_pedido ON public.restaurante_cuenta_mesas(comercio_id,pedido_id);
CREATE INDEX restaurante_carta_sector ON public.restaurante_carta(comercio_id,sector_id);
CREATE INDEX restaurante_rendiciones_fecha ON public.restaurante_rendiciones(comercio_id,created_at);
CREATE INDEX restaurante_cobro_items_item ON public.restaurante_cobro_items(comercio_id,item_id);

CREATE FUNCTION public.restaurante_habilitado(p_comercio uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.user_belongs_to_comercio(p_comercio) AND EXISTS(SELECT 1 FROM public.comercio_parametrizacion WHERE comercio_id=p_comercio AND parametros->'modulos'->>'restaurante'='true');
$$;
CREATE FUNCTION public.restaurante_permiso(p_comercio uuid,p_permiso text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.restaurante_habilitado(p_comercio) AND (public.user_is_comercio_admin(p_comercio) OR EXISTS(
 SELECT 1 FROM public.restaurante_permisos WHERE comercio_id=p_comercio AND usuario_id=auth.uid() AND p_permiso=ANY(permisos)));
$$;
CREATE FUNCTION public.restaurante_acceso(p_comercio uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.restaurante_habilitado(p_comercio) AND (public.user_is_comercio_admin(p_comercio) OR EXISTS(
 SELECT 1 FROM public.restaurante_permisos WHERE comercio_id=p_comercio AND usuario_id=auth.uid() AND cardinality(permisos)>0));
$$;
CREATE FUNCTION public.restaurante_ver_pedido(p_comercio uuid,p_pedido uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.restaurante_acceso(p_comercio) AND (public.user_is_comercio_admin(p_comercio) OR EXISTS(
 SELECT 1 FROM public.restaurante_permisos WHERE comercio_id=p_comercio AND usuario_id=auth.uid()
 AND permisos && ARRAY['pedidos','salon','cocina','despacho','cobros','cierre','configuracion']) OR EXISTS(
 SELECT 1 FROM public.restaurante_envios WHERE comercio_id=p_comercio AND pedido_id=p_pedido AND repartidor_id=auth.uid()));
$$;
CREATE FUNCTION public.restaurante_relaciones() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.comercio_id IS DISTINCT FROM OLD.comercio_id THEN RAISE EXCEPTION 'Comercio inmutable'; END IF;
 IF TG_TABLE_NAME='restaurante_permisos' THEN
 IF NOT EXISTS(SELECT 1 FROM public.comercio_usuarios WHERE comercio_id=NEW.comercio_id AND user_id=NEW.usuario_id AND activo) THEN RAISE EXCEPTION 'Usuario sin acceso al comercio'; END IF; END IF;
 IF TG_TABLE_NAME='restaurante_carta' OR TG_TABLE_NAME='restaurante_items' THEN
 IF NOT EXISTS(SELECT 1 FROM public.productos WHERE id=NEW.producto_id AND comercio_id=NEW.comercio_id) THEN RAISE EXCEPTION 'Producto de otro comercio'; END IF; END IF;
 IF TG_TABLE_NAME='restaurante_pedidos' THEN
 IF NEW.cliente_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=NEW.cliente_id AND comercio_id=NEW.comercio_id) THEN RAISE EXCEPTION 'Cliente de otro comercio'; END IF;
 IF NEW.venta_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ventas WHERE id=NEW.venta_id AND comercio_id=NEW.comercio_id AND cliente_id IS NOT DISTINCT FROM NEW.cliente_id) THEN RAISE EXCEPTION 'Venta incompatible'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(NEW.creditos_cierre) x WHERE NOT EXISTS(SELECT 1 FROM public.cuenta_corriente cc WHERE cc.id=x AND cc.venta_id=NEW.venta_id AND cc.comercio_id=NEW.comercio_id AND cc.tipo_movimiento='credito')) THEN RAISE EXCEPTION 'Crédito incompatible'; END IF;
 END IF;
 IF TG_TABLE_NAME='restaurante_envios' THEN
 IF NOT EXISTS(SELECT 1 FROM public.comercio_usuarios WHERE comercio_id=NEW.comercio_id AND user_id=NEW.repartidor_id AND activo) THEN RAISE EXCEPTION 'Repartidor de otro comercio'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.restaurante_pedidos WHERE id=NEW.pedido_id AND modalidad='delivery') THEN RAISE EXCEPTION 'Pedido sin delivery'; END IF; END IF;
 IF TG_TABLE_NAME='restaurante_items' THEN
 IF NEW.comanda_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.restaurante_comandas WHERE id=NEW.comanda_id AND pedido_id=NEW.pedido_id AND sector_id=NEW.sector_id) THEN RAISE EXCEPTION 'Comanda incompatible'; END IF; END IF;
 IF TG_TABLE_NAME='restaurante_cobro_items' THEN
 IF NOT EXISTS(SELECT 1 FROM public.restaurante_cobros c JOIN public.restaurante_items i ON i.pedido_id=c.pedido_id WHERE c.id=NEW.cobro_id AND i.id=NEW.item_id) THEN RAISE EXCEPTION 'Cobro de otro pedido'; END IF; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['restaurante_config','restaurante_permisos','restaurante_sectores','restaurante_mesas','restaurante_carta','restaurante_adicionales','restaurante_pedidos','restaurante_cuenta_mesas','restaurante_comandas','restaurante_items','restaurante_envios','restaurante_rendiciones','restaurante_cobros','restaurante_cobro_items','restaurante_eventos','restaurante_intentos'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
 EXECUTE format('CREATE POLICY restaurante_lectura ON public.%I FOR SELECT TO authenticated USING(public.restaurante_acceso(comercio_id))',t);
 EXECUTE format('CREATE TRIGGER restaurante_relaciones BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.restaurante_relaciones()',t);
 END LOOP;
END $$;
-- Los eventos respetan también la visibilidad del pedido de cada repartidor.
DROP POLICY restaurante_lectura ON public.restaurante_eventos;
CREATE POLICY restaurante_lectura ON public.restaurante_eventos FOR SELECT TO authenticated
 USING(public.restaurante_acceso(comercio_id) AND (pedido_id IS NULL OR public.restaurante_ver_pedido(comercio_id,pedido_id)));
GRANT SELECT ON public.restaurante_eventos TO authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
 ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurante_eventos;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.restaurante_relaciones() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.restaurante_habilitado(uuid),public.restaurante_permiso(uuid,text),public.restaurante_acceso(uuid),public.restaurante_ver_pedido(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restaurante_habilitado(uuid),public.restaurante_permiso(uuid,text),public.restaurante_acceso(uuid),public.restaurante_ver_pedido(uuid,uuid) TO authenticated;
COMMIT;
