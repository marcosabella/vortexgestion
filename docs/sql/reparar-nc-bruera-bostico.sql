-- Reparacion de datos puntual. Ejecutar SOLO con autorizacion en el proyecto
-- de Bostico, despues de 20261030120000_notas_cuenta_corriente_signo.sql.
-- No cambia el comprobante fiscal. Ante diferencias, revierte toda la transaccion.
BEGIN;
LOCK TABLE public.cuenta_corriente IN SHARE ROW EXCLUSIVE MODE;

-- Suspension transaccional de la inmutabilidad para reparar este asiento.
ALTER TABLE public.cuenta_corriente DISABLE TRIGGER prevent_authorized_cuenta_corriente_changes;

DO $$
DECLARE
  v_venta public.ventas;
  v_movimiento public.cuenta_corriente;
  v_cantidad integer;
BEGIN
  SELECT count(*) INTO v_cantidad
  FROM public.ventas v JOIN public.clientes c ON c.id = v.cliente_id AND c.comercio_id = v.comercio_id
  WHERE v.comercio_id = 'a4983b26-4f3d-46e0-8e4f-46bd34fec838'
    AND public.ventas_punto_venta_canonico(v.numero_comprobante) = 6
    AND public.ventas_numero_secuencial_canonico(v.numero_comprobante) = 71
    AND v.tipo_comprobante = 'nota_credito_a' AND v.total = 12000
    AND (v.fecha_venta AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = DATE '2026-10-29'
    AND upper(regexp_replace(trim(concat_ws(' ', c.nombre, c.apellido)), '\s+', ' ', 'g')) = 'MARCELO BRUERA';
  IF v_cantidad <> 1 THEN RAISE EXCEPTION 'reparacion_nc_bruera_venta_no_univoca: %', v_cantidad; END IF;

  SELECT v.* INTO STRICT v_venta
  FROM public.ventas v
  WHERE v.comercio_id = 'a4983b26-4f3d-46e0-8e4f-46bd34fec838'
    AND public.ventas_punto_venta_canonico(v.numero_comprobante) = 6
    AND public.ventas_numero_secuencial_canonico(v.numero_comprobante) = 71
    AND v.tipo_comprobante = 'nota_credito_a' FOR UPDATE;

  SELECT count(*) INTO v_cantidad FROM public.cuenta_corriente
  WHERE venta_id = v_venta.id;
  IF v_cantidad <> 1 THEN RAISE EXCEPTION 'reparacion_nc_bruera_asiento_no_univoco: %', v_cantidad; END IF;
  SELECT * INTO STRICT v_movimiento FROM public.cuenta_corriente WHERE venta_id = v_venta.id FOR UPDATE;
  IF v_movimiento.comercio_id IS DISTINCT FROM v_venta.comercio_id
     OR v_movimiento.cliente_id IS DISTINCT FROM v_venta.cliente_id
     OR v_movimiento.monto <> 12000
     OR v_movimiento.concepto NOT IN ('pago_cuenta_corriente','venta_credito','nota_credito')
     OR v_movimiento.cheque_id IS NOT NULL THEN
    RAISE EXCEPTION 'reparacion_nc_bruera_asiento_inesperado';
  END IF;
  UPDATE public.cuenta_corriente SET tipo_movimiento = 'credito', concepto = 'nota_credito'
  WHERE id = v_movimiento.id AND (tipo_movimiento <> 'credito' OR concepto <> 'nota_credito');
  IF NOT EXISTS (SELECT 1 FROM public.cuenta_corriente WHERE id = v_movimiento.id
    AND tipo_movimiento = 'credito' AND concepto = 'nota_credito' AND monto = 12000) THEN
    RAISE EXCEPTION 'reparacion_nc_bruera_verificacion_fallida';
  END IF;
END;
$$;

ALTER TABLE public.cuenta_corriente ENABLE TRIGGER prevent_authorized_cuenta_corriente_changes;
COMMIT;
