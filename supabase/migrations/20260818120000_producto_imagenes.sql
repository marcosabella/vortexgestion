-- Imagenes opcionales para el catalogo. Cada producto puede tener hasta cinco.
CREATE TABLE IF NOT EXISTS public.producto_imagenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  orden smallint NOT NULL CHECK (orden BETWEEN 1 AND 5),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (producto_id, orden)
);

CREATE INDEX IF NOT EXISTS idx_producto_imagenes_producto_id ON public.producto_imagenes(producto_id, orden);

CREATE OR REPLACE FUNCTION public.validar_producto_imagen()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.productos
    WHERE id = NEW.producto_id AND comercio_id = NEW.comercio_id
  ) THEN
    RAISE EXCEPTION 'La imagen debe pertenecer al mismo comercio que el producto';
  END IF;

  IF TG_OP = 'INSERT' AND (SELECT count(*) FROM public.producto_imagenes WHERE producto_id = NEW.producto_id) >= 5 THEN
    RAISE EXCEPTION 'Un producto admite hasta cinco imagenes';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validar_producto_imagen_trigger ON public.producto_imagenes;
CREATE TRIGGER validar_producto_imagen_trigger
BEFORE INSERT OR UPDATE ON public.producto_imagenes
FOR EACH ROW EXECUTE FUNCTION public.validar_producto_imagen();

ALTER TABLE public.producto_imagenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver imagenes de productos de su comercio"
ON public.producto_imagenes FOR SELECT TO authenticated
USING (public.user_belongs_to_comercio(comercio_id));

CREATE POLICY "Usuarios pueden cargar imagenes de productos de su comercio"
ON public.producto_imagenes FOR INSERT TO authenticated
WITH CHECK (public.user_belongs_to_comercio(comercio_id));

CREATE POLICY "Usuarios pueden modificar imagenes de productos de su comercio"
ON public.producto_imagenes FOR UPDATE TO authenticated
USING (public.user_belongs_to_comercio(comercio_id))
WITH CHECK (public.user_belongs_to_comercio(comercio_id));

CREATE POLICY "Usuarios pueden eliminar imagenes de productos de su comercio"
ON public.producto_imagenes FOR DELETE TO authenticated
USING (public.user_belongs_to_comercio(comercio_id));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('producto-imagenes', 'producto-imagenes', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Usuarios pueden ver imagenes de productos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'producto-imagenes'
  AND public.user_belongs_to_comercio(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Usuarios pueden subir imagenes de productos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'producto-imagenes'
  AND public.user_belongs_to_comercio(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Usuarios pueden eliminar imagenes de productos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'producto-imagenes'
  AND public.user_belongs_to_comercio(((storage.foldername(name))[1])::uuid)
);

UPDATE public.comercio_parametrizacion
SET parametros = jsonb_set(
  parametros,
  '{funciones,imagenes_productos}',
  'true'::jsonb,
  true
)
WHERE NOT (COALESCE(parametros->'funciones', '{}'::jsonb) ? 'imagenes_productos');
