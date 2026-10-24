// Regresión local del formulario; Supabase simulado, sin escrituras remotas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/components/ProductoForm.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;

async function scenario({ create = false, failAttributes = false, failInsert = false, hydrateOrder, variantStock = 3 } = {}) {
  const states = [];
  const notices = [], uploads = [], inserts = [], writes = [], removed = [];
  const toast = value => notices.push(value);
  let cursor = 0, submit, closed = false, failUpload = true, uuid = 0;
  let effectCursor = 0, effectQueue = [], changed = false, assignmentResult, variantResult;
  const effectDeps = [], attributeWrites = [], stockWrites = [], empty = [];
  const product = { id: 'product', comercio_id: 'tenant', cod_producto: '439', stock: 3 };
  const formValues = { ...product };
  const pending = ['a.jpg', 'b.jpg', 'c.jpg'].map(name => ({ file: { name, type: 'image/jpeg' }, previewUrl: name }));
  const jsx = (type, props) => { if (type === 'form') submit = props.onSubmit; return { type, props }; };
  const deps = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: {
      useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => {
        const next = typeof value === 'function' ? value(states[i]) : value;
        if (!Object.is(next, states[i])) changed = true;
        states[i] = next;
      }]; },
      useEffect(fn, dependencies) {
        if (!hydrateOrder) return;
        const i = effectCursor++;
        if (!effectDeps[i] || dependencies.some((value, index) => !Object.is(value, effectDeps[i][index]))) effectQueue.push(fn);
        effectDeps[i] = dependencies;
      },
    },
    'react-hook-form': { useForm: () => ({ register: () => ({}), handleSubmit: fn => fn, watch: field => formValues[field] ?? 0,
      setValue(field, value) { formValues[field] = value; if (field === 'stock') stockWrites.push(value); }, reset() {}, formState: { errors: {} } }) },
    '@/hooks/useProductos': { useProductos: options => {
      assert.equal(options.notificarExito, false);
      return {
        createProductoAsync: async () => { writes.push('create'); return product; },
        updateProductoAsync: async payload => { writes.push('update'); if (hydrateOrder) assert.equal('stock' in payload, false); return product; },
      };
    } },
    '@/hooks/useProveedores': { useProveedores: () => ({}) },
    '@/hooks/useMarcas': { useMarcas: () => ({ marcas: [] }) },
    '@/hooks/useRubros': { useRubros: () => ({ rubros: [] }) },
    '@/hooks/useSubRubros': { useSubRubros: () => ({ subrubros: empty }) },
    '@/hooks/useComercioParametrizacion': { useComercioParametrizacion: () => ({ data: { funciones: { imagenes_productos: !hydrateOrder, talles_colores_productos: failAttributes || Boolean(hydrateOrder) } } }) },
    '@/hooks/useComercio': { useComercio: () => ({ comercio: { id: 'tenant' } }) },
    '@/hooks/use-toast': { useToast: () => ({ toast }) },
    '@/hooks/useProductoAtributos': { useProductoAtributos: () => ({ colores: [], talles: [],
      asignaciones: assignmentResult, variantes: variantResult,
      guardarAsignaciones: async () => { attributeWrites.push('asignaciones'); if (failAttributes) throw { message: 'permiso de atributos denegado' }; },
      guardarVariantes: async () => { attributeWrites.push('variantes'); },
    }) },
    '@/utils/productDescription': { sanitizeProductDescription: () => '' },
    '@/utils/uuid': { generarUuid: () => `uuid-${++uuid}` },
    '@/integrations/supabase/client': { supabase: {
      storage: { from: () => ({
        upload: async (path, file) => {
          uploads.push(file.name);
          return { error: failUpload && !failInsert && file.name === 'b.jpg' ? { message: 'sin permiso de carga' } : null };
        },
        remove: async paths => { removed.push(...paths); return { error: null }; },
        getPublicUrl: path => ({ data: { publicUrl: path } }),
      }) },
      from: () => ({ insert: row => ({ select: () => ({ single: async () => {
        if (failInsert && failUpload && row.orden === 2) return { error: { message: 'sin permiso de registro' } };
        inserts.push(row);
        return { data: { ...row, id: row.storage_path } };
      } }) }) }),
    } },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => deps[name] || {}, URL: { revokeObjectURL() {} } });
  const render = () => { cursor = 0; effectCursor = 0; exports.ProductoForm({ producto: create ? undefined : product, onClose: () => { closed = true; } }); };
  const flush = () => {
    for (let i = 0; i < 20; i++) {
      changed = false; render();
      const effects = effectQueue; effectQueue = [];
      effects.forEach(fn => fn());
      if (!changed) return;
    }
    throw new Error('El formulario no estabilizó sus efectos');
  };
  if (hydrateOrder) {
    flush();
    await submit(product);
    assert.equal(writes.length, 0, 'No guardar con variantes pendientes de carga');
    notices.length = 0;
    const assignments = { colores: [{ id: 'rojo', nombre: 'Rojo' }], talles: [{ id: 'M', nombre: 'M' }] };
    const savedVariants = [{ id: 'vendida', color_id: 'rojo', talle_id: 'M', stock: variantStock }];
    if (hydrateOrder === 'variantes-primero') variantResult = savedVariants;
    else assignmentResult = assignments;
    flush();
    assert.equal(stockWrites.length, 0, 'La carga parcial no debe poner el stock en cero');
    assignmentResult = assignments; variantResult = savedVariants;
    flush();
    assert.equal(states[9][0].id, 'vendida');
    assert.equal(states[9][0].stock, variantStock);
    assert.equal(stockWrites.length, 0, 'Abrir el producto no debe modificar su stock');
    // Un refresco de las consultas tampoco debe reemplazar el borrador.
    variantResult = savedVariants.map(row => ({ ...row }));
    assignmentResult = { ...assignments };
    flush();
    assert.equal(states[9][0].stock, variantStock);
    await submit(product);
    assert.deepEqual(attributeWrites, [], 'Guardar datos/fotos sin tocar variantes no debe escribir existencias');
    assert.equal(closed, true);
    return;
  }
  render();
  if (failAttributes) { states[10] = product.id; states[11] = true; }
  // Estado: producto creado, subrubros, fotos guardadas, fotos pendientes.
  states[3] = pending;
  render();
  await submit(product);
  assert.equal(closed, false);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].title, 'Guardado incompleto');
  if (failAttributes) {
    assert.match(notices[0].description, /talles y colores: permiso de atributos denegado/);
    assert.equal(uploads.length, 0);
    return;
  }
  assert.match(notices[0].description, failInsert ? /fotos: sin permiso de registro/ : /fotos: sin permiso de carga/);
  assert.equal(removed.length, failInsert ? 1 : 0);
  assert.equal(states[2].length, 1);
  assert.deepEqual(states[3].map(item => item.file.name), ['b.jpg', 'c.jpg']);
  failUpload = false;
  render();
  await submit(product);
  assert.equal(closed, true);
  assert.deepEqual(uploads, ['a.jpg', 'b.jpg', 'b.jpg', 'c.jpg']);
  assert.deepEqual(inserts.map(row => row.orden), [1, 2, 3]);
  assert.equal(states[3].length, 0);
  assert.equal(notices.at(-1).title, 'Éxito');
  assert.deepEqual(writes, create ? ['create', 'update'] : ['update', 'update']);
}

await scenario();
await scenario({ create: true });
await scenario({ failInsert: true });
await scenario({ failAttributes: true });
await scenario({ hydrateOrder: 'variantes-primero' });
await scenario({ hydrateOrder: 'asignaciones-primero' });
await scenario({ hydrateOrder: 'asignaciones-primero', variantStock: 0 });
console.log('OK: carga en ambos órdenes conserva stock e IDs; guardar sin editar variantes no modifica existencias, incluso si el total general difiere.');
console.log('OK: guardado parcial, reintento sin duplicados, alta sin duplicar producto y error real de atributos.');

// Simular las FKs de ventas/pedidos para verificar que el hook conserva los IDs.
const hookSource = readFileSync(new URL('../src/hooks/useProductoAtributos.ts', import.meta.url), 'utf8');
const hookCompiled = ts.transpileModule(hookSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const original = { id: 'variante-vendida', color_id: 'rojo', talle_id: 'M', stock: 4 };
let rows, calls;
const deps = {
  '@tanstack/react-query': {
    useQuery: () => ({}), useMutation: () => ({}),
    useQueryClient: () => ({ invalidateQueries: async () => {} }),
  },
  '@/integrations/supabase/client': { supabase: { from(table) {
    assert.equal(table, 'producto_variantes');
    const query = {
      filters: {}, operation: 'select',
      select() { return this; },
      delete() { this.operation = 'delete'; return this; },
      update(payload) { this.operation = 'update'; this.payload = payload; return this; },
      insert(payload) { this.operation = 'insert'; this.payload = payload; return this; },
      eq(key, value) { this.filters[key] = value; return this; },
      in(key, value) { this.filters[key] = value; return this; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          calls.push({ operation: this.operation, filters: this.filters, payload: this.payload });
          if (this.operation === 'select') return { data: rows.map(row => ({ ...row })) };
          if (this.operation === 'delete') {
            assert.equal(this.filters.producto_id, 'product');
            assert.ok(Array.isArray(this.filters.id), 'No se permite borrar todas las variantes');
            if (this.filters.id.includes(original.id)) return { error: { code: '23503', message: 'foreign key constraint' } };
            rows = rows.filter(row => !this.filters.id.includes(row.id));
          }
          if (this.operation === 'update') {
            assert.equal(this.filters.producto_id, 'product');
            Object.assign(rows.find(row => row.id === this.filters.id), this.payload);
          }
          if (this.operation === 'insert') rows.push(...this.payload.map(row => ({ ...row, id: 'nueva' })));
          return { error: null };
        }).then(resolve, reject);
      },
    };
    return query;
  } } },
};
const hookExports = {};
vm.runInNewContext(hookCompiled, { exports: hookExports, require: name => deps[name] });
const { guardarVariantes } = hookExports.useProductoAtributos({ productoId: 'product', comercioId: 'tenant', enabled: true });
rows = [{ ...original }]; calls = [];
await guardarVariantes('product', [{ ...original }]);
assert.deepEqual(calls.map(call => call.operation), ['select']);

calls = [];
await guardarVariantes('product', [{ ...original, id: 'id-no-confiable', stock: 7 }, { color_id: 'azul', talle_id: 'M', stock: 2 }]);
assert.deepEqual(calls.map(call => call.operation), ['select', 'update', 'insert']);
assert.equal(rows[0].id, original.id);
assert.equal(rows[0].stock, 7);
assert.equal(calls[1].filters.id, original.id);

calls = [];
await guardarVariantes('product', [{ ...original, stock: 7 }]);
assert.deepEqual(calls.find(call => call.operation === 'delete').filters.id, ['nueva']);
assert.equal(rows[0].id, original.id);

calls = [];
await assert.rejects(guardarVariantes('product', []), /ventas o pedidos asociados/);
assert.equal(rows[0].id, original.id);
assert.deepEqual(calls.map(call => call.operation), ['select', 'delete']);
console.log('OK: variantes conservan IDs e historial; solo se eliminan combinaciones retiradas y las FKs siguen protegiendo ventas/pedidos.');
