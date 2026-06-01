-- Agrega la funcion de impresion de etiquetas de productos a parametrizaciones existentes.

UPDATE public.comercio_parametrizacion
SET parametros = jsonb_set(
  COALESCE(parametros, '{}'::jsonb),
  '{funciones,impresion_etiquetas_productos}',
  'true'::jsonb,
  true
)
WHERE NOT (COALESCE(parametros->'funciones', '{}'::jsonb) ? 'impresion_etiquetas_productos');

