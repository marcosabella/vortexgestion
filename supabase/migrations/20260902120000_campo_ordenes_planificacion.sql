-- Vortex Campo - Bloque 2, primera migracion de planificacion.
-- Crea solamente ordenes, labores planificadas y su asignacion a lotes.
-- Partes, ejecucion, precios, venta e historiales quedan fuera de esta etapa.

CREATE TABLE public.campo_ordenes_trabajo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL
    REFERENCES public.comercio(id) ON DELETE RESTRICT,
  -- El 0 solo hace opcional el campo para clientes tipados; el trigger 30
  -- siempre lo reemplaza y el CHECK impide que el centinela sea persistido.
  numero bigint NOT NULL DEFAULT 0,
  codigo_interno text,
  cliente_id uuid NOT NULL
    REFERENCES public.clientes(id) ON DELETE RESTRICT,
  establecimiento_id uuid NOT NULL
    REFERENCES public.campo_establecimientos(id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'borrador',
  fecha_inicio_planificada date,
  fecha_fin_planificada date,
  descripcion text,
  observaciones text,
  iniciada_at timestamp with time zone,
  finalizada_at timestamp with time zone,
  cancelada_at timestamp with time zone,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campo_ordenes_numero_positivo
    CHECK (numero > 0),
  CONSTRAINT campo_ordenes_codigo_no_vacio
    CHECK (codigo_interno IS NULL OR btrim(codigo_interno) <> ''),
  CONSTRAINT campo_ordenes_estado_valido
    CHECK (estado IN ('borrador', 'planificada', 'en_progreso', 'finalizada', 'cancelada')),
  CONSTRAINT campo_ordenes_fechas_coherentes
    CHECK (
      fecha_inicio_planificada IS NULL
      OR fecha_fin_planificada IS NULL
      OR fecha_fin_planificada >= fecha_inicio_planificada
    ),
  CONSTRAINT campo_ordenes_descripcion_no_vacia
    CHECK (descripcion IS NULL OR btrim(descripcion) <> ''),
  CONSTRAINT campo_ordenes_observaciones_no_vacias
    CHECK (observaciones IS NULL OR btrim(observaciones) <> ''),
  CONSTRAINT campo_ordenes_comercio_id_id_key
    UNIQUE (comercio_id, id),
  CONSTRAINT campo_ordenes_comercio_numero_key
    UNIQUE (comercio_id, numero)
);

CREATE TABLE public.campo_orden_labores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL
    REFERENCES public.comercio(id) ON DELETE RESTRICT,
  orden_id uuid NOT NULL,
  nombre text NOT NULL,
  codigo_interno text,
  descripcion text,
  unidad text NOT NULL,
  posicion integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campo_orden_labores_nombre_no_vacio
    CHECK (btrim(nombre) <> ''),
  CONSTRAINT campo_orden_labores_codigo_no_vacio
    CHECK (codigo_interno IS NULL OR btrim(codigo_interno) <> ''),
  CONSTRAINT campo_orden_labores_descripcion_no_vacia
    CHECK (descripcion IS NULL OR btrim(descripcion) <> ''),
  CONSTRAINT campo_orden_labores_unidad_valida
    CHECK (unidad IN ('ha', 'hora', 'km', 'tonelada', 'unidad', 'fijo')),
  CONSTRAINT campo_orden_labores_posicion_valida
    CHECK (posicion >= 0),
  CONSTRAINT campo_orden_labores_comercio_id_id_key
    UNIQUE (comercio_id, id),
  CONSTRAINT campo_orden_labores_orden_fkey
    FOREIGN KEY (comercio_id, orden_id)
    REFERENCES public.campo_ordenes_trabajo(comercio_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE public.campo_orden_labor_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL
    REFERENCES public.comercio(id) ON DELETE RESTRICT,
  orden_labor_id uuid NOT NULL,
  lote_id uuid NOT NULL
    REFERENCES public.campo_lotes(id) ON DELETE RESTRICT,
  cantidad_planificada numeric(14,4) NOT NULL,
  observaciones text,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campo_orden_labor_lotes_cantidad_positiva
    CHECK (cantidad_planificada > 0),
  CONSTRAINT campo_orden_labor_lotes_observaciones_no_vacias
    CHECK (observaciones IS NULL OR btrim(observaciones) <> ''),
  CONSTRAINT campo_orden_labor_lotes_labor_fkey
    FOREIGN KEY (comercio_id, orden_labor_id)
    REFERENCES public.campo_orden_labores(comercio_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT campo_orden_labor_lotes_labor_lote_key
    UNIQUE (orden_labor_id, lote_id)
);

CREATE UNIQUE INDEX idx_campo_ordenes_codigo_unico
ON public.campo_ordenes_trabajo(comercio_id, lower(btrim(codigo_interno)))
WHERE codigo_interno IS NOT NULL AND btrim(codigo_interno) <> '';

CREATE INDEX idx_campo_ordenes_comercio_estado_numero
ON public.campo_ordenes_trabajo(comercio_id, estado, numero DESC);

CREATE INDEX idx_campo_ordenes_comercio_cliente_estado
ON public.campo_ordenes_trabajo(comercio_id, cliente_id, estado);

CREATE INDEX idx_campo_ordenes_comercio_establecimiento_estado
ON public.campo_ordenes_trabajo(comercio_id, establecimiento_id, estado);

CREATE UNIQUE INDEX idx_campo_orden_labores_nombre_unico
ON public.campo_orden_labores(orden_id, lower(btrim(nombre)));

CREATE UNIQUE INDEX idx_campo_orden_labores_codigo_unico
ON public.campo_orden_labores(orden_id, lower(btrim(codigo_interno)))
WHERE codigo_interno IS NOT NULL AND btrim(codigo_interno) <> '';

CREATE INDEX idx_campo_orden_labores_orden_posicion
ON public.campo_orden_labores(comercio_id, orden_id, activo, posicion, id);

CREATE INDEX idx_campo_orden_labor_lotes_labor
ON public.campo_orden_labor_lotes(comercio_id, orden_labor_id, activo, id);

CREATE INDEX idx_campo_orden_labor_lotes_lote
ON public.campo_orden_labor_lotes(comercio_id, lote_id, activo);

-- Asigna auditoria desde la sesion autenticada e impide que el frontend
-- controle identidad, tenant o timestamps.
CREATE OR REPLACE FUNCTION public.campo_planificacion_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'campo_auth_requerida';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := current_user_id;
    NEW.updated_by := current_user_id;
    NEW.created_at := now();
    NEW.updated_at := now();
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'campo_id_inmutable';
    END IF;
    IF NEW.comercio_id IS DISTINCT FROM OLD.comercio_id THEN
      RAISE EXCEPTION 'campo_comercio_inmutable';
    END IF;
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'campo_created_by_inmutable';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'campo_created_at_inmutable';
    END IF;

    NEW.updated_by := current_user_id;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.campo_planificacion_audit()
FROM PUBLIC, anon, authenticated;

-- Valida tenant y jerarquia sorteando RLS unicamente para inspeccionar las
-- relaciones. No concede autorizacion: RLS sigue validando al usuario.
CREATE OR REPLACE FUNCTION public.campo_validate_planificacion_relations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  related_comercio_id uuid;
  establecimiento_cliente_id uuid;
  establecimiento_id_orden uuid;
  lote_establecimiento_id uuid;
  related_activo boolean;
  establecimiento_activo boolean;
  labor_activa boolean;
  orden_estado text;
  labor_unidad text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'campo_auth_requerida';
  END IF;

  IF TG_TABLE_NAME = 'campo_ordenes_trabajo' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.comercio c WHERE c.id = NEW.comercio_id
    ) THEN
      RAISE EXCEPTION 'campo_comercio_invalido';
    END IF;

    SELECT c.comercio_id
    INTO related_comercio_id
    FROM public.clientes c
    WHERE c.id = NEW.cliente_id;

    IF related_comercio_id IS NULL OR related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'campo_cliente_invalido';
    END IF;

    SELECT e.comercio_id, e.cliente_id, e.activo
    INTO related_comercio_id, establecimiento_cliente_id, related_activo
    FROM public.campo_establecimientos e
    WHERE e.id = NEW.establecimiento_id;

    IF related_comercio_id IS NULL OR related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'campo_establecimiento_invalido';
    END IF;

    IF TG_OP = 'INSERT'
       OR OLD.estado = 'borrador'
       OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
       OR NEW.establecimiento_id IS DISTINCT FROM OLD.establecimiento_id THEN
      IF establecimiento_cliente_id IS DISTINCT FROM NEW.cliente_id THEN
        RAISE EXCEPTION 'campo_cliente_no_coincide_establecimiento';
      END IF;
    END IF;

    IF TG_OP = 'INSERT'
       OR NEW.establecimiento_id IS DISTINCT FROM OLD.establecimiento_id THEN
      IF related_activo IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'campo_establecimiento_inactivo';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'campo_orden_labores' THEN
    SELECT o.comercio_id, o.estado, e.activo
    INTO related_comercio_id, orden_estado, establecimiento_activo
    FROM public.campo_ordenes_trabajo o
    JOIN public.campo_establecimientos e
      ON e.id = o.establecimiento_id
     AND e.comercio_id = o.comercio_id
    WHERE o.id = NEW.orden_id;

    IF related_comercio_id IS NULL OR related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'campo_orden_invalida';
    END IF;
    IF orden_estado <> 'borrador' THEN
      RAISE EXCEPTION 'campo_planificacion_congelada';
    END IF;
    IF establecimiento_activo IS DISTINCT FROM true
       AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.activo AND NOT OLD.activo)) THEN
      RAISE EXCEPTION 'campo_establecimiento_inactivo';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.orden_id IS DISTINCT FROM OLD.orden_id THEN
        RAISE EXCEPTION 'campo_orden_labor_inmutable';
      END IF;
      IF NEW.unidad = 'fijo' AND NEW.unidad IS DISTINCT FROM OLD.unidad
         AND EXISTS (
           SELECT 1
           FROM public.campo_orden_labor_lotes oll
           WHERE oll.orden_labor_id = NEW.id
             AND oll.comercio_id = NEW.comercio_id
             AND oll.cantidad_planificada <> 1
         ) THEN
        RAISE EXCEPTION 'campo_cantidad_fijo_debe_ser_uno';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'campo_orden_labor_lotes' THEN
    SELECT l.comercio_id, l.activo, l.unidad, o.estado, o.establecimiento_id, e.activo
    INTO related_comercio_id, labor_activa, labor_unidad, orden_estado,
         establecimiento_id_orden, establecimiento_activo
    FROM public.campo_orden_labores l
    JOIN public.campo_ordenes_trabajo o ON o.id = l.orden_id
    JOIN public.campo_establecimientos e
      ON e.id = o.establecimiento_id
     AND e.comercio_id = o.comercio_id
    WHERE l.id = NEW.orden_labor_id;

    IF related_comercio_id IS NULL OR related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'campo_labor_invalida';
    END IF;
    IF orden_estado <> 'borrador' THEN
      RAISE EXCEPTION 'campo_planificacion_congelada';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.orden_labor_id IS DISTINCT FROM OLD.orden_labor_id THEN
      RAISE EXCEPTION 'campo_labor_asignacion_inmutable';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.lote_id IS DISTINCT FROM OLD.lote_id THEN
      RAISE EXCEPTION 'campo_lote_asignacion_inmutable';
    END IF;
    IF establecimiento_activo IS DISTINCT FROM true
       AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.activo AND NOT OLD.activo)) THEN
      RAISE EXCEPTION 'campo_establecimiento_inactivo';
    END IF;

    SELECT l.comercio_id, l.establecimiento_id, l.activo
    INTO related_comercio_id, lote_establecimiento_id, related_activo
    FROM public.campo_lotes l
    WHERE l.id = NEW.lote_id;

    IF related_comercio_id IS NULL OR related_comercio_id IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'campo_lote_invalido';
    END IF;
    IF lote_establecimiento_id IS DISTINCT FROM establecimiento_id_orden THEN
      RAISE EXCEPTION 'campo_lote_fuera_establecimiento';
    END IF;
    IF labor_activa IS DISTINCT FROM true
       AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.activo AND NOT OLD.activo)) THEN
      RAISE EXCEPTION 'campo_labor_inactiva';
    END IF;
    IF related_activo IS DISTINCT FROM true
       AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.activo AND NOT OLD.activo)) THEN
      RAISE EXCEPTION 'campo_lote_inactivo';
    END IF;
    IF labor_unidad = 'fijo' AND NEW.cantidad_planificada <> 1 THEN
      RAISE EXCEPTION 'campo_cantidad_fijo_debe_ser_uno';
    END IF;
  ELSE
    RAISE EXCEPTION 'campo_tabla_planificacion_no_soportada';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.campo_validate_planificacion_relations()
FROM PUBLIC, anon, authenticated;

-- El advisory transaction lock usa una clave namespaced por comercio. Las
-- altas del mismo comercio se serializan; comercios diferentes pueden numerar
-- en paralelo. El lock se libera con COMMIT/ROLLBACK y el UNIQUE es defensa final.
CREATE OR REPLACE FUNCTION public.campo_assign_orden_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'campo_auth_requerida';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('vortex_campo_orden:' || NEW.comercio_id::text, 0)
  );

  SELECT COALESCE(max(o.numero), 0) + 1
  INTO NEW.numero
  FROM public.campo_ordenes_trabajo o
  WHERE o.comercio_id = NEW.comercio_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.campo_assign_orden_numero()
FROM PUBLIC, anon, authenticated;

-- Habilita solamente borrador <-> planificada. Los estados futuros ya forman
-- parte del CHECK, pero quedan bloqueados hasta implementar ejecucion y partes.
CREATE OR REPLACE FUNCTION public.campo_protect_orden_planificacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  related_comercio_id uuid;
  related_cliente_id uuid;
  related_activo boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'campo_auth_requerida';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.estado := 'borrador';
    NEW.iniciada_at := NULL;
    NEW.finalizada_at := NULL;
    NEW.cancelada_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.numero IS DISTINCT FROM OLD.numero THEN
    RAISE EXCEPTION 'campo_numero_orden_inmutable';
  END IF;
  IF NEW.iniciada_at IS DISTINCT FROM OLD.iniciada_at
     OR NEW.finalizada_at IS DISTINCT FROM OLD.finalizada_at
     OR NEW.cancelada_at IS DISTINCT FROM OLD.cancelada_at THEN
    RAISE EXCEPTION 'campo_fechas_estado_no_editables';
  END IF;

  IF OLD.estado = 'planificada' THEN
    IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
       OR NEW.establecimiento_id IS DISTINCT FROM OLD.establecimiento_id
       OR NEW.codigo_interno IS DISTINCT FROM OLD.codigo_interno
       OR NEW.fecha_inicio_planificada IS DISTINCT FROM OLD.fecha_inicio_planificada
       OR NEW.fecha_fin_planificada IS DISTINCT FROM OLD.fecha_fin_planificada
       OR NEW.descripcion IS DISTINCT FROM OLD.descripcion THEN
      RAISE EXCEPTION 'campo_planificacion_congelada';
    END IF;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT (
      (OLD.estado = 'borrador' AND NEW.estado = 'planificada')
      OR (OLD.estado = 'planificada' AND NEW.estado = 'borrador')
    ) THEN
      RAISE EXCEPTION 'campo_transicion_orden_no_habilitada';
    END IF;
  END IF;

  IF OLD.estado = 'borrador' AND NEW.estado = 'planificada' THEN
    SELECT e.comercio_id, e.cliente_id, e.activo
    INTO related_comercio_id, related_cliente_id, related_activo
    FROM public.campo_establecimientos e
    WHERE e.id = NEW.establecimiento_id;

    IF related_comercio_id IS NULL
       OR related_comercio_id IS DISTINCT FROM NEW.comercio_id
       OR related_activo IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'campo_establecimiento_no_disponible_planificar';
    END IF;
    IF related_cliente_id IS DISTINCT FROM NEW.cliente_id THEN
      RAISE EXCEPTION 'campo_cliente_no_coincide_establecimiento';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.campo_orden_labores l
      WHERE l.orden_id = NEW.id
        AND l.comercio_id = NEW.comercio_id
        AND l.activo = true
    ) THEN
      RAISE EXCEPTION 'campo_orden_sin_labores_activas';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.campo_orden_labores l
      WHERE l.orden_id = NEW.id
        AND l.comercio_id = NEW.comercio_id
        AND l.activo = true
        AND NOT EXISTS (
          SELECT 1
          FROM public.campo_orden_labor_lotes oll
          WHERE oll.orden_labor_id = l.id
            AND oll.comercio_id = NEW.comercio_id
            AND oll.activo = true
        )
    ) THEN
      RAISE EXCEPTION 'campo_labor_sin_lotes_activos';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.campo_orden_labores l
      JOIN public.campo_orden_labor_lotes oll
        ON oll.orden_labor_id = l.id
       AND oll.comercio_id = l.comercio_id
      JOIN public.campo_lotes lote ON lote.id = oll.lote_id
      WHERE l.orden_id = NEW.id
        AND l.comercio_id = NEW.comercio_id
        AND l.activo = true
        AND oll.activo = true
        AND (
          lote.comercio_id IS DISTINCT FROM NEW.comercio_id
          OR lote.establecimiento_id IS DISTINCT FROM NEW.establecimiento_id
          OR lote.activo IS DISTINCT FROM true
          OR (l.unidad = 'fijo' AND oll.cantidad_planificada <> 1)
        )
    ) THEN
      RAISE EXCEPTION 'campo_asignacion_no_disponible_planificar';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.campo_protect_orden_planificacion()
FROM PUBLIC, anon, authenticated;

-- PostgreSQL ejecuta triggers del mismo tipo y evento en orden alfabetico.
-- 10 audita, 20 valida relaciones, 30 numera y 40 protege estado/congelamiento.
CREATE TRIGGER "10_campo_ordenes_audit"
BEFORE INSERT OR UPDATE ON public.campo_ordenes_trabajo
FOR EACH ROW EXECUTE FUNCTION public.campo_planificacion_audit();

CREATE TRIGGER "20_campo_ordenes_validate_relations"
BEFORE INSERT OR UPDATE ON public.campo_ordenes_trabajo
FOR EACH ROW EXECUTE FUNCTION public.campo_validate_planificacion_relations();

CREATE TRIGGER "30_campo_ordenes_assign_numero"
BEFORE INSERT ON public.campo_ordenes_trabajo
FOR EACH ROW EXECUTE FUNCTION public.campo_assign_orden_numero();

CREATE TRIGGER "40_campo_ordenes_protect_planificacion"
BEFORE INSERT OR UPDATE ON public.campo_ordenes_trabajo
FOR EACH ROW EXECUTE FUNCTION public.campo_protect_orden_planificacion();

CREATE TRIGGER "10_campo_orden_labores_audit"
BEFORE INSERT OR UPDATE ON public.campo_orden_labores
FOR EACH ROW EXECUTE FUNCTION public.campo_planificacion_audit();

CREATE TRIGGER "20_campo_orden_labores_validate_relations"
BEFORE INSERT OR UPDATE ON public.campo_orden_labores
FOR EACH ROW EXECUTE FUNCTION public.campo_validate_planificacion_relations();

CREATE TRIGGER "10_campo_orden_labor_lotes_audit"
BEFORE INSERT OR UPDATE ON public.campo_orden_labor_lotes
FOR EACH ROW EXECUTE FUNCTION public.campo_planificacion_audit();

CREATE TRIGGER "20_campo_orden_labor_lotes_validate_relations"
BEFORE INSERT OR UPDATE ON public.campo_orden_labor_lotes
FOR EACH ROW EXECUTE FUNCTION public.campo_validate_planificacion_relations();

ALTER TABLE public.campo_ordenes_trabajo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campo_orden_labores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campo_orden_labor_lotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY campo_ordenes_select_miembros
ON public.campo_ordenes_trabajo
FOR SELECT TO authenticated
USING (public.user_belongs_to_comercio(comercio_id));

CREATE POLICY campo_ordenes_insert_admin
ON public.campo_ordenes_trabajo
FOR INSERT TO authenticated
WITH CHECK (public.user_is_comercio_admin(comercio_id));

CREATE POLICY campo_ordenes_update_admin
ON public.campo_ordenes_trabajo
FOR UPDATE TO authenticated
USING (public.user_is_comercio_admin(comercio_id))
WITH CHECK (public.user_is_comercio_admin(comercio_id));

CREATE POLICY campo_orden_labores_select_miembros
ON public.campo_orden_labores
FOR SELECT TO authenticated
USING (public.user_belongs_to_comercio(comercio_id));

CREATE POLICY campo_orden_labores_insert_admin
ON public.campo_orden_labores
FOR INSERT TO authenticated
WITH CHECK (public.user_is_comercio_admin(comercio_id));

CREATE POLICY campo_orden_labores_update_admin
ON public.campo_orden_labores
FOR UPDATE TO authenticated
USING (public.user_is_comercio_admin(comercio_id))
WITH CHECK (public.user_is_comercio_admin(comercio_id));

CREATE POLICY campo_orden_labor_lotes_select_miembros
ON public.campo_orden_labor_lotes
FOR SELECT TO authenticated
USING (public.user_belongs_to_comercio(comercio_id));

CREATE POLICY campo_orden_labor_lotes_insert_admin
ON public.campo_orden_labor_lotes
FOR INSERT TO authenticated
WITH CHECK (public.user_is_comercio_admin(comercio_id));

CREATE POLICY campo_orden_labor_lotes_update_admin
ON public.campo_orden_labor_lotes
FOR UPDATE TO authenticated
USING (public.user_is_comercio_admin(comercio_id))
WITH CHECK (public.user_is_comercio_admin(comercio_id));

REVOKE ALL ON TABLE
  public.campo_ordenes_trabajo,
  public.campo_orden_labores,
  public.campo_orden_labor_lotes
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.campo_ordenes_trabajo,
  public.campo_orden_labores,
  public.campo_orden_labor_lotes
TO authenticated;

REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.campo_ordenes_trabajo,
  public.campo_orden_labores,
  public.campo_orden_labor_lotes
FROM authenticated;
