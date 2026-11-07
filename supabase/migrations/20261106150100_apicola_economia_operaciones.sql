BEGIN;
CREATE FUNCTION public.apicola_economia_operar(p_comercio uuid,p_accion text,p_datos jsonb,p_clave uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE d jsonb:=p_datos; r public.apicola_imputaciones; o public.apicola_operaciones;
 c public.compras; g public.gastos_egresos; v public.ventas;
 campana uuid; apiario uuid; documento uuid; f date; total numeric; asignado numeric; monto numeric; moneda text; snapshot jsonb:='{}'; resultado jsonb;
BEGIN
 IF NOT public.apicola_permiso(p_comercio,'admin') THEN RAISE EXCEPTION 'La economía apícola requiere administración y módulo habilitado' USING ERRCODE='42501'; END IF;
 IF p_clave IS NULL OR jsonb_typeof(d) IS DISTINCT FROM 'object' OR pg_column_size(d)>32768 THEN RAISE EXCEPTION 'Datos de operación inválidos'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('apicola:'||p_comercio::text,0));
 SELECT * INTO o FROM public.apicola_operaciones WHERE comercio_id=p_comercio AND clave=p_clave;
 IF FOUND THEN
  IF o.usuario_id<>auth.uid() OR o.accion<>'economia:'||p_accion OR o.datos<>d THEN RAISE EXCEPTION 'La clave de operación ya se usó con otros datos'; END IF;
  RETURN o.resultado;
 END IF;
 IF p_accion='imputar' THEN
  campana:=(d->>'campana_id')::uuid; apiario:=nullif(d->>'apiario_id','')::uuid; f:=(d->>'fecha')::date;
  monto:=(d->>'importe')::numeric; moneda:=d->>'moneda'; documento:=nullif(d->>'documento_id','')::uuid;
  IF monto IS NULL OR monto<=0 OR monto>=1000000000000 OR monto<>round(monto,2) THEN RAISE EXCEPTION 'Importe inválido: usá un valor positivo con hasta dos decimales'; END IF;
  IF f IS NULL OR f>current_date OR NOT EXISTS(SELECT 1 FROM public.apicola_campanas WHERE comercio_id=p_comercio AND id=campana AND estado='abierta' AND f BETWEEN fecha_inicio AND fecha_fin) THEN RAISE EXCEPTION 'Seleccioná una fecha dentro de una campaña abierta'; END IF;
  IF apiario IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.apicola_apiarios WHERE comercio_id=p_comercio AND id=apiario AND activo) THEN RAISE EXCEPTION 'Apiario inválido o inactivo'; END IF;
  IF d->>'origen'='compra' THEN
   SELECT * INTO c FROM public.compras WHERE comercio_id=p_comercio AND id=documento FOR UPDATE;
   IF NOT FOUND OR c.estado<>'recibida' OR c.fecha>f THEN RAISE EXCEPTION 'Compra inválida: debe estar recibida y no ser posterior a la imputación'; END IF;
   total:=c.total; moneda:='ARS'; snapshot:=jsonb_build_object('numero',c.numero,'fecha',c.fecha,'total',c.total,'moneda',moneda);
  ELSIF d->>'origen'='gasto' THEN
   SELECT * INTO g FROM public.gastos_egresos WHERE comercio_id=p_comercio AND id=documento FOR UPDATE;
   IF NOT FOUND OR g.fecha>f THEN RAISE EXCEPTION 'Gasto inválido o posterior a la imputación'; END IF;
   total:=g.monto; moneda:='ARS'; snapshot:=jsonb_build_object('numero',coalesce(g.numero_comprobante,g.concepto),'fecha',g.fecha,'total',g.monto,'moneda',moneda);
  ELSIF d->>'origen'='venta' THEN
   SELECT * INTO v FROM public.ventas WHERE comercio_id=p_comercio AND id=documento FOR UPDATE;
   IF NOT FOUND OR v.anulado_at IS NOT NULL OR v.tipo_comprobante::text LIKE 'nota_%' OR (v.fecha_venta AT TIME ZONE 'America/Argentina/Buenos_Aires')::date>f
     OR EXISTS(SELECT 1 FROM public.ventas n WHERE n.comercio_id=p_comercio AND n.comprobante_asociado_id=v.id AND n.tipo_comprobante::text LIKE 'nota_credito_%') THEN RAISE EXCEPTION 'Venta inválida, anulada, con nota de crédito o posterior a la imputación'; END IF;
   total:=v.total; moneda:=v.moneda; snapshot:=jsonb_build_object('numero',v.numero_comprobante,'fecha',v.fecha_venta,'total',v.total,'moneda',moneda,'cliente',v.cliente_nombre);
  ELSIF d->>'origen'='estimado' THEN
   IF documento IS NOT NULL THEN RAISE EXCEPTION 'Un costo estimado no lleva comprobante vinculado'; END IF;
  ELSE RAISE EXCEPTION 'Origen económico inválido'; END IF;
  IF d->>'origen'<>'estimado' THEN
   IF d->>'moneda' IS DISTINCT FROM moneda THEN RAISE EXCEPTION 'La moneda debe coincidir con la del comprobante'; END IF;
   SELECT coalesce(sum(importe),0) INTO asignado FROM public.apicola_imputaciones WHERE comercio_id=p_comercio AND estado='vigente'
    AND origen=d->>'origen'
    AND (compra_id=documento OR gasto_id=documento OR venta_id=documento);
   IF total IS NULL OR total<=0 OR total>=1000000000000 OR monto+asignado>total THEN RAISE EXCEPTION 'El importe supera el saldo sin imputar del comprobante'; END IF;
  END IF;
  INSERT INTO public.apicola_imputaciones(comercio_id,campana_id,apiario_id,fecha,tipo,origen,compra_id,gasto_id,venta_id,concepto,actividad,criterio,importe,moneda,documento_snapshot,creado_por)
  VALUES(p_comercio,campana,apiario,f,CASE WHEN d->>'origen'='venta' THEN 'ingreso' ELSE 'costo' END,d->>'origen',
   CASE WHEN d->>'origen'='compra' THEN documento END,CASE WHEN d->>'origen'='gasto' THEN documento END,CASE WHEN d->>'origen'='venta' THEN documento END,
   btrim(d->>'concepto'),d->>'actividad',btrim(d->>'criterio'),monto,moneda,snapshot,auth.uid()) RETURNING * INTO r;
 ELSIF p_accion='anular' THEN
  IF coalesce(length(btrim(d->>'motivo')),0) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'Indicá un motivo de anulación de 5 a 1000 caracteres'; END IF;
  UPDATE public.apicola_imputaciones SET estado='anulado',motivo_anulacion=btrim(d->>'motivo'),version=version+1,updated_at=now()
   WHERE comercio_id=p_comercio AND id=(d->>'id')::uuid AND version=(d->>'version')::integer AND estado='vigente' RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'La imputación cambió o no está disponible. Actualizá la pantalla'; END IF;
 ELSE RAISE EXCEPTION 'Operación económica inválida'; END IF;
 resultado:=to_jsonb(r);
 INSERT INTO public.apicola_operaciones VALUES(p_comercio,p_clave,'economia:'||p_accion,d,resultado,auth.uid(),now());
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.apicola_economia_operar(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apicola_economia_operar(uuid,text,jsonb,uuid) TO authenticated;

-- Sólo los documentos vinculados adquieren restricciones adicionales.
-- La fila del documento ya está bloqueada por UPDATE; no tomar el bloqueo de
-- comercio aquí evita invertir el orden comercio -> documento de la RPC.
CREATE FUNCTION public.apicola_proteger_documento_economico() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE asignado numeric; historicos integer; limite numeric; invalido boolean:=false;
BEGIN
 SELECT coalesce(sum(importe) FILTER(WHERE estado='vigente'),0),count(*) INTO asignado,historicos FROM public.apicola_imputaciones
  WHERE (TG_TABLE_NAME='compras' AND compra_id=OLD.id) OR (TG_TABLE_NAME='gastos_egresos' AND gasto_id=OLD.id) OR (TG_TABLE_NAME='ventas' AND venta_id=OLD.id);
 IF historicos>0 AND NEW.comercio_id IS DISTINCT FROM OLD.comercio_id THEN RAISE EXCEPTION 'El documento tiene historial apícola y no puede cambiar de comercio'; END IF;
 IF asignado>0 THEN
  IF TG_TABLE_NAME='compras' THEN limite:=(to_jsonb(NEW)->>'total')::numeric; invalido:=to_jsonb(NEW)->>'estado'<>'recibida';
  ELSIF TG_TABLE_NAME='gastos_egresos' THEN limite:=(to_jsonb(NEW)->>'monto')::numeric;
  ELSE limite:=(to_jsonb(NEW)->>'total')::numeric;
   invalido:=(to_jsonb(NEW)->>'moneda' IS DISTINCT FROM to_jsonb(OLD)->>'moneda') OR (to_jsonb(NEW)->>'anulado_at' IS NOT NULL) OR (to_jsonb(NEW)->>'tipo_comprobante' LIKE 'nota_%');
  END IF;
  IF limite IS NULL OR limite<asignado OR invalido THEN RAISE EXCEPTION 'El documento tiene importes imputados a Apícola. Anulá esas imputaciones antes de reducirlo, anularlo o cambiar su moneda'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.apicola_proteger_documento_economico() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER apicola_proteger_compra BEFORE UPDATE ON public.compras FOR EACH ROW EXECUTE FUNCTION public.apicola_proteger_documento_economico();
CREATE TRIGGER apicola_proteger_gasto BEFORE UPDATE ON public.gastos_egresos FOR EACH ROW EXECUTE FUNCTION public.apicola_proteger_documento_economico();
CREATE TRIGGER apicola_proteger_venta BEFORE UPDATE ON public.ventas FOR EACH ROW EXECUTE FUNCTION public.apicola_proteger_documento_economico();

CREATE FUNCTION public.apicola_proteger_nota_credito() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.comprobante_asociado_id IS NOT NULL AND NEW.tipo_comprobante::text LIKE 'nota_credito_%' THEN
  PERFORM 1 FROM public.ventas WHERE comercio_id=NEW.comercio_id AND id=NEW.comprobante_asociado_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.apicola_imputaciones WHERE comercio_id=NEW.comercio_id AND venta_id=NEW.comprobante_asociado_id AND estado='vigente') THEN RAISE EXCEPTION 'Anulá las imputaciones apícolas de la venta antes de asociar una nota de crédito'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.apicola_proteger_nota_credito() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER apicola_proteger_nota BEFORE INSERT OR UPDATE OF comprobante_asociado_id,tipo_comprobante ON public.ventas FOR EACH ROW EXECUTE FUNCTION public.apicola_proteger_nota_credito();
COMMIT;
