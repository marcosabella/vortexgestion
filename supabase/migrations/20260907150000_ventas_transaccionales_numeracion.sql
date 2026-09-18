-- Numeracion y alta transaccional canónica de ventas.
--
-- Compatibilidad: las ventas historicas que no usan el formato punto-secuencia
-- conservan su numero visible y quedan fuera de la clave canónica. Las ventas
-- nuevas creadas por la RPC siempre usan PP..PP-NN..NN. El frontend existente
-- continúa funcionando, pero debe migrarse a public.registrar_venta_transaccional
-- para eliminar definitivamente su calculo MAX + 1.
--
-- Caja: el modelo actual permite una venta sin caja_movimientos y registra esos
-- movimientos posteriormente. Por eso esta RPC no crea movimientos de caja: la
-- obligatoriedad de caja para contado requiere una decision funcional posterior.

BEGIN;

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS moneda character(3) NOT NULL DEFAULT 'ARS',
  ADD COLUMN IF NOT EXISTS punto_venta integer,
  ADD COLUMN IF NOT EXISTS numero_secuencial bigint,
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS idempotency_payload jsonb;

ALTER TABLE public.ventas
  DROP CONSTRAINT IF EXISTS ventas_moneda_valida,
  ADD CONSTRAINT ventas_moneda_valida CHECK (moneda IN ('ARS', 'USD')),
  ADD CONSTRAINT ventas_punto_venta_valido CHECK (punto_venta IS NULL OR punto_venta > 0),
  ADD CONSTRAINT ventas_numero_secuencial_valido CHECK (numero_secuencial IS NULL OR numero_secuencial > 0),
  ADD CONSTRAINT ventas_numeracion_completa CHECK (
    (punto_venta IS NULL AND numero_secuencial IS NULL)
    OR (punto_venta IS NOT NULL AND numero_secuencial IS NOT NULL)
  );

ALTER TABLE public.venta_items
  ADD COLUMN IF NOT EXISTS afecta_stock boolean NOT NULL DEFAULT true;

ALTER TABLE public.pagos_venta
  ADD COLUMN IF NOT EXISTS moneda character(3) NOT NULL DEFAULT 'ARS';

ALTER TABLE public.pagos_venta
  DROP CONSTRAINT IF EXISTS pagos_venta_moneda_valida,
  ADD CONSTRAINT pagos_venta_moneda_valida CHECK (moneda IN ('ARS', 'USD'));

ALTER TABLE public.cuenta_corriente
  ADD COLUMN IF NOT EXISTS moneda character(3) NOT NULL DEFAULT 'ARS';

ALTER TABLE public.cuenta_corriente
  DROP CONSTRAINT IF EXISTS cuenta_corriente_moneda_valida,
  ADD CONSTRAINT cuenta_corriente_moneda_valida CHECK (moneda IN ('ARS', 'USD'));

ALTER TABLE public.caja_movimientos
  ADD COLUMN IF NOT EXISTS moneda character(3) NOT NULL DEFAULT 'ARS';

ALTER TABLE public.caja_movimientos
  DROP CONSTRAINT IF EXISTS caja_movimientos_moneda_valida,
  ADD CONSTRAINT caja_movimientos_moneda_valida CHECK (moneda IN ('ARS', 'USD'));

CREATE OR REPLACE FUNCTION public.ventas_punto_venta_canonico(p_numero text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_numero ~ '^[0-9]{1,9}-[0-9]{1,18}$'
     AND split_part(p_numero, '-', 1) !~ '^0+$'
     AND split_part(p_numero, '-', 2) !~ '^0+$'
    THEN split_part(p_numero, '-', 1)::integer
  END;
$$;

CREATE OR REPLACE FUNCTION public.ventas_numero_secuencial_canonico(p_numero text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_numero ~ '^[0-9]{1,9}-[0-9]{1,18}$'
     AND split_part(p_numero, '-', 1) !~ '^0+$'
     AND split_part(p_numero, '-', 2) !~ '^0+$'
    THEN split_part(p_numero, '-', 2)::bigint
  END;
$$;

REVOKE ALL ON FUNCTION public.ventas_punto_venta_canonico(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ventas_numero_secuencial_canonico(text) FROM PUBLIC, anon, authenticated;

-- Preflight: una clave canónica solo se puede habilitar si no hay colisiones
-- preexistentes y todas las ventas canónicas ya pertenecen a un comercio.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.ventas v
    WHERE v.numero_comprobante ~ '^[0-9]+-[0-9]+$'
      AND v.comercio_id IS NULL
  ) THEN
    RAISE EXCEPTION 'ventas_numeracion_preflight_comercio_faltante'
      USING ERRCODE = '23514',
            HINT = 'Asignar comercio_id a las ventas con numero punto-secuencia antes de aplicar esta migracion.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ventas v
    WHERE v.numero_comprobante ~ '^[0-9]+-[0-9]+$'
      AND (
        length(split_part(v.numero_comprobante, '-', 1)) > 9
        OR length(split_part(v.numero_comprobante, '-', 2)) > 18
        OR split_part(v.numero_comprobante, '-', 1) ~ '^0+$'
        OR split_part(v.numero_comprobante, '-', 2) ~ '^0+$'
      )
  ) THEN
    RAISE EXCEPTION 'ventas_numeracion_preflight_formato_invalido'
      USING ERRCODE = '23514',
            HINT = 'Los numeros punto-secuencia deben tener punto y secuencia positivos que entren en integer y bigint.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ventas v
    WHERE v.numero_comprobante ~ '^[0-9]+-[0-9]+$'
    GROUP BY v.comercio_id, v.tipo_comprobante,
      public.ventas_punto_venta_canonico(v.numero_comprobante),
      public.ventas_numero_secuencial_canonico(v.numero_comprobante)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'ventas_numeracion_preflight_duplicados'
      USING ERRCODE = '23505',
            HINT = 'Resolver los duplicados historicos de comercio, tipo, punto de venta y numero antes de aplicar esta migracion.';
  END IF;
END;
$$;

CREATE TABLE public.ventas_numeradores (
  comercio_id uuid NOT NULL REFERENCES public.comercio(id) ON DELETE RESTRICT,
  tipo_comprobante public.tipo_comprobante NOT NULL,
  punto_venta integer NOT NULL CHECK (punto_venta > 0),
  ultimo_numero bigint NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comercio_id, tipo_comprobante, punto_venta)
);

ALTER TABLE public.ventas_numeradores ENABLE ROW LEVEL SECURITY;

INSERT INTO public.ventas_numeradores (comercio_id, tipo_comprobante, punto_venta, ultimo_numero)
SELECT comercio_id, tipo_comprobante,
  public.ventas_punto_venta_canonico(numero_comprobante),
  max(public.ventas_numero_secuencial_canonico(numero_comprobante))
FROM public.ventas
WHERE public.ventas_punto_venta_canonico(numero_comprobante) IS NOT NULL
  AND public.ventas_numero_secuencial_canonico(numero_comprobante) IS NOT NULL
GROUP BY comercio_id, tipo_comprobante, public.ventas_punto_venta_canonico(numero_comprobante);

CREATE UNIQUE INDEX ventas_numeracion_canonica_unica
  ON public.ventas (
    comercio_id,
    tipo_comprobante,
    public.ventas_punto_venta_canonico(numero_comprobante),
    public.ventas_numero_secuencial_canonico(numero_comprobante)
  )
  WHERE public.ventas_punto_venta_canonico(numero_comprobante) IS NOT NULL
    AND public.ventas_numero_secuencial_canonico(numero_comprobante) IS NOT NULL;

CREATE UNIQUE INDEX ventas_idempotency_key_unica
  ON public.ventas (comercio_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sincronizar_numeracion_venta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_punto integer;
  v_numero bigint;
BEGIN
  IF NEW.numero_comprobante ~ '^[0-9]+-[0-9]+$' THEN
    v_punto := split_part(NEW.numero_comprobante, '-', 1)::integer;
    v_numero := split_part(NEW.numero_comprobante, '-', 2)::bigint;

    IF v_punto <= 0 OR v_numero <= 0 THEN
      RAISE EXCEPTION 'ventas_numeracion_invalida' USING ERRCODE = '23514';
    END IF;
    IF NEW.punto_venta IS NOT NULL AND NEW.punto_venta <> v_punto THEN
      RAISE EXCEPTION 'ventas_punto_venta_inconsistente' USING ERRCODE = '23514';
    END IF;
    IF NEW.numero_secuencial IS NOT NULL AND NEW.numero_secuencial <> v_numero THEN
      RAISE EXCEPTION 'ventas_numero_secuencial_inconsistente' USING ERRCODE = '23514';
    END IF;

    NEW.punto_venta := v_punto;
    NEW.numero_secuencial := v_numero;
  ELSIF NEW.punto_venta IS NOT NULL OR NEW.numero_secuencial IS NOT NULL THEN
    RAISE EXCEPTION 'ventas_formato_numero_incompatible' USING ERRCODE = '23514';
  ELSE
    NEW.punto_venta := NULL;
    NEW.numero_secuencial := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_numeracion_venta() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sincronizar_numeracion_venta ON public.ventas;
CREATE TRIGGER sincronizar_numeracion_venta
BEFORE INSERT OR UPDATE OF numero_comprobante, punto_venta, numero_secuencial ON public.ventas
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_numeracion_venta();

-- Conserva exactamente el comportamiento previo para lineas que afectan stock.
CREATE OR REPLACE FUNCTION public.apply_venta_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE affected_rows integer;
BEGIN
  IF current_setting('app.skip_stock_movements', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT NEW.afecta_stock OR NEW.producto_id IS NULL THEN RETURN NEW; END IF;
    UPDATE public.productos SET stock = stock - NEW.cantidad
    WHERE id = NEW.producto_id AND stock >= NEW.cantidad;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    IF affected_rows = 0 THEN RAISE EXCEPTION 'Stock insuficiente para el producto seleccionado'; END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.afecta_stock AND OLD.producto_id IS NOT NULL THEN
      UPDATE public.productos SET stock = stock + OLD.cantidad WHERE id = OLD.producto_id;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT OLD.afecta_stock AND NOT NEW.afecta_stock THEN RETURN NEW; END IF;
    IF OLD.afecta_stock AND NOT NEW.afecta_stock THEN
      IF OLD.producto_id IS NOT NULL THEN UPDATE public.productos SET stock = stock + OLD.cantidad WHERE id = OLD.producto_id; END IF;
      RETURN NEW;
    END IF;
    IF NOT OLD.afecta_stock AND NEW.afecta_stock THEN
      IF NEW.producto_id IS NULL THEN RETURN NEW; END IF;
      UPDATE public.productos SET stock = stock - NEW.cantidad WHERE id = NEW.producto_id AND stock >= NEW.cantidad;
      GET DIAGNOSTICS affected_rows = ROW_COUNT;
      IF affected_rows = 0 THEN RAISE EXCEPTION 'Stock insuficiente para el producto seleccionado'; END IF;
      RETURN NEW;
    END IF;
    IF OLD.producto_id IS NOT NULL AND OLD.producto_id = NEW.producto_id THEN
      IF NEW.cantidad > OLD.cantidad THEN
        UPDATE public.productos SET stock = stock - (NEW.cantidad - OLD.cantidad)
        WHERE id = NEW.producto_id AND stock >= (NEW.cantidad - OLD.cantidad);
        GET DIAGNOSTICS affected_rows = ROW_COUNT;
        IF affected_rows = 0 THEN RAISE EXCEPTION 'Stock insuficiente para el producto seleccionado'; END IF;
      ELSIF NEW.cantidad < OLD.cantidad THEN
        UPDATE public.productos SET stock = stock + (OLD.cantidad - NEW.cantidad) WHERE id = NEW.producto_id;
      END IF;
    ELSE
      IF OLD.producto_id IS NOT NULL THEN UPDATE public.productos SET stock = stock + OLD.cantidad WHERE id = OLD.producto_id; END IF;
      IF NEW.producto_id IS NOT NULL THEN
        UPDATE public.productos SET stock = stock - NEW.cantidad WHERE id = NEW.producto_id AND stock >= NEW.cantidad;
        GET DIAGNOSTICS affected_rows = ROW_COUNT;
        IF affected_rows = 0 THEN RAISE EXCEPTION 'Stock insuficiente para el producto seleccionado'; END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS apply_venta_item_stock_update ON public.venta_items;
CREATE TRIGGER apply_venta_item_stock_update
AFTER UPDATE OF producto_id, cantidad, afecta_stock ON public.venta_items
FOR EACH ROW
WHEN (
  OLD.producto_id IS DISTINCT FROM NEW.producto_id
  OR OLD.cantidad IS DISTINCT FROM NEW.cantidad
  OR OLD.afecta_stock IS DISTINCT FROM NEW.afecta_stock
)
EXECUTE FUNCTION public.apply_venta_item_stock();

CREATE OR REPLACE FUNCTION public.registrar_venta_transaccional(
  p_comercio_id uuid,
  p_tipo_comprobante public.tipo_comprobante,
  p_punto_venta integer,
  p_cliente_id uuid,
  p_cliente_nombre text,
  p_moneda text,
  p_modalidad text,
  p_items jsonb,
  p_pagos jsonb,
  p_idempotency_key uuid,
  p_fecha_venta timestamptz DEFAULT now(),
  p_observaciones text DEFAULT NULL,
  p_porcentaje_descuento numeric DEFAULT 0,
  p_monto_descuento numeric DEFAULT 0,
  p_porcentaje_recargo numeric DEFAULT 0,
  p_monto_recargo numeric DEFAULT 0
)
RETURNS public.ventas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_venta public.ventas;
  v_item jsonb;
  v_pago jsonb;
  v_producto_id uuid;
  v_descripcion text;
  v_codigo text;
  v_cantidad integer;
  v_precio numeric;
  v_iva_pct numeric;
  v_item_desc_pct numeric;
  v_item_desc_monto numeric;
  v_item_rec_pct numeric;
  v_item_rec_monto numeric;
  v_afecta_stock boolean;
  v_item_bruto numeric;
  v_item_descuento numeric;
  v_item_recargo numeric;
  v_item_total numeric;
  v_item_subtotal numeric;
  v_item_iva numeric;
  v_items_total numeric := 0;
  v_items_subtotal numeric := 0;
  v_descuento_venta numeric;
  v_recargo_venta numeric;
  v_total_base numeric;
  v_total numeric;
  v_subtotal numeric;
  v_total_iva numeric;
  v_factor numeric;
  v_pago_monto numeric;
  v_pago_recargo numeric;
  v_pagos_base numeric := 0;
  v_pagos_total numeric := 0;
  v_numero bigint;
  v_numero_texto text;
  v_tipo_pago public.tipo_pago;
  v_intento integer := 0;
  v_idempotency_payload jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ventas_auth_requerida' USING ERRCODE = '42501'; END IF;
  IF p_comercio_id IS NULL OR NOT public.user_is_comercio_admin(p_comercio_id) THEN
    RAISE EXCEPTION 'ventas_no_disponible' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'ventas_idempotency_requerida' USING ERRCODE = '22023'; END IF;
  IF p_tipo_comprobante IS NULL OR p_punto_venta IS NULL OR p_punto_venta <= 0 THEN
    RAISE EXCEPTION 'ventas_cabecera_invalida' USING ERRCODE = '22023';
  END IF;
  IF p_moneda IS NULL OR p_modalidad IS NULL
     OR p_moneda NOT IN ('ARS', 'USD') OR p_modalidad NOT IN ('contado', 'cta_cte') THEN
    RAISE EXCEPTION 'ventas_modalidad_o_moneda_invalida' USING ERRCODE = '22023';
  END IF;
  IF p_fecha_venta IS NULL OR NOT isfinite(p_fecha_venta)
     OR COALESCE(p_porcentaje_descuento, 0) < 0 OR COALESCE(p_monto_descuento, 0) < 0
     OR COALESCE(p_porcentaje_recargo, 0) < 0 OR COALESCE(p_monto_recargo, 0) < 0
     OR COALESCE(p_porcentaje_descuento::text, '') IN ('NaN', 'Infinity', '-Infinity')
     OR COALESCE(p_monto_descuento::text, '') IN ('NaN', 'Infinity', '-Infinity')
     OR COALESCE(p_porcentaje_recargo::text, '') IN ('NaN', 'Infinity', '-Infinity')
     OR COALESCE(p_monto_recargo::text, '') IN ('NaN', 'Infinity', '-Infinity')
     OR COALESCE(p_porcentaje_descuento, 0) <> round(COALESCE(p_porcentaje_descuento, 0), 2)
     OR COALESCE(p_monto_descuento, 0) <> round(COALESCE(p_monto_descuento, 0), 2)
     OR COALESCE(p_porcentaje_recargo, 0) <> round(COALESCE(p_porcentaje_recargo, 0), 2)
     OR COALESCE(p_monto_recargo, 0) <> round(COALESCE(p_monto_recargo, 0), 2) THEN
    RAISE EXCEPTION 'ventas_cabecera_invalida' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(jsonb_typeof(p_items), '') <> 'array' OR jsonb_array_length(p_items) = 0
     OR COALESCE(jsonb_typeof(p_pagos), '') <> 'array' THEN
    RAISE EXCEPTION 'ventas_json_invalido' USING ERRCODE = '22023';
  END IF;

  v_idempotency_payload := jsonb_build_object(
    'tipo_comprobante', p_tipo_comprobante::text, 'punto_venta', p_punto_venta,
    'cliente_id', p_cliente_id, 'cliente_nombre', p_cliente_nombre, 'moneda', p_moneda,
    'modalidad', p_modalidad, 'items', p_items, 'pagos', p_pagos, 'fecha_venta', p_fecha_venta,
    'observaciones', p_observaciones, 'porcentaje_descuento', p_porcentaje_descuento,
    'monto_descuento', p_monto_descuento, 'porcentaje_recargo', p_porcentaje_recargo,
    'monto_recargo', p_monto_recargo
  );

  PERFORM pg_advisory_xact_lock(hashtextextended('ventas:idempotency:' || p_comercio_id::text || ':' || p_idempotency_key::text, 0));
  SELECT * INTO v_venta FROM public.ventas
  WHERE comercio_id = p_comercio_id AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF v_venta.id IS NOT NULL THEN
    IF v_venta.idempotency_payload IS DISTINCT FROM v_idempotency_payload THEN
      RAISE EXCEPTION 'ventas_idempotency_conflicto' USING ERRCODE = '22023';
    END IF;
    RETURN v_venta;
  END IF;

  IF p_cliente_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clientes c WHERE c.id = p_cliente_id AND c.comercio_id = p_comercio_id
  ) THEN RAISE EXCEPTION 'ventas_cliente_no_disponible' USING ERRCODE = '42501'; END IF;
  IF p_modalidad = 'cta_cte' AND p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'ventas_cliente_requerido' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_item) k WHERE k NOT IN (
         'producto_id','descripcion_manual','codigo_manual','cantidad','precio_unitario','porcentaje_iva',
         'porcentaje_descuento','monto_descuento','porcentaje_recargo','monto_recargo','afecta_stock'
       ))
       OR NOT (v_item ? 'cantidad' AND v_item ? 'precio_unitario' AND v_item ? 'porcentaje_iva' AND v_item ? 'afecta_stock')
       OR jsonb_typeof(v_item->'cantidad') <> 'number'
       OR jsonb_typeof(v_item->'precio_unitario') <> 'number'
       OR jsonb_typeof(v_item->'porcentaje_iva') <> 'number'
       OR jsonb_typeof(v_item->'afecta_stock') <> 'boolean'
       OR (v_item ? 'producto_id' AND jsonb_typeof(v_item->'producto_id') <> 'string')
       OR (v_item ? 'descripcion_manual' AND jsonb_typeof(v_item->'descripcion_manual') <> 'string')
       OR (v_item ? 'codigo_manual' AND jsonb_typeof(v_item->'codigo_manual') <> 'string')
       OR COALESCE(v_item->>'cantidad','') !~ '^[1-9][0-9]*$'
       OR COALESCE(v_item->>'precio_unitario','') !~ '^[0-9]+(\.[0-9]{1,2})?$'
       OR COALESCE(v_item->>'porcentaje_iva','') !~ '^[0-9]+(\.[0-9]{1,2})?$'
       OR COALESCE(v_item->>'afecta_stock','') NOT IN ('true','false') THEN
      RAISE EXCEPTION 'ventas_item_invalido' USING ERRCODE = '22023';
    END IF;
    IF (v_item ? 'producto_id') = (v_item ? 'descripcion_manual')
       OR (v_item ? 'descripcion_manual' AND btrim(COALESCE(v_item->>'descripcion_manual','')) = '')
       OR (NOT (v_item ? 'producto_id') AND v_item->>'afecta_stock' <> 'false') THEN
      RAISE EXCEPTION 'ventas_item_invalido' USING ERRCODE = '22023';
    END IF;
    FOR v_pago IN SELECT jsonb_build_object('k', k, 'v', v_item->>k)
      FROM jsonb_object_keys(v_item) k
      WHERE k IN ('porcentaje_descuento','monto_descuento','porcentaje_recargo','monto_recargo')
    LOOP
      IF jsonb_typeof(v_item->(v_pago->>'k')) <> 'number'
         OR COALESCE(v_pago->>'v','') !~ '^[0-9]+(\.[0-9]{1,2})?$' THEN
        RAISE EXCEPTION 'ventas_item_invalido' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF (v_item->>'porcentaje_iva')::numeric > 100 THEN RAISE EXCEPTION 'ventas_item_invalido' USING ERRCODE = '22023'; END IF;
    IF v_item ? 'producto_id' AND NOT EXISTS (
      SELECT 1 FROM public.productos pr WHERE pr.id = (v_item->>'producto_id')::uuid AND pr.comercio_id = p_comercio_id
    ) THEN RAISE EXCEPTION 'ventas_producto_no_disponible' USING ERRCODE = '42501'; END IF;

    v_cantidad := (v_item->>'cantidad')::integer;
    v_precio := (v_item->>'precio_unitario')::numeric;
    v_iva_pct := (v_item->>'porcentaje_iva')::numeric;
    v_item_desc_pct := COALESCE((v_item->>'porcentaje_descuento')::numeric, 0);
    v_item_desc_monto := COALESCE((v_item->>'monto_descuento')::numeric, 0);
    v_item_rec_pct := COALESCE((v_item->>'porcentaje_recargo')::numeric, 0);
    v_item_rec_monto := COALESCE((v_item->>'monto_recargo')::numeric, 0);
    v_item_bruto := round(v_cantidad * v_precio, 2);
    v_item_descuento := least(round(v_item_bruto * v_item_desc_pct / 100 + v_item_desc_monto, 2), v_item_bruto);
    v_item_recargo := round(v_item_bruto * v_item_rec_pct / 100 + v_item_rec_monto, 2);
    v_item_total := round(greatest(v_item_bruto - v_item_descuento + v_item_recargo, 0), 2);
    v_item_subtotal := round(CASE WHEN v_iva_pct > 0 THEN v_item_total / (1 + v_iva_pct / 100) ELSE v_item_total END, 2);
    v_items_total := v_items_total + v_item_total;
    v_items_subtotal := v_items_subtotal + v_item_subtotal;
  END LOOP;

  v_descuento_venta := least(round(v_items_total * COALESCE(p_porcentaje_descuento, 0) / 100 + COALESCE(p_monto_descuento, 0), 2), v_items_total);
  v_recargo_venta := round(v_items_total * COALESCE(p_porcentaje_recargo, 0) / 100 + COALESCE(p_monto_recargo, 0), 2);
  v_total_base := round(greatest(v_items_total - v_descuento_venta + v_recargo_venta, 0), 2);
  IF v_total_base <= 0 THEN RAISE EXCEPTION 'ventas_total_invalido' USING ERRCODE = '22023'; END IF;

  IF p_modalidad = 'contado' THEN
    IF jsonb_array_length(p_pagos) = 0 THEN RAISE EXCEPTION 'ventas_pago_requerido' USING ERRCODE = '22023'; END IF;
    FOR v_pago IN SELECT value FROM jsonb_array_elements(p_pagos)
    LOOP
      IF jsonb_typeof(v_pago) <> 'object'
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_pago) k WHERE k NOT IN ('tipo_pago','monto','banco_id','tarjeta_id','cuotas','recargo_cuotas','cheque_id'))
          OR NOT (v_pago ? 'tipo_pago' AND v_pago ? 'monto')
          OR jsonb_typeof(v_pago->'tipo_pago') <> 'string'
          OR jsonb_typeof(v_pago->'monto') <> 'number'
          OR (v_pago ? 'banco_id' AND jsonb_typeof(v_pago->'banco_id') <> 'string')
          OR (v_pago ? 'tarjeta_id' AND jsonb_typeof(v_pago->'tarjeta_id') <> 'string')
          OR (v_pago ? 'cheque_id' AND jsonb_typeof(v_pago->'cheque_id') <> 'string')
          OR (v_pago ? 'cuotas' AND jsonb_typeof(v_pago->'cuotas') <> 'number')
          OR (v_pago ? 'recargo_cuotas' AND jsonb_typeof(v_pago->'recargo_cuotas') <> 'number')
          OR COALESCE(v_pago->>'monto','') !~ '^[0-9]+(\.[0-9]{1,2})?$'
          OR (v_pago ? 'recargo_cuotas' AND COALESCE(v_pago->>'recargo_cuotas','') !~ '^[0-9]+(\.[0-9]{1,2})?$')
          OR (v_pago ? 'cuotas' AND COALESCE(v_pago->>'cuotas','') !~ '^[1-9][0-9]*$') THEN
        RAISE EXCEPTION 'ventas_pago_invalido' USING ERRCODE = '22023';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::public.tipo_pago)) t WHERE t::text = v_pago->>'tipo_pago')
         OR v_pago->>'tipo_pago' = 'cta_cte' THEN RAISE EXCEPTION 'ventas_pago_invalido' USING ERRCODE = '22023'; END IF;
      v_pago_monto := (v_pago->>'monto')::numeric;
      v_pago_recargo := COALESCE((v_pago->>'recargo_cuotas')::numeric, 0);
      IF v_pago_monto <= 0 OR v_pago_recargo > v_pago_monto THEN RAISE EXCEPTION 'ventas_pago_invalido' USING ERRCODE = '22023'; END IF;
      v_pagos_base := v_pagos_base + (v_pago_monto - v_pago_recargo);
      v_pagos_total := v_pagos_total + v_pago_monto;
    END LOOP;
    IF abs(round(v_pagos_base, 2) - v_total_base) > 0.01 THEN
      RAISE EXCEPTION 'ventas_pagos_no_coinciden' USING ERRCODE = '22023';
    END IF;
    v_total := round(v_pagos_total, 2);
  ELSE
    IF jsonb_array_length(p_pagos) <> 0 THEN RAISE EXCEPTION 'ventas_pago_no_permitido' USING ERRCODE = '22023'; END IF;
    v_total := v_total_base;
  END IF;
  v_factor := CASE WHEN v_total_base > 0 THEN v_total / v_total_base ELSE 1 END;
  v_subtotal := round(v_items_subtotal * v_factor, 2);
  v_total_iva := round(v_total - v_subtotal, 2);

  INSERT INTO public.ventas_numeradores(comercio_id, tipo_comprobante, punto_venta, ultimo_numero)
  VALUES (p_comercio_id, p_tipo_comprobante, p_punto_venta, 0)
  ON CONFLICT (comercio_id, tipo_comprobante, punto_venta) DO NOTHING;

  LOOP
    v_intento := v_intento + 1;
    IF v_intento > 100 THEN RAISE EXCEPTION 'ventas_numeracion_no_disponible' USING ERRCODE = '40001'; END IF;
    UPDATE public.ventas_numeradores
    SET ultimo_numero = ultimo_numero + 1, updated_at = now()
    WHERE comercio_id = p_comercio_id AND tipo_comprobante = p_tipo_comprobante AND punto_venta = p_punto_venta
    RETURNING ultimo_numero INTO v_numero;
    v_numero_texto := lpad(p_punto_venta::text, 4, '0') || '-' || lpad(v_numero::text, 8, '0');
    BEGIN
      INSERT INTO public.ventas (
        comercio_id, numero_comprobante, fecha_venta, tipo_pago, tipo_comprobante, cliente_id, cliente_nombre,
        moneda, punto_venta, numero_secuencial, idempotency_key, porcentaje_descuento, monto_descuento,
        idempotency_payload, porcentaje_recargo, monto_recargo, subtotal, total_iva, total, observaciones
      ) VALUES (
        p_comercio_id, v_numero_texto, p_fecha_venta,
        CASE WHEN p_modalidad = 'cta_cte' THEN 'cta_cte'::public.tipo_pago ELSE (p_pagos->0->>'tipo_pago')::public.tipo_pago END,
        p_tipo_comprobante, p_cliente_id, COALESCE(NULLIF(btrim(p_cliente_nombre), ''), 'Consumidor Final'),
        p_moneda, p_punto_venta, v_numero, p_idempotency_key, COALESCE(p_porcentaje_descuento, 0),
        v_descuento_venta, v_idempotency_payload, COALESCE(p_porcentaje_recargo, 0), v_recargo_venta,
        v_subtotal, v_total_iva, v_total, NULLIF(btrim(p_observaciones), '')
      ) RETURNING * INTO v_venta;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO v_venta FROM public.ventas
      WHERE comercio_id = p_comercio_id AND idempotency_key = p_idempotency_key;
      IF v_venta.id IS NOT NULL THEN
        IF v_venta.idempotency_payload IS DISTINCT FROM v_idempotency_payload THEN
          RAISE EXCEPTION 'ventas_idempotency_conflicto' USING ERRCODE = '22023';
        END IF;
        RETURN v_venta;
      END IF;
    END;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_producto_id := CASE WHEN v_item ? 'producto_id' THEN (v_item->>'producto_id')::uuid ELSE NULL END;
    v_descripcion := NULLIF(btrim(v_item->>'descripcion_manual'), '');
    v_codigo := NULLIF(btrim(v_item->>'codigo_manual'), '');
    v_cantidad := (v_item->>'cantidad')::integer;
    v_precio := (v_item->>'precio_unitario')::numeric;
    v_iva_pct := (v_item->>'porcentaje_iva')::numeric;
    v_item_desc_pct := COALESCE((v_item->>'porcentaje_descuento')::numeric, 0);
    v_item_desc_monto := COALESCE((v_item->>'monto_descuento')::numeric, 0);
    v_item_rec_pct := COALESCE((v_item->>'porcentaje_recargo')::numeric, 0);
    v_item_rec_monto := COALESCE((v_item->>'monto_recargo')::numeric, 0);
    v_afecta_stock := (v_item->>'afecta_stock')::boolean;
    v_item_bruto := round(v_cantidad * v_precio, 2);
    v_item_descuento := least(round(v_item_bruto * v_item_desc_pct / 100 + v_item_desc_monto, 2), v_item_bruto);
    v_item_recargo := round(v_item_bruto * v_item_rec_pct / 100 + v_item_rec_monto, 2);
    v_item_total := round(greatest(v_item_bruto - v_item_descuento + v_item_recargo, 0), 2);
    v_item_subtotal := round(CASE WHEN v_iva_pct > 0 THEN v_item_total / (1 + v_iva_pct / 100) ELSE v_item_total END, 2);
    v_item_iva := round(v_item_total - v_item_subtotal, 2);
    INSERT INTO public.venta_items(
      venta_id, comercio_id, producto_id, descripcion_manual, codigo_manual, cantidad, precio_unitario,
      porcentaje_iva, porcentaje_descuento, monto_descuento, porcentaje_recargo, monto_recargo,
      monto_iva, subtotal, total, afecta_stock
    ) VALUES (
      v_venta.id, p_comercio_id, v_producto_id, v_descripcion, v_codigo, v_cantidad, v_precio,
      v_iva_pct, v_item_desc_pct, v_item_descuento, v_item_rec_pct, v_item_recargo,
      v_item_iva, v_item_subtotal, v_item_total, v_afecta_stock
    );
  END LOOP;

  IF p_modalidad = 'contado' THEN
    FOR v_pago IN SELECT value FROM jsonb_array_elements(p_pagos)
    LOOP
      INSERT INTO public.pagos_venta(
        venta_id, comercio_id, tipo_pago, monto, banco_id, tarjeta_id, cuotas, recargo_cuotas, cheque_id, moneda
      ) VALUES (
        v_venta.id, p_comercio_id, (v_pago->>'tipo_pago')::public.tipo_pago, (v_pago->>'monto')::numeric,
        CASE WHEN v_pago ? 'banco_id' THEN (v_pago->>'banco_id')::uuid ELSE NULL END,
        CASE WHEN v_pago ? 'tarjeta_id' THEN (v_pago->>'tarjeta_id')::uuid ELSE NULL END,
        COALESCE((v_pago->>'cuotas')::integer, 1), COALESCE((v_pago->>'recargo_cuotas')::numeric, 0),
        CASE WHEN v_pago ? 'cheque_id' THEN (v_pago->>'cheque_id')::uuid ELSE NULL END, p_moneda
      );
    END LOOP;
  ELSE
    INSERT INTO public.pagos_venta(venta_id, comercio_id, tipo_pago, monto, moneda)
    VALUES (v_venta.id, p_comercio_id, 'cta_cte', v_total, p_moneda);
    INSERT INTO public.cuenta_corriente(
      comercio_id, cliente_id, tipo_movimiento, monto, concepto, venta_id, fecha_movimiento, moneda
    ) VALUES (
      p_comercio_id, p_cliente_id, 'debito', v_total, 'pago_cuenta_corriente', v_venta.id, p_fecha_venta, p_moneda
    );
  END IF;

  RETURN v_venta;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_venta_transaccional(
  uuid, public.tipo_comprobante, integer, uuid, text, text, text, jsonb, jsonb, uuid,
  timestamptz, text, numeric, numeric, numeric, numeric
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_venta_transaccional(
  uuid, public.tipo_comprobante, integer, uuid, text, text, text, jsonb, jsonb, uuid,
  timestamptz, text, numeric, numeric, numeric, numeric
) TO authenticated;

COMMENT ON FUNCTION public.registrar_venta_transaccional(
  uuid, public.tipo_comprobante, integer, uuid, text, text, text, jsonb, jsonb, uuid,
  timestamptz, text, numeric, numeric, numeric, numeric
) IS 'Alta administrativa e idempotente. No crea caja_movimientos: el circuito actual de caja es posterior y opcional.';

COMMIT;
