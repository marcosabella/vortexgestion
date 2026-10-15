// Genera definiciones completas a partir de las versiones previas, sin alterar migraciones históricas.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const directory = 'supabase/migrations/';
function corregir(file, name) {
  const source = readFileSync(directory + file, 'utf8').replaceAll('\r\n', '\n');
  const inicio = source.indexOf('CREATE OR REPLACE FUNCTION public.' + name + '(');
  const fin = source.indexOf('\n$$;', inicio) + 4;
  assert.ok(inicio >= 0 && fin > inicio);
  let sql = source.slice(inicio, fin);
  const replace = (before, after) => {
    assert.equal(sql.split(before).length - 1, 1, `Patrón inesperado en ${name}: ${before}`);
    sql = sql.replace(before, () => after);
  };
  replace("k NOT IN ('producto_id','descripcion_manual'", "k NOT IN ('producto_id','producto_variante_id','descripcion_manual'");
  replace("OR (v_item ? 'producto_id' AND jsonb_typeof(v_item->'producto_id') <> 'string')",
    "OR (v_item ? 'producto_id' AND jsonb_typeof(v_item->'producto_id') <> 'string')\n       OR (v_item ? 'producto_variante_id' AND (NOT (v_item ? 'producto_id') OR jsonb_typeof(v_item->'producto_variante_id') <> 'string' OR coalesce(v_item->>'producto_variante_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'))");
  replace('INSERT INTO public.venta_items(venta_id, comercio_id, producto_id, descripcion_manual,',
    'INSERT INTO public.venta_items(venta_id, comercio_id, producto_id, producto_variante_id, descripcion_manual,');
  replace('VALUES (v_venta.id, p_comercio_id, v_producto_id, v_descripcion,',
    "VALUES (v_venta.id, p_comercio_id, v_producto_id, nullif(v_item->>'producto_variante_id','')::uuid, v_descripcion,");
  return sql;
}
const guard = `
-- Los clientes anteriores tampoco pueden descontar solo el total de un producto con variantes.
-- El bloqueo del producto serializa movimientos por talle antes de recalcular el total existente.
CREATE FUNCTION public.validar_variante_venta_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_comercio uuid; v_producto public.productos; v_suma bigint;
BEGIN
  IF current_setting('app.skip_stock_movements', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.producto_id IS NULL THEN
    IF NEW.producto_variante_id IS NOT NULL THEN RAISE EXCEPTION 'ventas_variante_no_disponible'; END IF;
    RETURN NEW;
  END IF;
  SELECT comercio_id INTO v_comercio FROM public.ventas WHERE id=NEW.venta_id;
  SELECT * INTO v_producto FROM public.productos WHERE id=NEW.producto_id FOR UPDATE;
  IF v_comercio IS NULL OR v_producto.id IS NULL OR v_producto.comercio_id IS DISTINCT FROM v_comercio
    OR NEW.comercio_id IS DISTINCT FROM v_comercio THEN RAISE EXCEPTION 'ventas_producto_no_disponible' USING ERRCODE='42501'; END IF;
  IF NEW.producto_variante_id IS NULL THEN
    IF EXISTS(SELECT 1 FROM public.producto_variantes WHERE producto_id=NEW.producto_id) THEN
      RAISE EXCEPTION 'ventas_variante_requerida' USING ERRCODE='22023';
    END IF;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM public.producto_variantes WHERE id=NEW.producto_variante_id AND producto_id=NEW.producto_id) THEN
      RAISE EXCEPTION 'ventas_variante_no_disponible' USING ERRCODE='42501';
    END IF;
    SELECT coalesce(sum(stock),0) INTO v_suma FROM public.producto_variantes WHERE producto_id=NEW.producto_id;
    IF v_producto.stock IS DISTINCT FROM v_suma THEN
      RAISE EXCEPTION 'ventas_stock_variantes_desajustado' USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.validar_variante_venta_stock() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validar_variante_venta_stock
BEFORE INSERT OR UPDATE OF producto_id, producto_variante_id, cantidad, afecta_stock ON public.venta_items
FOR EACH ROW EXECUTE FUNCTION public.validar_variante_venta_stock();

-- Cambiar solo de talle también debe reponer el anterior y descontar el nuevo.
CREATE OR REPLACE TRIGGER apply_venta_item_stock_update
AFTER UPDATE OF producto_id, producto_variante_id, cantidad, afecta_stock ON public.venta_items
FOR EACH ROW WHEN (
  OLD.producto_id IS DISTINCT FROM NEW.producto_id
  OR OLD.producto_variante_id IS DISTINCT FROM NEW.producto_variante_id
  OR OLD.cantidad IS DISTINCT FROM NEW.cantidad
  OR OLD.afecta_stock IS DISTINCT FROM NEW.afecta_stock
)
EXECUTE FUNCTION public.apply_venta_item_stock();
`;
const funciones = [
  corregir('20260908130000_venta_items_precio_iva_decimal.sql', 'registrar_venta_transaccional'),
  corregir('20261014131000_emisores_fiscales_ventas.sql', 'registrar_venta_emisor_transaccional'),
];
writeFileSync(directory + '20261015140000_ventas_conservar_variante_stock.sql',
  '-- Conserva talle/color en altas normales, manuales (wrapper) y multi-CUIT.\n-- No repara ni recalcula stocks históricos. Aplicar antes del frontend.\nBEGIN;\n\n' + funciones.join('\n\n') + '\n' + guard + '\nCOMMIT;\n');
console.log('Migración de stock por variante generada; sin conexión a Supabase.');
