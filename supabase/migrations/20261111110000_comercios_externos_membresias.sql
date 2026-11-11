-- Registro administrativo de sistemas externos. No crea tenants ni usuarios,
-- no modifica clientes existentes y no se conecta a otras bases de datos.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS clientes_comercio_id_id_externos_key ON public.clientes(comercio_id,id);
CREATE TABLE public.comercios_externos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 cliente_id uuid NOT NULL,
 nombre_comercio text NOT NULL CHECK(length(btrim(nombre_comercio)) BETWEEN 1 AND 200),
 sistema text NOT NULL CHECK(length(btrim(sistema)) BETWEEN 1 AND 200),
 url_sistema text NOT NULL CHECK(length(url_sistema)<=2048 AND url_sistema ~ '^https://[^[:space:]@/]+([/?#][^[:space:]]*)?$'),
 importe_mensual numeric(14,2) NOT NULL CHECK(importe_mensual>0 AND importe_mensual<>'NaN'::numeric),
 concepto text NOT NULL CHECK(length(btrim(concepto)) BETWEEN 1 AND 200),
 fecha_ingreso_sistema date CHECK(isfinite(fecha_ingreso_sistema)),
 membresia_vigente_hasta date CHECK(isfinite(membresia_vigente_hasta)),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(comercio_id,id),
 FOREIGN KEY(comercio_id,cliente_id) REFERENCES public.clientes(comercio_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX comercios_externos_url_unica ON public.comercios_externos(comercio_id,regexp_replace(url_sistema,'/+$',''));
CREATE INDEX comercios_externos_cliente_idx ON public.comercios_externos(comercio_id,cliente_id);
CREATE TABLE public.comercios_externos_comprobantes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id),
 externo_id uuid NOT NULL, periodo date NOT NULL CHECK(isfinite(periodo) AND extract(day FROM periodo)=1),
 venta_id uuid REFERENCES public.ventas(id) ON DELETE SET NULL,
 importe numeric(14,2) NOT NULL CHECK(importe>0 AND importe<>'NaN'::numeric), concepto text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(comercio_id,externo_id,periodo),
 FOREIGN KEY(comercio_id,externo_id) REFERENCES public.comercios_externos(comercio_id,id) ON DELETE RESTRICT
);
CREATE INDEX comercios_externos_comprobantes_venta_idx ON public.comercios_externos_comprobantes(comercio_id,venta_id);

CREATE FUNCTION public.validar_comercio_externo() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_TABLE_NAME='comercios_externos' THEN
  IF NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=NEW.cliente_id AND comercio_id=NEW.comercio_id) THEN RAISE EXCEPTION 'El cliente debe pertenecer al comercio emisor'; END IF;
  IF TG_OP='UPDATE' AND (OLD.comercio_id IS DISTINCT FROM NEW.comercio_id OR OLD.id IS DISTINCT FROM NEW.id) THEN RAISE EXCEPTION 'No se puede cambiar el emisor del comercio externo'; END IF;
  IF TG_OP='UPDATE' AND OLD.cliente_id IS DISTINCT FROM NEW.cliente_id AND EXISTS(SELECT 1 FROM public.comercios_externos_comprobantes WHERE comercio_id=OLD.comercio_id AND externo_id=OLD.id) THEN RAISE EXCEPTION 'No se puede cambiar el cliente de un comercio externo con comprobantes'; END IF;
 ELSE
  IF NEW.venta_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ventas v JOIN public.comercios_externos e ON e.id=NEW.externo_id AND e.comercio_id=NEW.comercio_id WHERE v.id=NEW.venta_id AND v.comercio_id=NEW.comercio_id AND v.cliente_id=e.cliente_id) THEN RAISE EXCEPTION 'La venta debe pertenecer al emisor y al cliente vinculados'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validar_comercio_externo BEFORE INSERT OR UPDATE ON public.comercios_externos FOR EACH ROW EXECUTE FUNCTION public.validar_comercio_externo();
CREATE TRIGGER validar_comercio_externo_comprobante BEFORE INSERT OR UPDATE ON public.comercios_externos_comprobantes FOR EACH ROW EXECUTE FUNCTION public.validar_comercio_externo();
ALTER TABLE public.comercios_externos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comercios_externos_comprobantes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comercios_externos,public.comercios_externos_comprobantes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.comercios_externos,public.comercios_externos_comprobantes TO authenticated;
CREATE POLICY comercios_externos_lectura ON public.comercios_externos FOR SELECT TO authenticated USING(public.is_app_admin() AND public.user_is_comercio_admin(comercio_id));
CREATE POLICY comercios_externos_comprobantes_lectura ON public.comercios_externos_comprobantes FOR SELECT TO authenticated USING(public.is_app_admin() AND public.user_is_comercio_admin(comercio_id));

CREATE FUNCTION public.listar_comercios_externos(p_comercio_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.uid() IS NULL OR public.is_app_admin() IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sin permiso para consultar el panel de comercios' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
  'externos',coalesce((SELECT jsonb_agg(to_jsonb(e)||jsonb_build_object('cliente_nombre',concat_ws(' ',c.nombre,c.apellido),'cliente_cuit',c.cuit,'cliente_situacion_afip',c.situacion_afip,'emisor_nombre',em.nombre_comercio) ORDER BY e.nombre_comercio) FROM public.comercios_externos e JOIN public.clientes c ON c.id=e.cliente_id AND c.comercio_id=e.comercio_id JOIN public.comercio em ON em.id=e.comercio_id),'[]'::jsonb),
  'licencias',CASE WHEN public.user_is_comercio_admin(p_comercio_id) THEN coalesce((SELECT jsonb_agg(jsonb_build_object('destinatario_comercio_id',l.destinatario_comercio_id,'importe_mensual',l.importe_mensual)) FROM public.licencias_comercios l WHERE l.comercio_id=p_comercio_id),'[]'::jsonb) ELSE '[]'::jsonb END
 );
END $$;
CREATE FUNCTION public.guardar_comercio_externo(p_comercio_id uuid,p_id uuid,p_cliente_id uuid,p_nombre text,p_sistema text,p_url text,p_importe numeric,p_concepto text,p_fecha_alta date DEFAULT NULL,p_vigencia date DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE destino uuid;
BEGIN
 IF auth.uid() IS NULL OR public.is_app_admin() IS DISTINCT FROM true OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sin permiso para administrar comercios externos de este emisor' USING ERRCODE='42501'; END IF;
 IF p_importe IS NULL OR p_importe::text IN ('NaN','Infinity','-Infinity') OR p_importe<=0 OR p_importe<>round(p_importe,2) THEN RAISE EXCEPTION 'Ingresá un importe mensual positivo con hasta dos decimales'; END IF;
 IF p_id IS NULL THEN
  INSERT INTO public.comercios_externos(comercio_id,cliente_id,nombre_comercio,sistema,url_sistema,importe_mensual,concepto,fecha_ingreso_sistema,membresia_vigente_hasta)
  VALUES(p_comercio_id,p_cliente_id,btrim(p_nombre),btrim(p_sistema),btrim(p_url),p_importe,btrim(p_concepto),p_fecha_alta,p_vigencia) RETURNING id INTO destino;
 ELSE
  UPDATE public.comercios_externos SET cliente_id=p_cliente_id,nombre_comercio=btrim(p_nombre),sistema=btrim(p_sistema),url_sistema=btrim(p_url),importe_mensual=p_importe,concepto=btrim(p_concepto),fecha_ingreso_sistema=p_fecha_alta,membresia_vigente_hasta=p_vigencia,updated_at=now() WHERE comercio_id=p_comercio_id AND id=p_id RETURNING id INTO destino;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comercio externo no disponible en este emisor'; END IF;
 END IF;
 RETURN destino;
END $$;
CREATE FUNCTION public.eliminar_comercio_externo(p_comercio_id uuid,p_destinatario_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.uid() IS NULL OR public.is_app_admin() IS DISTINCT FROM true OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sin permiso para eliminar el registro externo' USING ERRCODE='42501'; END IF;
 DELETE FROM public.comercios_externos WHERE comercio_id=p_comercio_id AND id=p_destinatario_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Comercio externo no disponible en este emisor'; END IF;
EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION 'El comercio externo tiene comprobantes y debe conservarse como historial';
END $$;
CREATE FUNCTION public.consultar_licencia_externa(p_comercio_id uuid,p_destinatario_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE e public.comercios_externos;
BEGIN
 IF auth.uid() IS NULL OR public.is_app_admin() IS DISTINCT FROM true OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sin permiso para consultar esta membresía externa' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.comercios_externos WHERE id=p_destinatario_id AND comercio_id=p_comercio_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Comercio externo no disponible en este emisor'; END IF;
 RETURN jsonb_build_object('configuracion',to_jsonb(e)||jsonb_build_object('destinatario_comercio_id',e.id),'comprobantes',coalesce((SELECT jsonb_agg(to_jsonb(h)||jsonb_build_object('numero_comprobante',v.numero_comprobante,'tipo_comprobante',v.tipo_comprobante,'cae',v.cae,'cae_error',v.cae_error) ORDER BY h.periodo DESC) FROM public.comercios_externos_comprobantes h LEFT JOIN public.ventas v ON v.id=h.venta_id AND v.comercio_id=h.comercio_id WHERE h.comercio_id=p_comercio_id AND h.externo_id=e.id),'[]'::jsonb));
END $$;
CREATE FUNCTION public.guardar_licencia_externa(p_comercio_id uuid,p_destinatario_id uuid,p_importe numeric,p_concepto text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE e public.comercios_externos;
BEGIN
 IF auth.uid() IS NULL OR public.is_app_admin() IS DISTINCT FROM true OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sin permiso para administrar esta membresía externa' USING ERRCODE='42501'; END IF;
 IF p_importe IS NULL OR p_importe::text IN ('NaN','Infinity','-Infinity') OR p_importe<=0 OR p_importe<>round(p_importe,2) THEN RAISE EXCEPTION 'Ingresá un importe mensual positivo con hasta dos decimales'; END IF;
 UPDATE public.comercios_externos SET importe_mensual=p_importe,concepto=btrim(p_concepto),updated_at=now() WHERE comercio_id=p_comercio_id AND id=p_destinatario_id RETURNING * INTO e;
 IF NOT FOUND THEN RAISE EXCEPTION 'Comercio externo no disponible en este emisor'; END IF;
 RETURN to_jsonb(e)||jsonb_build_object('destinatario_comercio_id',e.id);
END $$;
CREATE FUNCTION public.generar_comprobante_licencia_externa(p_comercio_id uuid,p_destinatario_id uuid,p_periodo date,p_tipo_comprobante public.tipo_comprobante,p_iva numeric,p_vencimiento date,p_emisor_fiscal_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE e public.comercios_externos; c public.clientes; v public.ventas; previo uuid; pv integer; multi boolean; items jsonb; nombre text; documento text;
BEGIN
 IF auth.uid() IS NULL OR public.is_app_admin() IS DISTINCT FROM true OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sin permiso para facturar esta membresía externa' USING ERRCODE='42501'; END IF;
 IF p_periodo IS NULL OR NOT isfinite(p_periodo) OR extract(day FROM p_periodo)<>1 THEN RAISE EXCEPTION 'Seleccioná un mes válido'; END IF;
 IF p_tipo_comprobante IS NULL OR p_tipo_comprobante NOT IN ('recibo_x','factura_a','factura_b','factura_c') THEN RAISE EXCEPTION 'Tipo de comprobante no permitido'; END IF;
 IF p_iva IS NULL OR p_iva NOT IN (0,10.5,21,27) OR (p_tipo_comprobante IN ('recibo_x','factura_c') AND p_iva<>0) THEN RAISE EXCEPTION 'Revisá el IVA del comprobante'; END IF;
 IF p_vencimiento IS NULL OR NOT isfinite(p_vencimiento) OR p_vencimiento<(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date THEN RAISE EXCEPTION 'El vencimiento no puede ser anterior a hoy'; END IF;
 SELECT * INTO e FROM public.comercios_externos WHERE comercio_id=p_comercio_id AND id=p_destinatario_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Comercio externo no disponible en este emisor'; END IF;
 SELECT venta_id INTO previo FROM public.comercios_externos_comprobantes WHERE comercio_id=p_comercio_id AND externo_id=e.id AND periodo=p_periodo;
 IF previo IS NOT NULL THEN RETURN jsonb_build_object('venta_id',previo,'reutilizado',true); END IF;
 SELECT * INTO c FROM public.clientes WHERE id=e.cliente_id AND comercio_id=p_comercio_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'El cliente vinculado no está disponible en este emisor'; END IF;
 documento:=regexp_replace(coalesce(c.cuit,''),'[^0-9]','','g');
 IF p_tipo_comprobante<>'recibo_x' AND (documento !~ '^[0-9]{11}$' OR documento ~ '^([0-9])\1{10}$' OR nullif(btrim(c.situacion_afip),'') IS NULL) THEN RAISE EXCEPTION 'Completá los datos fiscales del cliente vinculado antes de emitir una factura'; END IF;
 SELECT coalesce((parametros->'funciones'->>'multiples_cuit')::boolean,false) INTO multi FROM public.comercio_parametrizacion WHERE comercio_id=p_comercio_id;
 IF coalesce(multi,false) THEN
  SELECT punto_venta INTO pv FROM public.emisores_fiscales WHERE id=p_emisor_fiscal_id AND comercio_id=p_comercio_id AND activo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seleccioná un emisor fiscal activo'; END IF;
 ELSE
  IF p_emisor_fiscal_id IS NOT NULL THEN RAISE EXCEPTION 'El comercio no tiene habilitados múltiples CUIT'; END IF;
  SELECT punto_venta INTO pv FROM public.afip_config WHERE comercio_id=p_comercio_id AND activo;
  IF pv IS NULL AND p_tipo_comprobante<>'recibo_x' THEN RAISE EXCEPTION 'Configurá ARCA antes de generar una factura'; END IF;
  pv:=coalesce(pv,1);
 END IF;
 nombre:=concat_ws(' ',nullif(btrim(c.nombre),''),nullif(btrim(c.apellido),''));
 items:=jsonb_build_array(jsonb_build_object('descripcion_manual',e.concepto,'cantidad',1,'precio_unitario',e.importe_mensual,'porcentaje_iva',p_iva,'afecta_stock',false));
 IF coalesce(multi,false) THEN
  SELECT * INTO v FROM public.registrar_venta_emisor_transaccional(p_comercio_id,p_tipo_comprobante,pv,c.id,nombre,'ARS','cta_cte',items,'[]'::jsonb,gen_random_uuid(),p_emisor_fiscal_id,p_observaciones=>'Membresía de '||e.nombre_comercio||' · '||to_char(p_periodo,'MM/YYYY'));
 ELSE
  SELECT * INTO v FROM public.registrar_venta_transaccional(p_comercio_id,p_tipo_comprobante,pv,c.id,nombre,'ARS','cta_cte',items,'[]'::jsonb,gen_random_uuid(),p_observaciones=>'Membresía de '||e.nombre_comercio||' · '||to_char(p_periodo,'MM/YYYY'));
 END IF;
 UPDATE public.ventas SET concepto_arca=2,servicio_desde=p_periodo,servicio_hasta=(p_periodo+interval '1 month - 1 day')::date,servicio_vencimiento_pago=p_vencimiento WHERE id=v.id AND comercio_id=p_comercio_id;
 INSERT INTO public.comercios_externos_comprobantes(comercio_id,externo_id,periodo,venta_id,importe,concepto) VALUES(p_comercio_id,e.id,p_periodo,v.id,e.importe_mensual,e.concepto)
 ON CONFLICT(comercio_id,externo_id,periodo) DO UPDATE SET venta_id=excluded.venta_id,importe=excluded.importe,concepto=excluded.concepto,created_at=now();
 RETURN jsonb_build_object('venta_id',v.id,'reutilizado',false);
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS firma,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('validar_comercio_externo','listar_comercios_externos','guardar_comercio_externo','eliminar_comercio_externo','consultar_licencia_externa','guardar_licencia_externa','generar_comprobante_licencia_externa') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.firma);
  IF f.proname<>'validar_comercio_externo' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.firma); END IF;
 END LOOP;
END $$;
-- Las cuentas configuradas pasan también por el guard central de la API.
-- Este acceso administrativo requiere ambas identidades: plataforma y emisor.
DO $$ DECLARE definicion text; ancla text:='r:=regexp_replace(ruta,''^.*/'','''');'; BEGIN
 IF to_regprocedure('public.vortex_solicitud_permitida(uuid)') IS NOT NULL THEN
  SELECT pg_get_functiondef('public.vortex_solicitud_permitida(uuid)'::regprocedure) INTO definicion;
  IF position(ancla IN definicion)=0 THEN RAISE EXCEPTION 'Revisar integración del guard administrativo de comercios externos'; END IF;
  definicion:=replace(definicion,ancla,ancla||' IF r IN (''listar_comercios_externos'',''guardar_comercio_externo'',''eliminar_comercio_externo'',''consultar_licencia_externa'',''guardar_licencia_externa'',''generar_comprobante_licencia_externa'',''consultar_licencia_comercio'',''guardar_licencia_comercio'',''generar_comprobante_licencia'') THEN RETURN public.is_app_admin() AND public.user_is_comercio_admin(c); END IF;');
  EXECUTE definicion;
 END IF;
END $$;
COMMIT;
