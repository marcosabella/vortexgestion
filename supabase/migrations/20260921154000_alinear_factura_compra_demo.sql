-- Reparación contable puntual del comprobante demo cuya cabecera fue creada en $0.
-- La migración anterior reconstruyó el total desde sus renglones; aquí se alinea
-- únicamente su factura y el par deuda/pago automático del flujo legado.
DO $repair$
DECLARE
  v_compra_id uuid;
  v_factura_id uuid;
  v_total numeric(14, 2);
  v_total_anterior numeric(14, 2);
BEGIN
  SELECT id, total
    INTO v_compra_id, v_total
  FROM public.compras
  WHERE numero = 'OC-20260921140034322-C71C';

  IF v_compra_id IS NULL OR v_total <> 68000.00 THEN
    RETURN;
  END IF;

  SELECT id, total
    INTO v_factura_id, v_total_anterior
  FROM public.compras_facturas
  WHERE compra_id = v_compra_id;

  IF v_factura_id IS NULL OR v_total_anterior <> 100000.00 THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pagos_compra WHERE factura_id = v_factura_id
  ) OR (
    SELECT count(*)
    FROM public.cuenta_corriente_proveedores
    WHERE factura_id = v_factura_id
      AND monto = v_total_anterior
      AND tipo IN ('deuda', 'pago')
  ) <> 2 THEN
    RETURN;
  END IF;

  UPDATE public.compras_facturas
  SET total = v_total
  WHERE id = v_factura_id;

  UPDATE public.cuenta_corriente_proveedores
  SET monto = v_total
  WHERE factura_id = v_factura_id
    AND monto = v_total_anterior
    AND tipo IN ('deuda', 'pago');
END
$repair$;
