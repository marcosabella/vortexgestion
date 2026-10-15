BEGIN;

CREATE TABLE public.recibos_pago_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  numero bigint NOT NULL CHECK (numero > 0),
  solicitud_id uuid NOT NULL,
  solicitud jsonb NOT NULL,
  fecha date NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  importe numeric(18,2) NOT NULL CHECK (importe > 0),
  moneda text NOT NULL,
  saldo_anterior numeric(18,2) NOT NULL,
  saldo_posterior numeric(18,2) NOT NULL,
  cliente_snapshot jsonb NOT NULL,
  comercio_snapshot jsonb NOT NULL,
  pagos jsonb NOT NULL,
  documentos jsonb NOT NULL,
  movimiento_ids uuid[] NOT NULL,
  observaciones text,
  anulado_en timestamptz,
  CHECK (saldo_posterior = saldo_anterior - importe),
  UNIQUE (comercio_id, numero),
  UNIQUE (comercio_id, solicitud_id)
);
CREATE INDEX recibos_pago_cliente_historial_idx ON public.recibos_pago_cliente(comercio_id, cliente_id, creado_en DESC);
CREATE INDEX recibos_pago_cliente_movimientos_idx ON public.recibos_pago_cliente USING gin(movimiento_ids);
ALTER TABLE public.recibos_pago_cliente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recibos_pago_cliente FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.recibos_pago_cliente TO authenticated;
CREATE POLICY recibos_pago_cliente_lectura ON public.recibos_pago_cliente
  FOR SELECT TO authenticated USING (public.user_belongs_to_comercio(comercio_id));

CREATE FUNCTION public.validar_recibo_pago_cliente() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id=NEW.cliente_id AND comercio_id=NEW.comercio_id)
     OR coalesce(cardinality(NEW.movimiento_ids),0)=0
     OR EXISTS (
       SELECT 1 FROM unnest(NEW.movimiento_ids) m(id)
       LEFT JOIN public.cuenta_corriente cc ON cc.id=m.id
       WHERE cc.id IS NULL OR cc.comercio_id IS DISTINCT FROM NEW.comercio_id
         OR cc.cliente_id IS DISTINCT FROM NEW.cliente_id OR cc.tipo_movimiento<>'credito'
     ) THEN RAISE EXCEPTION 'recibo_cliente_referencias_invalidas';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validar_recibo_pago_cliente() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validar_recibo_pago_cliente BEFORE INSERT OR UPDATE OF comercio_id,cliente_id,movimiento_ids
  ON public.recibos_pago_cliente FOR EACH ROW EXECUTE FUNCTION public.validar_recibo_pago_cliente();

-- El servidor conserva la identidad y el saldo de emisión. Nunca se reciben
-- importes de saldo ni datos del encabezado desde el navegador.
CREATE FUNCTION public.registrar_cobro_cliente_con_recibo(
  p_cliente_id uuid, p_venta_ids uuid[], p_fecha date,
  p_observaciones text, p_pagos jsonb, p_solicitud_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  c public.clientes;
  r public.recibos_pago_cliente;
  anteriores uuid[];
  nuevos uuid[];
  saldo numeric;
  importe numeric;
  moneda text;
  documentos jsonb;
  emisor jsonb;
BEGIN
  SELECT * INTO c FROM public.clientes WHERE id = p_cliente_id;
  IF NOT FOUND OR NOT public.user_belongs_to_comercio(c.comercio_id) THEN
    RAISE EXCEPTION 'cliente_no_disponible';
  END IF;
  IF p_solicitud_id IS NULL THEN RAISE EXCEPTION 'solicitud_recibo_requerida'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cuenta-cliente:pago:' || c.comercio_id::text || ':' || c.id::text, 0));
  -- Serializa también la numeración y los reintentos entre distintos clientes.
  PERFORM pg_advisory_xact_lock(hashtextextended('recibo-cliente:' || c.comercio_id::text, 0));
  SELECT * INTO r FROM public.recibos_pago_cliente
    WHERE comercio_id = c.comercio_id AND solicitud_id = p_solicitud_id;
  IF FOUND THEN
    IF r.cliente_id <> c.id THEN RAISE EXCEPTION 'solicitud_recibo_ya_utilizada'; END IF;
    IF r.solicitud IS DISTINCT FROM jsonb_build_object('ventas',p_venta_ids,'fecha',p_fecha,'observaciones',p_observaciones,'pagos',p_pagos) THEN
      RAISE EXCEPTION 'solicitud_recibo_datos_distintos';
    END IF;
    RETURN to_jsonb(r);
  END IF;
  PERFORM 1 FROM public.clientes WHERE id = c.id FOR UPDATE;
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]),
    coalesce(sum(CASE WHEN tipo_movimiento='debito' THEN monto ELSE -monto END),0)
  INTO anteriores, saldo FROM public.cuenta_corriente
  WHERE comercio_id=c.comercio_id AND cliente_id=c.id;

  PERFORM public.registrar_pagos_cliente_multi_documento(c.id,p_venta_ids,p_fecha,p_observaciones,p_pagos);

  SELECT array_agg(id), sum(monto), min(cc.moneda)
    INTO nuevos, importe, moneda FROM public.cuenta_corriente cc
    WHERE comercio_id=c.comercio_id AND cliente_id=c.id
      AND NOT EXISTS (SELECT 1 FROM unnest(anteriores) anterior(id) WHERE anterior.id=cc.id);
  IF coalesce(importe,0)<=0 THEN RAISE EXCEPTION 'recibo_sin_cobro'; END IF;
  SELECT jsonb_agg(jsonb_build_object('numero', v.numero_comprobante,'importe', d.importe) ORDER BY v.numero_comprobante)
    INTO documentos FROM (
      SELECT venta_id,sum(monto) importe FROM public.cuenta_corriente WHERE id=ANY(nuevos) GROUP BY venta_id
    ) d JOIN public.ventas v ON v.id=d.venta_id;
  SELECT jsonb_build_object(
    'id',t.id,'nombre_comercio',t.nombre_comercio,'calle',t.calle,'numero',t.numero,
    'localidad',t.localidad,'provincia',t.provincia,'codigo_postal',t.codigo_postal,
    'telefono',t.telefono,'cuit',t.cuit,'situacion_afip',t.situacion_afip,
    'ingresos_brutos',t.ingresos_brutos,'fecha_inicio_actividad',t.fecha_inicio_actividad,
    'logo_url',t.logo_url,'mostrar_razon_social_con_logo',t.mostrar_razon_social_con_logo
  ) INTO emisor FROM public.comercio t WHERE id=c.comercio_id;
  INSERT INTO public.recibos_pago_cliente(
    comercio_id,cliente_id,numero,solicitud_id,solicitud,fecha,importe,moneda,
    saldo_anterior,saldo_posterior,cliente_snapshot,comercio_snapshot,pagos,
    documentos,movimiento_ids,observaciones
  ) VALUES (
    c.comercio_id,c.id,(SELECT coalesce(max(numero),0)+1 FROM public.recibos_pago_cliente WHERE comercio_id=c.comercio_id),
    p_solicitud_id,jsonb_build_object('ventas',p_venta_ids,'fecha',p_fecha,'observaciones',p_observaciones,'pagos',p_pagos),
    coalesce(p_fecha,current_date),importe,coalesce(moneda,'ARS'),saldo,saldo-importe,
    jsonb_build_object('nombre',concat_ws(' ',c.nombre,c.apellido),'cuit',c.cuit,'telefono',c.telefono),
    emisor,p_pagos,coalesce(documentos,'[]'::jsonb),nuevos,nullif(trim(p_observaciones),'')
  ) RETURNING * INTO r;
  RETURN to_jsonb(r);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_cobro_cliente_con_recibo(uuid,uuid[],date,text,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_cobro_cliente_con_recibo(uuid,uuid[],date,text,jsonb,uuid) TO authenticated;

-- Si se revierte o altera alguna imputación, el original sigue consultable
-- pero deja de ser un comprobante vigente del importe recibido.
CREATE FUNCTION public.marcar_recibo_cliente_revertido() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at') THEN
    UPDATE public.recibos_pago_cliente SET anulado_en=coalesce(anulado_en,now())
      WHERE comercio_id=OLD.comercio_id AND movimiento_ids @> ARRAY[OLD.id];
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_recibo_cliente_revertido() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER marcar_recibo_cliente_revertido AFTER DELETE OR UPDATE ON public.cuenta_corriente
  FOR EACH ROW EXECUTE FUNCTION public.marcar_recibo_cliente_revertido();

COMMIT;
