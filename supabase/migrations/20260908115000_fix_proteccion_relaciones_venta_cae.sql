\set ON_ERROR_STOP on

BEGIN;

-- Preconditions: this repair is valid only after the CAE relation-protection
-- triggers and their expected tables/columns have been installed.
DO $preconditions$
DECLARE
  v_trigger_count integer;
BEGIN
  IF to_regprocedure('public.prevent_authorized_venta_relation_changes()') IS NULL
     OR to_regclass('public.ventas') IS NULL
     OR to_regclass('public.venta_items') IS NULL
     OR to_regclass('public.pagos_venta') IS NULL
     OR to_regclass('public.cuenta_corriente') IS NULL
     OR to_regclass('public.caja_movimientos') IS NULL THEN
    RAISE EXCEPTION 'venta_cae_protection_repair_missing_required_relation_or_function';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='venta_items' AND column_name='afecta_stock')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='venta_items' AND column_name='producto_id')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='venta_items' AND column_name='venta_id')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pagos_venta' AND column_name='tipo_pago') THEN
    RAISE EXCEPTION 'venta_cae_protection_repair_unexpected_schema';
  END IF;

  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger t
  WHERE NOT t.tgisinternal
    AND t.tgname IN (
      'prevent_authorized_venta_items_changes',
      'prevent_authorized_pagos_venta_changes',
      'prevent_authorized_cuenta_corriente_changes',
      'prevent_authorized_caja_movimientos_changes'
    )
    AND t.tgfoid = 'public.prevent_authorized_venta_relation_changes()'::regprocedure;
  IF v_trigger_count <> 4 THEN
    RAISE EXCEPTION 'venta_cae_protection_repair_expected_four_triggers:%', v_trigger_count;
  END IF;
END;
$preconditions$;

-- Safe table-specific branching: no pagos_venta field is reachable from a
-- venta_items trigger invocation. This temporary version permits only the
-- one-time stock-flag normalization below.
CREATE OR REPLACE FUNCTION public.prevent_authorized_venta_relation_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_venta_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'venta_items' THEN
    IF TG_OP = 'DELETE' THEN
      v_venta_id := OLD.venta_id;
    ELSIF TG_OP = 'INSERT' THEN
      v_venta_id := NEW.venta_id;
    ELSIF TG_OP = 'UPDATE' THEN
      v_venta_id := NEW.venta_id;
    ELSE
      RAISE EXCEPTION 'venta_cae_protection_unexpected_operation:%', TG_OP;
    END IF;

    IF EXISTS (SELECT 1 FROM public.ventas WHERE id=v_venta_id AND NULLIF(pg_catalog.btrim(cae), '') IS NOT NULL) THEN
      IF TG_OP = 'UPDATE'
         AND OLD.producto_id IS NULL AND NEW.producto_id IS NULL
         AND OLD.afecta_stock IS TRUE AND NEW.afecta_stock IS FALSE
         AND (pg_catalog.to_jsonb(OLD) - 'afecta_stock' - 'updated_at') IS NOT DISTINCT FROM (pg_catalog.to_jsonb(NEW) - 'afecta_stock' - 'updated_at') THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'La venta tiene CAE y sus datos relacionados no pueden modificarse';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'pagos_venta' THEN
    IF TG_OP = 'DELETE' THEN v_venta_id := OLD.venta_id; ELSE v_venta_id := NEW.venta_id; END IF;
    IF EXISTS (SELECT 1 FROM public.ventas WHERE id=v_venta_id AND NULLIF(pg_catalog.btrim(cae), '') IS NOT NULL) THEN
      IF TG_OP = 'UPDATE'
         AND OLD.id IS NOT DISTINCT FROM NEW.id
         AND OLD.venta_id IS NOT DISTINCT FROM NEW.venta_id
         AND OLD.comercio_id IS NOT DISTINCT FROM NEW.comercio_id
         AND OLD.tipo_pago IS NOT DISTINCT FROM NEW.tipo_pago
         AND OLD.monto IS NOT DISTINCT FROM NEW.monto
         AND OLD.banco_id IS NOT DISTINCT FROM NEW.banco_id
         AND OLD.tarjeta_id IS NOT DISTINCT FROM NEW.tarjeta_id
         AND OLD.cuotas IS NOT DISTINCT FROM NEW.cuotas
         AND OLD.recargo_cuotas IS NOT DISTINCT FROM NEW.recargo_cuotas
         AND OLD.cheque_id IS NOT DISTINCT FROM NEW.cheque_id THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'La venta tiene CAE y sus datos relacionados no pueden modificarse';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'cuenta_corriente' OR TG_TABLE_NAME = 'caja_movimientos' THEN
    IF TG_OP = 'DELETE' THEN v_venta_id := OLD.venta_id; ELSE v_venta_id := NEW.venta_id; END IF;
    IF EXISTS (SELECT 1 FROM public.ventas WHERE id=v_venta_id AND NULLIF(pg_catalog.btrim(cae), '') IS NOT NULL) THEN
      RAISE EXCEPTION 'La venta tiene CAE y sus datos relacionados no pueden modificarse';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'venta_cae_protection_unexpected_table:%', TG_TABLE_NAME;
END;
$function$;

UPDATE public.venta_items
SET afecta_stock = false
WHERE producto_id IS NULL
  AND afecta_stock IS TRUE;

DO $assert_normalized$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venta_items WHERE producto_id IS NULL AND afecta_stock IS TRUE) THEN
    RAISE EXCEPTION 'venta_cae_protection_repair_stock_flag_normalization_incomplete';
  END IF;
END;
$assert_normalized$;

-- Final strict version: the temporary venta_items exception is intentionally
-- removed before commit; only the historic pagos_venta reconciliation update remains.
CREATE OR REPLACE FUNCTION public.prevent_authorized_venta_relation_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_venta_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'venta_items' THEN
    IF TG_OP = 'DELETE' THEN v_venta_id := OLD.venta_id; ELSE v_venta_id := NEW.venta_id; END IF;
    IF EXISTS (SELECT 1 FROM public.ventas WHERE id=v_venta_id AND NULLIF(pg_catalog.btrim(cae), '') IS NOT NULL) THEN
      RAISE EXCEPTION 'La venta tiene CAE y sus datos relacionados no pueden modificarse';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'pagos_venta' THEN
    IF TG_OP = 'DELETE' THEN v_venta_id := OLD.venta_id; ELSE v_venta_id := NEW.venta_id; END IF;
    IF EXISTS (SELECT 1 FROM public.ventas WHERE id=v_venta_id AND NULLIF(pg_catalog.btrim(cae), '') IS NOT NULL) THEN
      IF TG_OP = 'UPDATE'
         AND OLD.id IS NOT DISTINCT FROM NEW.id
         AND OLD.venta_id IS NOT DISTINCT FROM NEW.venta_id
         AND OLD.comercio_id IS NOT DISTINCT FROM NEW.comercio_id
         AND OLD.tipo_pago IS NOT DISTINCT FROM NEW.tipo_pago
         AND OLD.monto IS NOT DISTINCT FROM NEW.monto
         AND OLD.banco_id IS NOT DISTINCT FROM NEW.banco_id
         AND OLD.tarjeta_id IS NOT DISTINCT FROM NEW.tarjeta_id
         AND OLD.cuotas IS NOT DISTINCT FROM NEW.cuotas
         AND OLD.recargo_cuotas IS NOT DISTINCT FROM NEW.recargo_cuotas
         AND OLD.cheque_id IS NOT DISTINCT FROM NEW.cheque_id THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'La venta tiene CAE y sus datos relacionados no pueden modificarse';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'cuenta_corriente' OR TG_TABLE_NAME = 'caja_movimientos' THEN
    IF TG_OP = 'DELETE' THEN v_venta_id := OLD.venta_id; ELSE v_venta_id := NEW.venta_id; END IF;
    IF EXISTS (SELECT 1 FROM public.ventas WHERE id=v_venta_id AND NULLIF(pg_catalog.btrim(cae), '') IS NOT NULL) THEN
      RAISE EXCEPTION 'La venta tiene CAE y sus datos relacionados no pueden modificarse';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'venta_cae_protection_unexpected_table:%', TG_TABLE_NAME;
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_authorized_venta_relation_changes() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.prevent_authorized_venta_relation_changes() IS
  'Protege relaciones de ventas con CAE con ramas separadas por tabla; nunca evalua campos de pagos_venta desde triggers de otras tablas.';

COMMIT;
