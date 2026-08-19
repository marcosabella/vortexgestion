-- La descripción enriquecida es una función optativa por comercio.
UPDATE public.comercio_parametrizacion
SET parametros = jsonb_set(
  parametros,
  '{funciones,descripcion_enriquecida_productos}',
  CASE
    WHEN comercio_id = '30e79cd0-360d-4a03-b634-bb7414ee505b'::uuid THEN 'true'::jsonb
    ELSE 'false'::jsonb
  END,
  true
);
