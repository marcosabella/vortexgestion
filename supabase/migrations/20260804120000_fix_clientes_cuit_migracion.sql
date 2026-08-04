-- Un CUIT solo identifica a un cliente cuando fue informado. La restriccion
-- historica global tambien trataba todos los textos vacios como el mismo CUIT.
ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS clientes_cuit_key;

CREATE UNIQUE INDEX IF NOT EXISTS clientes_comercio_cuit_unique
  ON public.clientes (comercio_id, btrim(cuit))
  WHERE btrim(cuit) <> '';

-- Conservamos la simulacion original y agregamos la validacion de CUIT
-- duplicado dentro del propio archivo antes de habilitar la aplicacion.
ALTER FUNCTION public.migracion_simular_maestros(uuid)
  RENAME TO migracion_simular_maestros_v1;

CREATE FUNCTION public.migracion_simular_maestros(p_migracion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.migracion_assert_admin();
  PERFORM public.migracion_simular_maestros_v1(p_migracion_id);

  WITH duplicados AS (
    SELECT id
    FROM (
      SELECT id,
             row_number() OVER (
               PARTITION BY migracion_id, btrim(datos->>'cuit')
               ORDER BY id
             ) AS posicion
      FROM public.migracion_staging_maestros
      WHERE migracion_id = p_migracion_id
        AND modulo = 'clientes'
        AND btrim(coalesce(datos->>'cuit', '')) <> ''
    ) filas
    WHERE posicion > 1
  )
  UPDATE public.migracion_staging_maestros AS s
  SET errores = array_append(s.errores, 'CUIT de cliente duplicado en el archivo'),
      estado = 'error',
      accion = NULL,
      destino_id = NULL
  FROM duplicados AS d
  WHERE s.id = d.id;

  UPDATE public.migracion_modulos AS mm
  SET registros_validos = (
        SELECT count(*) FROM public.migracion_staging_maestros AS s
        WHERE s.migracion_id = mm.migracion_id
          AND s.modulo = mm.modulo AND s.estado = 'valido'
      ),
      omitidos = (
        SELECT count(*) FROM public.migracion_staging_maestros AS s
        WHERE s.migracion_id = mm.migracion_id
          AND s.modulo = mm.modulo AND s.estado = 'omitido'
      ),
      errores = (
        SELECT count(*) FROM public.migracion_staging_maestros AS s
        WHERE s.migracion_id = mm.migracion_id
          AND s.modulo = mm.modulo AND s.estado = 'error'
      ),
      estado = CASE WHEN EXISTS (
        SELECT 1 FROM public.migracion_staging_maestros AS s
        WHERE s.migracion_id = mm.migracion_id
          AND s.modulo = mm.modulo AND s.estado = 'error'
      ) THEN 'requiere_revision'::public.migracion_modulo_estado
        ELSE 'listo'::public.migracion_modulo_estado END
  WHERE mm.migracion_id = p_migracion_id;

  SELECT jsonb_build_object(
    'total', count(*),
    'validos', count(*) FILTER (WHERE estado = 'valido'),
    'omitidos', count(*) FILTER (WHERE estado = 'omitido'),
    'errores', count(*) FILTER (WHERE estado = 'error'),
    'por_modulo', (
      SELECT jsonb_object_agg(modulo, datos)
      FROM (
        SELECT modulo, jsonb_build_object(
          'total', count(*),
          'validos', count(*) FILTER (WHERE estado = 'valido'),
          'omitidos', count(*) FILTER (WHERE estado = 'omitido'),
          'errores', count(*) FILTER (WHERE estado = 'error')
        ) AS datos
        FROM public.migracion_staging_maestros
        WHERE migracion_id = p_migracion_id
        GROUP BY modulo
      ) AS resumen_modulos
    )
  )
  INTO v_result
  FROM public.migracion_staging_maestros
  WHERE migracion_id = p_migracion_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.migracion_simular_maestros(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.migracion_simular_maestros(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.migracion_simular_maestros_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.migracion_simular_maestros_v1(uuid) FROM authenticated;
