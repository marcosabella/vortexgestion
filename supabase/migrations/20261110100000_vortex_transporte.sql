-- Infraestructura del módulo. No habilita comercios ni modifica datos productivos.
BEGIN;
CREATE FUNCTION public.transporte_habilitado(c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT auth.uid() IS NOT NULL AND public.user_belongs_to_comercio(c) AND EXISTS(SELECT 1 FROM public.comercio_parametrizacion WHERE comercio_id=c AND parametros->'modulos'->>'transporte'='true')
$$;
CREATE FUNCTION public.transporte_admin(c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.transporte_habilitado(c) AND public.user_is_comercio_admin(c)
$$;
CREATE TABLE public.transporte_unidades (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 nombre text NOT NULL CHECK(length(trim(nombre))>0), patente text NOT NULL CHECK(length(trim(patente))>0),
 tipo text NOT NULL CHECK(tipo IN ('camion','grua','acoplado','trailer','equipo')), marca text NOT NULL DEFAULT '', modelo text NOT NULL DEFAULT '',
 kilometraje numeric(12,1) NOT NULL DEFAULT 0 CHECK(kilometraje>=0), horas numeric(12,1) NOT NULL DEFAULT 0 CHECK(horas>=0),
 estado text NOT NULL DEFAULT 'disponible' CHECK(estado IN ('disponible','mantenimiento','fuera_servicio')), activo boolean NOT NULL DEFAULT true,
 observaciones text NOT NULL DEFAULT '', UNIQUE(comercio_id,id), UNIQUE(comercio_id,patente)
);
CREATE TABLE public.transporte_choferes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id), nombre text NOT NULL CHECK(length(trim(nombre))>0),
 telefono text NOT NULL DEFAULT '', user_id uuid, activo boolean NOT NULL DEFAULT true, UNIQUE(comercio_id,id), UNIQUE(comercio_id,user_id)
);
CREATE TABLE public.transporte_tarifas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id), nombre text NOT NULL CHECK(length(trim(nombre))>0),
 cliente_id uuid REFERENCES public.clientes(id), tipo text NOT NULL CHECK(tipo IN ('auxilio','maquinaria')),
 base numeric(12,2) NOT NULL DEFAULT 0 CHECK(base>=0), km_incluidos numeric(12,1) NOT NULL DEFAULT 0 CHECK(km_incluidos>=0),
 precio_km numeric(12,2) NOT NULL DEFAULT 0 CHECK(precio_km>=0), precio_hora numeric(12,2) NOT NULL DEFAULT 0 CHECK(precio_hora>=0),
 iva numeric(5,2) NOT NULL DEFAULT 21 CHECK(iva IN (0,10.5,21,27)), vigente_desde date NOT NULL DEFAULT current_date,
 vigente_hasta date, activo boolean NOT NULL DEFAULT true, CHECK(vigente_hasta IS NULL OR vigente_hasta>=vigente_desde), UNIQUE(comercio_id,id)
);
CREATE TABLE public.transporte_servicios (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id), numero bigint GENERATED ALWAYS AS IDENTITY,
 tipo text NOT NULL CHECK(tipo IN ('auxilio','maquinaria')), cliente_id uuid NOT NULL REFERENCES public.clientes(id),
 unidad_id uuid, equipo_id uuid, chofer_id uuid, tarifa_id uuid,
 estado text NOT NULL DEFAULT 'solicitado' CHECK(estado IN ('solicitado','asignado','en_camino','en_lugar','trasladando','finalizado','cancelado','no_realizado')),
 presentacion text NOT NULL DEFAULT 'pendiente_documentacion' CHECK(presentacion IN ('pendiente_documentacion','pendiente_autorizacion','listo','observado','rechazado')),
 programado_at timestamptz, origen text NOT NULL CHECK(length(trim(origen))>0), destino text NOT NULL CHECK(length(trim(destino))>0),
 solicitante text NOT NULL DEFAULT '', expediente text NOT NULL DEFAULT '', contacto text NOT NULL DEFAULT '', telefono text NOT NULL DEFAULT '',
 carga text NOT NULL CHECK(length(trim(carga))>0), detalles jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(detalles)='object'),
 km_salida numeric(12,1) CHECK(km_salida>=0), km_llegada numeric(12,1),
 km_aproximacion numeric(12,1) NOT NULL DEFAULT 0 CHECK(km_aproximacion>=0), km_traslado numeric(12,1) NOT NULL DEFAULT 0 CHECK(km_traslado>=0), km_retorno numeric(12,1) NOT NULL DEFAULT 0 CHECK(km_retorno>=0),
 km_facturables numeric(12,1) NOT NULL DEFAULT 0 CHECK(km_facturables>=0), horas_espera numeric(12,2) NOT NULL DEFAULT 0 CHECK(horas_espera>=0), adicionales numeric(12,2) NOT NULL DEFAULT 0 CHECK(adicionales>=0),
 precio_manual numeric(12,2) CHECK(precio_manual>=0), tarifa_snapshot jsonb, total numeric(12,2) NOT NULL DEFAULT 0 CHECK(total>=0), iva numeric(5,2) NOT NULL DEFAULT 21 CHECK(iva IN (0,10.5,21,27)),
 observaciones text NOT NULL DEFAULT '', motivo_cierre text NOT NULL DEFAULT '', presupuesto_id uuid REFERENCES public.presupuestos(id) ON DELETE RESTRICT,
 venta_id uuid REFERENCES public.ventas(id) ON DELETE RESTRICT, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(km_llegada IS NULL OR (km_salida IS NOT NULL AND km_llegada>=km_salida)), CHECK(unidad_id IS DISTINCT FROM equipo_id OR equipo_id IS NULL),
 UNIQUE(comercio_id,id),
 FOREIGN KEY(comercio_id,unidad_id) REFERENCES public.transporte_unidades(comercio_id,id),
 FOREIGN KEY(comercio_id,equipo_id) REFERENCES public.transporte_unidades(comercio_id,id),
 FOREIGN KEY(comercio_id,chofer_id) REFERENCES public.transporte_choferes(comercio_id,id),
 FOREIGN KEY(comercio_id,tarifa_id) REFERENCES public.transporte_tarifas(comercio_id,id)
);
CREATE TABLE public.transporte_lecturas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id), unidad_id uuid NOT NULL, servicio_id uuid,
 kilometraje numeric(12,1) NOT NULL CHECK(kilometraje>=0), horas numeric(12,1) NOT NULL CHECK(horas>=0), motivo text NOT NULL CHECK(length(trim(motivo))>0),
 user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(comercio_id,unidad_id) REFERENCES public.transporte_unidades(comercio_id,id), FOREIGN KEY(comercio_id,servicio_id) REFERENCES public.transporte_servicios(comercio_id,id)
);
CREATE TABLE public.transporte_planes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id), unidad_id uuid NOT NULL,
 nombre text NOT NULL CHECK(length(trim(nombre))>0), intervalo_km numeric(12,1) CHECK(intervalo_km>0), intervalo_dias integer CHECK(intervalo_dias>0), intervalo_horas numeric(12,1) CHECK(intervalo_horas>0),
 proximo_km numeric(12,1) CHECK(proximo_km>=0), proxima_fecha date, proximas_horas numeric(12,1) CHECK(proximas_horas>=0),
 aviso_km numeric(12,1) NOT NULL DEFAULT 1000 CHECK(aviso_km>=0), aviso_dias integer NOT NULL DEFAULT 15 CHECK(aviso_dias>=0), aviso_horas numeric(12,1) NOT NULL DEFAULT 10 CHECK(aviso_horas>=0), activo boolean NOT NULL DEFAULT true,
 CHECK((intervalo_km IS NOT NULL AND proximo_km IS NOT NULL) OR (intervalo_dias IS NOT NULL AND proxima_fecha IS NOT NULL) OR (intervalo_horas IS NOT NULL AND proximas_horas IS NOT NULL)),
 UNIQUE(comercio_id,id), FOREIGN KEY(comercio_id,unidad_id) REFERENCES public.transporte_unidades(comercio_id,id)
);
CREATE TABLE public.transporte_gastos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id), unidad_id uuid NOT NULL, servicio_id uuid,
 gasto_id uuid NOT NULL UNIQUE REFERENCES public.gastos_egresos(id) ON DELETE RESTRICT, litros numeric(12,2) CHECK(litros>0), kilometraje numeric(12,1) CHECK(kilometraje>=0),
 UNIQUE(comercio_id,id), FOREIGN KEY(comercio_id,unidad_id) REFERENCES public.transporte_unidades(comercio_id,id), FOREIGN KEY(comercio_id,servicio_id) REFERENCES public.transporte_servicios(comercio_id,id)
);
CREATE TABLE public.transporte_mantenimientos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id), unidad_id uuid NOT NULL, plan_id uuid,
 fecha date NOT NULL DEFAULT current_date, programado_para date, estado text NOT NULL DEFAULT 'programado' CHECK(estado IN ('programado','realizado')),
 tareas text NOT NULL CHECK(length(trim(tareas))>0), kilometraje numeric(12,1) NOT NULL CHECK(kilometraje>=0), horas numeric(12,1) NOT NULL DEFAULT 0 CHECK(horas>=0),
 proveedor_id uuid REFERENCES public.proveedores(id), presupuesto numeric(12,2) NOT NULL DEFAULT 0 CHECK(presupuesto>=0), gasto_id uuid REFERENCES public.gastos_egresos(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(comercio_id,unidad_id) REFERENCES public.transporte_unidades(comercio_id,id), FOREIGN KEY(comercio_id,plan_id) REFERENCES public.transporte_planes(comercio_id,id)
);
CREATE TABLE public.transporte_eventos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id), servicio_id uuid NOT NULL, estado text NOT NULL, detalle text NOT NULL DEFAULT '', user_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(comercio_id,servicio_id) REFERENCES public.transporte_servicios(comercio_id,id)
);
CREATE TABLE public.transporte_adjuntos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id), servicio_id uuid NOT NULL, ruta text NOT NULL UNIQUE, nombre text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(comercio_id,servicio_id) REFERENCES public.transporte_servicios(comercio_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['unidades','choferes','tarifas','servicios','lecturas','planes','gastos','mantenimientos','eventos','adjuntos'] LOOP
  EXECUTE format('ALTER TABLE public.transporte_%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.transporte_%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON public.transporte_%I TO authenticated',t);
  EXECUTE format('CREATE POLICY transporte_admin_lectura ON public.transporte_%I FOR SELECT TO authenticated USING(public.transporte_admin(comercio_id))',t);
  EXECUTE format('CREATE INDEX ON public.transporte_%I(comercio_id)',t);
 END LOOP;
END $$;
CREATE INDEX ON public.transporte_servicios(comercio_id,chofer_id,estado);
CREATE INDEX ON public.transporte_servicios(comercio_id,cliente_id,programado_at);
CREATE INDEX ON public.transporte_servicios(comercio_id,unidad_id);
CREATE INDEX ON public.transporte_planes(comercio_id,unidad_id);
CREATE INDEX ON public.transporte_eventos(comercio_id,servicio_id,created_at);
CREATE INDEX ON public.transporte_adjuntos(comercio_id,servicio_id);

-- Integridad adicional para relaciones con entidades de Gestión y usuarios.
CREATE FUNCTION public.transporte_integridad() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j jsonb:=to_jsonb(NEW); clave text; tabla text; valor uuid; tenant uuid;
BEGIN
 FOR clave,tabla IN SELECT * FROM (VALUES ('cliente_id','clientes'),('proveedor_id','proveedores'),('presupuesto_id','presupuestos'),('venta_id','ventas'),('gasto_id','gastos_egresos')) AS r(k,t) LOOP
  valor:=nullif(j->>clave,'')::uuid;
  IF valor IS NOT NULL THEN
   EXECUTE format('SELECT comercio_id FROM public.%I WHERE id=$1',tabla) INTO tenant USING valor;
   IF tenant IS DISTINCT FROM NEW.comercio_id THEN RAISE EXCEPTION 'transporte_relacion_de_otro_comercio'; END IF;
  END IF;
 END LOOP;
 IF TG_TABLE_NAME='transporte_choferes' AND j->>'user_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.comercio_usuarios WHERE comercio_id=NEW.comercio_id AND user_id=(j->>'user_id')::uuid AND activo) THEN RAISE EXCEPTION 'transporte_usuario_no_pertenece_al_comercio'; END IF;
 IF TG_TABLE_NAME='transporte_mantenimientos' AND j->>'plan_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.transporte_planes WHERE id=(j->>'plan_id')::uuid AND unidad_id=(j->>'unidad_id')::uuid AND comercio_id=NEW.comercio_id) THEN RAISE EXCEPTION 'transporte_plan_de_otra_unidad'; END IF;
 IF TG_TABLE_NAME='transporte_servicios' AND j->>'presupuesto_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.presupuestos WHERE id=(j->>'presupuesto_id')::uuid AND cliente_id=(j->>'cliente_id')::uuid) THEN RAISE EXCEPTION 'transporte_presupuesto_de_otro_cliente'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['choferes','tarifas','servicios','gastos','mantenimientos'] LOOP
  EXECUTE format('CREATE TRIGGER transporte_integridad BEFORE INSERT OR UPDATE ON public.transporte_%I FOR EACH ROW EXECUTE FUNCTION public.transporte_integridad()',t);
 END LOOP;
END $$;

CREATE FUNCTION public.transporte_puede_servicio(c uuid,s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.transporte_habilitado(c) AND (public.transporte_admin(c) OR EXISTS(SELECT 1 FROM public.transporte_servicios o JOIN public.transporte_choferes ch ON ch.id=o.chofer_id AND ch.comercio_id=o.comercio_id WHERE o.id=s AND o.comercio_id=c AND ch.user_id=auth.uid() AND ch.activo))
$$;

CREATE FUNCTION public.transporte_datos(p_comercio_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a boolean; c uuid:=p_comercio_id; resultado jsonb;
BEGIN
 IF public.transporte_habilitado(c) IS DISTINCT FROM true THEN RAISE EXCEPTION 'transporte_sin_acceso_o_modulo_deshabilitado'; END IF;
 a:=public.transporte_admin(c);
 SELECT jsonb_build_object('admin',a,
  'unidades',coalesce((SELECT jsonb_agg(u) FROM public.transporte_unidades u WHERE comercio_id=c),'[]'),
  'choferes',coalesce((SELECT jsonb_agg(ch) FROM public.transporte_choferes ch WHERE comercio_id=c AND (a OR user_id=auth.uid())),'[]'),
  'servicios',coalesce((SELECT jsonb_agg(CASE WHEN a THEN to_jsonb(s) ELSE to_jsonb(s)-ARRAY['tarifa_snapshot','precio_manual','adicionales','km_facturables','horas_espera','iva','total','tarifa_id','presupuesto_id','venta_id'] END ORDER BY s.created_at DESC) FROM public.transporte_servicios s WHERE comercio_id=c AND public.transporte_puede_servicio(c,id)),'[]'),
  'tarifas',CASE WHEN a THEN coalesce((SELECT jsonb_agg(t) FROM public.transporte_tarifas t WHERE comercio_id=c),'[]') ELSE '[]'::jsonb END,
  'planes',CASE WHEN a THEN coalesce((SELECT jsonb_agg(p) FROM public.transporte_planes p WHERE comercio_id=c),'[]') ELSE '[]'::jsonb END,
  'mantenimientos',CASE WHEN a THEN coalesce((SELECT jsonb_agg(m) FROM public.transporte_mantenimientos m WHERE comercio_id=c),'[]') ELSE '[]'::jsonb END,
  'lecturas',CASE WHEN a THEN coalesce((SELECT jsonb_agg(l ORDER BY created_at DESC) FROM public.transporte_lecturas l WHERE comercio_id=c),'[]') ELSE '[]'::jsonb END,
  'gastos',CASE WHEN a THEN coalesce((SELECT jsonb_agg(to_jsonb(g)||jsonb_build_object('gasto',to_jsonb(e))) FROM public.transporte_gastos g JOIN public.gastos_egresos e ON e.id=g.gasto_id AND e.comercio_id=c WHERE g.comercio_id=c),'[]') ELSE '[]'::jsonb END,
  'eventos',coalesce((SELECT jsonb_agg(e ORDER BY created_at DESC) FROM public.transporte_eventos e WHERE comercio_id=c AND public.transporte_puede_servicio(c,servicio_id)),'[]'),
  'adjuntos',coalesce((SELECT jsonb_agg(e) FROM public.transporte_adjuntos e WHERE comercio_id=c AND public.transporte_puede_servicio(c,servicio_id)),'[]'),
  'clientes',CASE WHEN a THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'apellido',apellido)) FROM public.clientes WHERE comercio_id=c),'[]') ELSE '[]'::jsonb END,
  'proveedores',CASE WHEN a THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'apellido',apellido,'razon_social',razon_social)) FROM public.proveedores WHERE comercio_id=c),'[]') ELSE '[]'::jsonb END,
  'usuarios',CASE WHEN a THEN coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',user_id,'rol',rol)) FROM public.comercio_usuarios WHERE comercio_id=c AND activo),'[]') ELSE '[]'::jsonb END
 ) INTO resultado;
 RETURN resultado;
END $$;

CREATE FUNCTION public.transporte_registrar_lectura(c uuid,u uuid,s uuid,km numeric,h numeric,m text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE unidad public.transporte_unidades;
BEGIN
 SELECT * INTO unidad FROM public.transporte_unidades WHERE id=u AND comercio_id=c FOR UPDATE;
 IF unidad.id IS NULL OR km IS NULL OR h IS NULL OR km<unidad.kilometraje OR h<unidad.horas THEN RAISE EXCEPTION 'transporte_lectura_inferior_o_unidad_invalida'; END IF;
 UPDATE public.transporte_unidades SET kilometraje=km,horas=h WHERE id=u;
 INSERT INTO public.transporte_lecturas(comercio_id,unidad_id,servicio_id,kilometraje,horas,motivo,user_id) VALUES(c,u,s,km,h,m,auth.uid());
END $$;

CREATE FUNCTION public.transporte_operar(p_comercio_id uuid,p_accion text,p_id uuid,p_version integer,p_datos jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c uuid:=p_comercio_id; d jsonb:=p_datos; a boolean; v_id uuid:=coalesce(p_id,gen_random_uuid()); s public.transporte_servicios; previo public.transporte_servicios;
 u public.transporte_unidades; t public.transporte_tarifas; p public.transporte_planes; m public.transporte_mantenimientos;
 nuevo text; cliente uuid; uid uuid; equipo uuid; chofer uuid; tar uuid; gid uuid; doc uuid; v public.ventas; items jsonb; fila record;
 importe numeric; neto numeric; nombre text; punto integer; ids uuid[]; km numeric; h numeric; total_grupo numeric; pres public.presupuestos;
BEGIN
 IF public.transporte_habilitado(c) IS DISTINCT FROM true THEN RAISE EXCEPTION 'transporte_sin_acceso_o_modulo_deshabilitado'; END IF;
 IF jsonb_typeof(d) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'transporte_datos_invalidos'; END IF;
 a:=public.transporte_admin(c);
 IF NOT a AND p_accion NOT IN ('estado','adjunto') THEN RAISE EXCEPTION 'transporte_solo_administracion'; END IF;
 IF p_accion='unidad' THEN
  IF p_id IS NULL THEN
   INSERT INTO public.transporte_unidades(id,comercio_id,nombre,patente,tipo,marca,modelo,kilometraje,horas,estado,activo,observaciones)
   VALUES(v_id,c,d->>'nombre',upper(trim(d->>'patente')),d->>'tipo',coalesce(d->>'marca',''),coalesce(d->>'modelo',''),coalesce((d->>'kilometraje')::numeric,0),coalesce((d->>'horas')::numeric,0),coalesce(d->>'estado','disponible'),coalesce((d->>'activo')::boolean,true),coalesce(d->>'observaciones',''));
   PERFORM public.transporte_registrar_lectura(c,v_id,NULL,coalesce((d->>'kilometraje')::numeric,0),coalesce((d->>'horas')::numeric,0),'Alta de unidad');
  ELSE
   UPDATE public.transporte_unidades SET nombre=d->>'nombre',patente=upper(trim(d->>'patente')),tipo=d->>'tipo',marca=coalesce(d->>'marca',''),modelo=coalesce(d->>'modelo',''),estado=d->>'estado',activo=(d->>'activo')::boolean,observaciones=coalesce(d->>'observaciones','') WHERE transporte_unidades.id=p_id AND comercio_id=c;
   IF NOT FOUND THEN RAISE EXCEPTION 'transporte_unidad_no_disponible'; END IF;
  END IF;
 ELSIF p_accion='chofer' THEN
  IF p_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.transporte_choferes WHERE transporte_choferes.id=p_id AND comercio_id=c) THEN RAISE EXCEPTION 'transporte_chofer_no_disponible'; END IF;
  INSERT INTO public.transporte_choferes(id,comercio_id,nombre,telefono,user_id,activo) VALUES(v_id,c,d->>'nombre',coalesce(d->>'telefono',''),nullif(d->>'user_id','')::uuid,coalesce((d->>'activo')::boolean,true))
  ON CONFLICT ON CONSTRAINT transporte_choferes_pkey DO UPDATE SET nombre=EXCLUDED.nombre,telefono=EXCLUDED.telefono,user_id=EXCLUDED.user_id,activo=EXCLUDED.activo;
 ELSIF p_accion='tarifa' THEN
  IF p_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.transporte_tarifas WHERE transporte_tarifas.id=p_id AND comercio_id=c) THEN RAISE EXCEPTION 'transporte_tarifa_no_disponible'; END IF;
  INSERT INTO public.transporte_tarifas(id,comercio_id,nombre,cliente_id,tipo,base,km_incluidos,precio_km,precio_hora,iva,vigente_desde,vigente_hasta,activo)
  VALUES(v_id,c,d->>'nombre',nullif(d->>'cliente_id','')::uuid,d->>'tipo',(d->>'base')::numeric,(d->>'km_incluidos')::numeric,(d->>'precio_km')::numeric,(d->>'precio_hora')::numeric,(d->>'iva')::numeric,(d->>'vigente_desde')::date,nullif(d->>'vigente_hasta','')::date,coalesce((d->>'activo')::boolean,true))
  ON CONFLICT ON CONSTRAINT transporte_tarifas_pkey DO UPDATE SET nombre=EXCLUDED.nombre,cliente_id=EXCLUDED.cliente_id,tipo=EXCLUDED.tipo,base=EXCLUDED.base,km_incluidos=EXCLUDED.km_incluidos,precio_km=EXCLUDED.precio_km,precio_hora=EXCLUDED.precio_hora,iva=EXCLUDED.iva,vigente_desde=EXCLUDED.vigente_desde,vigente_hasta=EXCLUDED.vigente_hasta,activo=EXCLUDED.activo;
 ELSIF p_accion='servicio' THEN
  IF p_id IS NOT NULL THEN
   SELECT * INTO previo FROM public.transporte_servicios WHERE transporte_servicios.id=p_id AND comercio_id=c FOR UPDATE;
   IF previo.id IS NULL OR previo.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'transporte_version_desactualizada'; END IF;
   IF previo.estado IN ('cancelado','no_realizado') OR previo.venta_id IS NOT NULL OR previo.presupuesto_id IS NOT NULL THEN RAISE EXCEPTION 'transporte_servicio_comercial_protegido'; END IF;
  END IF;
  cliente:=(d->>'cliente_id')::uuid; uid:=nullif(d->>'unidad_id','')::uuid; equipo:=nullif(d->>'equipo_id','')::uuid; chofer:=nullif(d->>'chofer_id','')::uuid; tar:=nullif(d->>'tarifa_id','')::uuid;
  IF previo.id IS NOT NULL AND previo.estado NOT IN ('solicitado','asignado') AND
     (previo.unidad_id IS DISTINCT FROM uid OR previo.equipo_id IS DISTINCT FROM equipo OR previo.chofer_id IS DISTINCT FROM chofer) THEN
   RAISE EXCEPTION 'transporte_asignacion_protegida_servicio_iniciado';
  END IF;
  IF uid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.transporte_unidades WHERE transporte_unidades.id=uid AND comercio_id=c AND activo) THEN RAISE EXCEPTION 'transporte_unidad_inactiva'; END IF;
  IF equipo IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.transporte_unidades WHERE transporte_unidades.id=equipo AND comercio_id=c AND activo) THEN RAISE EXCEPTION 'transporte_equipo_inactivo'; END IF;
  IF chofer IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.transporte_choferes WHERE transporte_choferes.id=chofer AND comercio_id=c AND activo) THEN RAISE EXCEPTION 'transporte_chofer_inactivo'; END IF;
  IF tar IS NOT NULL THEN
   IF previo.tarifa_id=tar AND previo.cliente_id=cliente AND previo.tipo=d->>'tipo' THEN t:=jsonb_populate_record(NULL::public.transporte_tarifas,previo.tarifa_snapshot);
   ELSE
    SELECT * INTO t FROM public.transporte_tarifas WHERE transporte_tarifas.id=tar AND comercio_id=c AND activo AND tipo=d->>'tipo' AND (cliente_id IS NULL OR cliente_id=cliente) AND vigente_desde<=coalesce(nullif(d->>'programado_at','')::timestamptz::date,current_date) AND (vigente_hasta IS NULL OR vigente_hasta>=coalesce(nullif(d->>'programado_at','')::timestamptz::date,current_date));
    IF t.id IS NULL THEN RAISE EXCEPTION 'transporte_tarifa_no_aplicable'; END IF;
   END IF;
  END IF;
  s:=jsonb_populate_record(NULL::public.transporte_servicios,d);
  IF s.precio_manual IS NULL AND t.id IS NULL THEN RAISE EXCEPTION 'transporte_indique_tarifa_o_precio_acordado'; END IF;
  importe:=round(coalesce(s.precio_manual,t.base+greatest(0,coalesce(s.km_facturables,0)-t.km_incluidos)*t.precio_km+coalesce(s.horas_espera,0)*t.precio_hora)+coalesce(s.adicionales,0),2);
  IF previo.id IS NULL THEN
   INSERT INTO public.transporte_servicios(id,comercio_id,tipo,cliente_id,origen,destino,carga) VALUES(v_id,c,d->>'tipo',cliente,d->>'origen',d->>'destino',d->>'carga');
  END IF;
  UPDATE public.transporte_servicios SET tipo=s.tipo,cliente_id=cliente,unidad_id=uid,equipo_id=equipo,chofer_id=chofer,tarifa_id=tar,
   programado_at=s.programado_at,origen=s.origen,destino=s.destino,solicitante=coalesce(s.solicitante,''),expediente=coalesce(s.expediente,''),contacto=coalesce(s.contacto,''),telefono=coalesce(s.telefono,''),carga=s.carga,detalles=coalesce(s.detalles,'{}'),
   km_facturables=coalesce(s.km_facturables,0),horas_espera=coalesce(s.horas_espera,0),adicionales=coalesce(s.adicionales,0),precio_manual=s.precio_manual,tarifa_snapshot=CASE WHEN t.id IS NOT NULL THEN to_jsonb(t) END,total=importe,iva=coalesce(t.iva,s.iva,21),observaciones=coalesce(s.observaciones,''),version=version+1
   WHERE transporte_servicios.id=v_id AND comercio_id=c;
  IF previo.id IS NULL THEN INSERT INTO public.transporte_eventos(comercio_id,servicio_id,estado,detalle,user_id) VALUES(c,v_id,'solicitado','Alta del servicio',auth.uid()); END IF;
 ELSIF p_accion IN ('estado','presentacion','adjunto') THEN
  SELECT * INTO s FROM public.transporte_servicios WHERE transporte_servicios.id=p_id AND comercio_id=c FOR UPDATE;
  IF s.id IS NULL OR public.transporte_puede_servicio(c,p_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'transporte_servicio_no_disponible'; END IF;
  IF p_accion='adjunto' THEN
   IF d->>'ruta' NOT LIKE c::text||'/'||p_id::text||'/%' OR d->>'ruta' LIKE '%..%' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transporte' AND name=d->>'ruta') THEN RAISE EXCEPTION 'transporte_archivo_invalido'; END IF;
   INSERT INTO public.transporte_adjuntos(comercio_id,servicio_id,ruta,nombre) VALUES(c,p_id,d->>'ruta',d->>'nombre') RETURNING transporte_adjuntos.id INTO v_id;
  ELSE
   IF s.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'transporte_version_desactualizada'; END IF;
   IF p_accion='presentacion' THEN
    UPDATE public.transporte_servicios SET presentacion=d->>'presentacion',version=version+1 WHERE transporte_servicios.id=p_id;
    INSERT INTO public.transporte_eventos(comercio_id,servicio_id,estado,detalle,user_id) VALUES(c,p_id,s.estado,'Presentación: '||(d->>'presentacion')||' '||coalesce(d->>'detalle',''),auth.uid());
   ELSE
    nuevo:=d->>'estado';
    IF NOT ((s.estado='solicitado' AND nuevo='asignado') OR (s.estado='asignado' AND nuevo='en_camino') OR (s.estado='en_camino' AND nuevo='en_lugar') OR (s.estado='en_lugar' AND nuevo='trasladando') OR (s.estado='trasladando' AND nuevo='finalizado') OR (a AND s.estado NOT IN ('finalizado','cancelado','no_realizado') AND nuevo IN ('cancelado','no_realizado'))) THEN RAISE EXCEPTION 'transporte_transicion_invalida'; END IF;
    IF nuevo IN ('cancelado','no_realizado') AND length(trim(coalesce(d->>'detalle','')))=0 THEN RAISE EXCEPTION 'transporte_motivo_requerido'; END IF;
    IF nuevo NOT IN ('cancelado','no_realizado') AND (s.unidad_id IS NULL OR s.chofer_id IS NULL) THEN RAISE EXCEPTION 'transporte_asigne_unidad_y_chofer'; END IF;
    -- Serializa la disponibilidad de chofer y equipos incluso entre unidades diferentes.
    PERFORM 1 FROM public.transporte_choferes WHERE transporte_choferes.id=s.chofer_id AND comercio_id=c FOR UPDATE;
    PERFORM 1 FROM public.transporte_unidades WHERE transporte_unidades.id IN (s.unidad_id,s.equipo_id) AND comercio_id=c ORDER BY transporte_unidades.id FOR UPDATE;
    SELECT * INTO u FROM public.transporte_unidades WHERE transporte_unidades.id=s.unidad_id AND comercio_id=c FOR UPDATE;
    IF nuevo='en_camino' THEN
     IF NOT u.activo OR u.estado<>'disponible' THEN RAISE EXCEPTION 'transporte_unidad_no_disponible'; END IF;
     IF NOT EXISTS(SELECT 1 FROM public.transporte_choferes WHERE transporte_choferes.id=s.chofer_id AND comercio_id=c AND activo) THEN RAISE EXCEPTION 'transporte_chofer_inactivo'; END IF;
     IF s.equipo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.transporte_unidades WHERE transporte_unidades.id=s.equipo_id AND comercio_id=c AND activo AND estado='disponible') THEN RAISE EXCEPTION 'transporte_equipo_no_disponible'; END IF;
     IF EXISTS(SELECT 1 FROM public.transporte_servicios x WHERE x.comercio_id=c AND x.id<>p_id AND x.estado IN ('en_camino','en_lugar','trasladando') AND (x.chofer_id=s.chofer_id OR ARRAY[x.unidad_id,x.equipo_id] && ARRAY[s.unidad_id,s.equipo_id])) THEN RAISE EXCEPTION 'transporte_unidad_o_chofer_ocupado'; END IF;
     km:=(d->>'km_salida')::numeric;
     PERFORM public.transporte_registrar_lectura(c,s.unidad_id,p_id,km,u.horas,'Salida del servicio '||s.numero);
     UPDATE public.transporte_servicios SET km_salida=km WHERE transporte_servicios.id=p_id;
    ELSIF nuevo='finalizado' THEN
     km:=(d->>'km_llegada')::numeric;
     IF s.km_salida IS NULL OR km<s.km_salida THEN RAISE EXCEPTION 'transporte_kilometraje_invalido'; END IF;
     IF coalesce((d->>'km_aproximacion')::numeric,0)+coalesce((d->>'km_traslado')::numeric,0)+coalesce((d->>'km_retorno')::numeric,0)>km-s.km_salida THEN RAISE EXCEPTION 'transporte_tramos_superan_recorrido_real'; END IF;
     PERFORM public.transporte_registrar_lectura(c,s.unidad_id,p_id,km,u.horas,'Regreso del servicio '||s.numero);
     UPDATE public.transporte_servicios SET km_llegada=km,km_aproximacion=coalesce((d->>'km_aproximacion')::numeric,0),km_traslado=coalesce((d->>'km_traslado')::numeric,0),km_retorno=coalesce((d->>'km_retorno')::numeric,0) WHERE transporte_servicios.id=p_id;
    END IF;
    UPDATE public.transporte_servicios SET estado=nuevo,motivo_cierre=coalesce(d->>'detalle',''),version=version+1 WHERE transporte_servicios.id=p_id;
    INSERT INTO public.transporte_eventos(comercio_id,servicio_id,estado,detalle,user_id) VALUES(c,p_id,nuevo,coalesce(d->>'detalle',''),auth.uid());
   END IF;
   v_id:=p_id;
  END IF;
 ELSIF p_accion='lectura' THEN
  uid:=(d->>'unidad_id')::uuid;
  PERFORM public.transporte_registrar_lectura(c,uid,NULL,(d->>'kilometraje')::numeric,(d->>'horas')::numeric,d->>'motivo'); v_id:=uid;
 ELSIF p_accion='plan' THEN
  IF p_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.transporte_planes WHERE transporte_planes.id=p_id AND comercio_id=c) THEN RAISE EXCEPTION 'transporte_plan_no_disponible'; END IF;
  p:=jsonb_populate_record(NULL::public.transporte_planes,d);
  IF p_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.transporte_planes WHERE transporte_planes.id=p_id AND unidad_id IS DISTINCT FROM p.unidad_id) THEN RAISE EXCEPTION 'transporte_no_cambie_unidad_del_plan'; END IF;
  INSERT INTO public.transporte_planes(id,comercio_id,unidad_id,nombre,intervalo_km,intervalo_dias,intervalo_horas,proximo_km,proxima_fecha,proximas_horas,aviso_km,aviso_dias,aviso_horas,activo)
  VALUES(v_id,c,p.unidad_id,p.nombre,p.intervalo_km,p.intervalo_dias,p.intervalo_horas,p.proximo_km,p.proxima_fecha,p.proximas_horas,coalesce(p.aviso_km,1000),coalesce(p.aviso_dias,15),coalesce(p.aviso_horas,10),coalesce(p.activo,true))
  ON CONFLICT ON CONSTRAINT transporte_planes_pkey DO UPDATE SET nombre=EXCLUDED.nombre,intervalo_km=EXCLUDED.intervalo_km,intervalo_dias=EXCLUDED.intervalo_dias,intervalo_horas=EXCLUDED.intervalo_horas,proximo_km=EXCLUDED.proximo_km,proxima_fecha=EXCLUDED.proxima_fecha,proximas_horas=EXCLUDED.proximas_horas,aviso_km=EXCLUDED.aviso_km,aviso_dias=EXCLUDED.aviso_dias,aviso_horas=EXCLUDED.aviso_horas,activo=EXCLUDED.activo;
 ELSIF p_accion='gasto' THEN
  uid:=(d->>'unidad_id')::uuid;
  IF nullif(d->>'servicio_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.transporte_servicios WHERE transporte_servicios.id=(d->>'servicio_id')::uuid AND comercio_id=c AND (unidad_id=uid OR equipo_id=uid)) THEN RAISE EXCEPTION 'transporte_gasto_de_otra_unidad'; END IF;
  -- La carga inicial es pendiente; los pagos y su impacto en caja se gestionan en Gestión.
  INSERT INTO public.gastos_egresos(comercio_id,fecha,categoria,concepto,proveedor_id,monto,medio_pago,estado,numero_comprobante,observaciones)
  VALUES(c,(d->>'fecha')::date,d->>'categoria',d->>'concepto',nullif(d->>'proveedor_id','')::uuid,(d->>'monto')::numeric,CASE WHEN nullif(d->>'proveedor_id','') IS NULL THEN 'otro' ELSE 'cuenta_corriente' END,'pendiente',d->>'numero_comprobante','Vortex Transporte') RETURNING gastos_egresos.id INTO gid;
  INSERT INTO public.transporte_gastos(id,comercio_id,unidad_id,servicio_id,gasto_id,litros,kilometraje) VALUES(v_id,c,uid,nullif(d->>'servicio_id','')::uuid,gid,nullif(d->>'litros','')::numeric,nullif(d->>'kilometraje','')::numeric);
  IF nullif(d->>'kilometraje','') IS NOT NULL THEN SELECT * INTO u FROM public.transporte_unidades WHERE transporte_unidades.id=uid AND comercio_id=c; PERFORM public.transporte_registrar_lectura(c,uid,NULL,(d->>'kilometraje')::numeric,u.horas,'Carga de gasto'); END IF;
 ELSIF p_accion='mantenimiento' THEN
  IF p_id IS NOT NULL THEN SELECT * INTO m FROM public.transporte_mantenimientos WHERE transporte_mantenimientos.id=p_id AND comercio_id=c FOR UPDATE; IF m.id IS NULL OR m.estado='realizado' THEN RAISE EXCEPTION 'transporte_mantenimiento_protegido'; END IF; END IF;
  m:=jsonb_populate_record(NULL::public.transporte_mantenimientos,d);
  IF m.estado='realizado' THEN PERFORM public.transporte_registrar_lectura(c,m.unidad_id,NULL,m.kilometraje,m.horas,'Mantenimiento: '||m.tareas); END IF;
  IF m.gasto_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.transporte_gastos WHERE gasto_id=m.gasto_id AND comercio_id=c AND unidad_id=m.unidad_id) THEN RAISE EXCEPTION 'transporte_gasto_no_vinculado_a_unidad'; END IF;
  INSERT INTO public.transporte_mantenimientos(id,comercio_id,unidad_id,plan_id,fecha,programado_para,estado,tareas,kilometraje,horas,proveedor_id,presupuesto,gasto_id)
  VALUES(v_id,c,m.unidad_id,m.plan_id,coalesce(m.fecha,current_date),m.programado_para,m.estado,m.tareas,m.kilometraje,coalesce(m.horas,0),m.proveedor_id,coalesce(m.presupuesto,0),m.gasto_id)
  ON CONFLICT ON CONSTRAINT transporte_mantenimientos_pkey DO UPDATE SET unidad_id=EXCLUDED.unidad_id,plan_id=EXCLUDED.plan_id,fecha=EXCLUDED.fecha,programado_para=EXCLUDED.programado_para,estado=EXCLUDED.estado,tareas=EXCLUDED.tareas,kilometraje=EXCLUDED.kilometraje,horas=EXCLUDED.horas,proveedor_id=EXCLUDED.proveedor_id,presupuesto=EXCLUDED.presupuesto,gasto_id=EXCLUDED.gasto_id;
  IF m.estado='realizado' AND m.plan_id IS NOT NULL THEN
   UPDATE public.transporte_planes SET proximo_km=CASE WHEN intervalo_km IS NOT NULL THEN m.kilometraje+intervalo_km END,proxima_fecha=CASE WHEN intervalo_dias IS NOT NULL THEN coalesce(m.fecha,current_date)+intervalo_dias END,proximas_horas=CASE WHEN intervalo_horas IS NOT NULL THEN m.horas+intervalo_horas END WHERE transporte_planes.id=m.plan_id AND comercio_id=c AND unidad_id=m.unidad_id;
  END IF;
 ELSIF p_accion IN ('presupuesto','facturar') THEN
  SELECT array_agg(x::uuid ORDER BY x) INTO ids FROM jsonb_array_elements_text(d->'servicios') x;
  IF coalesce(cardinality(ids),0)=0 OR cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'transporte_seleccion_invalida'; END IF;
  PERFORM 1 FROM public.transporte_servicios WHERE transporte_servicios.id=ANY(ids) AND comercio_id=c ORDER BY transporte_servicios.id FOR UPDATE;
  IF (SELECT count(*) FROM public.transporte_servicios WHERE transporte_servicios.id=ANY(ids) AND comercio_id=c)<>cardinality(ids) THEN RAISE EXCEPTION 'transporte_seleccion_de_otro_comercio'; END IF;
  IF (SELECT count(DISTINCT cliente_id) FROM public.transporte_servicios WHERE transporte_servicios.id=ANY(ids))<>1 THEN RAISE EXCEPTION 'transporte_seleccione_un_solo_cliente'; END IF;
  IF EXISTS(SELECT 1 FROM public.transporte_servicios WHERE transporte_servicios.id=ANY(ids) AND venta_id IS NOT NULL) THEN
   IF (SELECT count(DISTINCT venta_id) FROM public.transporte_servicios WHERE transporte_servicios.id=ANY(ids))=1 AND NOT EXISTS(SELECT 1 FROM public.transporte_servicios WHERE transporte_servicios.id=ANY(ids) AND venta_id IS NULL) THEN SELECT venta_id INTO v_id FROM public.transporte_servicios WHERE transporte_servicios.id=ids[1]; RETURN v_id; END IF;
   RAISE EXCEPTION 'transporte_servicios_ya_facturados';
  END IF;
  SELECT * INTO s FROM public.transporte_servicios WHERE transporte_servicios.id=ids[1];
  cliente:=s.cliente_id;
  SELECT concat_ws(' ',cl.nombre,cl.apellido) INTO nombre FROM public.clientes cl WHERE cl.id=cliente AND cl.comercio_id=c;
  IF p_accion='presupuesto' THEN
   IF cardinality(ids)<>1 THEN RAISE EXCEPTION 'transporte_presupuesto_individual'; END IF;
   IF s.presupuesto_id IS NOT NULL THEN RETURN s.presupuesto_id; END IF;
   IF s.estado IN ('cancelado','no_realizado') OR s.total<=0 THEN RAISE EXCEPTION 'transporte_servicio_no_presupuestable'; END IF;
   neto:=round(s.total/(1+s.iva/100),2);
   INSERT INTO public.presupuestos(comercio_id,numero_comprobante,cliente_id,cliente_nombre,tipo_pago,tipo_comprobante,subtotal,total_iva,total,observaciones)
   VALUES(c,'TR-'||s.id::text,cliente,nombre,'cta_cte','recibo_x',neto,s.total-neto,s.total,'Servicio de Transporte #'||s.numero) RETURNING presupuestos.id INTO doc;
   INSERT INTO public.presupuesto_items(comercio_id,presupuesto_id,descripcion_manual,cantidad,precio_unitario,porcentaje_iva,subtotal,monto_iva,total) VALUES(c,doc,s.carga||' - '||s.origen||' → '||s.destino,1,s.total,s.iva,neto,s.total-neto,s.total);
   INSERT INTO public.presupuesto_pagos(comercio_id,presupuesto_id,tipo_pago,monto) VALUES(c,doc,'cta_cte',s.total);
   UPDATE public.transporte_servicios SET presupuesto_id=doc,version=version+1 WHERE transporte_servicios.id=s.id; v_id:=doc;
  ELSE
   IF EXISTS(SELECT 1 FROM public.transporte_servicios WHERE transporte_servicios.id=ANY(ids) AND (estado<>'finalizado' OR presentacion<>'listo' OR total<=0)) THEN RAISE EXCEPTION 'transporte_finalice_y_complete_la_presentacion'; END IF;
   -- Comparte el bloqueo con la confirmación de presupuestos de Gestión.
   PERFORM 1 FROM public.presupuestos WHERE presupuestos.id IN (SELECT presupuesto_id FROM public.transporte_servicios WHERE transporte_servicios.id=ANY(ids)) ORDER BY presupuestos.id FOR UPDATE;
   -- Si Gestión ya confirmó un presupuesto, se reutiliza su venta y no se vuelve a cobrar.
   FOR fila IN SELECT o.*,pr.venta_id AS venta_presupuesto,pr.total AS presupuesto_total,pr.cliente_id AS presupuesto_cliente FROM public.transporte_servicios o LEFT JOIN public.presupuestos pr ON pr.id=o.presupuesto_id WHERE o.id=ANY(ids) LOOP
    IF fila.presupuesto_id IS NOT NULL AND (fila.presupuesto_total IS DISTINCT FROM fila.total OR fila.presupuesto_cliente IS DISTINCT FROM fila.cliente_id) THEN RAISE EXCEPTION 'transporte_presupuesto_modificado_revisar'; END IF;
    IF fila.venta_presupuesto IS NOT NULL THEN
     IF cardinality(ids)<>1 THEN RAISE EXCEPTION 'transporte_presupuesto_confirmado_facturar_individual'; END IF;
     UPDATE public.transporte_servicios SET venta_id=fila.venta_presupuesto,version=version+1 WHERE transporte_servicios.id=fila.id; RETURN fila.venta_presupuesto;
    END IF;
   END LOOP;
   SELECT jsonb_agg(jsonb_build_object('descripcion_manual','Transporte #'||numero||' · '||carga||' · '||origen||' → '||destino,'cantidad',1,'precio_unitario',total,'porcentaje_iva',iva,'afecta_stock',false)),sum(total) INTO items,total_grupo FROM public.transporte_servicios WHERE transporte_servicios.id=ANY(ids);
   IF d->>'tipo_comprobante' NOT IN ('recibo_x','factura_a','factura_b','factura_c') THEN RAISE EXCEPTION 'transporte_tipo_comprobante_invalido'; END IF;
   SELECT coalesce(ac.punto_venta,1) INTO punto FROM public.comercio co LEFT JOIN public.afip_config ac ON ac.comercio_id=co.id AND ac.activo WHERE co.id=c;
   IF nullif(d->>'emisor_fiscal_id','') IS NOT NULL THEN
    SELECT * INTO v FROM public.registrar_venta_emisor_transaccional(p_comercio_id=>c,p_tipo_comprobante=>(d->>'tipo_comprobante')::public.tipo_comprobante,p_punto_venta=>punto,p_cliente_id=>cliente,p_cliente_nombre=>nombre,p_moneda=>'ARS',p_modalidad=>d->>'modalidad',p_items=>items,p_pagos=>coalesce(d->'pagos','[]'),p_idempotency_key=>(d->>'idempotency_key')::uuid,p_emisor_fiscal_id=>(d->>'emisor_fiscal_id')::uuid,p_observaciones=>'Servicios Vortex Transporte');
   ELSE
    IF EXISTS(SELECT 1 FROM public.comercio_parametrizacion WHERE comercio_id=c AND parametros->'funciones'->>'multiples_cuit'='true') THEN RAISE EXCEPTION 'transporte_seleccione_emisor_fiscal'; END IF;
    SELECT * INTO v FROM public.registrar_venta_transaccional(p_comercio_id=>c,p_tipo_comprobante=>(d->>'tipo_comprobante')::public.tipo_comprobante,p_punto_venta=>punto,p_cliente_id=>cliente,p_cliente_nombre=>nombre,p_moneda=>'ARS',p_modalidad=>d->>'modalidad',p_items=>items,p_pagos=>coalesce(d->'pagos','[]'),p_idempotency_key=>(d->>'idempotency_key')::uuid,p_observaciones=>'Servicios Vortex Transporte');
   END IF;
   IF v.id IS NULL OR v.total IS DISTINCT FROM total_grupo THEN RAISE EXCEPTION 'transporte_total_facturacion_inconsistente'; END IF;
   UPDATE public.presupuestos SET estado='confirmado',venta_id=v.id,confirmado_at=now() WHERE presupuestos.id IN (SELECT presupuesto_id FROM public.transporte_servicios WHERE transporte_servicios.id=ANY(ids));
   UPDATE public.transporte_servicios SET venta_id=v.id,version=version+1 WHERE transporte_servicios.id=ANY(ids); v_id:=v.id;
  END IF;
 ELSE RAISE EXCEPTION 'transporte_accion_desconocida'; END IF;
 RETURN v_id;
END $$;

-- Bucket privado. Los archivos se consultan con URL firmada y sólo por servicio autorizado.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('transporte','transporte',false,10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf']);
CREATE FUNCTION public.transporte_archivo_autorizado(ruta text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c uuid; s uuid;
BEGIN
 IF ruta LIKE '%..%' OR array_length(string_to_array(ruta,'/'),1)<>3 THEN RETURN false; END IF;
 BEGIN c:=split_part(ruta,'/',1)::uuid; s:=split_part(ruta,'/',2)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 RETURN public.transporte_puede_servicio(c,s);
END $$;
CREATE POLICY transporte_archivo_lectura ON storage.objects FOR SELECT TO authenticated USING(bucket_id='transporte' AND public.transporte_archivo_autorizado(name));
CREATE POLICY transporte_archivo_alta ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='transporte' AND public.transporte_archivo_autorizado(name));
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS firma,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'transporte_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.firma);
  IF f.proname IN ('transporte_habilitado','transporte_admin','transporte_datos','transporte_operar','transporte_puede_servicio','transporte_archivo_autorizado') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.firma); END IF;
 END LOOP;
END $$;
COMMIT;
