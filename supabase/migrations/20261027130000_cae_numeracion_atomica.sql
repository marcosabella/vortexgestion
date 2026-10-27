-- Infraestructura: no repara ni modifica ventas existentes al aplicar la migracion.
BEGIN;

-- Solo lo invocan las RPC fiscales privadas, dentro de la misma transaccion.
CREATE FUNCTION public.afip_preparar_numero_venta(p_venta_id uuid, p_comercio_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
  v public.ventas;
  ocupante public.ventas;
  intento public.afip_cae_intentos;
  libre bigint;
  numero text;
BEGIN
  -- Bloqueo corto, sin llamadas HTTP. Evita que altas/ediciones concurrentes
  -- ocupen el numero mientras se registra la reserva fiscal y se renumera.
  LOCK TABLE public.ventas, public.afip_cae_intentos IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v FROM public.ventas WHERE id=p_venta_id AND comercio_id=p_comercio_id FOR UPDATE;
  IF NOT FOUND OR nullif(trim(v.cae),'') IS NOT NULL THEN RAISE EXCEPTION 'cae_venta_no_disponible'; END IF;
  SELECT * INTO intento FROM public.afip_cae_intentos WHERE venta_id=v.id AND comercio_id=v.comercio_id;
  IF NOT FOUND OR intento.rechazado THEN RAISE EXCEPTION 'cae_intento_no_disponible'; END IF;
  IF intento.numero_secuencial>99999999 OR intento.punto_venta>9999 THEN RAISE EXCEPTION 'cae_numeracion_fuera_de_rango'; END IF;
  IF (intento.solicitud #>> '{FeDetReq,FECAEDetRequest,ImpTotal}')::numeric IS DISTINCT FROM v.total
    OR intento.solicitud #>> '{FeDetReq,FECAEDetRequest,CbteFch}' IS DISTINCT FROM
      to_char(v.fecha_venta AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYYMMDD')
    OR (intento.solicitud #>> '{FeCabReq,PtoVta}')::integer IS DISTINCT FROM intento.punto_venta
    OR (intento.solicitud #>> '{FeCabReq,CbteTipo}')::integer IS DISTINCT FROM intento.tipo_comprobante
    OR (intento.solicitud #>> '{FeDetReq,FECAEDetRequest,CbteDesde}')::bigint IS DISTINCT FROM intento.numero_secuencial
    OR (intento.solicitud #>> '{FeDetReq,FECAEDetRequest,CbteHasta}')::bigint IS DISTINCT FROM intento.numero_secuencial
  THEN RAISE EXCEPTION 'cae_venta_cambio_desde_solicitud'; END IF;
  IF v.emisor_fiscal_id IS NOT NULL AND (
    v.emisor_snapshot->>'cuit_emisor' IS DISTINCT FROM intento.cuit_emisor
    OR v.emisor_snapshot->>'ambiente' IS DISTINCT FROM intento.ambiente
    OR (v.emisor_snapshot->>'punto_venta')::integer IS DISTINCT FROM intento.punto_venta
  ) THEN RAISE EXCEPTION 'cae_emisor_no_coincide'; END IF;
  IF (CASE v.tipo_comprobante::text
    WHEN 'factura_a' THEN 1 WHEN 'factura_b' THEN 6 WHEN 'factura_c' THEN 11
    WHEN 'nota_credito_a' THEN 3 WHEN 'nota_credito_b' THEN 8 WHEN 'nota_credito_c' THEN 13
    WHEN 'nota_debito_a' THEN 2 WHEN 'nota_debito_b' THEN 7 WHEN 'nota_debito_c' THEN 12
    WHEN 'recibo_a' THEN 4 WHEN 'recibo_b' THEN 9 WHEN 'recibo_c' THEN 15 END)
    IS DISTINCT FROM intento.tipo_comprobante THEN RAISE EXCEPTION 'cae_tipo_no_coincide'; END IF;

  numero:=lpad(intento.punto_venta::text,4,'0')||'-'||lpad(intento.numero_secuencial::text,8,'0');
  SELECT * INTO ocupante FROM public.ventas
    WHERE comercio_id=v.comercio_id AND emisor_fiscal_id IS NOT DISTINCT FROM v.emisor_fiscal_id
      AND tipo_comprobante=v.tipo_comprobante AND id<>v.id
      AND public.ventas_punto_venta_canonico(numero_comprobante)=intento.punto_venta
      AND public.ventas_numero_secuencial_canonico(numero_comprobante)=intento.numero_secuencial
    FOR UPDATE;
  IF FOUND THEN
    -- Nunca desplazar una autorizacion ni un intento cuyo resultado pueda ser incierto.
    IF nullif(trim(ocupante.cae),'') IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.afip_cae_intentos WHERE venta_id=ocupante.id AND NOT rechazado
    ) THEN RAISE EXCEPTION 'cae_numero_ocupado_por_comprobante_fiscal: requiere conciliacion, no se envio a ARCA'; END IF;
    SELECT greatest(intento.numero_secuencial,
      coalesce((SELECT max(public.ventas_numero_secuencial_canonico(numero_comprobante)) FROM public.ventas
        WHERE comercio_id=v.comercio_id AND emisor_fiscal_id IS NOT DISTINCT FROM v.emisor_fiscal_id
          AND tipo_comprobante=v.tipo_comprobante
          AND public.ventas_punto_venta_canonico(numero_comprobante)=intento.punto_venta),0),
      coalesce((SELECT max(numero_secuencial) FROM public.afip_cae_intentos
        WHERE comercio_id=v.comercio_id AND cuit_emisor=intento.cuit_emisor AND ambiente=intento.ambiente
          AND punto_venta=intento.punto_venta AND tipo_comprobante=intento.tipo_comprobante),0)) + 1 INTO libre;
    IF libre>99999999 THEN RAISE EXCEPTION 'cae_numeracion_agotada'; END IF;
    UPDATE public.ventas SET numero_comprobante=lpad(intento.punto_venta::text,4,'0')||'-'||lpad(libre::text,8,'0'),
      punto_venta=intento.punto_venta,numero_secuencial=libre WHERE id=ocupante.id AND comercio_id=v.comercio_id;
    IF v.emisor_fiscal_id IS NOT NULL THEN
      INSERT INTO public.ventas_numeradores_emisores(comercio_id,emisor_fiscal_id,tipo_comprobante,punto_venta,ultimo_numero)
        VALUES(v.comercio_id,v.emisor_fiscal_id,v.tipo_comprobante,intento.punto_venta,libre)
        ON CONFLICT(comercio_id,emisor_fiscal_id,tipo_comprobante,punto_venta)
        DO UPDATE SET ultimo_numero=greatest(ventas_numeradores_emisores.ultimo_numero,EXCLUDED.ultimo_numero),updated_at=now();
    ELSE
      INSERT INTO public.ventas_numeradores(comercio_id,tipo_comprobante,punto_venta,ultimo_numero)
        VALUES(v.comercio_id,v.tipo_comprobante,intento.punto_venta,libre)
        ON CONFLICT(comercio_id,tipo_comprobante,punto_venta)
        DO UPDATE SET ultimo_numero=greatest(ventas_numeradores.ultimo_numero,EXCLUDED.ultimo_numero),updated_at=now();
    END IF;
  END IF;
  IF v.numero_comprobante IS DISTINCT FROM numero OR v.punto_venta IS DISTINCT FROM intento.punto_venta
    OR v.numero_secuencial IS DISTINCT FROM intento.numero_secuencial THEN
    UPDATE public.ventas SET numero_comprobante=numero,punto_venta=intento.punto_venta,
      numero_secuencial=intento.numero_secuencial WHERE id=v.id AND comercio_id=v.comercio_id;
  END IF;
END $$;

CREATE FUNCTION public.afip_reservar_cae(p_intento jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  LOCK TABLE public.ventas, public.afip_cae_intentos IN SHARE ROW EXCLUSIVE MODE;
  INSERT INTO public.afip_cae_intentos(venta_id,comercio_id,ambiente,cuit_emisor,punto_venta,tipo_comprobante,numero_secuencial,solicitud)
    VALUES((p_intento->>'venta_id')::uuid,(p_intento->>'comercio_id')::uuid,p_intento->>'ambiente',p_intento->>'cuit_emisor',
      (p_intento->>'punto_venta')::integer,(p_intento->>'tipo_comprobante')::integer,
      (p_intento->>'numero_secuencial')::bigint,p_intento->'solicitud');
  PERFORM public.afip_preparar_numero_venta((p_intento->>'venta_id')::uuid,(p_intento->>'comercio_id')::uuid);
END $$;

CREATE FUNCTION public.afip_guardar_cae(p_venta_id uuid,p_comercio_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE i public.afip_cae_intentos;
BEGIN
  LOCK TABLE public.ventas, public.afip_cae_intentos IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO i FROM public.afip_cae_intentos WHERE venta_id=p_venta_id AND comercio_id=p_comercio_id;
  IF NOT FOUND OR i.rechazado OR i.cae IS NULL OR i.cae !~ '^[0-9]{14}$' OR i.cae_vencimiento IS NULL
    THEN RAISE EXCEPTION 'cae_resultado_no_disponible'; END IF;
  PERFORM public.afip_preparar_numero_venta(p_venta_id,p_comercio_id);
  UPDATE public.ventas SET cae=i.cae,cae_vencimiento=i.cae_vencimiento,cae_solicitado_at=now(),cae_error=NULL
    WHERE id=p_venta_id AND comercio_id=p_comercio_id;
END $$;
REVOKE ALL ON FUNCTION public.afip_preparar_numero_venta(uuid,uuid),public.afip_reservar_cae(jsonb),public.afip_guardar_cae(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.afip_preparar_numero_venta(uuid,uuid),public.afip_reservar_cae(jsonb),public.afip_guardar_cae(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ventas_punto_venta_canonico(text),public.ventas_numero_secuencial_canonico(text) TO service_role;
COMMIT;
