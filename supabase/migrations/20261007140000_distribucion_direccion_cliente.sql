BEGIN;
-- Los pedidos nuevos identifican si la entrega usa el domicilio del cliente.
-- Los pedidos anteriores conservan su snapshot; no se reparan datos históricos.
ALTER TABLE public.distribucion_pedidos ADD COLUMN direccion_cliente boolean NOT NULL DEFAULT false;
CREATE FUNCTION public.distribucion_direccion_fuente() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE direccion text;
BEGIN
 SELECT concat_ws(' ',nullif(btrim(calle),''),nullif(btrim(numero),''),nullif(btrim(localidad),'')) INTO direccion
 FROM public.clientes WHERE id=NEW.cliente_id AND comercio_id=NEW.comercio_id;
 NEW.direccion_cliente:=coalesce(length(direccion)>0 AND lower(regexp_replace(btrim(NEW.direccion),'\s+',' ','g'))=lower(regexp_replace(btrim(direccion),'\s+',' ','g')),false);
 RETURN NEW;
END $$;
CREATE TRIGGER distribucion_direccion_fuente BEFORE INSERT OR UPDATE OF direccion,cliente_id ON public.distribucion_pedidos
 FOR EACH ROW EXECUTE FUNCTION public.distribucion_direccion_fuente();

CREATE FUNCTION public.distribucion_actualizar_direccion_cliente() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE nueva_direccion text; p public.distribucion_pedidos;
BEGIN
 IF ROW(OLD.calle,OLD.numero,OLD.localidad) IS NOT DISTINCT FROM ROW(NEW.calle,NEW.numero,NEW.localidad) THEN RETURN NEW; END IF;
 nueva_direccion:=concat_ws(' ',nullif(btrim(NEW.calle),''),nullif(btrim(NEW.numero),''),nullif(btrim(NEW.localidad),''));
 IF nueva_direccion='' THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('distribucion:'||NEW.comercio_id::text,0));
 FOR p IN SELECT pedido.* FROM public.distribucion_pedidos pedido
 WHERE pedido.cliente_id=NEW.id AND pedido.comercio_id=NEW.comercio_id AND pedido.direccion_cliente AND pedido.estado<>'cancelado'
 AND NOT EXISTS(SELECT 1 FROM public.distribucion_paradas pp JOIN public.distribucion_repartos r ON r.id=pp.reparto_id WHERE pp.pedido_id=pedido.id AND r.estado<>'planificado')
 AND NOT EXISTS(SELECT 1 FROM public.distribucion_paradas pp JOIN public.distribucion_remitos m ON m.parada_id=pp.id WHERE pp.pedido_id=pedido.id)
 AND NOT EXISTS(SELECT 1 FROM public.distribucion_paradas pp JOIN public.distribucion_cargas c ON c.parada_id=pp.id WHERE pp.pedido_id=pedido.id AND c.entregada>0)
 ORDER BY pedido.id FOR UPDATE LOOP
 IF p.direccion=nueva_direccion THEN CONTINUE; END IF;
 UPDATE public.distribucion_pedidos SET direccion=nueva_direccion WHERE id=p.id AND comercio_id=NEW.comercio_id;
 UPDATE public.distribucion_paradas SET latitud=NULL,longitud=NULL,direccion_mapa='' WHERE pedido_id=p.id AND comercio_id=NEW.comercio_id;
 INSERT INTO public.distribucion_eventos(comercio_id,tipo,datos,usuario_id)
 VALUES(NEW.comercio_id,'actualizar_direccion_cliente',jsonb_build_object('pedido_id',p.id,'anterior',p.direccion,'direccion',nueva_direccion),coalesce(auth.uid(),p.creado_por));
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER distribucion_cliente_direccion AFTER UPDATE OF calle,numero,localidad ON public.clientes
 FOR EACH ROW EXECUTE FUNCTION public.distribucion_actualizar_direccion_cliente();
REVOKE ALL ON FUNCTION public.distribucion_direccion_fuente(),public.distribucion_actualizar_direccion_cliente() FROM PUBLIC,anon,authenticated;
COMMIT;
