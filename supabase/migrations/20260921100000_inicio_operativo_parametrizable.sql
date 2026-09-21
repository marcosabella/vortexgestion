-- Mantiene el inicio operativo deshabilitado en comercios existentes.
-- La habilitación y sus tarjetas se gestionan exclusivamente desde Administración de comercios.
UPDATE public.comercio_parametrizacion
SET parametros = jsonb_set(
  parametros,
  '{inicio}',
  '{"habilitado": false, "tarjetas": {"ventas_hoy": true, "caja_actual": true, "stock_critico": true, "cuenta_corriente": true, "cheques_proximos": true}}'::jsonb,
  true
)
WHERE NOT (parametros ? 'inicio');
