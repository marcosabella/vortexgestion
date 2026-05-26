-- Corregir current_comercio_id: PostgreSQL no soporta min(uuid).

CREATE OR REPLACE FUNCTION public.current_comercio_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claim_comercio_id uuid;
  membership_count integer;
  only_comercio_id uuid;
BEGIN
  BEGIN
    claim_comercio_id := NULLIF(auth.jwt() -> 'app_metadata' ->> 'comercio_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    claim_comercio_id := NULL;
  END;

  IF claim_comercio_id IS NOT NULL
     AND public.user_belongs_to_comercio(claim_comercio_id) THEN
    RETURN claim_comercio_id;
  END IF;

  SELECT count(*)
  INTO membership_count
  FROM public.comercio_usuarios
  WHERE user_id = auth.uid()
    AND activo = true;

  IF membership_count = 1 THEN
    SELECT comercio_id
    INTO only_comercio_id
    FROM public.comercio_usuarios
    WHERE user_id = auth.uid()
      AND activo = true
    ORDER BY created_at ASC
    LIMIT 1;

    RETURN only_comercio_id;
  END IF;

  RETURN NULL;
END;
$$;
