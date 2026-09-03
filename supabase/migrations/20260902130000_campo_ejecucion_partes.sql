-- Vortex Campo - ejecucion de trabajos y partes.
-- Solo estructura, integridad, RLS y operaciones transaccionales. Sin DML de datos.

ALTER TABLE public.campo_ordenes_trabajo
  ADD COLUMN motivo_cancelacion text,
  ADD CONSTRAINT campo_ordenes_motivo_cancelacion_no_vacio
    CHECK (motivo_cancelacion IS NULL OR btrim(motivo_cancelacion) <> '');

ALTER TABLE public.campo_orden_labor_lotes
  ADD CONSTRAINT campo_orden_labor_lotes_comercio_id_id_key UNIQUE (comercio_id, id);

CREATE TABLE public.campo_operarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  nombre text NOT NULL,
  codigo_interno text,
  documento text,
  telefono text,
  user_id uuid,
  observaciones text,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campo_operarios_nombre_no_vacio CHECK (btrim(nombre) <> ''),
  CONSTRAINT campo_operarios_codigo_no_vacio CHECK (codigo_interno IS NULL OR btrim(codigo_interno) <> ''),
  CONSTRAINT campo_operarios_documento_no_vacio CHECK (documento IS NULL OR btrim(documento) <> ''),
  CONSTRAINT campo_operarios_telefono_no_vacio CHECK (telefono IS NULL OR btrim(telefono) <> ''),
  CONSTRAINT campo_operarios_observaciones_no_vacias CHECK (observaciones IS NULL OR btrim(observaciones) <> ''),
  CONSTRAINT campo_operarios_comercio_id_id_key UNIQUE (comercio_id, id)
);

CREATE TABLE public.campo_maquinarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  nombre text NOT NULL,
  codigo_interno text,
  tipo text NOT NULL,
  marca text,
  modelo text,
  identificacion text,
  anio smallint,
  observaciones text,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campo_maquinarias_nombre_no_vacio CHECK (btrim(nombre) <> ''),
  CONSTRAINT campo_maquinarias_codigo_no_vacio CHECK (codigo_interno IS NULL OR btrim(codigo_interno) <> ''),
  CONSTRAINT campo_maquinarias_tipo_no_vacio CHECK (btrim(tipo) <> ''),
  CONSTRAINT campo_maquinarias_marca_no_vacia CHECK (marca IS NULL OR btrim(marca) <> ''),
  CONSTRAINT campo_maquinarias_modelo_no_vacio CHECK (modelo IS NULL OR btrim(modelo) <> ''),
  CONSTRAINT campo_maquinarias_identificacion_no_vacia CHECK (identificacion IS NULL OR btrim(identificacion) <> ''),
  CONSTRAINT campo_maquinarias_anio_valido CHECK (anio IS NULL OR anio BETWEEN 1900 AND 2100),
  CONSTRAINT campo_maquinarias_observaciones_no_vacias CHECK (observaciones IS NULL OR btrim(observaciones) <> ''),
  CONSTRAINT campo_maquinarias_comercio_id_id_key UNIQUE (comercio_id, id)
);

CREATE TABLE public.campo_insumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  nombre text NOT NULL,
  codigo_interno text,
  unidad text NOT NULL,
  observaciones text,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campo_insumos_nombre_no_vacio CHECK (btrim(nombre) <> ''),
  CONSTRAINT campo_insumos_codigo_no_vacio CHECK (codigo_interno IS NULL OR btrim(codigo_interno) <> ''),
  CONSTRAINT campo_insumos_unidad_valida CHECK (unidad IN ('litro', 'kilogramo', 'tonelada', 'unidad', 'bolsa', 'metro', 'dosis')),
  CONSTRAINT campo_insumos_observaciones_no_vacias CHECK (observaciones IS NULL OR btrim(observaciones) <> ''),
  CONSTRAINT campo_insumos_comercio_id_id_key UNIQUE (comercio_id, id)
);

CREATE TABLE public.campo_partes_trabajo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  orden_id uuid NOT NULL,
  orden_labor_id uuid NOT NULL,
  numero bigint NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'borrador',
  fecha_trabajo date NOT NULL,
  hora_inicio time without time zone,
  hora_fin time without time zone,
  descripcion text,
  observaciones text,
  condiciones_climaticas text,
  confirmado_by uuid,
  confirmado_at timestamptz,
  anulado_by uuid,
  anulado_at timestamptz,
  motivo_anulacion text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campo_partes_numero_positivo CHECK (numero > 0),
  CONSTRAINT campo_partes_estado_valido CHECK (estado IN ('borrador', 'confirmado', 'anulado')),
  CONSTRAINT campo_partes_horas_coherentes CHECK (hora_inicio IS NULL OR hora_fin IS NULL OR hora_fin > hora_inicio),
  CONSTRAINT campo_partes_descripcion_no_vacia CHECK (descripcion IS NULL OR btrim(descripcion) <> ''),
  CONSTRAINT campo_partes_observaciones_no_vacias CHECK (observaciones IS NULL OR btrim(observaciones) <> ''),
  CONSTRAINT campo_partes_clima_no_vacio CHECK (condiciones_climaticas IS NULL OR btrim(condiciones_climaticas) <> ''),
  CONSTRAINT campo_partes_motivo_anulacion_no_vacio CHECK (motivo_anulacion IS NULL OR btrim(motivo_anulacion) <> ''),
  CONSTRAINT campo_partes_estado_auditoria_coherente CHECK (
    (estado = 'borrador' AND confirmado_by IS NULL AND confirmado_at IS NULL AND anulado_by IS NULL AND anulado_at IS NULL AND motivo_anulacion IS NULL)
    OR (estado = 'confirmado' AND confirmado_by IS NOT NULL AND confirmado_at IS NOT NULL AND anulado_by IS NULL AND anulado_at IS NULL AND motivo_anulacion IS NULL)
    OR (estado = 'anulado' AND confirmado_by IS NOT NULL AND confirmado_at IS NOT NULL AND anulado_by IS NOT NULL AND anulado_at IS NOT NULL AND motivo_anulacion IS NOT NULL)
  ),
  CONSTRAINT campo_partes_comercio_id_id_key UNIQUE (comercio_id, id),
  CONSTRAINT campo_partes_comercio_orden_numero_key UNIQUE (comercio_id, orden_id, numero),
  CONSTRAINT campo_partes_orden_fkey FOREIGN KEY (comercio_id, orden_id)
    REFERENCES public.campo_ordenes_trabajo(comercio_id, id) ON DELETE RESTRICT,
  CONSTRAINT campo_partes_labor_fkey FOREIGN KEY (comercio_id, orden_labor_id)
    REFERENCES public.campo_orden_labores(comercio_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.campo_parte_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  parte_id uuid NOT NULL,
  orden_labor_lote_id uuid NOT NULL,
  cantidad_ejecutada numeric(14,4) NOT NULL,
  observaciones text,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campo_parte_lotes_cantidad_positiva CHECK (cantidad_ejecutada > 0),
  CONSTRAINT campo_parte_lotes_observaciones_no_vacias CHECK (observaciones IS NULL OR btrim(observaciones) <> ''),
  CONSTRAINT campo_parte_lotes_comercio_id_id_key UNIQUE (comercio_id, id),
  CONSTRAINT campo_parte_lotes_parte_asignacion_key UNIQUE (comercio_id, parte_id, orden_labor_lote_id),
  CONSTRAINT campo_parte_lotes_parte_fkey FOREIGN KEY (comercio_id, parte_id)
    REFERENCES public.campo_partes_trabajo(comercio_id, id) ON DELETE RESTRICT,
  CONSTRAINT campo_parte_lotes_asignacion_fkey FOREIGN KEY (comercio_id, orden_labor_lote_id)
    REFERENCES public.campo_orden_labor_lotes(comercio_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.campo_parte_operarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  parte_id uuid NOT NULL,
  operario_id uuid NOT NULL,
  funcion text,
  horas_trabajadas numeric(10,2),
  observaciones text,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(), updated_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campo_parte_operarios_funcion_no_vacia CHECK (funcion IS NULL OR btrim(funcion) <> ''),
  CONSTRAINT campo_parte_operarios_horas_positivas CHECK (horas_trabajadas IS NULL OR horas_trabajadas > 0),
  CONSTRAINT campo_parte_operarios_observaciones_no_vacias CHECK (observaciones IS NULL OR btrim(observaciones) <> ''),
  CONSTRAINT campo_parte_operarios_comercio_id_id_key UNIQUE (comercio_id, id),
  CONSTRAINT campo_parte_operarios_parte_operario_key UNIQUE (comercio_id, parte_id, operario_id),
  CONSTRAINT campo_parte_operarios_parte_fkey FOREIGN KEY (comercio_id, parte_id) REFERENCES public.campo_partes_trabajo(comercio_id, id) ON DELETE RESTRICT,
  CONSTRAINT campo_parte_operarios_operario_fkey FOREIGN KEY (comercio_id, operario_id) REFERENCES public.campo_operarios(comercio_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.campo_parte_maquinarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  parte_id uuid NOT NULL, maquinaria_id uuid NOT NULL,
  horas_uso numeric(10,2), lectura_inicial numeric(14,2), lectura_final numeric(14,2), unidad_lectura text,
  observaciones text, activo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(), updated_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campo_parte_maquinarias_horas_positivas CHECK (horas_uso IS NULL OR horas_uso > 0),
  CONSTRAINT campo_parte_maquinarias_lectura_inicial_valida CHECK (lectura_inicial IS NULL OR lectura_inicial >= 0),
  CONSTRAINT campo_parte_maquinarias_lectura_final_valida CHECK (lectura_final IS NULL OR lectura_final >= 0),
  CONSTRAINT campo_parte_maquinarias_lecturas_coherentes CHECK (lectura_inicial IS NULL OR lectura_final IS NULL OR lectura_final >= lectura_inicial),
  CONSTRAINT campo_parte_maquinarias_unidad_lectura_valida CHECK (
    ((lectura_inicial IS NULL AND lectura_final IS NULL) AND unidad_lectura IS NULL)
    OR ((lectura_inicial IS NOT NULL OR lectura_final IS NOT NULL) AND unidad_lectura IN ('hora', 'km'))
  ),
  CONSTRAINT campo_parte_maquinarias_observaciones_no_vacias CHECK (observaciones IS NULL OR btrim(observaciones) <> ''),
  CONSTRAINT campo_parte_maquinarias_comercio_id_id_key UNIQUE (comercio_id, id),
  CONSTRAINT campo_parte_maquinarias_parte_maquinaria_key UNIQUE (comercio_id, parte_id, maquinaria_id),
  CONSTRAINT campo_parte_maquinarias_parte_fkey FOREIGN KEY (comercio_id, parte_id) REFERENCES public.campo_partes_trabajo(comercio_id, id) ON DELETE RESTRICT,
  CONSTRAINT campo_parte_maquinarias_maquinaria_fkey FOREIGN KEY (comercio_id, maquinaria_id) REFERENCES public.campo_maquinarias(comercio_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.campo_parte_insumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  parte_id uuid NOT NULL, insumo_id uuid NOT NULL, cantidad numeric(14,4) NOT NULL, unidad text NOT NULL,
  observaciones text, activo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(), updated_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campo_parte_insumos_cantidad_positiva CHECK (cantidad > 0),
  CONSTRAINT campo_parte_insumos_unidad_valida CHECK (unidad IN ('litro', 'kilogramo', 'tonelada', 'unidad', 'bolsa', 'metro', 'dosis')),
  CONSTRAINT campo_parte_insumos_observaciones_no_vacias CHECK (observaciones IS NULL OR btrim(observaciones) <> ''),
  CONSTRAINT campo_parte_insumos_comercio_id_id_key UNIQUE (comercio_id, id),
  CONSTRAINT campo_parte_insumos_parte_insumo_key UNIQUE (comercio_id, parte_id, insumo_id),
  CONSTRAINT campo_parte_insumos_parte_fkey FOREIGN KEY (comercio_id, parte_id) REFERENCES public.campo_partes_trabajo(comercio_id, id) ON DELETE RESTRICT,
  CONSTRAINT campo_parte_insumos_insumo_fkey FOREIGN KEY (comercio_id, insumo_id) REFERENCES public.campo_insumos(comercio_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_campo_operarios_codigo ON public.campo_operarios(comercio_id, lower(btrim(codigo_interno))) WHERE codigo_interno IS NOT NULL;
CREATE UNIQUE INDEX idx_campo_operarios_documento ON public.campo_operarios(comercio_id, lower(btrim(documento))) WHERE documento IS NOT NULL;
CREATE UNIQUE INDEX idx_campo_operarios_usuario ON public.campo_operarios(comercio_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_campo_operarios_listado ON public.campo_operarios(comercio_id, activo, nombre, id);
CREATE UNIQUE INDEX idx_campo_maquinarias_codigo ON public.campo_maquinarias(comercio_id, lower(btrim(codigo_interno))) WHERE codigo_interno IS NOT NULL;
CREATE UNIQUE INDEX idx_campo_maquinarias_identificacion ON public.campo_maquinarias(comercio_id, lower(btrim(identificacion))) WHERE identificacion IS NOT NULL;
CREATE INDEX idx_campo_maquinarias_listado ON public.campo_maquinarias(comercio_id, activo, nombre, id);
CREATE INDEX idx_campo_maquinarias_tipo ON public.campo_maquinarias(comercio_id, tipo, activo);
CREATE UNIQUE INDEX idx_campo_insumos_codigo ON public.campo_insumos(comercio_id, lower(btrim(codigo_interno))) WHERE codigo_interno IS NOT NULL;
CREATE INDEX idx_campo_insumos_listado ON public.campo_insumos(comercio_id, activo, nombre, id);
CREATE INDEX idx_campo_partes_orden ON public.campo_partes_trabajo(comercio_id, orden_id, estado, fecha_trabajo DESC, numero DESC);
CREATE INDEX idx_campo_partes_labor ON public.campo_partes_trabajo(comercio_id, orden_labor_id, fecha_trabajo DESC);
CREATE INDEX idx_campo_parte_lotes_parte ON public.campo_parte_lotes(comercio_id, parte_id, activo, id);
CREATE INDEX idx_campo_parte_lotes_asignacion ON public.campo_parte_lotes(comercio_id, orden_labor_lote_id);
CREATE INDEX idx_campo_parte_operarios_parte ON public.campo_parte_operarios(comercio_id, parte_id, activo);
CREATE INDEX idx_campo_parte_maquinarias_parte ON public.campo_parte_maquinarias(comercio_id, parte_id, activo);
CREATE INDEX idx_campo_parte_insumos_parte ON public.campo_parte_insumos(comercio_id, parte_id, activo);

CREATE OR REPLACE FUNCTION public.campo_ejecucion_audit()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := v_uid; NEW.updated_by := v_uid; NEW.created_at := now(); NEW.updated_at := now();
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'campo_id_inmutable'; END IF;
    IF NEW.comercio_id IS DISTINCT FROM OLD.comercio_id THEN RAISE EXCEPTION 'campo_comercio_inmutable'; END IF;
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'campo_created_by_inmutable'; END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'campo_created_at_inmutable'; END IF;
    NEW.updated_by := v_uid; NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.campo_ejecucion_audit() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.campo_validate_operario_usuario()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF public.user_is_comercio_admin(NEW.comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'campo_admin_requerido'; END IF;
  IF NEW.user_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      IF (SELECT count(*) FROM public.comercio_usuarios cu WHERE cu.comercio_id = NEW.comercio_id AND cu.user_id = NEW.user_id AND cu.activo) <> 1 THEN
        RAISE EXCEPTION 'campo_operario_usuario_invalido';
      END IF;
    ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id OR (NEW.activo AND NOT OLD.activo) THEN
      IF (SELECT count(*) FROM public.comercio_usuarios cu WHERE cu.comercio_id = NEW.comercio_id AND cu.user_id = NEW.user_id AND cu.activo) <> 1 THEN
        RAISE EXCEPTION 'campo_operario_usuario_invalido';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.campo_validate_operario_usuario() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.campo_validate_parte_relations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_orden_estado text; v_labor_orden uuid; v_labor_activa boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF public.user_is_comercio_admin(NEW.comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'campo_admin_requerido'; END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT o.estado INTO v_orden_estado FROM public.campo_ordenes_trabajo o WHERE o.id = NEW.orden_id AND o.comercio_id = NEW.comercio_id FOR UPDATE;
  ELSE
    SELECT o.estado INTO v_orden_estado FROM public.campo_ordenes_trabajo o WHERE o.id = NEW.orden_id AND o.comercio_id = NEW.comercio_id;
  END IF;
  IF v_orden_estado IS NULL THEN RAISE EXCEPTION 'campo_orden_invalida'; END IF;
  SELECT l.orden_id, l.activo INTO v_labor_orden, v_labor_activa FROM public.campo_orden_labores l WHERE l.id = NEW.orden_labor_id AND l.comercio_id = NEW.comercio_id;
  IF v_labor_orden IS NULL OR v_labor_orden IS DISTINCT FROM NEW.orden_id THEN RAISE EXCEPTION 'campo_labor_invalida'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.orden_id IS DISTINCT FROM OLD.orden_id OR NEW.orden_labor_id IS DISTINCT FROM OLD.orden_labor_id OR NEW.numero IS DISTINCT FROM OLD.numero) THEN
    RAISE EXCEPTION 'campo_parte_relacion_inmutable';
  END IF;
  -- La anulacion conserva historia y puede ocurrir luego de finalizar/cancelar la orden.
  -- Altas, ediciones de borrador y confirmaciones siguen exigiendo una orden operativa
  -- y una labor activa; la RPC de confirmacion repite estas validaciones bajo bloqueo.
  IF TG_OP = 'INSERT' OR OLD.estado = 'borrador' THEN
    IF v_orden_estado NOT IN ('planificada', 'en_progreso') THEN RAISE EXCEPTION 'campo_orden_no_admite_partes'; END IF;
    IF v_labor_activa IS DISTINCT FROM true THEN RAISE EXCEPTION 'campo_labor_inactiva'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.campo_validate_parte_relations() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.campo_assign_parte_numero()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF public.user_is_comercio_admin(NEW.comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'campo_admin_requerido'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('vortex_campo_parte:' || NEW.orden_id::text, 0));
  SELECT COALESCE(max(p.numero), 0) + 1 INTO NEW.numero FROM public.campo_partes_trabajo p WHERE p.comercio_id = NEW.comercio_id AND p.orden_id = NEW.orden_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.campo_assign_parte_numero() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.campo_protect_parte_state()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.estado := 'borrador'; NEW.confirmado_by := NULL; NEW.confirmado_at := NULL;
    NEW.anulado_by := NULL; NEW.anulado_at := NULL; NEW.motivo_anulacion := NULL;
    RETURN NEW;
  END IF;
  IF OLD.estado IN ('confirmado', 'anulado') THEN
    IF NOT (OLD.estado = 'confirmado' AND NEW.estado = 'anulado'
      AND NEW.orden_id IS NOT DISTINCT FROM OLD.orden_id AND NEW.orden_labor_id IS NOT DISTINCT FROM OLD.orden_labor_id
      AND NEW.numero IS NOT DISTINCT FROM OLD.numero AND NEW.fecha_trabajo IS NOT DISTINCT FROM OLD.fecha_trabajo
      AND NEW.hora_inicio IS NOT DISTINCT FROM OLD.hora_inicio AND NEW.hora_fin IS NOT DISTINCT FROM OLD.hora_fin
      AND NEW.descripcion IS NOT DISTINCT FROM OLD.descripcion AND NEW.observaciones IS NOT DISTINCT FROM OLD.observaciones
      AND NEW.condiciones_climaticas IS NOT DISTINCT FROM OLD.condiciones_climaticas
      AND NEW.confirmado_by IS NOT DISTINCT FROM OLD.confirmado_by AND NEW.confirmado_at IS NOT DISTINCT FROM OLD.confirmado_at)
    THEN RAISE EXCEPTION 'campo_parte_congelado'; END IF;
  END IF;
  IF OLD.estado = 'borrador' AND NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado <> 'confirmado' THEN RAISE EXCEPTION 'campo_transicion_parte_no_habilitada'; END IF;
  IF OLD.estado = 'confirmado' AND NEW.estado = 'anulado' THEN
    IF NEW.anulado_by IS NULL OR NEW.anulado_at IS NULL OR NEW.motivo_anulacion IS NULL THEN RAISE EXCEPTION 'campo_anulacion_incompleta'; END IF;
  ELSIF OLD.estado = 'borrador' AND NEW.estado = 'confirmado' THEN
    IF NEW.confirmado_by IS NULL OR NEW.confirmado_at IS NULL THEN RAISE EXCEPTION 'campo_confirmacion_incompleta'; END IF;
  ELSIF NEW.estado = OLD.estado THEN
    IF NEW.confirmado_by IS DISTINCT FROM OLD.confirmado_by OR NEW.confirmado_at IS DISTINCT FROM OLD.confirmado_at
      OR NEW.anulado_by IS DISTINCT FROM OLD.anulado_by OR NEW.anulado_at IS DISTINCT FROM OLD.anulado_at
      OR NEW.motivo_anulacion IS DISTINCT FROM OLD.motivo_anulacion THEN RAISE EXCEPTION 'campo_fechas_estado_no_editables'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.campo_protect_parte_state() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.campo_validate_parte_detail_relations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_estado text; v_labor uuid; v_activo boolean; v_unidad text; v_asignacion_labor uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF public.user_is_comercio_admin(NEW.comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'campo_admin_requerido'; END IF;
  SELECT p.estado, p.orden_labor_id INTO v_estado, v_labor FROM public.campo_partes_trabajo p WHERE p.id = NEW.parte_id AND p.comercio_id = NEW.comercio_id FOR UPDATE;
  IF v_estado IS NULL THEN RAISE EXCEPTION 'campo_parte_invalido'; END IF;
  IF v_estado <> 'borrador' THEN RAISE EXCEPTION 'campo_parte_congelado'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.parte_id IS DISTINCT FROM OLD.parte_id THEN RAISE EXCEPTION 'campo_parte_detalle_inmutable'; END IF;
  IF TG_TABLE_NAME = 'campo_parte_lotes' THEN
    IF TG_OP = 'UPDATE' AND NEW.orden_labor_lote_id IS DISTINCT FROM OLD.orden_labor_lote_id THEN RAISE EXCEPTION 'campo_asignacion_parte_inmutable'; END IF;
    SELECT oll.orden_labor_id, oll.activo, l.unidad INTO v_asignacion_labor, v_activo, v_unidad
    FROM public.campo_orden_labor_lotes oll JOIN public.campo_orden_labores l ON l.id = oll.orden_labor_id AND l.comercio_id = oll.comercio_id
    WHERE oll.id = NEW.orden_labor_lote_id AND oll.comercio_id = NEW.comercio_id;
    IF v_asignacion_labor IS NULL OR v_asignacion_labor IS DISTINCT FROM v_labor THEN RAISE EXCEPTION 'campo_asignacion_planificada_invalida'; END IF;
    IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.activo AND NOT OLD.activo)) AND v_activo IS DISTINCT FROM true THEN RAISE EXCEPTION 'campo_asignacion_planificada_inactiva'; END IF;
    IF v_unidad = 'fijo' AND NEW.cantidad_ejecutada <> 1 THEN RAISE EXCEPTION 'campo_cantidad_fijo_debe_ser_uno'; END IF;
  ELSIF TG_TABLE_NAME = 'campo_parte_operarios' THEN
    IF TG_OP = 'UPDATE' AND NEW.operario_id IS DISTINCT FROM OLD.operario_id THEN RAISE EXCEPTION 'campo_operario_parte_inmutable'; END IF;
    SELECT o.activo INTO v_activo FROM public.campo_operarios o WHERE o.id = NEW.operario_id AND o.comercio_id = NEW.comercio_id;
    IF v_activo IS NULL THEN RAISE EXCEPTION 'campo_operario_invalido'; END IF;
    IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.activo AND NOT OLD.activo)) AND NOT v_activo THEN RAISE EXCEPTION 'campo_operario_inactivo'; END IF;
  ELSIF TG_TABLE_NAME = 'campo_parte_maquinarias' THEN
    IF TG_OP = 'UPDATE' AND NEW.maquinaria_id IS DISTINCT FROM OLD.maquinaria_id THEN RAISE EXCEPTION 'campo_maquinaria_parte_inmutable'; END IF;
    SELECT m.activo INTO v_activo FROM public.campo_maquinarias m WHERE m.id = NEW.maquinaria_id AND m.comercio_id = NEW.comercio_id;
    IF v_activo IS NULL THEN RAISE EXCEPTION 'campo_maquinaria_invalida'; END IF;
    IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.activo AND NOT OLD.activo)) AND NOT v_activo THEN RAISE EXCEPTION 'campo_maquinaria_inactiva'; END IF;
  ELSIF TG_TABLE_NAME = 'campo_parte_insumos' THEN
    IF TG_OP = 'UPDATE' AND NEW.insumo_id IS DISTINCT FROM OLD.insumo_id THEN RAISE EXCEPTION 'campo_insumo_parte_inmutable'; END IF;
    SELECT i.activo, i.unidad INTO v_activo, v_unidad FROM public.campo_insumos i WHERE i.id = NEW.insumo_id AND i.comercio_id = NEW.comercio_id;
    IF v_activo IS NULL THEN RAISE EXCEPTION 'campo_insumo_invalido'; END IF;
    IF NEW.unidad IS DISTINCT FROM v_unidad THEN RAISE EXCEPTION 'campo_insumo_unidad_invalida'; END IF;
    IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.activo AND NOT OLD.activo)) AND NOT v_activo THEN RAISE EXCEPTION 'campo_insumo_inactivo'; END IF;
  ELSE RAISE EXCEPTION 'campo_detalle_parte_no_soportado';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.campo_validate_parte_detail_relations() FROM PUBLIC, anon, authenticated;

-- Reemplaza el protector inicial: todos los cambios de estado quedan validados aquí.
CREATE OR REPLACE FUNCTION public.campo_protect_orden_planificacion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_comercio uuid; v_cliente uuid; v_activo boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF public.user_is_comercio_admin(NEW.comercio_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'campo_admin_requerido'; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.estado := 'borrador'; NEW.iniciada_at := NULL; NEW.finalizada_at := NULL; NEW.cancelada_at := NULL; NEW.motivo_cancelacion := NULL; RETURN NEW;
  END IF;
  IF NEW.numero IS DISTINCT FROM OLD.numero THEN RAISE EXCEPTION 'campo_numero_orden_inmutable'; END IF;
  IF NEW.estado = OLD.estado AND (NEW.iniciada_at IS DISTINCT FROM OLD.iniciada_at OR NEW.finalizada_at IS DISTINCT FROM OLD.finalizada_at OR NEW.cancelada_at IS DISTINCT FROM OLD.cancelada_at OR NEW.motivo_cancelacion IS DISTINCT FROM OLD.motivo_cancelacion) THEN RAISE EXCEPTION 'campo_fechas_estado_no_editables'; END IF;
  IF OLD.estado <> 'borrador' AND (NEW.cliente_id IS DISTINCT FROM OLD.cliente_id OR NEW.establecimiento_id IS DISTINCT FROM OLD.establecimiento_id OR NEW.codigo_interno IS DISTINCT FROM OLD.codigo_interno OR NEW.fecha_inicio_planificada IS DISTINCT FROM OLD.fecha_inicio_planificada OR NEW.fecha_fin_planificada IS DISTINCT FROM OLD.fecha_fin_planificada OR NEW.descripcion IS DISTINCT FROM OLD.descripcion) THEN RAISE EXCEPTION 'campo_planificacion_congelada'; END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT ((OLD.estado = 'borrador' AND NEW.estado = 'planificada') OR (OLD.estado = 'planificada' AND NEW.estado IN ('borrador','en_progreso','cancelada')) OR (OLD.estado = 'en_progreso' AND NEW.estado IN ('finalizada','cancelada'))) THEN RAISE EXCEPTION 'campo_transicion_orden_no_habilitada'; END IF;
    IF OLD.estado = 'borrador' AND NEW.estado = 'planificada' THEN
      SELECT e.comercio_id, e.cliente_id, e.activo INTO v_comercio, v_cliente, v_activo FROM public.campo_establecimientos e WHERE e.id = NEW.establecimiento_id;
      IF v_comercio IS DISTINCT FROM NEW.comercio_id OR v_activo IS DISTINCT FROM true THEN RAISE EXCEPTION 'campo_establecimiento_no_disponible_planificar'; END IF;
      IF v_cliente IS DISTINCT FROM NEW.cliente_id THEN RAISE EXCEPTION 'campo_cliente_no_coincide_establecimiento'; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.campo_orden_labores l WHERE l.comercio_id=NEW.comercio_id AND l.orden_id=NEW.id AND l.activo) THEN RAISE EXCEPTION 'campo_orden_sin_labores_activas'; END IF;
      IF EXISTS (SELECT 1 FROM public.campo_orden_labores l WHERE l.comercio_id=NEW.comercio_id AND l.orden_id=NEW.id AND l.activo AND NOT EXISTS (SELECT 1 FROM public.campo_orden_labor_lotes a WHERE a.comercio_id=l.comercio_id AND a.orden_labor_id=l.id AND a.activo)) THEN RAISE EXCEPTION 'campo_labor_sin_lotes_activos'; END IF;
      IF EXISTS (SELECT 1 FROM public.campo_orden_labores l JOIN public.campo_orden_labor_lotes a ON a.comercio_id=l.comercio_id AND a.orden_labor_id=l.id JOIN public.campo_lotes lote ON lote.id=a.lote_id AND lote.comercio_id=a.comercio_id WHERE l.comercio_id=NEW.comercio_id AND l.orden_id=NEW.id AND l.activo AND a.activo AND (NOT lote.activo OR lote.establecimiento_id IS DISTINCT FROM NEW.establecimiento_id OR (l.unidad='fijo' AND a.cantidad_planificada<>1))) THEN RAISE EXCEPTION 'campo_asignacion_no_disponible_planificar'; END IF;
    ELSIF OLD.estado='planificada' AND NEW.estado='borrador' THEN
      IF EXISTS (SELECT 1 FROM public.campo_partes_trabajo p WHERE p.comercio_id=NEW.comercio_id AND p.orden_id=NEW.id) THEN RAISE EXCEPTION 'campo_orden_con_partes_no_reabrible'; END IF;
    ELSIF OLD.estado='planificada' AND NEW.estado='en_progreso' THEN
      IF NOT EXISTS (SELECT 1 FROM public.campo_partes_trabajo p WHERE p.comercio_id=NEW.comercio_id AND p.orden_id=NEW.id AND p.estado='confirmado') THEN RAISE EXCEPTION 'campo_inicio_requiere_parte_confirmado'; END IF;
      NEW.iniciada_at := COALESCE(OLD.iniciada_at, now());
    ELSIF OLD.estado='en_progreso' AND NEW.estado='finalizada' THEN
      IF NOT EXISTS (SELECT 1 FROM public.campo_partes_trabajo p WHERE p.comercio_id=NEW.comercio_id AND p.orden_id=NEW.id AND p.estado='confirmado') THEN RAISE EXCEPTION 'campo_finalizacion_sin_partes_confirmados'; END IF;
      IF EXISTS (SELECT 1 FROM public.campo_partes_trabajo p WHERE p.comercio_id=NEW.comercio_id AND p.orden_id=NEW.id AND p.estado='borrador') THEN RAISE EXCEPTION 'campo_orden_con_partes_borrador'; END IF;
      NEW.finalizada_at := now(); NEW.cancelada_at := NULL; NEW.motivo_cancelacion := NULL;
    ELSIF NEW.estado='cancelada' THEN
      IF NEW.motivo_cancelacion IS NULL OR btrim(NEW.motivo_cancelacion)='' THEN RAISE EXCEPTION 'campo_cancelacion_requiere_motivo'; END IF;
      IF EXISTS (SELECT 1 FROM public.campo_partes_trabajo p WHERE p.comercio_id=NEW.comercio_id AND p.orden_id=NEW.id AND p.estado='borrador') THEN RAISE EXCEPTION 'campo_orden_con_partes_borrador'; END IF;
      NEW.cancelada_at := now(); NEW.finalizada_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.campo_protect_orden_planificacion() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.campo_confirmar_parte(p_parte_id uuid)
RETURNS public.campo_partes_trabajo LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_uid uuid:=auth.uid(); v_parte public.campo_partes_trabajo; v_orden public.campo_ordenes_trabajo; v_labor public.campo_orden_labores;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  SELECT * INTO v_parte FROM public.campo_partes_trabajo p WHERE p.id=p_parte_id;
  IF v_parte.id IS NULL OR NOT public.user_is_comercio_admin(v_parte.comercio_id) THEN RAISE EXCEPTION 'campo_parte_no_disponible'; END IF;
  SELECT * INTO STRICT v_orden FROM public.campo_ordenes_trabajo o WHERE o.id=v_parte.orden_id AND o.comercio_id=v_parte.comercio_id FOR UPDATE;
  SELECT * INTO v_parte FROM public.campo_partes_trabajo p WHERE p.id=p_parte_id AND p.comercio_id=v_orden.comercio_id AND p.orden_id=v_orden.id FOR UPDATE;
  IF v_parte.id IS NULL OR v_parte.estado<>'borrador' THEN RAISE EXCEPTION 'campo_parte_no_confirmable'; END IF;
  IF v_orden.estado NOT IN ('planificada','en_progreso') THEN RAISE EXCEPTION 'campo_orden_no_admite_confirmacion'; END IF;
  SELECT * INTO STRICT v_labor FROM public.campo_orden_labores l WHERE l.id=v_parte.orden_labor_id AND l.comercio_id=v_parte.comercio_id;
  IF v_labor.orden_id<>v_parte.orden_id OR NOT v_labor.activo THEN RAISE EXCEPTION 'campo_labor_invalida'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.campo_parte_lotes d WHERE d.comercio_id=v_parte.comercio_id AND d.parte_id=v_parte.id AND d.activo) THEN RAISE EXCEPTION 'campo_parte_sin_lotes'; END IF;
  IF EXISTS (SELECT 1 FROM public.campo_parte_lotes d LEFT JOIN public.campo_orden_labor_lotes a ON a.id=d.orden_labor_lote_id AND a.comercio_id=d.comercio_id LEFT JOIN public.campo_lotes lote ON lote.id=a.lote_id AND lote.comercio_id=d.comercio_id WHERE d.comercio_id=v_parte.comercio_id AND d.parte_id=v_parte.id AND d.activo AND (a.id IS NULL OR NOT a.activo OR a.orden_labor_id<>v_parte.orden_labor_id OR lote.id IS NULL OR NOT lote.activo OR (v_labor.unidad='fijo' AND d.cantidad_ejecutada<>1))) THEN RAISE EXCEPTION 'campo_parte_lotes_invalidos'; END IF;
  IF EXISTS (SELECT 1 FROM public.campo_parte_operarios d LEFT JOIN public.campo_operarios c ON c.id=d.operario_id AND c.comercio_id=d.comercio_id WHERE d.comercio_id=v_parte.comercio_id AND d.parte_id=v_parte.id AND d.activo AND (c.id IS NULL OR NOT c.activo)) THEN RAISE EXCEPTION 'campo_parte_operarios_invalidos'; END IF;
  IF EXISTS (SELECT 1 FROM public.campo_parte_maquinarias d LEFT JOIN public.campo_maquinarias c ON c.id=d.maquinaria_id AND c.comercio_id=d.comercio_id WHERE d.comercio_id=v_parte.comercio_id AND d.parte_id=v_parte.id AND d.activo AND (c.id IS NULL OR NOT c.activo)) THEN RAISE EXCEPTION 'campo_parte_maquinarias_invalidas'; END IF;
  IF EXISTS (SELECT 1 FROM public.campo_parte_insumos d LEFT JOIN public.campo_insumos c ON c.id=d.insumo_id AND c.comercio_id=d.comercio_id WHERE d.comercio_id=v_parte.comercio_id AND d.parte_id=v_parte.id AND d.activo AND (c.id IS NULL OR NOT c.activo OR d.unidad<>c.unidad)) THEN RAISE EXCEPTION 'campo_parte_insumos_invalidos'; END IF;
  UPDATE public.campo_partes_trabajo SET estado='confirmado', confirmado_by=v_uid, confirmado_at=now() WHERE id=v_parte.id AND comercio_id=v_parte.comercio_id AND orden_id=v_parte.orden_id RETURNING * INTO v_parte;
  IF v_orden.estado='planificada' THEN UPDATE public.campo_ordenes_trabajo SET estado='en_progreso' WHERE id=v_orden.id AND comercio_id=v_orden.comercio_id; END IF;
  RETURN v_parte;
END;
$$;
REVOKE ALL ON FUNCTION public.campo_confirmar_parte(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campo_confirmar_parte(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.campo_anular_parte(p_parte_id uuid, p_motivo text)
RETURNS public.campo_partes_trabajo LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_uid uuid:=auth.uid(); v_parte public.campo_partes_trabajo; v_orden public.campo_ordenes_trabajo;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo)='' THEN RAISE EXCEPTION 'campo_anulacion_requiere_motivo'; END IF;
  SELECT * INTO v_parte FROM public.campo_partes_trabajo p WHERE p.id=p_parte_id;
  IF v_parte.id IS NULL OR NOT public.user_is_comercio_admin(v_parte.comercio_id) THEN RAISE EXCEPTION 'campo_parte_no_disponible'; END IF;
  SELECT * INTO STRICT v_orden FROM public.campo_ordenes_trabajo o WHERE o.id=v_parte.orden_id AND o.comercio_id=v_parte.comercio_id FOR UPDATE;
  SELECT * INTO v_parte FROM public.campo_partes_trabajo p WHERE p.id=p_parte_id AND p.comercio_id=v_orden.comercio_id AND p.orden_id=v_orden.id FOR UPDATE;
  IF v_parte.id IS NULL OR v_parte.estado<>'confirmado' THEN RAISE EXCEPTION 'campo_parte_no_anulable'; END IF;
  UPDATE public.campo_partes_trabajo SET estado='anulado', anulado_by=v_uid, anulado_at=now(), motivo_anulacion=btrim(p_motivo) WHERE id=v_parte.id AND comercio_id=v_parte.comercio_id AND orden_id=v_parte.orden_id RETURNING * INTO v_parte;
  RETURN v_parte;
END;
$$;
REVOKE ALL ON FUNCTION public.campo_anular_parte(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campo_anular_parte(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.campo_cambiar_estado_orden(p_orden_id uuid, p_nuevo_estado text, p_motivo text DEFAULT NULL)
RETURNS public.campo_ordenes_trabajo LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_orden public.campo_ordenes_trabajo;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  SELECT * INTO v_orden FROM public.campo_ordenes_trabajo o WHERE o.id=p_orden_id FOR UPDATE;
  IF v_orden.id IS NULL OR NOT public.user_is_comercio_admin(v_orden.comercio_id) THEN RAISE EXCEPTION 'campo_orden_no_disponible'; END IF;
  IF NOT ((v_orden.estado='borrador' AND p_nuevo_estado='planificada') OR (v_orden.estado='planificada' AND p_nuevo_estado='borrador') OR (v_orden.estado='en_progreso' AND p_nuevo_estado='finalizada') OR (v_orden.estado IN ('planificada','en_progreso') AND p_nuevo_estado='cancelada')) THEN RAISE EXCEPTION 'campo_transicion_orden_no_habilitada'; END IF;
  UPDATE public.campo_ordenes_trabajo SET estado=p_nuevo_estado, motivo_cancelacion=CASE WHEN p_nuevo_estado='cancelada' THEN NULLIF(btrim(p_motivo),'') ELSE motivo_cancelacion END WHERE id=v_orden.id AND comercio_id=v_orden.comercio_id RETURNING * INTO v_orden;
  RETURN v_orden;
END;
$$;
REVOKE ALL ON FUNCTION public.campo_cambiar_estado_orden(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campo_cambiar_estado_orden(uuid, text, text) TO authenticated;

-- Triggers: PostgreSQL ordena alfabéticamente los del mismo evento/tipo.
CREATE TRIGGER "10_campo_operarios_audit" BEFORE INSERT OR UPDATE ON public.campo_operarios FOR EACH ROW EXECUTE FUNCTION public.campo_ejecucion_audit();
CREATE TRIGGER "20_campo_operarios_validate" BEFORE INSERT OR UPDATE ON public.campo_operarios FOR EACH ROW EXECUTE FUNCTION public.campo_validate_operario_usuario();
CREATE TRIGGER "10_campo_maquinarias_audit" BEFORE INSERT OR UPDATE ON public.campo_maquinarias FOR EACH ROW EXECUTE FUNCTION public.campo_ejecucion_audit();
CREATE TRIGGER "10_campo_insumos_audit" BEFORE INSERT OR UPDATE ON public.campo_insumos FOR EACH ROW EXECUTE FUNCTION public.campo_ejecucion_audit();
CREATE TRIGGER "10_campo_partes_audit" BEFORE INSERT OR UPDATE ON public.campo_partes_trabajo FOR EACH ROW EXECUTE FUNCTION public.campo_ejecucion_audit();
CREATE TRIGGER "20_campo_partes_validate" BEFORE INSERT OR UPDATE ON public.campo_partes_trabajo FOR EACH ROW EXECUTE FUNCTION public.campo_validate_parte_relations();
CREATE TRIGGER "30_campo_partes_numero" BEFORE INSERT ON public.campo_partes_trabajo FOR EACH ROW EXECUTE FUNCTION public.campo_assign_parte_numero();
CREATE TRIGGER "40_campo_partes_protect" BEFORE INSERT OR UPDATE ON public.campo_partes_trabajo FOR EACH ROW EXECUTE FUNCTION public.campo_protect_parte_state();
CREATE TRIGGER "10_campo_parte_lotes_audit" BEFORE INSERT OR UPDATE ON public.campo_parte_lotes FOR EACH ROW EXECUTE FUNCTION public.campo_ejecucion_audit();
CREATE TRIGGER "20_campo_parte_lotes_validate" BEFORE INSERT OR UPDATE ON public.campo_parte_lotes FOR EACH ROW EXECUTE FUNCTION public.campo_validate_parte_detail_relations();
CREATE TRIGGER "10_campo_parte_operarios_audit" BEFORE INSERT OR UPDATE ON public.campo_parte_operarios FOR EACH ROW EXECUTE FUNCTION public.campo_ejecucion_audit();
CREATE TRIGGER "20_campo_parte_operarios_validate" BEFORE INSERT OR UPDATE ON public.campo_parte_operarios FOR EACH ROW EXECUTE FUNCTION public.campo_validate_parte_detail_relations();
CREATE TRIGGER "10_campo_parte_maquinarias_audit" BEFORE INSERT OR UPDATE ON public.campo_parte_maquinarias FOR EACH ROW EXECUTE FUNCTION public.campo_ejecucion_audit();
CREATE TRIGGER "20_campo_parte_maquinarias_validate" BEFORE INSERT OR UPDATE ON public.campo_parte_maquinarias FOR EACH ROW EXECUTE FUNCTION public.campo_validate_parte_detail_relations();
CREATE TRIGGER "10_campo_parte_insumos_audit" BEFORE INSERT OR UPDATE ON public.campo_parte_insumos FOR EACH ROW EXECUTE FUNCTION public.campo_ejecucion_audit();
CREATE TRIGGER "20_campo_parte_insumos_validate" BEFORE INSERT OR UPDATE ON public.campo_parte_insumos FOR EACH ROW EXECUTE FUNCTION public.campo_validate_parte_detail_relations();

ALTER TABLE public.campo_operarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campo_maquinarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campo_insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campo_partes_trabajo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campo_parte_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campo_parte_operarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campo_parte_maquinarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campo_parte_insumos ENABLE ROW LEVEL SECURITY;

DO $policies$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['campo_operarios','campo_maquinarias','campo_insumos','campo_partes_trabajo','campo_parte_lotes','campo_parte_operarios','campo_parte_maquinarias','campo_parte_insumos'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_belongs_to_comercio(comercio_id))', t || '_select_miembros', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_is_comercio_admin(comercio_id))', t || '_insert_admin', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_is_comercio_admin(comercio_id)) WITH CHECK (public.user_is_comercio_admin(comercio_id))', t || '_update_admin', t);
  END LOOP;
END;
$policies$;

REVOKE ALL ON TABLE public.campo_operarios, public.campo_maquinarias, public.campo_insumos, public.campo_partes_trabajo, public.campo_parte_lotes, public.campo_parte_operarios, public.campo_parte_maquinarias, public.campo_parte_insumos FROM PUBLIC, anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.campo_operarios, public.campo_maquinarias, public.campo_insumos, public.campo_partes_trabajo, public.campo_parte_lotes, public.campo_parte_operarios, public.campo_parte_maquinarias, public.campo_parte_insumos FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.campo_operarios, public.campo_maquinarias, public.campo_insumos, public.campo_partes_trabajo, public.campo_parte_lotes, public.campo_parte_operarios, public.campo_parte_maquinarias, public.campo_parte_insumos TO authenticated;
GRANT UPDATE (nombre,codigo_interno,documento,telefono,user_id,observaciones,activo) ON public.campo_operarios TO authenticated;
GRANT UPDATE (nombre,codigo_interno,tipo,marca,modelo,identificacion,anio,observaciones,activo) ON public.campo_maquinarias TO authenticated;
GRANT UPDATE (nombre,codigo_interno,unidad,observaciones,activo) ON public.campo_insumos TO authenticated;
GRANT UPDATE (fecha_trabajo,hora_inicio,hora_fin,descripcion,observaciones,condiciones_climaticas) ON public.campo_partes_trabajo TO authenticated;
GRANT UPDATE (cantidad_ejecutada,observaciones,activo) ON public.campo_parte_lotes TO authenticated;
GRANT UPDATE (funcion,horas_trabajadas,observaciones,activo) ON public.campo_parte_operarios TO authenticated;
GRANT UPDATE (horas_uso,lectura_inicial,lectura_final,unidad_lectura,observaciones,activo) ON public.campo_parte_maquinarias TO authenticated;
GRANT UPDATE (cantidad,unidad,observaciones,activo) ON public.campo_parte_insumos TO authenticated;

-- Endurece tablas de planificación: identificadores, tenant, auditoría y estado no son editables directamente.
REVOKE UPDATE ON public.campo_ordenes_trabajo, public.campo_orden_labores, public.campo_orden_labor_lotes FROM authenticated;
GRANT UPDATE (cliente_id,establecimiento_id,codigo_interno,fecha_inicio_planificada,fecha_fin_planificada,descripcion,observaciones) ON public.campo_ordenes_trabajo TO authenticated;
GRANT UPDATE (nombre,codigo_interno,descripcion,unidad,posicion,activo) ON public.campo_orden_labores TO authenticated;
GRANT UPDATE (cantidad_planificada,observaciones,activo) ON public.campo_orden_labor_lotes TO authenticated;

COMMENT ON TABLE public.campo_parte_lotes IS 'Avance ejecutado por asignacion planificada. Sobre-ejecucion permitida; el avance suma solo filas activas de partes confirmados.';
