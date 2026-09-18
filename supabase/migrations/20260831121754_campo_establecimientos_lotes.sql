-- Vortex Campo: estructura inicial de establecimientos y lotes.
-- Esta migracion no habilita el modulo para ningun comercio ni modifica datos.

CREATE TABLE public.campo_establecimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL
    REFERENCES public.comercio(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL
    REFERENCES public.clientes(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  nombre text NOT NULL,
  codigo_interno text,
  direccion text,
  localidad text,
  provincia text,
  latitud numeric(9,6),
  longitud numeric(9,6),
  superficie_total_ha numeric(14,4),
  contacto_nombre text,
  contacto_telefono text,
  observaciones text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campo_establecimientos_nombre_no_vacio
    CHECK (btrim(nombre) <> ''),
  CONSTRAINT campo_establecimientos_codigo_no_vacio
    CHECK (codigo_interno IS NULL OR btrim(codigo_interno) <> ''),
  CONSTRAINT campo_establecimientos_latitud_valida
    CHECK (latitud IS NULL OR latitud BETWEEN -90 AND 90),
  CONSTRAINT campo_establecimientos_longitud_valida
    CHECK (longitud IS NULL OR longitud BETWEEN -180 AND 180),
  CONSTRAINT campo_establecimientos_superficie_positiva
    CHECK (superficie_total_ha IS NULL OR superficie_total_ha > 0)
);

CREATE TABLE public.campo_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL
    REFERENCES public.comercio(id) ON DELETE CASCADE,
  establecimiento_id uuid NOT NULL
    REFERENCES public.campo_establecimientos(id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  nombre text NOT NULL,
  codigo_interno text,
  superficie_ha numeric(14,4) NOT NULL,
  latitud numeric(9,6),
  longitud numeric(9,6),
  observaciones text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campo_lotes_nombre_no_vacio
    CHECK (btrim(nombre) <> ''),
  CONSTRAINT campo_lotes_codigo_no_vacio
    CHECK (codigo_interno IS NULL OR btrim(codigo_interno) <> ''),
  CONSTRAINT campo_lotes_superficie_positiva
    CHECK (superficie_ha > 0),
  CONSTRAINT campo_lotes_latitud_valida
    CHECK (latitud IS NULL OR latitud BETWEEN -90 AND 90),
  CONSTRAINT campo_lotes_longitud_valida
    CHECK (longitud IS NULL OR longitud BETWEEN -180 AND 180)
);

CREATE INDEX idx_campo_establecimientos_comercio_activo
ON public.campo_establecimientos(comercio_id, activo);

CREATE INDEX idx_campo_establecimientos_comercio_cliente_activo
ON public.campo_establecimientos(comercio_id, cliente_id, activo);

CREATE INDEX idx_campo_establecimientos_comercio_nombre
ON public.campo_establecimientos(comercio_id, lower(btrim(nombre)));

CREATE UNIQUE INDEX idx_campo_establecimientos_codigo_unico
ON public.campo_establecimientos(comercio_id, lower(btrim(codigo_interno)))
WHERE codigo_interno IS NOT NULL AND btrim(codigo_interno) <> '';

CREATE INDEX idx_campo_lotes_comercio_establecimiento_activo
ON public.campo_lotes(comercio_id, establecimiento_id, activo);

CREATE UNIQUE INDEX idx_campo_lotes_codigo_unico
ON public.campo_lotes(
  comercio_id,
  establecimiento_id,
  lower(btrim(codigo_interno))
)
WHERE codigo_interno IS NOT NULL AND btrim(codigo_interno) <> '';

CREATE UNIQUE INDEX idx_campo_lotes_nombre_unico
ON public.campo_lotes(
  comercio_id,
  establecimiento_id,
  lower(btrim(nombre))
);

CREATE OR REPLACE FUNCTION public.validate_campo_tenant_relations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  related_comercio_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.comercio_id IS DISTINCT FROM OLD.comercio_id THEN
      RAISE EXCEPTION 'No se puede cambiar el comercio del registro';
    END IF;

    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'No se puede cambiar la fecha de creacion del registro';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'campo_establecimientos' THEN
    SELECT c.comercio_id
    INTO related_comercio_id
    FROM public.clientes c
    WHERE c.id = NEW.cliente_id;

    IF related_comercio_id IS NULL THEN
      RAISE EXCEPTION 'El cliente indicado no existe o no tiene un comercio asignado';
    END IF;

    IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'El cliente pertenece a otro comercio';
    END IF;
  ELSIF TG_TABLE_NAME = 'campo_lotes' THEN
    SELECT e.comercio_id
    INTO related_comercio_id
    FROM public.campo_establecimientos e
    WHERE e.id = NEW.establecimiento_id;

    IF related_comercio_id IS NULL THEN
      RAISE EXCEPTION 'El establecimiento indicado no existe';
    END IF;

    IF related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'El establecimiento pertenece a otro comercio';
    END IF;
  ELSE
    RAISE EXCEPTION 'Tabla no soportada por validate_campo_tenant_relations: %', TG_TABLE_NAME;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_campo_tenant_relations() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER validate_campo_establecimientos_tenant
BEFORE INSERT OR UPDATE
ON public.campo_establecimientos
FOR EACH ROW
EXECUTE FUNCTION public.validate_campo_tenant_relations();

CREATE TRIGGER validate_campo_lotes_tenant
BEFORE INSERT OR UPDATE
ON public.campo_lotes
FOR EACH ROW
EXECUTE FUNCTION public.validate_campo_tenant_relations();

CREATE TRIGGER update_campo_establecimientos_updated_at
BEFORE UPDATE ON public.campo_establecimientos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_campo_lotes_updated_at
BEFORE UPDATE ON public.campo_lotes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.campo_establecimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campo_lotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY campo_establecimientos_select_miembros
ON public.campo_establecimientos
FOR SELECT
TO authenticated
USING (public.user_belongs_to_comercio(comercio_id));

CREATE POLICY campo_establecimientos_insert_admin
ON public.campo_establecimientos
FOR INSERT
TO authenticated
WITH CHECK (public.user_is_comercio_admin(comercio_id));

CREATE POLICY campo_establecimientos_update_admin
ON public.campo_establecimientos
FOR UPDATE
TO authenticated
USING (public.user_is_comercio_admin(comercio_id))
WITH CHECK (public.user_is_comercio_admin(comercio_id));

CREATE POLICY campo_lotes_select_miembros
ON public.campo_lotes
FOR SELECT
TO authenticated
USING (public.user_belongs_to_comercio(comercio_id));

CREATE POLICY campo_lotes_insert_admin
ON public.campo_lotes
FOR INSERT
TO authenticated
WITH CHECK (public.user_is_comercio_admin(comercio_id));

CREATE POLICY campo_lotes_update_admin
ON public.campo_lotes
FOR UPDATE
TO authenticated
USING (public.user_is_comercio_admin(comercio_id))
WITH CHECK (public.user_is_comercio_admin(comercio_id));

REVOKE ALL ON TABLE public.campo_establecimientos, public.campo_lotes FROM PUBLIC, anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.campo_establecimientos, public.campo_lotes
FROM authenticated;
GRANT SELECT, INSERT, UPDATE
ON TABLE public.campo_establecimientos, public.campo_lotes
TO authenticated;
