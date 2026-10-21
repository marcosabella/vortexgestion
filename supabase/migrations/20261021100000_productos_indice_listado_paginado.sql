-- Optimiza el filtro por comercio y el orden estable de Inventario > Productos.
-- Solo agrega un índice; no cambia datos, permisos ni políticas RLS.
-- Aplicar en producción únicamente con autorización expresa.
CREATE INDEX IF NOT EXISTS idx_productos_comercio_created_at_id
  ON public.productos (comercio_id, created_at DESC, id DESC);
