BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.afip_config
    WHERE comercio_id IS NULL
  ) THEN
    RAISE EXCEPTION 'afip_config_comercio_requerido';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.afip_config
    WHERE cuit_emisor !~ '^[0-9]{11}$'
  ) THEN
    RAISE EXCEPTION 'afip_config_cuit_incompatible';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.afip_config
    WHERE punto_venta NOT BETWEEN 1 AND 9999
  ) THEN
    RAISE EXCEPTION 'afip_config_punto_venta_incompatible';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.afip_config
    WHERE activo IS TRUE
    GROUP BY comercio_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'afip_config_activa_duplicada';
  END IF;
END;
$$;

-- La configuracion comercial habilita numeracion; las credenciales se validan
-- exclusivamente al solicitar CAE.
ALTER TABLE public.afip_config
  DROP CONSTRAINT IF EXISTS afip_config_punto_venta_rango,
  ADD CONSTRAINT afip_config_punto_venta_rango
    CHECK (punto_venta BETWEEN 1 AND 9999),
  DROP CONSTRAINT IF EXISTS afip_config_cuit_emisor_11_digitos,
  ADD CONSTRAINT afip_config_cuit_emisor_11_digitos
    CHECK (cuit_emisor ~ '^[0-9]{11}$');

CREATE UNIQUE INDEX IF NOT EXISTS afip_config_una_activa_por_comercio
  ON public.afip_config (comercio_id)
  WHERE activo IS TRUE;

COMMENT ON INDEX public.afip_config_una_activa_por_comercio IS
  'Una configuracion comercial activa por comercio; certificado y clave no son requeridos para numeracion.';

COMMIT;
