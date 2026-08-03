-- Modelo de control para futuras migraciones Access.
-- Esta etapa NO importa ni modifica datos comerciales.

CREATE TYPE public.migracion_estado AS ENUM (
  'borrador', 'subido', 'analizando', 'listo', 'importando',
  'completado', 'completado_con_errores', 'fallido', 'cancelado'
);

CREATE TYPE public.migracion_modulo_estado AS ENUM (
  'pendiente', 'compatible', 'requiere_revision', 'no_disponible',
  'listo', 'importando', 'completado', 'completado_con_errores', 'fallido', 'omitido'
);

CREATE TABLE public.migraciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  archivo_nombre text NOT NULL,
  archivo_hash text,
  archivo_tamano bigint CHECK (archivo_tamano IS NULL OR archivo_tamano >= 0),
  storage_path text,
  estado public.migracion_estado NOT NULL DEFAULT 'borrador',
  resumen jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CONSTRAINT migraciones_storage_privado CHECK (
    storage_path IS NULL OR storage_path LIKE comercio_id::text || '/' || id::text || '/%'
  )
);

CREATE TABLE public.migracion_modulos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migracion_id uuid NOT NULL REFERENCES public.migraciones(id) ON DELETE CASCADE,
  modulo text NOT NULL,
  tabla_origen text NOT NULL,
  tabla_destino text,
  estado public.migracion_modulo_estado NOT NULL DEFAULT 'pendiente',
  dependencias text[] NOT NULL DEFAULT '{}',
  registros_origen bigint NOT NULL DEFAULT 0 CHECK (registros_origen >= 0),
  registros_validos bigint NOT NULL DEFAULT 0 CHECK (registros_validos >= 0),
  insertados bigint NOT NULL DEFAULT 0 CHECK (insertados >= 0),
  actualizados bigint NOT NULL DEFAULT 0 CHECK (actualizados >= 0),
  omitidos bigint NOT NULL DEFAULT 0 CHECK (omitidos >= 0),
  errores bigint NOT NULL DEFAULT 0 CHECK (errores >= 0),
  diagnostico jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (migracion_id, modulo)
);

CREATE TABLE public.migracion_id_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migracion_id uuid NOT NULL REFERENCES public.migraciones(id) ON DELETE CASCADE,
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  entidad text NOT NULL,
  id_origen text NOT NULL,
  id_destino uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (migracion_id, entidad, id_origen)
);

CREATE INDEX idx_migraciones_comercio ON public.migraciones(comercio_id, created_at DESC);
CREATE INDEX idx_migraciones_estado ON public.migraciones(estado);
CREATE INDEX idx_migracion_modulos_migracion ON public.migracion_modulos(migracion_id);
CREATE INDEX idx_migracion_id_map_busqueda ON public.migracion_id_map(migracion_id, entidad, id_origen);

ALTER TABLE public.migraciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migracion_modulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migracion_id_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY migraciones_solo_app_admin
ON public.migraciones FOR ALL TO authenticated
USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

CREATE POLICY migracion_modulos_solo_app_admin
ON public.migracion_modulos FOR ALL TO authenticated
USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

CREATE POLICY migracion_id_map_solo_app_admin
ON public.migracion_id_map FOR ALL TO authenticated
USING (public.is_app_admin()) WITH CHECK (
  public.is_app_admin()
  AND EXISTS (
    SELECT 1 FROM public.migraciones m
    WHERE m.id = migracion_id AND m.comercio_id = comercio_id
  )
);

CREATE TRIGGER update_migraciones_updated_at
BEFORE UPDATE ON public.migraciones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_migracion_modulos_updated_at
BEFORE UPDATE ON public.migracion_modulos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

