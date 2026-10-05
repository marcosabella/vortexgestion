BEGIN;

-- Las horas de mano de obra requieren cantidades decimales. Los valores
-- enteros históricos de presupuestos se conservan sin modificación.
ALTER TABLE public.presupuesto_items ALTER COLUMN cantidad TYPE numeric USING cantidad::numeric;

-- Módulo opcional. No habilita comercios ni modifica datos existentes.
CREATE FUNCTION public.taller_habilitado(p_comercio_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.user_belongs_to_comercio(p_comercio_id) AND EXISTS (
    SELECT 1 FROM public.comercio_parametrizacion
    WHERE comercio_id=p_comercio_id AND parametros->'modulos'->>'taller'='true'
  );
$$;
REVOKE ALL ON FUNCTION public.taller_habilitado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.taller_habilitado(uuid) TO authenticated;

CREATE TABLE public.taller_vehiculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  patente text NOT NULL CHECK (length(patente) BETWEEN 3 AND 15 AND patente=upper(regexp_replace(patente,'[^A-Za-z0-9]','','g'))),
  marca text NOT NULL CHECK (length(btrim(marca))>0),
  modelo text NOT NULL CHECK (length(btrim(modelo))>0),
  anio integer CHECK (anio BETWEEN 1900 AND 2200),
  vin text,
  kilometraje integer NOT NULL DEFAULT 0 CHECK (kilometraje>=0),
  observaciones text NOT NULL DEFAULT '',
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(comercio_id,patente)
);
CREATE INDEX taller_vehiculos_cliente_idx ON public.taller_vehiculos(comercio_id,cliente_id);

CREATE TABLE public.taller_tecnicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  nombre text NOT NULL CHECK (length(btrim(nombre))>0),
  telefono text NOT NULL DEFAULT '',
  especialidad text NOT NULL DEFAULT '',
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX taller_tecnicos_comercio_idx ON public.taller_tecnicos(comercio_id);

CREATE TABLE public.taller_ordenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  numero bigint GENERATED ALWAYS AS IDENTITY,
  vehiculo_id uuid NOT NULL REFERENCES public.taller_vehiculos(id),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  tecnico_id uuid REFERENCES public.taller_tecnicos(id),
  kilometraje integer NOT NULL CHECK (kilometraje>=0),
  motivo text NOT NULL CHECK (length(btrim(motivo))>0),
  recepcion text NOT NULL DEFAULT '',
  diagnostico text NOT NULL DEFAULT '',
  trabajo_realizado text NOT NULL DEFAULT '',
  observaciones text NOT NULL DEFAULT '',
  fecha_ingreso timestamptz NOT NULL DEFAULT now(),
  turno timestamptz,
  entrega_estimada date,
  proximo_service date,
  proximo_service_km integer CHECK (proximo_service_km>=0),
  estado text NOT NULL DEFAULT 'recibido' CHECK (estado IN ('recibido','diagnostico','presupuestado','aprobado','en_reparacion','listo','entregado','cancelado')),
  aprobacion_cliente text,
  motivo_cancelacion text,
  presupuesto_id uuid UNIQUE REFERENCES public.presupuestos(id) ON DELETE RESTRICT,
  venta_id uuid UNIQUE REFERENCES public.ventas(id) ON DELETE RESTRICT,
  entregado_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(comercio_id,numero),
  CHECK (proximo_service IS NULL OR proximo_service>=fecha_ingreso::date),
  CHECK (proximo_service_km IS NULL OR proximo_service_km>=kilometraje)
);
CREATE INDEX taller_ordenes_comercio_estado_idx ON public.taller_ordenes(comercio_id,estado,fecha_ingreso DESC);
CREATE INDEX taller_ordenes_vehiculo_idx ON public.taller_ordenes(comercio_id,vehiculo_id,fecha_ingreso DESC);
CREATE INDEX taller_ordenes_cliente_idx ON public.taller_ordenes(comercio_id,cliente_id);
CREATE INDEX taller_ordenes_tecnico_turno_idx ON public.taller_ordenes(comercio_id,tecnico_id,turno);

CREATE TABLE public.taller_orden_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  orden_id uuid NOT NULL REFERENCES public.taller_ordenes(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('repuesto','mano_obra','servicio_externo')),
  producto_id uuid REFERENCES public.productos(id),
  producto_variante_id uuid REFERENCES public.producto_variantes(id),
  proveedor_id uuid REFERENCES public.proveedores(id),
  descripcion text NOT NULL CHECK (length(btrim(descripcion))>0),
  cantidad numeric NOT NULL CHECK (cantidad>0 AND cantidad::text NOT IN ('NaN','Infinity','-Infinity') AND scale(cantidad)<=4 AND cantidad<=999999),
  precio_unitario numeric(12,2) NOT NULL CHECK (precio_unitario>=0 AND precio_unitario::text<>'NaN'),
  porcentaje_iva numeric(5,2) NOT NULL DEFAULT 0 CHECK (porcentaje_iva BETWEEN 0 AND 100 AND porcentaje_iva::text<>'NaN'),
  costo_unitario numeric(12,2) NOT NULL DEFAULT 0 CHECK (costo_unitario>=0 AND costo_unitario::text<>'NaN'),
  total numeric(12,2) GENERATED ALWAYS AS (round(cantidad*precio_unitario,2)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((tipo='repuesto' AND producto_id IS NOT NULL AND cantidad=trunc(cantidad)) OR (tipo<>'repuesto' AND producto_id IS NULL AND producto_variante_id IS NULL)),
  CHECK (tipo<>'servicio_externo' OR proveedor_id IS NOT NULL)
);
CREATE INDEX taller_items_orden_idx ON public.taller_orden_items(comercio_id,orden_id);
CREATE INDEX taller_items_proveedor_idx ON public.taller_orden_items(comercio_id,proveedor_id);

CREATE TABLE public.taller_orden_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  orden_id uuid NOT NULL REFERENCES public.taller_ordenes(id) ON DELETE RESTRICT,
  estado_anterior text,
  estado_nuevo text NOT NULL,
  detalle text NOT NULL DEFAULT '',
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX taller_eventos_orden_idx ON public.taller_orden_eventos(comercio_id,orden_id,created_at);

-- Las escrituras se realizan por RPC: permite bloquear la orden y aplicar
-- versiones optimistas incluso al modificar items en paralelo.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['taller_vehiculos','taller_tecnicos','taller_ordenes','taller_orden_items','taller_orden_eventos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
    EXECUTE format('CREATE POLICY taller_lectura ON public.%I FOR SELECT TO authenticated USING (public.taller_habilitado(comercio_id))',t);
  END LOOP;
END $$;

CREATE FUNCTION public.taller_validar_relaciones() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tenant uuid; producto uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.comercio_id IS DISTINCT FROM OLD.comercio_id THEN RAISE EXCEPTION 'taller_tenant_inmutable'; END IF;
  IF TG_TABLE_NAME IN ('taller_vehiculos','taller_ordenes') THEN
    SELECT comercio_id INTO tenant FROM public.clientes WHERE id=NEW.cliente_id;
    IF tenant IS DISTINCT FROM NEW.comercio_id THEN RAISE EXCEPTION 'taller_cliente_otro_comercio'; END IF;
  END IF;
  IF TG_TABLE_NAME='taller_ordenes' THEN
    SELECT comercio_id INTO tenant FROM public.taller_vehiculos WHERE id=NEW.vehiculo_id;
    IF tenant IS DISTINCT FROM NEW.comercio_id THEN RAISE EXCEPTION 'taller_vehiculo_otro_comercio'; END IF;
    IF NEW.tecnico_id IS NOT NULL THEN
      SELECT comercio_id INTO tenant FROM public.taller_tecnicos WHERE id=NEW.tecnico_id;
      IF tenant IS DISTINCT FROM NEW.comercio_id THEN RAISE EXCEPTION 'taller_tecnico_otro_comercio'; END IF;
    END IF;
    IF NEW.presupuesto_id IS NOT NULL THEN
      SELECT comercio_id INTO tenant FROM public.presupuestos WHERE id=NEW.presupuesto_id;
      IF tenant IS DISTINCT FROM NEW.comercio_id THEN RAISE EXCEPTION 'taller_presupuesto_otro_comercio'; END IF;
    END IF;
    IF NEW.venta_id IS NOT NULL THEN
      SELECT comercio_id INTO tenant FROM public.ventas WHERE id=NEW.venta_id;
      IF tenant IS DISTINCT FROM NEW.comercio_id THEN RAISE EXCEPTION 'taller_venta_otro_comercio'; END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME IN ('taller_orden_items','taller_orden_eventos') THEN
    SELECT comercio_id INTO tenant FROM public.taller_ordenes WHERE id=NEW.orden_id;
    IF tenant IS DISTINCT FROM NEW.comercio_id THEN RAISE EXCEPTION 'taller_orden_otro_comercio'; END IF;
  END IF;
  IF TG_TABLE_NAME='taller_orden_items' THEN
    IF NEW.producto_id IS NOT NULL THEN
      SELECT comercio_id INTO tenant FROM public.productos WHERE id=NEW.producto_id;
      IF tenant IS DISTINCT FROM NEW.comercio_id THEN RAISE EXCEPTION 'taller_producto_otro_comercio'; END IF;
      IF EXISTS(SELECT 1 FROM public.productos WHERE id=NEW.producto_id AND tipo_moneda::text<>'ARS') THEN RAISE EXCEPTION 'taller_producto_moneda_incompatible'; END IF;
      IF NEW.producto_variante_id IS NULL AND EXISTS(SELECT 1 FROM public.producto_variantes WHERE producto_id=NEW.producto_id) THEN RAISE EXCEPTION 'taller_variante_requerida'; END IF;
    END IF;
    IF NEW.producto_variante_id IS NOT NULL THEN
      SELECT p.comercio_id,v.producto_id INTO tenant,producto FROM public.producto_variantes v JOIN public.productos p ON p.id=v.producto_id WHERE v.id=NEW.producto_variante_id;
      IF tenant IS DISTINCT FROM NEW.comercio_id OR producto IS DISTINCT FROM NEW.producto_id THEN RAISE EXCEPTION 'taller_variante_incompatible'; END IF;
    END IF;
    IF NEW.proveedor_id IS NOT NULL THEN
      SELECT comercio_id INTO tenant FROM public.proveedores WHERE id=NEW.proveedor_id;
      IF tenant IS DISTINCT FROM NEW.comercio_id THEN RAISE EXCEPTION 'taller_proveedor_otro_comercio'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['taller_vehiculos','taller_ordenes','taller_orden_items','taller_orden_eventos'] LOOP
    EXECUTE format('CREATE TRIGGER taller_relaciones BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.taller_validar_relaciones()',t);
  END LOOP;
END $$;

CREATE FUNCTION public.taller_exigir_admin(p_comercio_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.taller_habilitado(p_comercio_id) IS DISTINCT FROM true OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'taller_sin_permisos_o_deshabilitado' USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.taller_exigir_admin(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.taller_guardar_catalogo(p_comercio_id uuid,p_tipo text,p_id uuid,p_datos jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE resultado uuid;
BEGIN
  PERFORM public.taller_exigir_admin(p_comercio_id);
  IF p_tipo='vehiculo' THEN
    IF p_id IS NULL THEN
      INSERT INTO public.taller_vehiculos(comercio_id,cliente_id,patente,marca,modelo,anio,vin,kilometraje,observaciones)
      VALUES(p_comercio_id,(p_datos->>'cliente_id')::uuid,upper(regexp_replace(p_datos->>'patente','[^A-Za-z0-9]','','g')),p_datos->>'marca',p_datos->>'modelo',nullif(p_datos->>'anio','')::integer,nullif(p_datos->>'vin',''),coalesce((p_datos->>'kilometraje')::integer,0),coalesce(p_datos->>'observaciones','')) RETURNING id INTO resultado;
    ELSE
      UPDATE public.taller_vehiculos SET cliente_id=(p_datos->>'cliente_id')::uuid,patente=upper(regexp_replace(p_datos->>'patente','[^A-Za-z0-9]','','g')),marca=p_datos->>'marca',modelo=p_datos->>'modelo',anio=nullif(p_datos->>'anio','')::integer,vin=nullif(p_datos->>'vin',''),kilometraje=coalesce((p_datos->>'kilometraje')::integer,0),observaciones=coalesce(p_datos->>'observaciones',''),activo=coalesce((p_datos->>'activo')::boolean,true),updated_at=now()
      WHERE id=p_id AND comercio_id=p_comercio_id RETURNING id INTO resultado;
    END IF;
  ELSIF p_tipo='tecnico' THEN
    IF p_id IS NULL THEN
      INSERT INTO public.taller_tecnicos(comercio_id,nombre,telefono,especialidad) VALUES(p_comercio_id,p_datos->>'nombre',coalesce(p_datos->>'telefono',''),coalesce(p_datos->>'especialidad','')) RETURNING id INTO resultado;
    ELSE
      UPDATE public.taller_tecnicos SET nombre=p_datos->>'nombre',telefono=coalesce(p_datos->>'telefono',''),especialidad=coalesce(p_datos->>'especialidad',''),activo=coalesce((p_datos->>'activo')::boolean,true),updated_at=now() WHERE id=p_id AND comercio_id=p_comercio_id RETURNING id INTO resultado;
    END IF;
  ELSE RAISE EXCEPTION 'taller_catalogo_invalido'; END IF;
  IF resultado IS NULL THEN RAISE EXCEPTION 'taller_registro_no_disponible'; END IF;
  RETURN resultado;
END $$;

CREATE FUNCTION public.taller_guardar_orden(p_comercio_id uuid,p_id uuid,p_version integer,p_datos jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.taller_ordenes%ROWTYPE; v public.taller_vehiculos%ROWTYPE; tecnico uuid; resultado uuid;
BEGIN
  PERFORM public.taller_exigir_admin(p_comercio_id);
  tecnico:=nullif(p_datos->>'tecnico_id','')::uuid;
  IF p_id IS NULL THEN
    IF tecnico IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.taller_tecnicos WHERE id=tecnico AND comercio_id=p_comercio_id AND activo) THEN RAISE EXCEPTION 'taller_tecnico_no_disponible'; END IF;
    SELECT * INTO v FROM public.taller_vehiculos WHERE id=(p_datos->>'vehiculo_id')::uuid AND comercio_id=p_comercio_id AND activo FOR UPDATE;
    IF v.id IS NULL THEN RAISE EXCEPTION 'taller_vehiculo_no_disponible'; END IF;
    IF (p_datos->>'kilometraje')::integer<v.kilometraje THEN RAISE EXCEPTION 'taller_kilometraje_inferior'; END IF;
    INSERT INTO public.taller_ordenes(comercio_id,vehiculo_id,cliente_id,tecnico_id,kilometraje,motivo,recepcion,turno,entrega_estimada,observaciones)
    VALUES(p_comercio_id,v.id,v.cliente_id,tecnico,(p_datos->>'kilometraje')::integer,p_datos->>'motivo',coalesce(p_datos->>'recepcion',''),nullif(p_datos->>'turno','')::timestamptz,nullif(p_datos->>'entrega_estimada','')::date,coalesce(p_datos->>'observaciones','')) RETURNING id INTO resultado;
    UPDATE public.taller_vehiculos SET kilometraje=(p_datos->>'kilometraje')::integer,updated_at=now() WHERE id=v.id;
    INSERT INTO public.taller_orden_eventos(comercio_id,orden_id,estado_nuevo,detalle,user_id) VALUES(p_comercio_id,resultado,'recibido','Ingreso del vehículo',auth.uid());
  ELSE
    SELECT * INTO o FROM public.taller_ordenes WHERE id=p_id AND comercio_id=p_comercio_id FOR UPDATE;
    IF o.id IS NULL THEN RAISE EXCEPTION 'taller_registro_no_disponible'; END IF;
    IF o.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'taller_version_desactualizada' USING ERRCODE='40001'; END IF;
    IF o.estado IN ('cancelado','entregado') THEN RAISE EXCEPTION 'taller_orden_cerrada'; END IF;
    IF tecnico IS DISTINCT FROM o.tecnico_id AND tecnico IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.taller_tecnicos WHERE id=tecnico AND comercio_id=p_comercio_id AND activo) THEN RAISE EXCEPTION 'taller_tecnico_no_disponible'; END IF;
    UPDATE public.taller_ordenes SET tecnico_id=tecnico,
      motivo=CASE WHEN estado IN ('recibido','diagnostico') THEN coalesce(p_datos->>'motivo',motivo) ELSE motivo END,
      recepcion=coalesce(p_datos->>'recepcion',recepcion),diagnostico=coalesce(p_datos->>'diagnostico',diagnostico),trabajo_realizado=coalesce(p_datos->>'trabajo_realizado',trabajo_realizado),observaciones=coalesce(p_datos->>'observaciones',observaciones),
      turno=nullif(p_datos->>'turno','')::timestamptz,entrega_estimada=nullif(p_datos->>'entrega_estimada','')::date,proximo_service=nullif(p_datos->>'proximo_service','')::date,proximo_service_km=nullif(p_datos->>'proximo_service_km','')::integer,version=version+1,updated_at=now()
    WHERE id=o.id RETURNING id INTO resultado;
  END IF;
  RETURN resultado;
END $$;

CREATE FUNCTION public.taller_guardar_item(p_orden_id uuid,p_version integer,p_id uuid,p_datos jsonb,p_eliminar boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.taller_ordenes%ROWTYPE; resultado uuid;
BEGIN
  SELECT * INTO o FROM public.taller_ordenes WHERE id=p_orden_id FOR UPDATE;
  PERFORM public.taller_exigir_admin(o.comercio_id);
  IF o.id IS NULL OR o.estado NOT IN ('recibido','diagnostico') OR o.presupuesto_id IS NOT NULL THEN RAISE EXCEPTION 'taller_detalle_congelado'; END IF;
  IF o.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'taller_version_desactualizada' USING ERRCODE='40001'; END IF;
  IF p_eliminar THEN
    DELETE FROM public.taller_orden_items WHERE id=p_id AND orden_id=o.id AND comercio_id=o.comercio_id RETURNING id INTO resultado;
  ELSE
    IF p_id IS NOT NULL THEN
      DELETE FROM public.taller_orden_items WHERE id=p_id AND orden_id=o.id AND comercio_id=o.comercio_id RETURNING id INTO resultado;
      IF resultado IS NULL THEN RAISE EXCEPTION 'taller_item_no_disponible'; END IF;
    END IF;
    INSERT INTO public.taller_orden_items(id,comercio_id,orden_id,tipo,producto_id,producto_variante_id,proveedor_id,descripcion,cantidad,precio_unitario,porcentaje_iva,costo_unitario)
    VALUES(coalesce(p_id,gen_random_uuid()),o.comercio_id,o.id,p_datos->>'tipo',nullif(p_datos->>'producto_id','')::uuid,nullif(p_datos->>'producto_variante_id','')::uuid,nullif(p_datos->>'proveedor_id','')::uuid,p_datos->>'descripcion',(p_datos->>'cantidad')::numeric,(p_datos->>'precio_unitario')::numeric,coalesce((p_datos->>'porcentaje_iva')::numeric,0),coalesce((p_datos->>'costo_unitario')::numeric,0)) RETURNING id INTO resultado;
  END IF;
  IF resultado IS NULL THEN RAISE EXCEPTION 'taller_item_no_disponible'; END IF;
  UPDATE public.taller_ordenes SET version=version+1,updated_at=now() WHERE id=o.id;
  RETURN resultado;
END $$;

CREATE FUNCTION public.taller_cambiar_estado(p_orden_id uuid,p_version integer,p_estado text,p_detalle text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.taller_ordenes%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.taller_ordenes WHERE id=p_orden_id FOR UPDATE;
  PERFORM public.taller_exigir_admin(o.comercio_id);
  IF o.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'taller_version_desactualizada' USING ERRCODE='40001'; END IF;
  IF NOT ((o.estado='recibido' AND p_estado='diagnostico') OR (o.estado='presupuestado' AND p_estado='aprobado') OR (o.estado='aprobado' AND p_estado='en_reparacion') OR (o.estado='en_reparacion' AND p_estado='listo') OR (o.estado='listo' AND p_estado='entregado' AND o.venta_id IS NOT NULL) OR (o.estado IN ('recibido','diagnostico','presupuestado','aprobado','en_reparacion','listo') AND p_estado='cancelado' AND o.venta_id IS NULL)) THEN RAISE EXCEPTION 'taller_transicion_invalida'; END IF;
  IF p_estado IN ('aprobado','cancelado') AND length(btrim(coalesce(p_detalle,'')))=0 THEN RAISE EXCEPTION 'taller_motivo_requerido'; END IF;
  IF p_estado='listo' AND length(btrim(o.trabajo_realizado))=0 THEN RAISE EXCEPTION 'taller_trabajo_realizado_requerido'; END IF;
  UPDATE public.taller_ordenes SET estado=p_estado,aprobacion_cliente=CASE WHEN p_estado='aprobado' THEN p_detalle ELSE aprobacion_cliente END,motivo_cancelacion=CASE WHEN p_estado='cancelado' THEN p_detalle ELSE motivo_cancelacion END,entregado_at=CASE WHEN p_estado='entregado' THEN now() ELSE entregado_at END,version=version+1,updated_at=now() WHERE id=o.id;
  INSERT INTO public.taller_orden_eventos(comercio_id,orden_id,estado_anterior,estado_nuevo,detalle,user_id) VALUES(o.comercio_id,o.id,o.estado,p_estado,p_detalle,auth.uid());
END $$;

CREATE FUNCTION public.taller_generar_presupuesto(p_orden_id uuid,p_version integer) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.taller_ordenes%ROWTYPE; resultado uuid; neto numeric; importe numeric; v_nombre text;
BEGIN
  SELECT * INTO o FROM public.taller_ordenes WHERE id=p_orden_id FOR UPDATE;
  PERFORM public.taller_exigir_admin(o.comercio_id);
  IF o.presupuesto_id IS NOT NULL AND o.estado<>'cancelado' THEN RETURN o.presupuesto_id; END IF;
  IF o.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'taller_version_desactualizada' USING ERRCODE='40001'; END IF;
  IF o.estado NOT IN ('recibido','diagnostico') THEN RAISE EXCEPTION 'taller_transicion_invalida'; END IF;
  SELECT sum(total),sum(round(total/(1+porcentaje_iva/100),2)) INTO importe,neto FROM public.taller_orden_items WHERE orden_id=o.id;
  IF importe IS NULL OR importe<=0 THEN RAISE EXCEPTION 'taller_detalle_vacio'; END IF;
  SELECT concat_ws(' ',c.nombre,c.apellido) INTO v_nombre FROM public.clientes c WHERE id=o.cliente_id;
  INSERT INTO public.presupuestos(comercio_id,numero_comprobante,tipo_pago,tipo_comprobante,cliente_id,cliente_nombre,subtotal,total_iva,total,observaciones)
  VALUES(o.comercio_id,'TALLER-'||lpad(o.numero::text,8,'0'),'cta_cte','recibo_x',o.cliente_id,v_nombre,neto,importe-neto,importe,'Orden de taller #'||o.numero||E'\n'||o.motivo) RETURNING id INTO resultado;
  INSERT INTO public.presupuesto_items(comercio_id,presupuesto_id,producto_id,producto_variante_id,descripcion_manual,cantidad,precio_unitario,porcentaje_iva,subtotal,monto_iva,total)
  SELECT o.comercio_id,resultado,producto_id,producto_variante_id,CASE WHEN producto_id IS NULL THEN descripcion ELSE NULL END,cantidad,precio_unitario,porcentaje_iva,round(total/(1+porcentaje_iva/100),2),total-round(total/(1+porcentaje_iva/100),2),total FROM public.taller_orden_items WHERE orden_id=o.id;
  INSERT INTO public.presupuesto_pagos(comercio_id,presupuesto_id,tipo_pago,monto) VALUES(o.comercio_id,resultado,'cta_cte',importe);
  UPDATE public.taller_ordenes SET presupuesto_id=resultado,estado='presupuestado',version=version+1,updated_at=now() WHERE id=o.id;
  INSERT INTO public.taller_orden_eventos(comercio_id,orden_id,estado_anterior,estado_nuevo,detalle,user_id) VALUES(o.comercio_id,o.id,o.estado,'presupuestado','Presupuesto integrado generado',auth.uid());
  RETURN resultado;
END $$;

-- Los presupuestos Taller se protegen también si se intenta editarlos o
-- confirmarlos desde el módulo general de presupuestos.
CREATE FUNCTION public.taller_proteger_presupuesto() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.taller_ordenes%ROWTYPE; presupuesto uuid;
BEGIN
  IF TG_TABLE_NAME='presupuestos' THEN
    presupuesto:=OLD.id;
  ELSE
    presupuesto:=CASE WHEN TG_OP='INSERT' THEN NEW.presupuesto_id ELSE OLD.presupuesto_id END;
  END IF;
  SELECT * INTO o FROM public.taller_ordenes WHERE presupuesto_id=presupuesto FOR UPDATE;
  IF o.id IS NULL AND TG_TABLE_NAME<>'presupuestos' AND TG_OP='UPDATE' THEN
    SELECT * INTO o FROM public.taller_ordenes WHERE presupuesto_id=NEW.presupuesto_id FOR UPDATE;
  END IF;
  IF o.id IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  PERFORM public.taller_exigir_admin(o.comercio_id);
  IF TG_TABLE_NAME='presupuestos' AND TG_OP='UPDATE' THEN
    IF NEW.tipo_comprobante::text NOT IN ('recibo_x','factura_a','factura_b','factura_c') THEN RAISE EXCEPTION 'taller_comprobante_invalido'; END IF;
    IF (to_jsonb(NEW)-ARRAY['estado','venta_id','confirmado_at','updated_at','tipo_pago','tipo_comprobante']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['estado','venta_id','confirmado_at','updated_at','tipo_pago','tipo_comprobante']) THEN RAISE EXCEPTION 'taller_presupuesto_protegido'; END IF;
    IF NEW.estado='confirmado' AND OLD.estado='pendiente' THEN
      IF o.estado<>'listo' OR NEW.venta_id IS NULL OR o.venta_id IS NOT NULL THEN RAISE EXCEPTION 'taller_orden_no_lista'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.ventas WHERE id=NEW.venta_id AND comercio_id=o.comercio_id AND cliente_id=o.cliente_id AND total=OLD.total) THEN RAISE EXCEPTION 'taller_venta_incompatible'; END IF;
      UPDATE public.taller_ordenes SET venta_id=NEW.venta_id,version=version+1,updated_at=now() WHERE id=o.id;
      INSERT INTO public.taller_orden_eventos(comercio_id,orden_id,estado_anterior,estado_nuevo,detalle,user_id) VALUES(o.comercio_id,o.id,o.estado,o.estado,'Venta vinculada: '||NEW.venta_id,auth.uid());
    ELSIF NEW.estado IS DISTINCT FROM OLD.estado OR NEW.venta_id IS DISTINCT FROM OLD.venta_id THEN RAISE EXCEPTION 'taller_presupuesto_protegido'; END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME='presupuesto_pagos' AND o.estado='listo' AND o.venta_id IS NULL THEN
    IF TG_OP='UPDATE' AND (NEW.presupuesto_id IS DISTINCT FROM OLD.presupuesto_id OR NEW.comercio_id IS DISTINCT FROM OLD.comercio_id) THEN RAISE EXCEPTION 'taller_presupuesto_protegido'; END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'taller_presupuesto_protegido';
END $$;
CREATE TRIGGER taller_presupuesto_protegido BEFORE UPDATE OR DELETE ON public.presupuestos FOR EACH ROW EXECUTE FUNCTION public.taller_proteger_presupuesto();
CREATE TRIGGER taller_presupuesto_items_protegidos BEFORE INSERT OR UPDATE OR DELETE ON public.presupuesto_items FOR EACH ROW EXECUTE FUNCTION public.taller_proteger_presupuesto();
CREATE TRIGGER taller_presupuesto_pagos_protegidos BEFORE INSERT OR UPDATE OR DELETE ON public.presupuesto_pagos FOR EACH ROW EXECUTE FUNCTION public.taller_proteger_presupuesto();

CREATE FUNCTION public.taller_facturar_orden(p_orden_id uuid,p_tipo public.tipo_comprobante,p_pagos jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.taller_ordenes%ROWTYPE; p public.presupuestos%ROWTYPE; pago jsonb; resultado uuid; suma numeric;
BEGIN
  SELECT * INTO o FROM public.taller_ordenes WHERE id=p_orden_id FOR UPDATE;
  PERFORM public.taller_exigir_admin(o.comercio_id);
  IF o.venta_id IS NOT NULL THEN RETURN o.venta_id; END IF;
  IF o.estado<>'listo' OR o.presupuesto_id IS NULL THEN RAISE EXCEPTION 'taller_orden_no_lista'; END IF;
  IF p_tipo::text NOT IN ('recibo_x','factura_a','factura_b','factura_c') THEN RAISE EXCEPTION 'taller_comprobante_invalido'; END IF;
  SELECT * INTO p FROM public.presupuestos WHERE id=o.presupuesto_id FOR UPDATE;
  IF p.estado<>'pendiente' THEN RAISE EXCEPTION 'taller_presupuesto_protegido'; END IF;
  IF jsonb_typeof(p_pagos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_pagos)=0 THEN RAISE EXCEPTION 'taller_pagos_invalidos'; END IF;
  SELECT sum((value->>'monto')::numeric-coalesce((value->>'recargo_cuotas')::numeric,0)) INTO suma FROM jsonb_array_elements(p_pagos);
  IF suma IS DISTINCT FROM p.total THEN RAISE EXCEPTION 'taller_pagos_no_coinciden'; END IF;
  DELETE FROM public.presupuesto_pagos WHERE presupuesto_id=p.id;
  FOR pago IN SELECT value FROM jsonb_array_elements(p_pagos) LOOP
    IF (pago->>'monto')::numeric<=0 OR (pago->>'monto')::numeric::text IN ('NaN','Infinity','-Infinity') OR (pago->>'tipo_pago') NOT IN ('contado','transferencia','tarjeta','cheque','cta_cte') OR coalesce((pago->>'recargo_cuotas')::numeric,0)<0 OR coalesce((pago->>'recargo_cuotas')::numeric,0)>=(pago->>'monto')::numeric THEN RAISE EXCEPTION 'taller_pagos_invalidos'; END IF;
    IF pago->>'tipo_pago'='tarjeta' AND nullif(pago->>'tarjeta_id','') IS NULL THEN RAISE EXCEPTION 'taller_tarjeta_requerida'; END IF;
    IF pago->>'tipo_pago'='cheque' AND nullif(pago->>'cheque_id','') IS NULL THEN RAISE EXCEPTION 'taller_cheque_requerido'; END IF;
    IF coalesce((pago->>'cuotas')::integer,1)<1 OR coalesce((pago->>'cuotas')::integer,1)>120 THEN RAISE EXCEPTION 'taller_cuotas_invalidas'; END IF;
    IF pago->>'tipo_pago'<>'tarjeta' AND coalesce((pago->>'recargo_cuotas')::numeric,0)<>0 THEN RAISE EXCEPTION 'taller_recargo_invalido'; END IF;
    INSERT INTO public.presupuesto_pagos(comercio_id,presupuesto_id,tipo_pago,monto,banco_id,tarjeta_id,cuotas,cheque_id,recargo_cuotas)
    VALUES(o.comercio_id,p.id,(pago->>'tipo_pago')::public.tipo_pago,(pago->>'monto')::numeric,nullif(pago->>'banco_id','')::uuid,nullif(pago->>'tarjeta_id','')::uuid,coalesce((pago->>'cuotas')::integer,1),nullif(pago->>'cheque_id','')::uuid,coalesce((pago->>'recargo_cuotas')::numeric,0));
  END LOOP;
  UPDATE public.presupuestos SET tipo_comprobante=p_tipo,tipo_pago=(p_pagos->0->>'tipo_pago')::public.tipo_pago WHERE id=p.id;
  resultado:=public.confirmar_presupuesto(p.id);
  RETURN resultado;
END $$;

CREATE FUNCTION public.taller_proteger_venta() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE venta uuid;
BEGIN
  IF TG_TABLE_NAME='ventas' THEN venta:=OLD.id;
  ELSE venta:=CASE WHEN TG_OP='INSERT' THEN NEW.venta_id ELSE OLD.venta_id END; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.taller_ordenes WHERE venta_id=venta) THEN
    IF TG_OP<>'UPDATE' OR TG_TABLE_NAME='ventas' THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.taller_ordenes WHERE venta_id=NEW.venta_id) THEN RETURN NEW; END IF;
  END IF;
  -- El CAE y su numeración pueden actualizarse desde el circuito fiscal.
  IF TG_TABLE_NAME='ventas' AND TG_OP='UPDATE' THEN
    IF NEW.comercio_id=OLD.comercio_id AND NEW.cliente_id IS NOT DISTINCT FROM OLD.cliente_id AND NEW.total=OLD.total AND NEW.subtotal=OLD.subtotal AND NEW.total_iva=OLD.total_iva THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'taller_venta_protegida: la venta conserva el detalle aprobado de la orden de taller';
END $$;
CREATE TRIGGER taller_venta_protegida BEFORE UPDATE OR DELETE ON public.ventas FOR EACH ROW EXECUTE FUNCTION public.taller_proteger_venta();
CREATE TRIGGER taller_venta_items_protegidos BEFORE INSERT OR UPDATE OR DELETE ON public.venta_items FOR EACH ROW EXECUTE FUNCTION public.taller_proteger_venta();

DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT oid::regprocedure AS firma,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'taller_%' AND proname<>'taller_habilitado' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.firma);
    IF f.proname IN ('taller_guardar_catalogo','taller_guardar_orden','taller_guardar_item','taller_cambiar_estado','taller_generar_presupuesto','taller_facturar_orden') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.firma); END IF;
  END LOOP;
END $$;

COMMIT;
