-- Costos internos reales. Solo estructura, permisos y triggers; sin backfill.
-- Monedas persistidas: exclusivamente ARS y USD. Sin conversiones monetarias.
BEGIN;

ALTER TABLE public.campo_operarios
  ADD COLUMN costo_hora numeric(16,4),
  ADD COLUMN moneda_costo character(3),
  ADD CONSTRAINT campo_operarios_costo_valido CHECK (
    (costo_hora IS NULL AND moneda_costo IS NULL)
    OR (costo_hora IS NOT NULL AND costo_hora <> 'NaN'::numeric
      AND costo_hora >= 0 AND moneda_costo IS NOT NULL
      AND moneda_costo IN ('ARS', 'USD'))
  );

ALTER TABLE public.campo_maquinarias
  ADD COLUMN costo_hora numeric(16,4),
  ADD COLUMN moneda_costo character(3),
  ADD CONSTRAINT campo_maquinarias_costo_valido CHECK (
    (costo_hora IS NULL AND moneda_costo IS NULL)
    OR (costo_hora IS NOT NULL AND costo_hora <> 'NaN'::numeric
      AND costo_hora >= 0 AND moneda_costo IS NOT NULL
      AND moneda_costo IN ('ARS', 'USD'))
  );

ALTER TABLE public.campo_insumos
  ADD COLUMN costo_unitario numeric(16,4),
  ADD COLUMN moneda_costo character(3),
  ADD CONSTRAINT campo_insumos_costo_valido CHECK (
    (costo_unitario IS NULL AND moneda_costo IS NULL)
    OR (costo_unitario IS NOT NULL AND costo_unitario <> 'NaN'::numeric
      AND costo_unitario >= 0 AND moneda_costo IS NOT NULL
      AND moneda_costo IN ('ARS', 'USD'))
  );

-- Se conservan las politicas de catalogos: escritura solo para administradores.
-- INSERT ya esta concedido por tabla bajo esas politicas. Solo se amplia UPDATE
-- a las columnas de costo; no se conceden columnas de identidad ni auditoria.
GRANT UPDATE (costo_hora, moneda_costo) ON public.campo_operarios TO authenticated;
GRANT UPDATE (costo_hora, moneda_costo) ON public.campo_maquinarias TO authenticated;
GRANT UPDATE (costo_unitario, moneda_costo) ON public.campo_insumos TO authenticated;

ALTER TABLE public.campo_parte_operarios
  ADD COLUMN costo_hora_snapshot numeric(16,4),
  ADD COLUMN moneda_costo_snapshot character(3),
  ADD CONSTRAINT campo_parte_operarios_costo_snapshot_valido CHECK (
    (costo_hora_snapshot IS NULL AND moneda_costo_snapshot IS NULL)
    OR (costo_hora_snapshot IS NOT NULL AND costo_hora_snapshot <> 'NaN'::numeric
      AND costo_hora_snapshot >= 0 AND moneda_costo_snapshot IS NOT NULL
      AND moneda_costo_snapshot IN ('ARS', 'USD'))
  );

ALTER TABLE public.campo_parte_maquinarias
  ADD COLUMN costo_hora_snapshot numeric(16,4),
  ADD COLUMN moneda_costo_snapshot character(3),
  ADD CONSTRAINT campo_parte_maquinarias_costo_snapshot_valido CHECK (
    (costo_hora_snapshot IS NULL AND moneda_costo_snapshot IS NULL)
    OR (costo_hora_snapshot IS NOT NULL AND costo_hora_snapshot <> 'NaN'::numeric
      AND costo_hora_snapshot >= 0 AND moneda_costo_snapshot IS NOT NULL
      AND moneda_costo_snapshot IN ('ARS', 'USD'))
  );

ALTER TABLE public.campo_parte_insumos
  ADD COLUMN costo_unitario_snapshot numeric(16,4),
  ADD COLUMN moneda_costo_snapshot character(3),
  ADD CONSTRAINT campo_parte_insumos_costo_snapshot_valido CHECK (
    (costo_unitario_snapshot IS NULL AND moneda_costo_snapshot IS NULL)
    OR (costo_unitario_snapshot IS NOT NULL AND costo_unitario_snapshot <> 'NaN'::numeric
      AND costo_unitario_snapshot >= 0 AND moneda_costo_snapshot IS NOT NULL
      AND moneda_costo_snapshot IN ('ARS', 'USD'))
  );

CREATE FUNCTION public.campo_parte_costo_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_costo numeric(16,4);
  v_moneda character(3);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF public.user_belongs_to_comercio(NEW.comercio_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'campo_costo_sin_acceso';
  END IF;
  IF TG_TABLE_NAME NOT IN ('campo_parte_operarios', 'campo_parte_maquinarias', 'campo_parte_insumos') THEN
    RAISE EXCEPTION 'campo_detalle_parte_no_soportado';
  END IF;

  -- El trigger 20 existente ya valido y bloqueo el parte en borrador,
  -- comprobo propiedad/permisos y la relacion con el catalogo del mismo tenant.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.moneda_costo_snapshot IS DISTINCT FROM OLD.moneda_costo_snapshot THEN
      RAISE EXCEPTION 'campo_costo_snapshot_inmutable';
    END IF;
    IF TG_TABLE_NAME = 'campo_parte_insumos' THEN
      IF NEW.costo_unitario_snapshot IS DISTINCT FROM OLD.costo_unitario_snapshot THEN
        RAISE EXCEPTION 'campo_costo_snapshot_inmutable';
      END IF;
    ELSE
      IF NEW.costo_hora_snapshot IS DISTINCT FROM OLD.costo_hora_snapshot THEN
        RAISE EXCEPTION 'campo_costo_snapshot_inmutable';
      END IF;
    END IF;
    -- Incluye reactivaciones: nunca se vuelve a consultar el costo del catalogo.
    RETURN NEW;
  END IF;

  -- Orden de bloqueo conservado: parte primero, catalogo despues.
  -- Costo y moneda se leen de una misma fila autorizada y se copian juntos.
  IF TG_TABLE_NAME = 'campo_parte_operarios' THEN
    SELECT c.costo_hora, c.moneda_costo INTO v_costo, v_moneda
    FROM public.campo_operarios AS c
    WHERE c.id = NEW.operario_id AND c.comercio_id = NEW.comercio_id AND c.activo
    FOR SHARE;
  ELSIF TG_TABLE_NAME = 'campo_parte_maquinarias' THEN
    SELECT c.costo_hora, c.moneda_costo INTO v_costo, v_moneda
    FROM public.campo_maquinarias AS c
    WHERE c.id = NEW.maquinaria_id AND c.comercio_id = NEW.comercio_id AND c.activo
    FOR SHARE;
  ELSE
    SELECT c.costo_unitario, c.moneda_costo INTO v_costo, v_moneda
    FROM public.campo_insumos AS c
    WHERE c.id = NEW.insumo_id AND c.comercio_id = NEW.comercio_id AND c.activo
    FOR SHARE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'campo_catalogo_costo_no_disponible'; END IF;

  -- Sobrescribe siempre lo enviado por el cliente, incluso con NULL/NULL.
  NEW.moneda_costo_snapshot := v_moneda;
  IF TG_TABLE_NAME = 'campo_parte_insumos' THEN
    NEW.costo_unitario_snapshot := v_costo;
  ELSE
    NEW.costo_hora_snapshot := v_costo;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.campo_parte_costo_snapshot() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "30_campo_parte_operarios_costo_snapshot"
BEFORE INSERT OR UPDATE ON public.campo_parte_operarios
FOR EACH ROW EXECUTE FUNCTION public.campo_parte_costo_snapshot();
CREATE TRIGGER "30_campo_parte_maquinarias_costo_snapshot"
BEFORE INSERT OR UPDATE ON public.campo_parte_maquinarias
FOR EACH ROW EXECUTE FUNCTION public.campo_parte_costo_snapshot();
CREATE TRIGGER "30_campo_parte_insumos_costo_snapshot"
BEFORE INSERT OR UPDATE ON public.campo_parte_insumos
FOR EACH ROW EXECUTE FUNCTION public.campo_parte_costo_snapshot();

-- Los permisos UPDATE por columna de los detalles siguen sin incluir snapshots.
-- Los detalles anteriores permanecen NULL/NULL: no se inventan costos historicos.
CREATE TABLE public.campo_parte_otros_costos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  parte_id uuid NOT NULL,
  concepto text NOT NULL,
  cantidad numeric(16,4) NOT NULL,
  costo_unitario numeric(16,4) NOT NULL,
  moneda character(3) NOT NULL,
  observaciones text,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campo_parte_otros_costos_concepto_valido CHECK (btrim(concepto) <> ''),
  CONSTRAINT campo_parte_otros_costos_cantidad_valida CHECK (cantidad <> 'NaN'::numeric AND cantidad > 0),
  CONSTRAINT campo_parte_otros_costos_costo_valido CHECK (costo_unitario <> 'NaN'::numeric AND costo_unitario >= 0),
  CONSTRAINT campo_parte_otros_costos_moneda_valida CHECK (moneda IN ('ARS', 'USD')),
  CONSTRAINT campo_parte_otros_costos_observaciones_validas CHECK (observaciones IS NULL OR btrim(observaciones) <> ''),
  CONSTRAINT campo_parte_otros_costos_comercio_id_id_key UNIQUE (comercio_id, id),
  CONSTRAINT campo_parte_otros_costos_parte_fkey FOREIGN KEY (comercio_id, parte_id)
    REFERENCES public.campo_partes_trabajo(comercio_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_campo_parte_otros_costos_parte
ON public.campo_parte_otros_costos(comercio_id, parte_id, activo, moneda, id);

CREATE FUNCTION public.campo_validate_parte_otro_costo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_estado text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF public.user_belongs_to_comercio(NEW.comercio_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'campo_costo_sin_acceso';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.parte_id IS DISTINCT FROM OLD.parte_id THEN
    RAISE EXCEPTION 'campo_parte_detalle_inmutable';
  END IF;
  SELECT p.estado INTO v_estado
  FROM public.campo_partes_trabajo AS p
  WHERE p.id = NEW.parte_id AND p.comercio_id = NEW.comercio_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campo_parte_invalido'; END IF;
  IF v_estado <> 'borrador' THEN RAISE EXCEPTION 'campo_parte_congelado'; END IF;
  IF public.campo_puede_editar_parte(NEW.parte_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'campo_parte_no_editable';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.campo_validate_parte_otro_costo() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "10_campo_parte_otros_costos_audit"
BEFORE INSERT OR UPDATE ON public.campo_parte_otros_costos
FOR EACH ROW EXECUTE FUNCTION public.campo_ejecucion_audit();
CREATE TRIGGER "20_campo_parte_otros_costos_validate"
BEFORE INSERT OR UPDATE ON public.campo_parte_otros_costos
FOR EACH ROW EXECUTE FUNCTION public.campo_validate_parte_otro_costo();

ALTER TABLE public.campo_parte_otros_costos ENABLE ROW LEVEL SECURITY;
-- Auxiliar interna: solo la invoca el trigger SECURITY DEFINER.
-- RLS replica la autorizacion de los detalles; el trigger exige borrador tambien al admin.
REVOKE ALL ON FUNCTION public.campo_puede_editar_parte(uuid)
FROM PUBLIC, anon, authenticated;

CREATE POLICY campo_parte_otros_costos_select_miembros
ON public.campo_parte_otros_costos FOR SELECT TO authenticated
USING (public.user_belongs_to_comercio(comercio_id));
CREATE POLICY campo_parte_otros_costos_insert_editor
ON public.campo_parte_otros_costos FOR INSERT TO authenticated
WITH CHECK (
  public.user_is_comercio_admin(comercio_id)
  OR EXISTS (
    SELECT 1 FROM public.campo_partes_trabajo AS p
    WHERE p.id = campo_parte_otros_costos.parte_id
      AND p.comercio_id = campo_parte_otros_costos.comercio_id
      AND p.estado = 'borrador' AND p.propietario_user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.comercio_usuarios AS cu
        WHERE cu.comercio_id = p.comercio_id AND cu.user_id = auth.uid()
          AND cu.rol = 'operador' AND cu.activo
      )
      AND EXISTS (
        SELECT 1 FROM public.campo_operarios AS o
        WHERE o.comercio_id = p.comercio_id AND o.user_id = auth.uid() AND o.activo
      )
  )
);
CREATE POLICY campo_parte_otros_costos_update_editor
ON public.campo_parte_otros_costos FOR UPDATE TO authenticated
USING (
  public.user_is_comercio_admin(comercio_id)
  OR EXISTS (
    SELECT 1 FROM public.campo_partes_trabajo AS p
    WHERE p.id = campo_parte_otros_costos.parte_id
      AND p.comercio_id = campo_parte_otros_costos.comercio_id
      AND p.estado = 'borrador' AND p.propietario_user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.comercio_usuarios AS cu
        WHERE cu.comercio_id = p.comercio_id AND cu.user_id = auth.uid()
          AND cu.rol = 'operador' AND cu.activo
      )
      AND EXISTS (
        SELECT 1 FROM public.campo_operarios AS o
        WHERE o.comercio_id = p.comercio_id AND o.user_id = auth.uid() AND o.activo
      )
  )
)
WITH CHECK (
  public.user_is_comercio_admin(comercio_id)
  OR EXISTS (
    SELECT 1 FROM public.campo_partes_trabajo AS p
    WHERE p.id = campo_parte_otros_costos.parte_id
      AND p.comercio_id = campo_parte_otros_costos.comercio_id
      AND p.estado = 'borrador' AND p.propietario_user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.comercio_usuarios AS cu
        WHERE cu.comercio_id = p.comercio_id AND cu.user_id = auth.uid()
          AND cu.rol = 'operador' AND cu.activo
      )
      AND EXISTS (
        SELECT 1 FROM public.campo_operarios AS o
        WHERE o.comercio_id = p.comercio_id AND o.user_id = auth.uid() AND o.activo
      )
  )
);

REVOKE ALL ON TABLE public.campo_parte_otros_costos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.campo_parte_otros_costos TO authenticated;
GRANT INSERT (comercio_id, parte_id, concepto, cantidad, costo_unitario, moneda, observaciones, activo)
ON public.campo_parte_otros_costos TO authenticated;
GRANT UPDATE (concepto, cantidad, costo_unitario, moneda, observaciones, activo)
ON public.campo_parte_otros_costos TO authenticated;

COMMENT ON COLUMN public.campo_operarios.costo_hora IS
  'Costo actual opcional. Sus cambios no modifican snapshots de detalles existentes.';
COMMENT ON COLUMN public.campo_maquinarias.costo_hora IS
  'Costo actual opcional. Sus cambios no modifican snapshots de detalles existentes.';
COMMENT ON COLUMN public.campo_insumos.costo_unitario IS
  'Costo actual opcional. Sus cambios no modifican snapshots de detalles existentes.';
COMMENT ON COLUMN public.campo_parte_operarios.costo_hora_snapshot IS
  'Costo historico: horas_trabajadas por costo_hora_snapshot. NULL significa costo desconocido, no cero.';
COMMENT ON COLUMN public.campo_parte_maquinarias.costo_hora_snapshot IS
  'Costo historico: horas_uso por costo_hora_snapshot. NULL significa costo desconocido, no cero.';
COMMENT ON COLUMN public.campo_parte_insumos.costo_unitario_snapshot IS
  'Costo historico: cantidad por costo_unitario_snapshot. NULL significa costo desconocido, no cero.';
COMMENT ON TABLE public.campo_parte_otros_costos IS
  'Costo dinamico: cantidad por costo_unitario. Solo detalles activos. Desactivar conserva historia. Escritura solo con parte en borrador y permiso de edicion. Sin totales persistidos.';
COMMENT ON FUNCTION public.campo_parte_costo_snapshot() IS
  'Copia costo y moneda del catalogo autorizado en INSERT, sobrescribiendo entradas del cliente. Inmutables en UPDATE, incluida reactivacion. Sin backfill.';
COMMENT ON FUNCTION public.campo_validate_parte_otro_costo() IS
  'Valida tenant, parte inmutable, bloqueo del parte, estado borrador y permiso de edicion; auditoria gestionada por campo_ejecucion_audit.';

-- Calculo dinamico futuro, sin crear aun una funcion de resumen economico:
-- operario = horas_trabajadas * costo_hora_snapshot;
-- maquinaria = horas_uso * costo_hora_snapshot;
-- insumo = cantidad * costo_unitario_snapshot;
-- otro costo = cantidad * costo_unitario.
-- Solo detalles activos. Horas o snapshots NULL indican costo desconocido.
-- Agrupar totales por moneda: nunca convertir ni sumar ARS con USD.
-- Excluir partes anulados o descartados del costo efectivo de la orden.
-- Los cambios de catalogos nunca recalculan los snapshots historicos.
COMMIT;
