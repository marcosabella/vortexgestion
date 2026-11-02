-- Reparacion puntual autorizada: recibo X de Berra, noviembre 2026, $55000.
-- No modifica importes, fechas, numeracion ni al cliente Sergio Flores.
-- Ejecutar despues de 20261102120000_licencias_cliente_sin_documento.sql.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE
  emisor constant uuid := '037c362e-555b-4b19-b257-5fd9c3a82203';
  destinatario constant uuid := 'ba927680-6870-4eca-a795-f5b72d51e7d9';
  sergio constant uuid := '37cae314-f5e7-43fd-ac02-5f887a25a2c3';
  venta constant uuid := 'e9fb04ae-0b81-4c43-a874-24a614fe3046';
  movimiento constant uuid := '5731287f-f9a4-461a-b04e-8e5c9255d331';
  l public.licencias_comercios;
  d public.comercio;
  v public.ventas;
  m public.cuenta_corriente;
  clientes uuid[];
  berra uuid;
  saldo_sergio numeric;
  saldo_berra numeric;
  administrador uuid;
BEGIN
  -- Contexto transaccional de un administrador existente del emisor, para
  -- conservar activos los triggers de pertenencia al crear el cliente.
  SELECT cu.user_id INTO administrador FROM public.comercio_usuarios cu
    JOIN public.app_admins aa ON aa.user_id=cu.user_id
    WHERE cu.comercio_id=emisor AND cu.rol='admin' AND cu.activo AND NOT cu.solo_restaurante
    ORDER BY cu.user_id LIMIT 1;
  IF administrador IS NULL THEN RAISE EXCEPTION 'No hay administrador habilitado del emisor'; END IF;
  PERFORM set_config('request.jwt.claim.sub',administrador::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',administrador,'role','authenticated')::text,true);
  IF public.user_belongs_to_comercio(emisor) IS DISTINCT FROM true
     OR public.user_is_comercio_admin(emisor) IS DISTINCT FROM true
     OR public.is_app_admin() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'No se confirmo el contexto administrativo del emisor';
  END IF;
  SELECT * INTO STRICT l FROM public.licencias_comercios
    WHERE comercio_id=emisor AND destinatario_comercio_id=destinatario FOR UPDATE;
  SELECT * INTO STRICT d FROM public.comercio WHERE id=destinatario FOR SHARE;
  SELECT * INTO STRICT v FROM public.ventas WHERE id=venta AND comercio_id=emisor FOR UPDATE;
  SELECT * INTO STRICT m FROM public.cuenta_corriente WHERE id=movimiento AND comercio_id=emisor FOR UPDATE;
  IF d.nombre_comercio<>'BERRA EXTINTORES' OR d.cuit<>'00000000000'
     OR v.numero_comprobante<>'0003-00000005' OR v.tipo_comprobante<>'recibo_x'
     OR v.total<>55000 OR v.tipo_pago<>'cta_cte' OR nullif(btrim(v.cae),'') IS NOT NULL
     OR v.cliente_nombre<>'BERRA EXTINTORES'
     OR (v.fecha_venta AT TIME ZONE 'America/Argentina/Buenos_Aires')::date<>'2026-11-02'::date
     OR m.venta_id IS DISTINCT FROM venta OR m.monto<>55000 OR m.tipo_movimiento<>'debito'
     OR m.concepto<>'pago_cuenta_corriente' OR m.cheque_id IS NOT NULL
     OR m.cliente_id IS DISTINCT FROM v.cliente_id OR l.cliente_id IS DISTINCT FROM v.cliente_id THEN
    RAISE EXCEPTION 'Estado inesperado del comprobante Berra: se revierte la reparacion';
  END IF;
  IF (SELECT count(*) FROM public.cuenta_corriente WHERE venta_id=venta)<>1
     OR (SELECT count(*) FROM public.pagos_venta WHERE venta_id=venta)<>1
     OR NOT EXISTS(SELECT 1 FROM public.pagos_venta WHERE venta_id=venta
       AND comercio_id=emisor AND tipo_pago='cta_cte' AND monto=55000)
     OR NOT EXISTS(SELECT 1 FROM public.licencias_comprobantes
       WHERE venta_id=venta AND comercio_id=emisor AND destinatario_comercio_id=destinatario
         AND periodo='2026-11-01'::date AND importe=55000)
     OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=sergio AND comercio_id=emisor
       AND nombre='SERGIO' AND apellido='FLORES' AND cuit='00000000000') THEN
    RAISE EXCEPTION 'Referencias o cobros inesperados: se revierte la reparacion';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('licencias:cliente:'||emisor::text||':00000000000',0));
  SELECT array_agg(c.id) INTO clientes FROM public.clientes c
    WHERE c.comercio_id=emisor AND c.nombre='BERRA EXTINTORES'
      AND coalesce(btrim(c.apellido),'')='' AND coalesce(btrim(c.cuit),'')='';
  IF cardinality(clientes)>1 THEN RAISE EXCEPTION 'Cliente Berra no univoco'; END IF;
  berra:=clientes[1];
  IF v.cliente_id=berra AND berra IS NOT NULL THEN RETURN; END IF;
  IF v.cliente_id IS DISTINCT FROM sergio THEN RAISE EXCEPTION 'El cliente original ya cambio'; END IF;
  IF berra IS NULL THEN
    INSERT INTO public.clientes(comercio_id,nombre,apellido,cuit,calle,numero,codigo_postal,localidad,provincia,telefono,situacion_afip,tipo_persona)
    VALUES(emisor,d.nombre_comercio,'','',coalesce(d.calle,''),coalesce(d.numero,''),coalesce(d.codigo_postal,''),
      coalesce(d.localidad,''),coalesce(d.provincia,''),d.telefono,coalesce(nullif(d.situacion_afip,''),'Consumidor Final'),'fisica')
    RETURNING id INTO berra;
  END IF;
  IF EXISTS(SELECT 1 FROM public.licencias_comercios WHERE comercio_id=emisor AND cliente_id=berra
    AND destinatario_comercio_id<>destinatario) THEN RAISE EXCEPTION 'Cliente Berra vinculado a otro comercio'; END IF;
  SELECT coalesce(sum(CASE WHEN tipo_movimiento='debito' THEN monto ELSE -monto END),0)
    INTO saldo_sergio FROM public.cuenta_corriente WHERE comercio_id=emisor AND cliente_id=sergio;
  SELECT coalesce(sum(CASE WHEN tipo_movimiento='debito' THEN monto ELSE -monto END),0)
    INTO saldo_berra FROM public.cuenta_corriente WHERE comercio_id=emisor AND cliente_id=berra;
  UPDATE public.ventas SET cliente_id=berra WHERE id=venta AND comercio_id=emisor;
  UPDATE public.cuenta_corriente SET cliente_id=berra WHERE id=movimiento AND comercio_id=emisor;
  UPDATE public.licencias_comercios SET cliente_id=berra,updated_at=now() WHERE id=l.id AND comercio_id=emisor;
  IF NOT EXISTS(SELECT 1 FROM public.ventas comprobante JOIN public.cuenta_corriente cc ON cc.venta_id=comprobante.id
    WHERE comprobante.id=venta AND cc.id=movimiento AND comprobante.cliente_id=berra AND cc.cliente_id=berra
      AND comprobante.total=55000 AND cc.monto=55000 AND cc.tipo_movimiento='debito')
    OR (SELECT coalesce(sum(CASE WHEN tipo_movimiento='debito' THEN monto ELSE -monto END),0)
      FROM public.cuenta_corriente WHERE comercio_id=emisor AND cliente_id=sergio)<>saldo_sergio-55000
    OR (SELECT coalesce(sum(CASE WHEN tipo_movimiento='debito' THEN monto ELSE -monto END),0)
      FROM public.cuenta_corriente WHERE comercio_id=emisor AND cliente_id=berra)<>saldo_berra+55000 THEN
    RAISE EXCEPTION 'No se confirmo la reimputacion: se revierte toda la reparacion';
  END IF;
END;
$$;
COMMIT;
