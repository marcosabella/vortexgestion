-- Corrige futuras emisiones. No reimputa datos historicos.
BEGIN;

CREATE OR REPLACE FUNCTION public.generar_comprobante_licencia(
  p_comercio_id uuid,p_destinatario_id uuid,p_periodo date,p_tipo_comprobante public.tipo_comprobante,
  p_iva numeric,p_vencimiento date,p_emisor_fiscal_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public AS $$
DECLARE
  l public.licencias_comercios; d public.comercio; v public.ventas; cl uuid; matches uuid[];
  v_cuit text; cuit_identificable boolean; pv integer; multi boolean; datos jsonb; existente uuid;
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
  -- Los documentos de relleno no identifican a un cliente (por ejemplo 00000000000).
  cuit_identificable:=v_cuit !~ '^([0-9])\1{10}$';
  IF NOT cuit_identificable AND p_tipo_comprobante<>'recibo_x' THEN
    RAISE EXCEPTION 'Completa un CUIT real en el comercio destinatario para emitir una factura fiscal';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('licencias:cliente:'||p_comercio_id::text||':'||v_cuit,0));
  cl:=l.cliente_id;
  -- Revisar vinculos anteriores sin modificar al cliente ajeno ni sus movimientos.
  IF cl IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id=cl AND c.comercio_id=p_comercio_id
      AND regexp_replace(c.cuit,'[^0-9]','','g')=v_cuit
      AND (cuit_identificable OR
        lower(btrim(concat_ws(' ',nullif(btrim(c.nombre),''),nullif(btrim(c.apellido),''))))=lower(btrim(d.nombre_comercio)))
      AND NOT EXISTS (
        SELECT 1 FROM public.licencias_comercios otra
        WHERE otra.comercio_id=p_comercio_id AND otra.cliente_id=c.id
          AND otra.destinatario_comercio_id<>p_destinatario_id
      )
  ) THEN
    cl:=NULL;
  END IF;
  IF cl IS NULL THEN
    -- Un CUIT generico nunca permite reutilizar automaticamente un cliente.
    SELECT array_agg(c.id) INTO matches FROM public.clientes c
    WHERE c.comercio_id=p_comercio_id AND cuit_identificable
      AND regexp_replace(c.cuit,'[^0-9]','','g')=v_cuit
      AND NOT EXISTS (
        SELECT 1 FROM public.licencias_comercios otra
        WHERE otra.comercio_id=p_comercio_id AND otra.cliente_id=c.id
          AND otra.destinatario_comercio_id<>p_destinatario_id
      );
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


REVOKE ALL ON FUNCTION public.generar_comprobante_licencia(uuid,uuid,date,public.tipo_comprobante,numeric,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generar_comprobante_licencia(uuid,uuid,date,public.tipo_comprobante,numeric,date,uuid) TO authenticated;
COMMIT;
