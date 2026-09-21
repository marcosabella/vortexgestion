-- Conserva los comprobantes históricos y exige el formato canónico en altas
-- y modificaciones nuevas, tanto en la compra como en la factura asociada.
ALTER TABLE public.compras
  ADD CONSTRAINT compras_factura_numero_formato
  CHECK (
    factura_numero IS NULL
    OR factura_numero ~ '^[0-9]{4}-[0-9]{8}$'
  ) NOT VALID;

ALTER TABLE public.compras_facturas
  ADD CONSTRAINT compras_facturas_numero_formato
  CHECK (numero_comprobante ~ '^[0-9]{4}-[0-9]{8}$') NOT VALID;
