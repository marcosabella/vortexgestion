-- Logos de comercios usados en comprobantes y reportes impresos.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comercio-logos',
  'comercio-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Usuarios pueden subir logo de su comercio" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios pueden leer logo de su comercio" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios pueden actualizar logo de su comercio" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios pueden eliminar logo de su comercio" ON storage.objects;

CREATE POLICY "Usuarios pueden leer logo de su comercio"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'comercio-logos'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND public.user_belongs_to_comercio(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Usuarios pueden subir logo de su comercio"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'comercio-logos'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND public.user_belongs_to_comercio(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Usuarios pueden actualizar logo de su comercio"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'comercio-logos'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND public.user_belongs_to_comercio(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'comercio-logos'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND public.user_belongs_to_comercio(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Usuarios pueden eliminar logo de su comercio"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'comercio-logos'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND public.user_belongs_to_comercio(((storage.foldername(name))[1])::uuid)
);
