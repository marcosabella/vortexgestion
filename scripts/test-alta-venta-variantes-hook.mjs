import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const mutations = [], calls = [];
let response = { data: { id: 'venta' }, error: null };
const rpc = async (name, args) => { calls.push({ name, args }); return response; };
const dependencies = {
  '@tanstack/react-query': {
    useQuery: () => ({ data: [] }), useQueryClient: () => ({ invalidateQueries() {} }),
    useMutation: options => { mutations.push(options); return {}; },
  },
  '@/integrations/supabase/client': { supabase: { rpc } },
  '@/hooks/use-toast': { useToast: () => ({ toast() {} }) },
  '@/hooks/useComercio': { useComercio: () => ({ comercio: { id: 'comercio' } }) },
  '@/hooks/useAfipConfig': { useAfipConfig: () => ({ data: { punto_venta: 1 } }) },
  '@/hooks/useEmisoresFiscales': { rpcEmisorFiscal: rpc },
  '@/utils/legacyVisibility': {},
};
const exports = {};
const compiled = ts.transpileModule(readFileSync('src/hooks/useVentas.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(compiled, { exports, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; }, console });
exports.useVentas();
const input = { venta: { tipo_comprobante: 'recibo_x', cliente_id: 'cliente', fecha_venta: '2026-10-15' },
  items: [{ producto_id: 'producto', producto_variante_id: 'talle-elegido', cantidad: 1, precio_unitario: 100, porcentaje_iva: 0 }],
  pagos: [{ tipo_pago: 'contado', monto: 100 }], idempotencyKey: 'intento' };
for (const [extra, expected] of [
  [{}, 'registrar_venta_transaccional'],
  [{ numeroManual: '0001-00000100' }, 'registrar_venta_manual_transaccional'],
  [{ venta: { ...input.venta, emisor_fiscal_id: 'emisor', punto_venta: 1 } }, 'registrar_venta_emisor_transaccional'],
]) {
  await mutations[0].mutationFn({ ...input, ...extra });
  const call = calls.at(-1);
  assert.equal(call.name, expected);
  assert.equal(call.args.p_items[0].producto_variante_id, 'talle-elegido', 'Debe conservar el talle hasta PostgreSQL');
  assert.equal(call.args.p_items[0].producto_id, 'producto');
}
await mutations[0].mutationFn({ ...input, items: [{ ...input.items[0], producto_variante_id: null }] });
assert.equal('producto_variante_id' in calls.at(-1).args.p_items[0], false, 'Sin variantes conserva compatibilidad');
response = { data: null, error: { message: 'ventas_stock_variantes_desajustado' } };
await assert.rejects(mutations[0].mutationFn(input), /stock por talle\/color no coincide/);
console.log('OK alta: RPC normal, manual y multi-CUIT conservan variante; sin variantes compatible; informa desajustes. Supabase simulado.');
