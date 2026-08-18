-- Diagnóstico estructural: informa nombres de campos, no sus valores.
DO $$
DECLARE
  v_keys text;
  v_direccion boolean;
  v_localidad boolean;
BEGIN
  SELECT string_agg(key, ', ' ORDER BY key),
         bool_or(key IN ('direccion', 'domicilio', 'calle', 'address', 'street_address')),
         bool_or(key IN ('localidad', 'ciudad', 'city', 'address_level2'))
  INTO v_keys, v_direccion, v_localidad
  FROM auth.users u
  CROSS JOIN LATERAL jsonb_object_keys(coalesce(u.raw_user_meta_data, '{}'::jsonb)) AS key
  WHERE coalesce(u.raw_user_meta_data, '{}'::jsonb)::text ILIKE '%abella%';

  RAISE NOTICE 'Campos Auth de Abella: [%]. Tiene dirección: %. Tiene localidad: %',
    coalesce(v_keys, ''), coalesce(v_direccion, false), coalesce(v_localidad, false);
END;
$$;

