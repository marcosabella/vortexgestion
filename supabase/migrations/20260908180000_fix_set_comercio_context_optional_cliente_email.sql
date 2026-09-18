-- Corrige el acceso al email de cliente en el trigger compartido de aislamiento.
-- La excepcion de cliente online se conserva sin asumir columnas de otras tablas.
BEGIN;

CREATE OR REPLACE FUNCTION public.set_comercio_id_from_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  resolved_comercio_id uuid;
  cliente_email text;
BEGIN
  IF NEW.comercio_id IS NOT NULL THEN
    IF public.user_belongs_to_comercio(NEW.comercio_id) THEN
      RETURN NEW;
    END IF;

    -- Solo clientes conserva la excepcion para el comprador autenticado.
    -- to_jsonb permite leer el campo opcional sin acceso directo al record en
    -- tablas cuyo registro no tiene esa columna.
    IF TG_TABLE_NAME = 'clientes' THEN
      cliente_email := lower(btrim(to_jsonb(NEW) ->> 'email'));

      IF EXISTS (
        SELECT 1
        FROM auth.users AS u
        WHERE u.id = auth.uid()
          AND lower(btrim(u.email)) = cliente_email
          AND u.raw_user_meta_data ->> 'comercio_id' = NEW.comercio_id::text
      ) THEN
        RETURN NEW;
      END IF;
    END IF;

    RAISE EXCEPTION 'El usuario no pertenece al comercio indicado';
  END IF;

  resolved_comercio_id := public.current_comercio_id();
  IF resolved_comercio_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo resolver el comercio del usuario autenticado';
  END IF;

  NEW.comercio_id := resolved_comercio_id;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_comercio_id_from_context()
  FROM PUBLIC, anon, authenticated;

COMMIT;
