CREATE TABLE public.tienda_landing_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE CASCADE,
  imagen_path text NOT NULL UNIQUE,
  titulo text NOT NULL DEFAULT '',
  subtitulo text NOT NULL DEFAULT '',
  enlace text,
  orden smallint NOT NULL DEFAULT 1 CHECK (orden BETWEEN 1 AND 20),
  publicado boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tienda_landing_slides_comercio_orden ON public.tienda_landing_slides(comercio_id, publicado, orden);
ALTER TABLE public.tienda_landing_slides ENABLE ROW LEVEL SECURITY;
CREATE POLICY tienda_landing_slides_publicos ON public.tienda_landing_slides FOR SELECT TO anon, authenticated USING (publicado);
CREATE POLICY tienda_landing_slides_gestion ON public.tienda_landing_slides FOR ALL TO authenticated USING (public.user_belongs_to_comercio(comercio_id)) WITH CHECK (public.user_belongs_to_comercio(comercio_id));
CREATE TRIGGER update_tienda_landing_slides_updated_at BEFORE UPDATE ON public.tienda_landing_slides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('tienda-landing','tienda-landing',true,5242880,ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY tienda_landing_archivos_publicos ON storage.objects FOR SELECT TO anon,authenticated USING (bucket_id='tienda-landing');
CREATE POLICY tienda_landing_archivos_gestion ON storage.objects FOR ALL TO authenticated USING (bucket_id='tienda-landing' AND public.user_belongs_to_comercio(((storage.foldername(name))[1])::uuid)) WITH CHECK (bucket_id='tienda-landing' AND public.user_belongs_to_comercio(((storage.foldername(name))[1])::uuid));
