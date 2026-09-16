CREATE TABLE public.tienda_configuraciones (
  comercio_id uuid PRIMARY KEY REFERENCES public.comercio(id) ON DELETE CASCADE,
  contenido jsonb NOT NULL DEFAULT '{"banner":{"activo":false,"texto":"","enlace":"","imagen_path":""},"identidad":{"color_primario":"#111827","color_acento":"#d65e37","titulo_portada":""},"contacto":{"instagram":"","facebook":"","horarios":""},"envios":{"condiciones":""},"ayuda":{"cambios":"","pagos":"","preguntas":""}}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.tienda_configuraciones(comercio_id) SELECT id FROM public.comercio ON CONFLICT DO NOTHING;
ALTER TABLE public.tienda_configuraciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY tienda_configuracion_publica ON public.tienda_configuraciones FOR SELECT TO anon,authenticated USING (true);
CREATE POLICY tienda_configuracion_gestion ON public.tienda_configuraciones FOR ALL TO authenticated USING (public.user_belongs_to_comercio(comercio_id)) WITH CHECK (public.user_belongs_to_comercio(comercio_id));
CREATE TRIGGER update_tienda_configuraciones_updated_at BEFORE UPDATE ON public.tienda_configuraciones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
