-- Vortex Campo - tarifas comerciales y snapshots facturables por labor.
-- No incorpora costos internos, stock, facturacion, ventas ni totales persistidos.

CREATE TABLE public.campo_tarifas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  nombre text NOT NULL,
  codigo_interno text,
  unidad text NOT NULL,
  nivel text NOT NULL,
  cliente_id uuid,
  establecimiento_id uuid,
  precio_unitario numeric(16,4) NOT NULL,
  porcentaje_iva numeric(7,4) NOT NULL DEFAULT 21,
  moneda character(3) NOT NULL DEFAULT 'ARS',
  vigente_desde date NOT NULL DEFAULT CURRENT_DATE,
  vigente_hasta date,
  observaciones text,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campo_tarifas_comercio_id_id_key UNIQUE (comercio_id, id),
  CONSTRAINT campo_tarifas_nombre_no_vacio CHECK (btrim(nombre) <> ''),
  CONSTRAINT campo_tarifas_codigo_no_vacio CHECK (codigo_interno IS NULL OR btrim(codigo_interno) <> ''),
  CONSTRAINT campo_tarifas_observaciones_no_vacias CHECK (observaciones IS NULL OR btrim(observaciones) <> ''),
  CONSTRAINT campo_tarifas_unidad_valida CHECK (unidad IN ('ha', 'hora', 'km', 'tonelada', 'unidad', 'fijo')),
  CONSTRAINT campo_tarifas_nivel_valido CHECK (nivel IN ('general', 'cliente', 'establecimiento')),
  CONSTRAINT campo_tarifas_precio_valido CHECK (
    precio_unitario <> 'NaN'::numeric AND precio_unitario >= 0
  ),
  CONSTRAINT campo_tarifas_iva_valido CHECK (porcentaje_iva >= 0 AND porcentaje_iva <= 100),
  CONSTRAINT campo_tarifas_moneda_ars CHECK (moneda = 'ARS'),
  CONSTRAINT campo_tarifas_vigencia_valida CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  CONSTRAINT campo_tarifas_alcance_coherente CHECK (
    (nivel = 'general' AND cliente_id IS NULL AND establecimiento_id IS NULL)
    OR (nivel = 'cliente' AND cliente_id IS NOT NULL AND establecimiento_id IS NULL)
    OR (nivel = 'establecimiento' AND cliente_id IS NOT NULL AND establecimiento_id IS NOT NULL)
  ),
  CONSTRAINT campo_tarifas_cliente_fkey FOREIGN KEY (cliente_id)
    REFERENCES public.clientes(id) ON DELETE RESTRICT,
  CONSTRAINT campo_tarifas_establecimiento_fkey FOREIGN KEY (establecimiento_id)
    REFERENCES public.campo_establecimientos(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_campo_tarifas_codigo
ON public.campo_tarifas(comercio_id, lower(btrim(codigo_interno)))
WHERE codigo_interno IS NOT NULL;

CREATE INDEX idx_campo_tarifas_comercio_activo_unidad
ON public.campo_tarifas(comercio_id, activo, unidad);

CREATE INDEX idx_campo_tarifas_establecimiento
ON public.campo_tarifas(comercio_id, establecimiento_id, unidad, vigente_desde DESC)
WHERE nivel = 'establecimiento' AND activo;

CREATE INDEX idx_campo_tarifas_cliente
ON public.campo_tarifas(comercio_id, cliente_id, unidad, vigente_desde DESC)
WHERE nivel = 'cliente' AND activo;

CREATE INDEX idx_campo_tarifas_general
ON public.campo_tarifas(comercio_id, unidad, vigente_desde DESC)
WHERE nivel = 'general' AND activo;

CREATE INDEX idx_campo_tarifas_vigencia
ON public.campo_tarifas(comercio_id, unidad, vigente_desde, vigente_hasta)
WHERE activo;

CREATE OR REPLACE FUNCTION public.campo_validate_tarifa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cliente_comercio uuid;
  v_establecimiento_comercio uuid;
  v_establecimiento_cliente uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'campo_auth_requerida';
  END IF;
  IF public.user_is_comercio_admin(NEW.comercio_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'campo_tarifa_no_disponible';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := v_uid;
    NEW.created_at := now();
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'campo_id_inmutable'; END IF;
    IF NEW.comercio_id IS DISTINCT FROM OLD.comercio_id THEN RAISE EXCEPTION 'campo_comercio_inmutable'; END IF;
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'campo_created_by_inmutable'; END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'campo_created_at_inmutable'; END IF;
  END IF;
  NEW.updated_by := v_uid;
  NEW.updated_at := now();

  IF NEW.cliente_id IS NOT NULL THEN
    SELECT c.comercio_id INTO v_cliente_comercio
    FROM public.clientes AS c WHERE c.id = NEW.cliente_id;
    IF v_cliente_comercio IS NULL OR v_cliente_comercio IS DISTINCT FROM NEW.comercio_id THEN
      RAISE EXCEPTION 'campo_tarifa_alcance_incompatible';
    END IF;
  END IF;

  IF NEW.establecimiento_id IS NOT NULL THEN
    SELECT e.comercio_id, e.cliente_id
    INTO v_establecimiento_comercio, v_establecimiento_cliente
    FROM public.campo_establecimientos AS e WHERE e.id = NEW.establecimiento_id;
    IF v_establecimiento_comercio IS NULL
       OR v_establecimiento_comercio IS DISTINCT FROM NEW.comercio_id
       OR v_establecimiento_cliente IS DISTINCT FROM NEW.cliente_id THEN
      RAISE EXCEPTION 'campo_tarifa_alcance_incompatible';
    END IF;
  END IF;

  -- Serializa todas las altas/cambios de una unidad dentro del comercio. Es
  -- deliberadamente mas amplio que el alcance para evitar locks dobles al editar.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('vortex_campo_tarifa:' || NEW.comercio_id::text || ':' || NEW.unidad, 0)
  );

  IF NEW.activo AND EXISTS (
    SELECT 1
    FROM public.campo_tarifas AS t
    WHERE t.comercio_id = NEW.comercio_id
      AND t.id IS DISTINCT FROM NEW.id
      AND t.activo
      AND t.unidad = NEW.unidad
      AND t.nivel = NEW.nivel
      AND t.cliente_id IS NOT DISTINCT FROM NEW.cliente_id
      AND t.establecimiento_id IS NOT DISTINCT FROM NEW.establecimiento_id
      AND t.vigente_desde <= COALESCE(NEW.vigente_hasta, 'infinity'::date)
      AND NEW.vigente_desde <= COALESCE(t.vigente_hasta, 'infinity'::date)
  ) THEN
    RAISE EXCEPTION 'campo_tarifa_vigencia_superpuesta';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.campo_validate_tarifa() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "10_campo_tarifas_validate"
BEFORE INSERT OR UPDATE ON public.campo_tarifas
FOR EACH ROW EXECUTE FUNCTION public.campo_validate_tarifa();

ALTER TABLE public.campo_orden_labores
  ADD COLUMN tarifa_id uuid,
  ADD COLUMN precio_unitario_snapshot numeric(16,4),
  ADD COLUMN porcentaje_iva_snapshot numeric(7,4),
  ADD COLUMN moneda_snapshot character(3),
  ADD COLUMN precio_origen text,
  ADD COLUMN facturable boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT campo_orden_labores_tarifa_fkey
    FOREIGN KEY (comercio_id, tarifa_id)
    REFERENCES public.campo_tarifas(comercio_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT campo_orden_labores_precio_snapshot_valido
    CHECK (
      precio_unitario_snapshot IS NULL
      OR (precio_unitario_snapshot <> 'NaN'::numeric AND precio_unitario_snapshot >= 0)
    ),
  ADD CONSTRAINT campo_orden_labores_iva_snapshot_valido
    CHECK (porcentaje_iva_snapshot IS NULL OR (porcentaje_iva_snapshot >= 0 AND porcentaje_iva_snapshot <= 100)),
  ADD CONSTRAINT campo_orden_labores_moneda_snapshot_valida
    CHECK (moneda_snapshot IS NULL OR moneda_snapshot = 'ARS'),
  ADD CONSTRAINT campo_orden_labores_precio_origen_valido
    CHECK (precio_origen IS NULL OR precio_origen IN ('general', 'cliente', 'establecimiento', 'manual')),
  ADD CONSTRAINT campo_orden_labores_facturacion_coherente CHECK (
    (NOT facturable
      AND tarifa_id IS NULL
      AND precio_unitario_snapshot IS NULL
      AND porcentaje_iva_snapshot IS NULL
      AND moneda_snapshot IS NULL
      AND precio_origen IS NULL)
    OR (
      facturable
      AND precio_unitario_snapshot IS NOT NULL
      AND porcentaje_iva_snapshot IS NOT NULL
      AND moneda_snapshot = 'ARS'
      AND precio_origen IS NOT NULL
      AND (
        (precio_origen IN ('general', 'cliente', 'establecimiento') AND tarifa_id IS NOT NULL)
        OR (precio_origen = 'manual' AND tarifa_id IS NULL)
      )
    )
  );

CREATE INDEX idx_campo_orden_labores_tarifa
ON public.campo_orden_labores(comercio_id, tarifa_id)
WHERE tarifa_id IS NOT NULL;

CREATE INDEX idx_campo_orden_labores_facturables
ON public.campo_orden_labores(comercio_id, orden_id, activo, posicion)
WHERE facturable;

CREATE OR REPLACE FUNCTION public.campo_protect_labor_precio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_estado text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.facturable := false;
    NEW.tarifa_id := NULL;
    NEW.precio_unitario_snapshot := NULL;
    NEW.porcentaje_iva_snapshot := NULL;
    NEW.moneda_snapshot := NULL;
    NEW.precio_origen := NULL;
    RETURN NEW;
  END IF;

  IF NEW.unidad IS DISTINCT FROM OLD.unidad AND OLD.facturable THEN
    RAISE EXCEPTION 'campo_labor_facturable_unidad_inmutable';
  END IF;

  IF NEW.tarifa_id IS DISTINCT FROM OLD.tarifa_id
     OR NEW.precio_unitario_snapshot IS DISTINCT FROM OLD.precio_unitario_snapshot
     OR NEW.porcentaje_iva_snapshot IS DISTINCT FROM OLD.porcentaje_iva_snapshot
     OR NEW.moneda_snapshot IS DISTINCT FROM OLD.moneda_snapshot
     OR NEW.precio_origen IS DISTINCT FROM OLD.precio_origen
     OR NEW.facturable IS DISTINCT FROM OLD.facturable THEN
    SELECT o.estado INTO v_estado
    FROM public.campo_ordenes_trabajo AS o
    WHERE o.id = NEW.orden_id AND o.comercio_id = NEW.comercio_id;
    IF v_estado IS NULL THEN RAISE EXCEPTION 'campo_labor_no_disponible'; END IF;
    IF public.user_is_comercio_admin(NEW.comercio_id) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'campo_labor_no_disponible';
    END IF;
    IF v_estado <> 'borrador' THEN RAISE EXCEPTION 'campo_orden_no_editable'; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.campo_protect_labor_precio() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "15_campo_orden_labores_protect_precio"
BEFORE INSERT OR UPDATE ON public.campo_orden_labores
FOR EACH ROW EXECUTE FUNCTION public.campo_protect_labor_precio();

-- Evita que un cambio de alcance de la orden deje una tarifa ya copiada con
-- cliente/establecimiento incompatibles. Primero debe limpiarse la configuracion.
CREATE OR REPLACE FUNCTION public.campo_protect_orden_precio_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF (NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
      OR NEW.establecimiento_id IS DISTINCT FROM OLD.establecimiento_id)
     AND EXISTS (
       SELECT 1 FROM public.campo_orden_labores AS l
       WHERE l.comercio_id = OLD.comercio_id
         AND l.orden_id = OLD.id
         AND l.facturable
     ) THEN
    RAISE EXCEPTION 'campo_tarifa_alcance_incompatible';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.campo_protect_orden_precio_scope() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "15_campo_ordenes_protect_precio_scope"
BEFORE UPDATE ON public.campo_ordenes_trabajo
FOR EACH ROW EXECUTE FUNCTION public.campo_protect_orden_precio_scope();

CREATE OR REPLACE FUNCTION public.campo_resolver_tarifa_labor(
  p_orden_labor_id uuid,
  p_fecha date DEFAULT CURRENT_DATE
)
RETURNS public.campo_tarifas
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_tarifa public.campo_tarifas;
  v_comercio_id uuid;
  v_unidad text;
  v_cliente_id uuid;
  v_establecimiento_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF p_fecha IS NULL THEN RAISE EXCEPTION 'campo_tarifa_invalida'; END IF;

  SELECT l.comercio_id, l.unidad, o.cliente_id, o.establecimiento_id
  INTO v_comercio_id, v_unidad, v_cliente_id, v_establecimiento_id
  FROM public.campo_orden_labores AS l
  JOIN public.campo_ordenes_trabajo AS o
    ON o.id = l.orden_id AND o.comercio_id = l.comercio_id
  WHERE l.id = p_orden_labor_id;

  IF v_comercio_id IS NULL OR public.user_belongs_to_comercio(v_comercio_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'campo_labor_no_disponible';
  END IF;

  SELECT t.* INTO v_tarifa
  FROM public.campo_tarifas AS t
  WHERE t.comercio_id = v_comercio_id
    AND t.unidad = v_unidad
    AND t.activo
    AND t.vigente_desde <= p_fecha
    AND (t.vigente_hasta IS NULL OR t.vigente_hasta >= p_fecha)
    AND (
      (t.nivel = 'establecimiento' AND t.cliente_id = v_cliente_id AND t.establecimiento_id = v_establecimiento_id)
      OR (t.nivel = 'cliente' AND t.cliente_id = v_cliente_id AND t.establecimiento_id IS NULL)
      OR (t.nivel = 'general' AND t.cliente_id IS NULL AND t.establecimiento_id IS NULL)
    )
  ORDER BY CASE t.nivel WHEN 'establecimiento' THEN 1 WHEN 'cliente' THEN 2 ELSE 3 END,
           t.vigente_desde DESC,
           t.id
  LIMIT 1;

  RETURN v_tarifa;
END;
$function$;

CREATE OR REPLACE FUNCTION public.campo_configurar_precio_labor(
  p_orden_labor_id uuid,
  p_tarifa_id uuid DEFAULT NULL,
  p_precio_manual numeric DEFAULT NULL,
  p_porcentaje_iva_manual numeric DEFAULT NULL,
  p_facturable boolean DEFAULT true
)
RETURNS public.campo_orden_labores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_pre record;
  v_orden public.campo_ordenes_trabajo;
  v_labor public.campo_orden_labores;
  v_tarifa public.campo_tarifas;
  v_hoy date := CURRENT_DATE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'campo_auth_requerida'; END IF;
  IF p_facturable IS NULL THEN RAISE EXCEPTION 'campo_labor_facturable_requiere_precio'; END IF;

  SELECT l.orden_id, l.comercio_id INTO v_pre
  FROM public.campo_orden_labores AS l WHERE l.id = p_orden_labor_id;
  IF v_pre.orden_id IS NULL THEN RAISE EXCEPTION 'campo_labor_no_disponible'; END IF;

  SELECT o.* INTO v_orden
  FROM public.campo_ordenes_trabajo AS o
  WHERE o.id = v_pre.orden_id AND o.comercio_id = v_pre.comercio_id
  FOR UPDATE;
  SELECT l.* INTO v_labor
  FROM public.campo_orden_labores AS l
  WHERE l.id = p_orden_labor_id
    AND l.orden_id = v_orden.id
    AND l.comercio_id = v_orden.comercio_id
  FOR UPDATE;

  IF v_labor.id IS NULL OR public.user_is_comercio_admin(v_labor.comercio_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'campo_labor_no_disponible';
  END IF;
  IF v_orden.estado <> 'borrador' THEN RAISE EXCEPTION 'campo_orden_no_editable'; END IF;

  IF NOT p_facturable THEN
    UPDATE public.campo_orden_labores
    SET facturable = false, tarifa_id = NULL, precio_unitario_snapshot = NULL,
        porcentaje_iva_snapshot = NULL, moneda_snapshot = NULL, precio_origen = NULL
    WHERE id = v_labor.id AND comercio_id = v_labor.comercio_id
    RETURNING * INTO v_labor;
    RETURN v_labor;
  END IF;

  IF p_tarifa_id IS NOT NULL THEN
    IF p_precio_manual IS NOT NULL OR p_porcentaje_iva_manual IS NOT NULL THEN
      RAISE EXCEPTION 'campo_precio_manual_invalido';
    END IF;
    SELECT t.* INTO v_tarifa FROM public.campo_tarifas AS t
    WHERE t.id = p_tarifa_id AND t.comercio_id = v_labor.comercio_id;
    IF v_tarifa.id IS NULL THEN RAISE EXCEPTION 'campo_tarifa_no_disponible'; END IF;
    IF NOT v_tarifa.activo THEN RAISE EXCEPTION 'campo_tarifa_no_disponible'; END IF;
    IF v_tarifa.vigente_desde > v_hoy OR (v_tarifa.vigente_hasta IS NOT NULL AND v_tarifa.vigente_hasta < v_hoy) THEN
      RAISE EXCEPTION 'campo_tarifa_fuera_vigencia';
    END IF;
    IF v_tarifa.unidad IS DISTINCT FROM v_labor.unidad THEN RAISE EXCEPTION 'campo_tarifa_unidad_incompatible'; END IF;
    IF NOT (
      (v_tarifa.nivel = 'general' AND v_tarifa.cliente_id IS NULL AND v_tarifa.establecimiento_id IS NULL)
      OR (v_tarifa.nivel = 'cliente' AND v_tarifa.cliente_id = v_orden.cliente_id AND v_tarifa.establecimiento_id IS NULL)
      OR (v_tarifa.nivel = 'establecimiento' AND v_tarifa.cliente_id = v_orden.cliente_id AND v_tarifa.establecimiento_id = v_orden.establecimiento_id)
    ) THEN RAISE EXCEPTION 'campo_tarifa_alcance_incompatible'; END IF;

    UPDATE public.campo_orden_labores
    SET facturable = true, tarifa_id = v_tarifa.id,
        precio_unitario_snapshot = v_tarifa.precio_unitario,
        porcentaje_iva_snapshot = v_tarifa.porcentaje_iva,
        moneda_snapshot = v_tarifa.moneda, precio_origen = v_tarifa.nivel
    WHERE id = v_labor.id AND comercio_id = v_labor.comercio_id
    RETURNING * INTO v_labor;
  ELSE
    IF p_precio_manual IS NULL
       OR p_precio_manual = 'NaN'::numeric
       OR p_precio_manual < 0 THEN
      RAISE EXCEPTION 'campo_precio_manual_invalido';
    END IF;
    IF p_porcentaje_iva_manual IS NULL OR p_porcentaje_iva_manual < 0 OR p_porcentaje_iva_manual > 100 THEN
      RAISE EXCEPTION 'campo_iva_invalido';
    END IF;
    UPDATE public.campo_orden_labores
    SET facturable = true, tarifa_id = NULL,
        precio_unitario_snapshot = p_precio_manual,
        porcentaje_iva_snapshot = p_porcentaje_iva_manual,
        moneda_snapshot = 'ARS', precio_origen = 'manual'
    WHERE id = v_labor.id AND comercio_id = v_labor.comercio_id
    RETURNING * INTO v_labor;
  END IF;
  RETURN v_labor;
END;
$function$;

ALTER TABLE public.campo_tarifas ENABLE ROW LEVEL SECURITY;

CREATE POLICY campo_tarifas_select_miembros
ON public.campo_tarifas FOR SELECT TO authenticated
USING (public.user_belongs_to_comercio(comercio_id));

CREATE POLICY campo_tarifas_insert_admin
ON public.campo_tarifas FOR INSERT TO authenticated
WITH CHECK (public.user_is_comercio_admin(comercio_id));

CREATE POLICY campo_tarifas_update_admin
ON public.campo_tarifas FOR UPDATE TO authenticated
USING (public.user_is_comercio_admin(comercio_id))
WITH CHECK (public.user_is_comercio_admin(comercio_id));

REVOKE ALL ON TABLE public.campo_tarifas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.campo_tarifas TO authenticated;
GRANT UPDATE (
  nombre, codigo_interno, unidad, nivel, cliente_id, establecimiento_id,
  precio_unitario, porcentaje_iva, moneda, vigente_desde, vigente_hasta,
  observaciones, activo
) ON public.campo_tarifas TO authenticated;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.campo_tarifas FROM authenticated;

-- Los snapshots se escriben solo mediante la RPC. Los GRANT anteriores de
-- campo_orden_labores no incluyen estas columnas y permanecen sin cambios.
REVOKE ALL ON FUNCTION public.campo_resolver_tarifa_labor(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campo_configurar_precio_labor(uuid, uuid, numeric, numeric, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campo_resolver_tarifa_labor(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campo_configurar_precio_labor(uuid, uuid, numeric, numeric, boolean) TO authenticated;

COMMENT ON TABLE public.campo_tarifas IS
  'Catalogo comercial vigente por comercio. Sus cambios no alteran snapshots historicos copiados a labores.';
COMMENT ON COLUMN public.campo_tarifas.moneda IS
  'Codigo ISO de moneda; restringido a ARS en esta version, preparado para ampliacion futura.';
COMMENT ON COLUMN public.campo_orden_labores.facturable IS
  'False mantiene compatible una labor sin precio. True exige un snapshot comercial completo.';
COMMENT ON COLUMN public.campo_orden_labores.precio_unitario_snapshot IS
  'Precio historico inmutable desde que la orden abandona borrador; nunca se recalcula desde campo_tarifas.';
COMMENT ON FUNCTION public.campo_resolver_tarifa_labor(uuid, date) IS
  'Devuelve para un miembro la tarifa vigente recomendada: establecimiento, cliente y finalmente general.';
COMMENT ON FUNCTION public.campo_configurar_precio_labor(uuid, uuid, numeric, numeric, boolean) IS
  'Configura o limpia el precio facturable snapshot de una labor; solo administradores y orden en borrador.';

COMMENT ON TABLE public.campo_orden_labores IS
  'Labores planificadas. Importe previsto no fijo: suma activa planificada por precio snapshot. Importe final no fijo: suma activa ejecutada de partes confirmados por precio snapshot, incluyendo sobre-ejecucion. Para fijo, el precio se cuenta una vez por labor prevista y una vez si existe ejecucion confirmada activa, sin multiplicar por lotes ni partes. IVA: neto por linea, IVA redondeado posteriormente a dos decimales y total igual a neto mas IVA.';
