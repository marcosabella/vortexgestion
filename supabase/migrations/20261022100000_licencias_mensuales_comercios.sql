-- Licencias facturadas por un comercio propio del administrador de plataforma.
-- comercio_id es el emisor; destinatario_comercio_id es el cliente de la licencia.
-- La relación entre empresas es intencional y solo la administra app_admins.
BEGIN;

ALTER TABLE public.ventas
  ADD COLUMN concepto_arca integer NOT NULL DEFAULT 1 CHECK (concepto_arca IN (1,2,3)),
  ADD COLUMN servicio_desde date,
  ADD COLUMN servicio_hasta date,
  ADD COLUMN servicio_vencimiento_pago date,
  ADD CONSTRAINT ventas_fechas_servicio_validas CHECK (
    concepto_arca = 1 OR (servicio_desde IS NOT NULL AND servicio_hasta IS NOT NULL
      AND servicio_vencimiento_pago IS NOT NULL AND servicio_hasta >= servicio_desde
      AND isfinite(servicio_desde) AND isfinite(servicio_hasta) AND isfinite(servicio_vencimiento_pago))
  );

CREATE TABLE public.licencias_comercios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  destinatario_comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  importe_mensual numeric(14,2) NOT NULL CHECK (importe_mensual > 0 AND importe_mensual <> 'NaN'::numeric),
  concepto text NOT NULL DEFAULT 'LICENCIA MENSUAL VORTEX' CHECK (length(btrim(concepto)) BETWEEN 1 AND 200),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comercio_id, destinatario_comercio_id),
  CHECK (comercio_id <> destinatario_comercio_id)
);
CREATE INDEX licencias_comercios_destinatario_idx ON public.licencias_comercios(destinatario_comercio_id);
CREATE INDEX licencias_comercios_cliente_idx ON public.licencias_comercios(cliente_id);

CREATE TABLE public.licencias_comprobantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  destinatario_comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  periodo date NOT NULL CHECK (isfinite(periodo) AND extract(day FROM periodo)=1),
  venta_id uuid REFERENCES public.ventas(id) ON DELETE SET NULL,
  importe numeric(14,2) NOT NULL CHECK (importe > 0 AND importe <> 'NaN'::numeric),
  concepto text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comercio_id, destinatario_comercio_id, periodo),
  UNIQUE (venta_id),
  FOREIGN KEY (comercio_id, destinatario_comercio_id)
    REFERENCES public.licencias_comercios(comercio_id, destinatario_comercio_id)
);
CREATE INDEX licencias_comprobantes_destinatario_idx ON public.licencias_comprobantes(destinatario_comercio_id,periodo DESC);

CREATE FUNCTION public.validar_licencia_tenant() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog,public AS $$
BEGIN
  IF TG_TABLE_NAME='licencias_comercios' THEN
    IF NEW.cliente_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=NEW.cliente_id AND comercio_id=NEW.comercio_id) THEN
      RAISE EXCEPTION 'El cliente de la licencia no pertenece al emisor';
    END IF;
  ELSE
    IF NEW.venta_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ventas WHERE id=NEW.venta_id AND comercio_id=NEW.comercio_id) THEN
      RAISE EXCEPTION 'El comprobante de la licencia no pertenece al emisor';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER validar_licencia_tenant BEFORE INSERT OR UPDATE ON public.licencias_comercios
  FOR EACH ROW EXECUTE FUNCTION public.validar_licencia_tenant();
CREATE TRIGGER validar_licencia_comprobante_tenant BEFORE INSERT OR UPDATE ON public.licencias_comprobantes
  FOR EACH ROW EXECUTE FUNCTION public.validar_licencia_tenant();

ALTER TABLE public.licencias_comercios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licencias_comprobantes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.licencias_comercios, public.licencias_comprobantes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.licencias_comercios, public.licencias_comprobantes TO authenticated;
GRANT ALL ON public.licencias_comercios, public.licencias_comprobantes TO service_role;
CREATE POLICY licencias_comercios_lectura ON public.licencias_comercios FOR SELECT TO authenticated
  USING (public.is_app_admin() AND public.user_is_comercio_admin(comercio_id));
CREATE POLICY licencias_comprobantes_lectura ON public.licencias_comprobantes FOR SELECT TO authenticated
  USING (public.is_app_admin() AND public.user_is_comercio_admin(comercio_id));

CREATE FUNCTION public.consultar_licencia_comercio(p_comercio_id uuid,p_destinatario_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_app_admin() IS DISTINCT FROM true OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'No tiene permisos para administrar licencias de este emisor' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object(
    'configuracion',(SELECT to_jsonb(l) FROM public.licencias_comercios l WHERE l.comercio_id=p_comercio_id AND l.destinatario_comercio_id=p_destinatario_id),
    'comprobantes',coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.periodo DESC) FROM (
      SELECT lc.*,v.numero_comprobante,v.tipo_comprobante,v.cae,v.cae_error
      FROM public.licencias_comprobantes lc LEFT JOIN public.ventas v ON v.id=lc.venta_id AND v.comercio_id=lc.comercio_id
      WHERE lc.comercio_id=p_comercio_id AND lc.destinatario_comercio_id=p_destinatario_id
      ORDER BY lc.periodo DESC LIMIT 24
    ) h),'[]'::jsonb)
  );
END; $$;

CREATE FUNCTION public.guardar_licencia_comercio(p_comercio_id uuid,p_destinatario_id uuid,p_importe numeric,p_concepto text DEFAULT 'LICENCIA MENSUAL VORTEX')
RETURNS public.licencias_comercios LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public AS $$
DECLARE l public.licencias_comercios;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_admin() IS DISTINCT FROM true OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'No tiene permisos para administrar licencias de este emisor' USING ERRCODE='42501';
  END IF;
  IF p_importe IS NULL OR p_importe::text IN ('NaN','Infinity','-Infinity') OR p_importe<=0 OR p_importe<>round(p_importe,2) THEN RAISE EXCEPTION 'Ingresá un importe mensual positivo, con hasta dos decimales'; END IF;
  IF p_concepto IS NULL OR length(btrim(p_concepto)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Ingresá el concepto de la licencia'; END IF;
  IF p_comercio_id=p_destinatario_id OR NOT EXISTS(SELECT 1 FROM public.comercio WHERE id=p_destinatario_id) THEN RAISE EXCEPTION 'Seleccioná un comercio destinatario diferente al emisor'; END IF;
  INSERT INTO public.licencias_comercios(comercio_id,destinatario_comercio_id,importe_mensual,concepto)
    VALUES(p_comercio_id,p_destinatario_id,p_importe,btrim(p_concepto))
    ON CONFLICT(comercio_id,destinatario_comercio_id) DO UPDATE SET importe_mensual=excluded.importe_mensual,concepto=excluded.concepto,updated_at=now()
    RETURNING * INTO l;
  RETURN l;
END; $$;

CREATE FUNCTION public.generar_comprobante_licencia(
  p_comercio_id uuid,p_destinatario_id uuid,p_periodo date,p_tipo_comprobante public.tipo_comprobante,
  p_iva numeric,p_vencimiento date,p_emisor_fiscal_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public AS $$
DECLARE
  l public.licencias_comercios; d public.comercio; v public.ventas; cl uuid; matches uuid[];
  v_cuit text; pv integer; multi boolean; datos jsonb; existente uuid;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_admin() IS DISTINCT FROM true OR public.user_is_comercio_admin(p_comercio_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'No tiene permisos para facturar licencias de este emisor' USING ERRCODE='42501';
  END IF;
  IF p_periodo IS NULL OR NOT isfinite(p_periodo) OR extract(day FROM p_periodo)<>1 THEN RAISE EXCEPTION 'Seleccioná un mes válido para facturar'; END IF;
  IF p_tipo_comprobante IS NULL OR p_tipo_comprobante NOT IN ('recibo_x','factura_a','factura_b','factura_c') THEN RAISE EXCEPTION 'Tipo de comprobante no permitido para licencias'; END IF;
  IF p_iva IS NULL OR p_iva NOT IN (0,10.5,21,27) OR (p_tipo_comprobante IN ('factura_c','recibo_x') AND p_iva<>0) THEN RAISE EXCEPTION 'Revisá el IVA del comprobante'; END IF;
  IF p_vencimiento IS NULL OR NOT isfinite(p_vencimiento) OR p_vencimiento<(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date THEN RAISE EXCEPTION 'El vencimiento de pago no puede ser anterior a hoy'; END IF;
  SELECT * INTO l FROM public.licencias_comercios WHERE comercio_id=p_comercio_id AND destinatario_comercio_id=p_destinatario_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Guardá el importe mensual antes de generar el comprobante'; END IF;
  -- El bloqueo de la configuración serializa reintentos y emisiones simultáneas.
  SELECT venta_id INTO existente FROM public.licencias_comprobantes WHERE comercio_id=p_comercio_id AND destinatario_comercio_id=p_destinatario_id AND periodo=p_periodo;
  IF existente IS NOT NULL THEN RETURN jsonb_build_object('venta_id',existente,'reutilizado',true); END IF;
  SELECT * INTO d FROM public.comercio WHERE id=p_destinatario_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comercio destinatario no disponible'; END IF;
  v_cuit:=regexp_replace(coalesce(d.cuit,''),'[^0-9]','','g');
  IF v_cuit !~ '^[0-9]{11}$' THEN RAISE EXCEPTION 'Completá un CUIT válido en el comercio destinatario'; END IF;
  IF p_tipo_comprobante<>'recibo_x' AND nullif(btrim(d.situacion_afip),'') IS NULL THEN RAISE EXCEPTION 'Completá la condición frente a ARCA del comercio destinatario'; END IF;
  cl:=l.cliente_id;
  IF cl IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('licencias:cliente:'||p_comercio_id::text||':'||v_cuit,0));
    SELECT array_agg(id) INTO matches FROM public.clientes WHERE comercio_id=p_comercio_id AND regexp_replace(clientes.cuit,'[^0-9]','','g')=v_cuit;
    IF cardinality(matches)>1 THEN RAISE EXCEPTION 'Hay varios clientes con este CUIT en el emisor; unificá sus datos antes de facturar'; END IF;
    cl:=matches[1];
    IF cl IS NULL THEN
      INSERT INTO public.clientes(comercio_id,nombre,apellido,cuit,calle,numero,codigo_postal,localidad,provincia,telefono,situacion_afip,tipo_persona)
      VALUES(p_comercio_id,d.nombre_comercio,'',v_cuit,coalesce(d.calle,''),coalesce(d.numero,''),coalesce(d.codigo_postal,''),coalesce(d.localidad,''),coalesce(d.provincia,''),d.telefono,coalesce(nullif(d.situacion_afip,''),'Consumidor Final'),CASE WHEN left(v_cuit,2) IN ('30','33','34') THEN 'juridica' ELSE 'fisica' END)
      RETURNING id INTO cl;
    END IF;
    UPDATE public.licencias_comercios SET cliente_id=cl WHERE id=l.id;
  END IF;
  SELECT coalesce((parametros->'funciones'->>'multiples_cuit')::boolean,false) INTO multi FROM public.comercio_parametrizacion WHERE comercio_id=p_comercio_id;
  IF coalesce(multi,false) THEN
    SELECT punto_venta INTO pv FROM public.emisores_fiscales WHERE id=p_emisor_fiscal_id AND comercio_id=p_comercio_id AND activo;
    IF NOT FOUND THEN RAISE EXCEPTION 'Seleccioná un emisor fiscal activo del comercio emisor'; END IF;
  ELSE
    IF p_emisor_fiscal_id IS NOT NULL THEN RAISE EXCEPTION 'El comercio no tiene habilitados múltiples CUIT'; END IF;
    SELECT punto_venta INTO pv FROM public.afip_config WHERE comercio_id=p_comercio_id AND activo;
    IF pv IS NULL AND p_tipo_comprobante<>'recibo_x' THEN RAISE EXCEPTION 'Configurá ARCA antes de generar una factura'; END IF;
    pv:=coalesce(pv,1);
  END IF;
  datos:=jsonb_build_array(jsonb_build_object('descripcion_manual',l.concepto,'cantidad',1,'precio_unitario',l.importe_mensual,'porcentaje_iva',p_iva,'afecta_stock',false));
  IF coalesce(multi,false) THEN
    SELECT * INTO v FROM public.registrar_venta_emisor_transaccional(
      p_comercio_id,p_tipo_comprobante,pv,cl,d.nombre_comercio,'ARS','cta_cte',datos,'[]'::jsonb,gen_random_uuid(),p_emisor_fiscal_id,
      p_observaciones=>'Licencia mensual Vortex · Período '||to_char(p_periodo,'MM/YYYY'));
  ELSE
    SELECT * INTO v FROM public.registrar_venta_transaccional(
      p_comercio_id,p_tipo_comprobante,pv,cl,d.nombre_comercio,'ARS','cta_cte',datos,'[]'::jsonb,gen_random_uuid(),
      p_observaciones=>'Licencia mensual Vortex · Período '||to_char(p_periodo,'MM/YYYY'));
  END IF;
  UPDATE public.ventas SET concepto_arca=2,servicio_desde=p_periodo,
    servicio_hasta=(p_periodo+interval '1 month - 1 day')::date,servicio_vencimiento_pago=p_vencimiento WHERE id=v.id AND comercio_id=p_comercio_id;
  INSERT INTO public.licencias_comprobantes(comercio_id,destinatario_comercio_id,periodo,venta_id,importe,concepto)
    VALUES(p_comercio_id,p_destinatario_id,p_periodo,v.id,l.importe_mensual,l.concepto)
    ON CONFLICT(comercio_id,destinatario_comercio_id,periodo) DO UPDATE SET venta_id=excluded.venta_id,importe=excluded.importe,concepto=excluded.concepto,created_at=now();
  RETURN jsonb_build_object('venta_id',v.id,'reutilizado',false);
END; $$;

REVOKE ALL ON FUNCTION public.consultar_licencia_comercio(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.guardar_licencia_comercio(uuid,uuid,numeric,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.generar_comprobante_licencia(uuid,uuid,date,public.tipo_comprobante,numeric,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.consultar_licencia_comercio(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_licencia_comercio(uuid,uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generar_comprobante_licencia(uuid,uuid,date,public.tipo_comprobante,numeric,date,uuid) TO authenticated;
COMMIT;
