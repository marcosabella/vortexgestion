-- Las operaciones históricas deben conservar el stock maestro ya importado.
-- El indicador es local a la transacción y solo lo establecen funciones admin.
CREATE OR REPLACE FUNCTION public.apply_venta_item_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE affected_rows integer;
BEGIN
  IF current_setting('app.skip_stock_movements', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.producto_id IS NULL THEN RETURN NEW; END IF;
    UPDATE public.productos SET stock=stock-NEW.cantidad WHERE id=NEW.producto_id AND stock>=NEW.cantidad;
    GET DIAGNOSTICS affected_rows=ROW_COUNT;
    IF affected_rows=0 THEN RAISE EXCEPTION 'Stock insuficiente para el producto seleccionado'; END IF;
    RETURN NEW;
  ELSIF TG_OP='DELETE' THEN
    IF OLD.producto_id IS NOT NULL THEN UPDATE public.productos SET stock=stock+OLD.cantidad WHERE id=OLD.producto_id; END IF;
    RETURN OLD;
  ELSIF TG_OP='UPDATE' THEN
    IF OLD.producto_id IS NOT NULL AND OLD.producto_id=NEW.producto_id THEN
      IF NEW.cantidad>OLD.cantidad THEN
        UPDATE public.productos SET stock=stock-(NEW.cantidad-OLD.cantidad) WHERE id=NEW.producto_id AND stock>=(NEW.cantidad-OLD.cantidad);
        GET DIAGNOSTICS affected_rows=ROW_COUNT;
        IF affected_rows=0 THEN RAISE EXCEPTION 'Stock insuficiente para el producto seleccionado'; END IF;
      ELSIF NEW.cantidad<OLD.cantidad THEN
        UPDATE public.productos SET stock=stock+(OLD.cantidad-NEW.cantidad) WHERE id=NEW.producto_id;
      END IF;
    ELSE
      IF OLD.producto_id IS NOT NULL THEN UPDATE public.productos SET stock=stock+OLD.cantidad WHERE id=OLD.producto_id; END IF;
      IF NEW.producto_id IS NOT NULL THEN
        UPDATE public.productos SET stock=stock-NEW.cantidad WHERE id=NEW.producto_id AND stock>=NEW.cantidad;
        GET DIAGNOSTICS affected_rows=ROW_COUNT;
        IF affected_rows=0 THEN RAISE EXCEPTION 'Stock insuficiente para el producto seleccionado'; END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END $$;

ALTER FUNCTION public.migracion_aplicar_operaciones(uuid) RENAME TO migracion_aplicar_operaciones_v1;
CREATE FUNCTION public.migracion_aplicar_operaciones(p_migracion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.migracion_assert_admin();
  PERFORM set_config('app.skip_stock_movements','on',true);
  RETURN public.migracion_aplicar_operaciones_v1(p_migracion_id);
END $$;

ALTER FUNCTION public.migracion_revertir_operaciones(uuid) RENAME TO migracion_revertir_operaciones_v1;
CREATE FUNCTION public.migracion_revertir_operaciones(p_migracion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.migracion_assert_admin();
  PERFORM set_config('app.skip_stock_movements','on',true);
  RETURN public.migracion_revertir_operaciones_v1(p_migracion_id);
END $$;

GRANT EXECUTE ON FUNCTION public.migracion_aplicar_operaciones(uuid),public.migracion_revertir_operaciones(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.migracion_aplicar_operaciones_v1(uuid),public.migracion_revertir_operaciones_v1(uuid) FROM PUBLIC,authenticated;
