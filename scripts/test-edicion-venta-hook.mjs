// Pruebas del hook con Supabase simulado; no realiza conexiones ni escrituras.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/hooks/useVentas.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const commerce = 'tenant';
let rpcCalls = [];
let pendingRpc;
let invalidations = [];
const dependencies = {
  '@tanstack/react-query': {
    useQuery: () => ({ data: [], isLoading: false }),
    useQueryClient: () => ({ invalidateQueries: args => invalidations.push(args) }),
    useMutation: config => ({
      mutate: () => { throw new Error('El guardado debe devolver una promesa'); },
      mutateAsync: async args => {
        try { const result = await config.mutationFn(args); config.onSuccess?.(result); return result; }
        catch (error) { config.onError?.(error); throw error; }
      },
    }),
  },
  '@/integrations/supabase/client': { supabase: {
    from: () => { throw new Error('No se permiten escrituras independientes al editar'); },
    rpc: async (name, args) => { rpcCalls.push({ name, args }); return await pendingRpc; },
  } },
  '@/hooks/use-toast': { useToast: () => ({ toast: () => {} }) },
  '@/hooks/useComercio': { useComercio: () => ({ comercio: { id: commerce } }) },
  '@/hooks/useAfipConfig': { useAfipConfig: () => ({}) },
  '@/utils/legacyVisibility': {},
};
const exports = {};
vm.runInNewContext(compiled, { exports, require: name => dependencies[name], console }, { filename: fileURLToPath(new URL('../src/hooks/useVentas.ts', import.meta.url)) });
const hook = exports.useVentas();
const payload = {
  ventaId: 'sale', venta: { numero_comprobante: '0001-00000027', total: 200000 },
  items: [{ descripcion_manual: 'Hosting', cantidad: 1, precio_unitario: 200000 }, { producto_id: 'product', cantidad: 1 }],
  pagos: [{ tipo_pago: 'transferencia', monto: 200000 }],
};
let resolveRpc;
pendingRpc = new Promise(resolve => { resolveRpc = resolve; });
let completed = false;
const saving = hook.updateVenta(payload).then(result => { completed = true; return result; });
await Promise.resolve();
assert.equal(completed, false, 'Debe esperar la confirmación del servidor');
assert.equal(invalidations.length, 0, 'No debe anunciar éxito anticipadamente');
assert.equal(rpcCalls.length, 1);
assert.equal(rpcCalls[0].name, 'actualizar_venta_transaccional');
assert.equal(rpcCalls[0].args.p_comercio_id, commerce);
assert.equal(rpcCalls[0].args.p_items[0].afecta_stock, false);
assert.equal(rpcCalls[0].args.p_items[1].afecta_stock, true);
resolveRpc({ data: { id: 'sale' }, error: null });
assert.equal((await saving).id, 'sale');
assert.ok(invalidations.some(entry => entry.queryKey[0] === 'ventas'));
console.log('OK Guarda con una sola RPC y espera confirmación');

rpcCalls = []; invalidations = [];
pendingRpc = Promise.resolve({ data: null, error: { message: 'Stock insuficiente' } });
await assert.rejects(hook.updateVenta(payload), /Stock insuficiente/);
assert.equal(rpcCalls.length, 1);
assert.equal(invalidations.length, 0);
console.log('OK Propaga el fallo al formulario sin éxito anticipado');

rpcCalls = [];
await assert.rejects(hook.updateVenta({ ...payload, items: [] }), /al menos un ítem/);
assert.equal(rpcCalls.length, 0);
console.log('OK Rechaza detalle vacío antes de enviar');

pendingRpc = Promise.resolve({ data: null, error: { message: 'Could not find the function public.actualizar_venta_transaccional in the schema cache' } });
await assert.rejects(hook.updateVenta(payload), /conserva sus datos/);
console.log('OK Si falta la migración, falla sin usar el guardado anterior');
console.log('4 pruebas del hook correctas.');
