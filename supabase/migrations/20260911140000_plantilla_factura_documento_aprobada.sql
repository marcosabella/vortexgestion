ALTER TABLE public.whatsapp_comercios
  ALTER COLUMN plantilla_factura_nombre SET DEFAULT 'factura_documento',
  ALTER COLUMN plantilla_factura_estado SET DEFAULT 'aprobada';

UPDATE public.whatsapp_comercios
SET
  plantilla_factura_nombre = 'factura_documento',
  plantilla_factura_estado = 'aprobada'
WHERE plantilla_factura_nombre = 'envio_factura'
   OR plantilla_factura_estado = 'pendiente';
