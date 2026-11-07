BEGIN;
CREATE FUNCTION public.apicola_validar_flujos(p_comercio uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(WITH asignados AS (
  SELECT origen,coalesce(pago_venta_id,cuenta_cliente_id,cuenta_proveedor_id,gasto_id) id,sum(importe) importe,min(moneda) moneda,min(tipo) tipo,min(fecha) fecha
  FROM public.apicola_flujos WHERE comercio_id=p_comercio AND estado='vigente' GROUP BY origen,coalesce(pago_venta_id,cuenta_cliente_id,cuenta_proveedor_id,gasto_id)
 ) SELECT 1 FROM asignados a LEFT JOIN public.apicola_fuentes_caja(p_comercio) q ON q.id=a.id AND q.origen=a.origen
 WHERE q.id IS NULL OR a.importe>q.importe OR a.moneda<>q.moneda OR a.tipo<>q.tipo OR a.fecha<>q.fecha) THEN
  RAISE EXCEPTION 'El cobro o pago tiene asignaciones apícolas. Anulalas antes de corregir su importe, fecha, moneda u origen';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.apicola_validar_flujos(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.apicola_control_flujos_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.comercio_id IS DISTINCT FROM NEW.comercio_id THEN
  IF TG_TABLE_NAME='ventas' AND EXISTS(SELECT 1 FROM public.apicola_flujos f WHERE f.pago_venta_id IN (SELECT id FROM public.pagos_venta WHERE venta_id=OLD.id) OR f.cuenta_cliente_id IN (SELECT id FROM public.cuenta_corriente WHERE venta_id=OLD.id)) THEN RAISE EXCEPTION 'La venta conserva flujos apícolas y no puede cambiar de comercio'; END IF;
  IF TG_TABLE_NAME='compras_facturas' AND EXISTS(SELECT 1 FROM public.apicola_flujos f JOIN public.cuenta_corriente_proveedores m ON m.id=f.cuenta_proveedor_id WHERE m.factura_id=OLD.id) THEN RAISE EXCEPTION 'La factura conserva flujos apícolas y no puede cambiar de comercio'; END IF;
  IF EXISTS(SELECT 1 FROM public.apicola_flujos f WHERE
   (TG_TABLE_NAME='pagos_venta' AND f.pago_venta_id=OLD.id) OR (TG_TABLE_NAME='cuenta_corriente' AND f.cuenta_cliente_id=OLD.id) OR (TG_TABLE_NAME='cuenta_corriente_proveedores' AND f.cuenta_proveedor_id=OLD.id) OR (TG_TABLE_NAME='gastos_egresos' AND f.gasto_id=OLD.id)) THEN RAISE EXCEPTION 'El movimiento tiene historial apícola y no puede cambiar de comercio'; END IF;
  PERFORM public.apicola_validar_flujos(OLD.comercio_id);
 END IF;
 PERFORM public.apicola_validar_flujos(NEW.comercio_id);RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.apicola_control_flujos_trigger() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['pagos_venta','cuenta_corriente','cuenta_corriente_proveedores','gastos_egresos','ventas','compras_facturas'] LOOP
  EXECUTE format('CREATE TRIGGER apicola_flujo_control AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.apicola_control_flujos_trigger()',t);
 END LOOP;
END $$;
CREATE FUNCTION public.apicola_insumo_tenant_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.comercio_id IS DISTINCT FROM OLD.comercio_id AND EXISTS(SELECT 1 FROM public.apicola_fraccionado_insumos WHERE producto_id=OLD.id) THEN RAISE EXCEPTION 'El insumo tiene historial de fraccionado y no puede cambiar de comercio'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.apicola_insumo_tenant_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER apicola_insumo_tenant BEFORE UPDATE ON public.productos FOR EACH ROW EXECUTE FUNCTION public.apicola_insumo_tenant_guard();
CREATE FUNCTION public.apicola_insumo_variante_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.apicola_fraccionado_insumos i JOIN public.apicola_fraccionamientos f ON f.comercio_id=i.comercio_id AND f.id=i.fraccionamiento_id WHERE i.producto_id=NEW.producto_id AND f.estado='vigente') THEN RAISE EXCEPTION 'El insumo tiene fraccionamientos vigentes sin variantes; conservá su modalidad de stock'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.apicola_insumo_variante_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER apicola_insumo_variante BEFORE INSERT OR UPDATE OF producto_id ON public.producto_variantes FOR EACH ROW EXECUTE FUNCTION public.apicola_insumo_variante_guard();
COMMIT;
