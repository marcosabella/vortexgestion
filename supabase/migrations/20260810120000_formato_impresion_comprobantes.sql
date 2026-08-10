-- Agrega el formato de impresion configurable, conservando A4 como predeterminado.

ALTER TABLE public.comercio_parametrizacion
ALTER COLUMN parametros SET DEFAULT '{
  "modulos": {
    "caja": true,
    "clientes": true,
    "proveedores": true,
    "productos": true,
    "ventas": true,
    "presupuestos": true,
    "cuenta_corriente": true,
    "cheques": true,
    "bancos": true,
    "tarjetas": true,
    "afip": true,
    "seguridad": true,
    "listados": true
  },
  "funciones": {
    "venta_items_manuales": true,
    "descuentos_recargos": true,
    "facturacion_afip": true,
    "impresion_comprobantes": true,
    "impresion_etiquetas_productos": true,
    "exportacion_pdf": true
  },
  "impresion": {
    "formato_comprobante": "a4"
  }
}'::jsonb;

UPDATE public.comercio_parametrizacion
SET parametros = jsonb_set(
  parametros,
  '{impresion}',
  COALESCE(parametros->'impresion', '{"formato_comprobante":"a4"}'::jsonb),
  true
)
WHERE NOT (parametros ? 'impresion');
