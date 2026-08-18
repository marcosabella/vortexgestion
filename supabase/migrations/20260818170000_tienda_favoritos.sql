-- Favoritos personales de los clientes de la tienda online.
CREATE TABLE IF NOT EXISTS public.tienda_favoritos (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, producto_id)
);

ALTER TABLE public.tienda_favoritos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clientes ven sus favoritos" ON public.tienda_favoritos;
CREATE POLICY "Clientes ven sus favoritos"
ON public.tienda_favoritos FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Clientes agregan sus favoritos" ON public.tienda_favoritos;
CREATE POLICY "Clientes agregan sus favoritos"
ON public.tienda_favoritos FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Clientes quitan sus favoritos" ON public.tienda_favoritos;
CREATE POLICY "Clientes quitan sus favoritos"
ON public.tienda_favoritos FOR DELETE TO authenticated
USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.tienda_favoritos TO authenticated;
