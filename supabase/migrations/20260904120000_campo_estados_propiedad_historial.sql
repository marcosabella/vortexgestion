-- Vortex Campo - estados, propiedad e historiales de ordenes y partes.
-- Esta migracion prepara el modelo. Las transiciones enviado/rechazado/
-- descartado y la escritura por operadores se habilitaran en etapas posteriores.

-- Auxiliar transitoria para materializar el operario durante el table rewrite.
-- Se declara IMMUTABLE solo durante este backfill cerrado, se elimina en esta
-- misma migracion y nunca queda disponible para uso funcional.
CREATE FUNCTION public.campo_resolver_operario_propietario_backfill(
  p_comercio_id uuid,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE
    WHEN count(*) = 1 THEN min(o.id::text)::uuid
    ELSE NULL
  END
  FROM public.campo_operarios AS o
  WHERE o.comercio_id = p_comercio_id
    AND o.user_id = p_user_id
$function$;

REVOKE ALL ON FUNCTION public.campo_resolver_operario_propietario_backfill(uuid, uuid)
FROM PUBLIC, anon, authenticated;

ALTER TABLE public.campo_partes_trabajo
  ADD COLUMN propietario_user_id uuid
    GENERATED ALWAYS AS (created_by) STORED,
  ADD COLUMN propietario_operario_id uuid
    GENERATED ALWAYS AS (
      public.campo_resolver_operario_propietario_backfill(comercio_id, created_by)
    ) STORED,
  ADD COLUMN enviado_by uuid,
  ADD COLUMN enviado_at timestamp with time zone,
  ADD COLUMN rechazado_by uuid,
  ADD COLUMN rechazado_at timestamp with time zone,
  ADD COLUMN motivo_rechazo text,
  ADD COLUMN descartado_by uuid,
  ADD COLUMN descartado_at timestamp with time zone,
  ADD COLUMN motivo_descarte text;

-- DROP EXPRESSION conserva los valores materializados y transforma ambas
-- columnas en ordinarias sin disparar los triggers DML de partes.
ALTER TABLE public.campo_partes_trabajo
  ALTER COLUMN propietario_user_id DROP EXPRESSION,
  ALTER COLUMN propietario_operario_id DROP EXPRESSION;

DROP FUNCTION public.campo_resolver_operario_propietario_backfill(uuid, uuid);

ALTER TABLE public.campo_partes_trabajo
  ALTER COLUMN propietario_user_id SET NOT NULL,
  ADD CONSTRAINT campo_partes_propietario_operario_fkey
    FOREIGN KEY (comercio_id, propietario_operario_id)
    REFERENCES public.campo_operarios(comercio_id, id)
    ON DELETE RESTRICT;

ALTER TABLE public.campo_partes_trabajo
  DROP CONSTRAINT campo_partes_estado_valido,
  DROP CONSTRAINT campo_partes_estado_auditoria_coherente;

ALTER TABLE public.campo_partes_trabajo
  ADD CONSTRAINT campo_partes_estado_valido
    CHECK (estado IN ('borrador', 'enviado', 'rechazado', 'confirmado', 'anulado', 'descartado')),
  ADD CONSTRAINT campo_partes_motivo_rechazo_no_vacio
    CHECK (motivo_rechazo IS NULL OR btrim(motivo_rechazo) <> ''),
  ADD CONSTRAINT campo_partes_motivo_descarte_no_vacio
    CHECK (motivo_descarte IS NULL OR btrim(motivo_descarte) <> ''),
  ADD CONSTRAINT campo_partes_envio_coherente
    CHECK ((enviado_by IS NULL) = (enviado_at IS NULL)),
  ADD CONSTRAINT campo_partes_rechazo_coherente
    CHECK (
      (rechazado_by IS NULL AND rechazado_at IS NULL AND motivo_rechazo IS NULL)
      OR
      (rechazado_by IS NOT NULL AND rechazado_at IS NOT NULL AND motivo_rechazo IS NOT NULL)
    ),
  ADD CONSTRAINT campo_partes_descarte_coherente
    CHECK (
      (descartado_by IS NULL AND descartado_at IS NULL AND motivo_descarte IS NULL)
      OR
      (descartado_by IS NOT NULL AND descartado_at IS NOT NULL AND motivo_descarte IS NOT NULL)
    ),
  ADD CONSTRAINT campo_partes_estado_auditoria_coherente
    CHECK (
      (
        estado = 'borrador'
        AND confirmado_by IS NULL AND confirmado_at IS NULL
        AND anulado_by IS NULL AND anulado_at IS NULL AND motivo_anulacion IS NULL
        AND descartado_by IS NULL AND descartado_at IS NULL AND motivo_descarte IS NULL
      )
      OR
      (
        estado = 'enviado'
        AND enviado_by IS NOT NULL AND enviado_at IS NOT NULL
        AND confirmado_by IS NULL AND confirmado_at IS NULL
        AND anulado_by IS NULL AND anulado_at IS NULL AND motivo_anulacion IS NULL
        AND descartado_by IS NULL AND descartado_at IS NULL AND motivo_descarte IS NULL
      )
      OR
      (
        estado = 'rechazado'
        AND rechazado_by IS NOT NULL AND rechazado_at IS NOT NULL AND motivo_rechazo IS NOT NULL
        AND confirmado_by IS NULL AND confirmado_at IS NULL
        AND anulado_by IS NULL AND anulado_at IS NULL AND motivo_anulacion IS NULL
        AND descartado_by IS NULL AND descartado_at IS NULL AND motivo_descarte IS NULL
      )
      OR
      (
        estado = 'confirmado'
        AND confirmado_by IS NOT NULL AND confirmado_at IS NOT NULL
        AND anulado_by IS NULL AND anulado_at IS NULL AND motivo_anulacion IS NULL
        AND descartado_by IS NULL AND descartado_at IS NULL AND motivo_descarte IS NULL
      )
      OR
      (
        estado = 'anulado'
        AND confirmado_by IS NOT NULL AND confirmado_at IS NOT NULL
        AND anulado_by IS NOT NULL AND anulado_at IS NOT NULL AND motivo_anulacion IS NOT NULL
        AND descartado_by IS NULL AND descartado_at IS NULL AND motivo_descarte IS NULL
      )
      OR
      (
        estado = 'descartado'
        AND descartado_by IS NOT NULL AND descartado_at IS NOT NULL AND motivo_descarte IS NOT NULL
        AND confirmado_by IS NULL AND confirmado_at IS NULL
        AND anulado_by IS NULL AND anulado_at IS NULL AND motivo_anulacion IS NULL
      )
    );

CREATE INDEX idx_campo_partes_propietario
ON public.campo_partes_trabajo(comercio_id, propietario_user_id, estado, fecha_trabajo DESC, id);

CREATE INDEX idx_campo_partes_propietario_operario
ON public.campo_partes_trabajo(comercio_id, propietario_operario_id, id)
WHERE propietario_operario_id IS NOT NULL;

CREATE INDEX idx_campo_partes_bandeja_estado
ON public.campo_partes_trabajo(comercio_id, estado, enviado_at DESC, fecha_trabajo DESC, id);

-- Se ejecuta despues del trigger de auditoria (10) y antes de los validadores
-- existentes. En INSERT fuerza el propietario autenticado y limpia datos de
-- estados aun no habilitados; en UPDATE inmoviliza ambos campos de propiedad.
CREATE OR REPLACE FUNCTION public.campo_protect_parte_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'campo_auth_requerida';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.propietario_user_id := v_uid;
    NEW.enviado_by := NULL;
    NEW.enviado_at := NULL;
    NEW.rechazado_by := NULL;
    NEW.rechazado_at := NULL;
    NEW.motivo_rechazo := NULL;
    NEW.descartado_by := NULL;
    NEW.descartado_at := NULL;
    NEW.motivo_descarte := NULL;
  ELSE
    IF NEW.propietario_user_id IS DISTINCT FROM OLD.propietario_user_id THEN
      RAISE EXCEPTION 'campo_propietario_user_inmutable';
    END IF;
    IF NEW.propietario_operario_id IS DISTINCT FROM OLD.propietario_operario_id THEN
      RAISE EXCEPTION 'campo_propietario_operario_inmutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.campo_protect_parte_ownership()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "15_campo_partes_protect_ownership"
BEFORE INSERT OR UPDATE ON public.campo_partes_trabajo
FOR EACH ROW
EXECUTE FUNCTION public.campo_protect_parte_ownership();

CREATE TABLE public.campo_parte_estado_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  parte_id uuid NOT NULL,
  estado_anterior text,
  estado_nuevo text NOT NULL,
  motivo text,
  actor_user_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campo_parte_historial_parte_fkey
    FOREIGN KEY (comercio_id, parte_id)
    REFERENCES public.campo_partes_trabajo(comercio_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT campo_parte_historial_estado_anterior_valido
    CHECK (estado_anterior IS NULL OR estado_anterior IN ('borrador', 'enviado', 'rechazado', 'confirmado', 'anulado', 'descartado')),
  CONSTRAINT campo_parte_historial_estado_nuevo_valido
    CHECK (estado_nuevo IN ('borrador', 'enviado', 'rechazado', 'confirmado', 'anulado', 'descartado')),
  CONSTRAINT campo_parte_historial_inicial_valido
    CHECK (
      estado_anterior IS NOT NULL
      OR metadata @> '{"backfill": true}'::jsonb
      OR metadata @> '{"evento": "inicial"}'::jsonb
    ),
  CONSTRAINT campo_parte_historial_transicion_real
    CHECK (estado_anterior IS NULL OR estado_anterior <> estado_nuevo),
  CONSTRAINT campo_parte_historial_motivo_no_vacio
    CHECK (motivo IS NULL OR btrim(motivo) <> ''),
  CONSTRAINT campo_parte_historial_metadata_objeto
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE public.campo_orden_estado_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  orden_id uuid NOT NULL,
  estado_anterior text,
  estado_nuevo text NOT NULL,
  motivo text,
  actor_user_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campo_orden_historial_orden_fkey
    FOREIGN KEY (comercio_id, orden_id)
    REFERENCES public.campo_ordenes_trabajo(comercio_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT campo_orden_historial_estado_anterior_valido
    CHECK (estado_anterior IS NULL OR estado_anterior IN ('borrador', 'planificada', 'en_progreso', 'finalizada', 'cancelada')),
  CONSTRAINT campo_orden_historial_estado_nuevo_valido
    CHECK (estado_nuevo IN ('borrador', 'planificada', 'en_progreso', 'finalizada', 'cancelada')),
  CONSTRAINT campo_orden_historial_inicial_valido
    CHECK (
      estado_anterior IS NOT NULL
      OR metadata @> '{"backfill": true}'::jsonb
      OR metadata @> '{"evento": "inicial"}'::jsonb
    ),
  CONSTRAINT campo_orden_historial_transicion_real
    CHECK (estado_anterior IS NULL OR estado_anterior <> estado_nuevo),
  CONSTRAINT campo_orden_historial_motivo_no_vacio
    CHECK (motivo IS NULL OR btrim(motivo) <> ''),
  CONSTRAINT campo_orden_historial_metadata_objeto
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX idx_campo_parte_historial_evento_inicial
ON public.campo_parte_estado_historial(parte_id)
WHERE estado_anterior IS NULL;

CREATE INDEX idx_campo_parte_historial_consulta
ON public.campo_parte_estado_historial(comercio_id, parte_id, created_at DESC, id DESC);

CREATE UNIQUE INDEX idx_campo_orden_historial_evento_inicial
ON public.campo_orden_estado_historial(orden_id)
WHERE estado_anterior IS NULL;

CREATE INDEX idx_campo_orden_historial_consulta
ON public.campo_orden_estado_historial(comercio_id, orden_id, created_at DESC, id DESC);

-- Backfill controlado: un unico evento inicial por registro preexistente. La
-- restriccion parcial y NOT EXISTS constituyen defensas complementarias.
INSERT INTO public.campo_parte_estado_historial (
  comercio_id, parte_id, estado_anterior, estado_nuevo,
  motivo, actor_user_id, metadata, created_at
)
SELECT
  p.comercio_id,
  p.id,
  NULL,
  p.estado,
  CASE
    WHEN p.estado = 'anulado' THEN p.motivo_anulacion
    ELSE NULL
  END,
  p.created_by,
  '{"backfill": true}'::jsonb,
  p.created_at
FROM public.campo_partes_trabajo AS p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.campo_parte_estado_historial AS h
  WHERE h.parte_id = p.id
    AND h.estado_anterior IS NULL
);

INSERT INTO public.campo_orden_estado_historial (
  comercio_id, orden_id, estado_anterior, estado_nuevo,
  motivo, actor_user_id, metadata, created_at
)
SELECT
  o.comercio_id,
  o.id,
  NULL,
  o.estado,
  CASE
    WHEN o.estado = 'cancelada' THEN o.motivo_cancelacion
    ELSE NULL
  END,
  o.created_by,
  '{"backfill": true}'::jsonb,
  o.created_at
FROM public.campo_ordenes_trabajo AS o
WHERE NOT EXISTS (
  SELECT 1
  FROM public.campo_orden_estado_historial AS h
  WHERE h.orden_id = o.id
    AND h.estado_anterior IS NULL
);

-- Funcion no invocable por clientes: el propietario de las tablas la ejecuta
-- como trigger y RLS permanece activo para las consultas del frontend.
CREATE OR REPLACE FUNCTION public.campo_registrar_estado_historial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_estado_anterior text;
  v_motivo text;
  v_metadata jsonb := '{}'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'campo_auth_requerida';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  v_estado_anterior := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.estado END;
  IF TG_OP = 'INSERT' THEN
    v_metadata := '{"evento": "inicial"}'::jsonb;
  END IF;

  IF TG_TABLE_NAME = 'campo_partes_trabajo' THEN
    v_motivo := CASE NEW.estado
      WHEN 'rechazado' THEN NEW.motivo_rechazo
      WHEN 'anulado' THEN NEW.motivo_anulacion
      WHEN 'descartado' THEN NEW.motivo_descarte
      ELSE NULL
    END;

    INSERT INTO public.campo_parte_estado_historial (
      comercio_id, parte_id, estado_anterior, estado_nuevo,
      motivo, actor_user_id, metadata
    ) VALUES (
      NEW.comercio_id, NEW.id, v_estado_anterior, NEW.estado,
      v_motivo, v_uid, v_metadata
    );
  ELSIF TG_TABLE_NAME = 'campo_ordenes_trabajo' THEN
    v_motivo := CASE
      WHEN NEW.estado = 'cancelada' THEN NEW.motivo_cancelacion
      ELSE NULL
    END;

    INSERT INTO public.campo_orden_estado_historial (
      comercio_id, orden_id, estado_anterior, estado_nuevo,
      motivo, actor_user_id, metadata
    ) VALUES (
      NEW.comercio_id, NEW.id, v_estado_anterior, NEW.estado,
      v_motivo, v_uid, v_metadata
    );
  ELSE
    RAISE EXCEPTION 'campo_historial_tabla_no_soportada';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.campo_registrar_estado_historial()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "90_campo_partes_estado_historial"
AFTER INSERT OR UPDATE OF estado ON public.campo_partes_trabajo
FOR EACH ROW
EXECUTE FUNCTION public.campo_registrar_estado_historial();

CREATE TRIGGER "90_campo_ordenes_estado_historial"
AFTER INSERT OR UPDATE OF estado ON public.campo_ordenes_trabajo
FOR EACH ROW
EXECUTE FUNCTION public.campo_registrar_estado_historial();

ALTER TABLE public.campo_parte_estado_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campo_orden_estado_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY campo_parte_historial_select_miembros
ON public.campo_parte_estado_historial
FOR SELECT
TO authenticated
USING (public.user_belongs_to_comercio(comercio_id));

CREATE POLICY campo_orden_historial_select_miembros
ON public.campo_orden_estado_historial
FOR SELECT
TO authenticated
USING (public.user_belongs_to_comercio(comercio_id));

REVOKE ALL ON TABLE
  public.campo_parte_estado_historial,
  public.campo_orden_estado_historial
FROM PUBLIC, anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.campo_parte_estado_historial,
  public.campo_orden_estado_historial
FROM authenticated;

GRANT SELECT ON TABLE
  public.campo_parte_estado_historial,
  public.campo_orden_estado_historial
TO authenticated;

COMMENT ON COLUMN public.campo_partes_trabajo.propietario_user_id IS
  'Usuario Auth propietario del parte. No posee FK hacia auth.users deliberadamente y es inmutable.';
COMMENT ON COLUMN public.campo_partes_trabajo.propietario_operario_id IS
  'Operario propietario opcional, vinculado mediante FK tenant-safe e inmutable despues de INSERT.';
COMMENT ON COLUMN public.campo_partes_trabajo.estado IS
  'Estados preparados: borrador, enviado, rechazado, confirmado, anulado y descartado. Las transiciones nuevas se habilitaran por RPC en una migracion posterior.';
COMMENT ON TABLE public.campo_parte_estado_historial IS
  'Historial append-only de estados de partes. authenticated posee solamente SELECT; las inserciones se realizan exclusivamente por trigger.';
COMMENT ON TABLE public.campo_orden_estado_historial IS
  'Historial append-only de estados de ordenes. authenticated posee solamente SELECT; las inserciones se realizan exclusivamente por trigger.';
COMMENT ON FUNCTION public.campo_confirmar_parte(uuid) IS
  'Compatibilidad transitoria: confirma directamente partes en borrador. En una migracion posterior exigira estado enviado.';
