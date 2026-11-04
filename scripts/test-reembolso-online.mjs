import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
const source = readFileSync('supabase/functions/mercadopago-reembolsar-pedido/reembolso.ts', 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Error, encodeURIComponent });
const { procesarReembolso } = exports;
const job = { id: 'job', intento: 'attempt', operacion_id: 'op', comercio_id: 'tenant', estado: 'procesando', puede_procesar: true, payment_id: '123', external_reference: 'pedido', idempotency_key: 'stable-uuid', importe: 100 };
function fixture(options = {}) {
  let refunded = options.refunded || 0;
  let storedAmount = options.storedAmount ?? null;
  const requests = [], syncs = [], finishes = [], ledger = new Map();
  const deps = {
    request: async (path, init) => {
      requests.push({ path, init });
      if (init?.method === 'POST') {
        const key = init.headers['X-Idempotency-Key'];
        const amount = JSON.parse(init.body).amount;
        if (!ledger.has(key)) {
          ledger.set(key, amount);
          if (!options.pending) refunded += amount;
        } else assert.equal(ledger.get(key), amount, 'Misma clave, mismo importe');
        if (options.timeout) { options.timeout = false; throw Error('Timeout despues del reembolso'); }
        return { id: 'refund-1', amount, status: options.pending ? 'in_process' : 'approved' };
      }
      if (options.networkFailure) throw Error('Sin conexion');
      if (path.endsWith('/refunds')) return options.pendingExternal ? [{ status: 'in_process' }] : [];
      return { id: 123, collector_id: 'seller', external_reference: 'pedido', currency_id: 'ARS', transaction_amount: 100,
        transaction_amount_refunded: refunded, status: refunded === 100 ? 'refunded' : 'approved', ...options.payment };
    },
    fijarImporte: async amount => { storedAmount ??= amount; return storedAmount; },
    sincronizar: async total => { syncs.push(total); },
    finalizar: async (...args) => { finishes.push(args); },
  };
  return { deps, requests, syncs, finishes, ledger };
}

let f = fixture();
assert.equal((await procesarReembolso(job, 'seller', f.deps)).estado, 'completado');
assert.equal(f.ledger.size, 1);
assert.deepEqual(f.syncs, [100]);
f = fixture({ timeout: true });
assert.equal((await procesarReembolso(job, 'seller', f.deps)).estado, 'error');
assert.equal((await procesarReembolso(job, 'seller', f.deps)).estado, 'completado');
assert.equal(f.ledger.size, 1, 'Respuesta perdida: reconciliar, sin repetir devolucion');
assert.equal(f.requests.filter(x => x.init?.method === 'POST').length, 1);
f = fixture({ pending: true });
assert.equal((await procesarReembolso(job, 'seller', f.deps)).estado, 'pendiente');
assert.equal((await procesarReembolso(job, 'seller', f.deps)).estado, 'pendiente');
assert.equal(f.ledger.size, 1, 'Reintento pendiente usa la misma clave');
f = fixture({ refunded: 30 });
assert.equal((await procesarReembolso(job, 'seller', f.deps)).estado, 'completado');
assert.equal([...f.ledger.values()][0], 70, 'Devuelve solo el saldo despues de una devolucion parcial');
f = fixture({ refunded: 30, storedAmount: 100 });
assert.equal((await procesarReembolso(job, 'seller', f.deps)).estado, 'error');
assert.equal(f.ledger.size, 0, 'Un saldo cambiado no reutiliza la clave con otro importe');
f = fixture({ refunded: 100 });
assert.equal((await procesarReembolso(job, 'seller', f.deps)).estado, 'completado');
assert.equal(f.ledger.size, 0, 'Una devolucion externa completa no se repite');
f = fixture({ pendingExternal: true });
assert.equal((await procesarReembolso(job, 'seller', f.deps)).estado, 'pendiente');
assert.equal(f.ledger.size, 0, 'Una devolucion externa pendiente no se superpone');
for (const payment of [{ collector_id: 'other' }, { external_reference: 'other' }, { id: 999 }, { currency_id: 'USD' }, { transaction_amount: 99 }, { status: 'rejected' }, { transaction_amount_refunded: 101 }]) {
  f = fixture({ payment });
  assert.equal((await procesarReembolso(job, 'seller', f.deps)).estado, 'error');
  assert.equal(f.ledger.size, 0, 'No devuelve dinero de un pago incompatible');
}
f = fixture({ networkFailure: true });
assert.equal((await procesarReembolso(job, 'seller', f.deps)).estado, 'error');
assert.equal(f.finishes[0][0], 'error');
f = fixture();
assert.equal((await procesarReembolso({ ...job, puede_procesar: false }, '', f.deps)).estado, 'pendiente');
assert.equal(f.requests.length, 0, 'Un segundo worker no consulta ni devuelve');
assert.equal((await procesarReembolso({ ...job, puede_procesar: false, estado: 'completado' }, '', f.deps)).estado, 'completado');
console.log('OK reembolso: total/parcial, timeout despues de debitar, idempotencia, pendiente, reembolso externo, identidad del pago y errores de red. Mercado Pago simulado; sin movimientos reales.');
