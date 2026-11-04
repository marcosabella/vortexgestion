// Prueba los handlers reales de la pagina con hooks/UI aislados; sin navegador ni red.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';

const fixtureSource = `
const states=[];let cursor=0;
export const begin=()=>{cursor=0};export const reset=()=>{states.length=0;cursor=0};
export const useState=initial=>{const index=cursor++;if(!(index in states))states[index]=initial;return [states[index],value=>states[index]=value]};
export const useMemo=fn=>fn();
export const jsx=(type,props)=>({type,props});export const jsxs=jsx;export const Fragment='Fragment';
export const calls=[];
export const fixture={pedidos:[],isLoading:false,error:null,puedeReembolsar:true,isUpdating:false,actualizarEstado:(...args)=>calls.push(args)};
export const usePedidosOnline=()=>fixture;
export const useNotificaciones=()=>({notificaciones:[],marcarLeida:{mutate:()=>{}}});
export const ChevronDown='ChevronDown',FilterX='FilterX',PackageCheck='PackageCheck',Search='Search',ShoppingBag='ShoppingBag';
export const Card='Card',CardContent='CardContent',Badge='Badge',Button='Button',Input='Input',Select='Select',SelectContent='SelectContent',SelectItem='SelectItem',SelectTrigger='SelectTrigger',SelectValue='SelectValue';
export const AlertDialog='AlertDialog',AlertDialogContent='AlertDialogContent',AlertDialogHeader='AlertDialogHeader',AlertDialogTitle='AlertDialogTitle',AlertDialogDescription='AlertDialogDescription',AlertDialogFooter='AlertDialogFooter',AlertDialogCancel='AlertDialogCancel';`;
const bundle = await build({ stdin: { contents: "export {default as Page} from './src/pages/PedidosOnline.tsx';export {fixture,calls,begin,reset} from 'fixture';", resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', plugins: [{ name: 'isolated-ui', setup(b) {
    b.onResolve({ filter: /^@\/components\/pedidos\/PedidoOnlineComprobante$/ }, () => ({ path: 'comprobante', namespace: 'empty' }));
    b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: 'export const PedidoOnlineComprobante=()=>null;', loader: 'js' }));
    b.onResolve({ filter: /^react$|^react\/jsx-runtime$|^lucide-react$|^fixture$|^@\/hooks\// }, () => ({ path: 'fixture', namespace: 'test' }));
    b.onResolve({ filter: /^@\/components\/ui\// }, () => ({ path: 'fixture', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: fixtureSource, loader: 'js' }));
  } }] });
const module = { exports: {} };
vm.runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, console, Intl, Date });
const { Page, fixture, calls, begin, reset } = module.exports;
const pedido = { id: 'pedido', numero: 24, estado: 'recibido', estado_pago: 'aprobado', importe_pagado: 100, total: 100, created_at: '2026-11-04', cliente_nombre: 'Martin Abella', cliente_email: 'test@example.invalid', cliente_telefono: '123', cliente_direccion: '', cliente_id: 'client', cliente: null, observaciones: null, pedido_online_items: [], pedido_online_reembolsos: null };
const render = () => { begin(); return Page(); };
function nodes(node, predicate, result = []) {
  if (Array.isArray(node)) { for (const child of node) nodes(child, predicate, result); return result; }
  if (!node || typeof node !== 'object') return result;
  if (typeof node.type === 'function') return nodes(node.type(node.props), predicate, result);
  if (predicate(node)) result.push(node);
  nodes(node.props?.children, predicate, result);
  return result;
}
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(typeof node.type === 'function' ? node.type(node.props) : node.props?.children) : node == null || node === false ? '' : String(node);
fixture.pedidos = [pedido];
let tree = render();
const estadoSelect = nodes(tree, x => x.type === 'Select' && x.props.value === 'recibido')[0];
estadoSelect.props.onValueChange('cancelado');
assert.equal(calls.length, 0, 'Elegir cancelado abre confirmacion, no devuelve dinero');
tree = render();
assert.equal(nodes(tree, x => x.type === 'AlertDialog')[0].props.open, true);
assert.match(text(nodes(tree, x => x.type === 'AlertDialogDescription')[0]), /100,00.*Martin Abella/);
fixture.isUpdating = true;
tree = render();
assert.equal(nodes(tree, x => x.type === 'Button' && text(x).includes('Procesando'))[0].props.disabled, true);
fixture.isUpdating = false;
tree = render();
nodes(tree, x => x.type === 'Button' && text(x) === 'Confirmar y devolver dinero')[0].props.onClick();
assert.equal(calls.length, 1);
assert.equal(calls[0][0].devolver, true);
assert.equal(calls[0][0].estado, 'cancelado');
calls[0][1].onSuccess();
assert.equal(nodes(render(), x => x.type === 'AlertDialog')[0].props.open, false);

reset(); calls.length = 0; pedido.estado = 'cancelado';
tree = render();
nodes(tree, x => x.type === 'Button' && text(x) === 'Reembolsar pago')[0].props.onClick();
tree = render();
assert.match(text(nodes(tree, x => x.type === 'AlertDialogDescription')[0]), /stock ya fue repuesto/);
pedido.pedido_online_reembolsos = { estado: 'error', importe: 100, importe_reembolsado: 30, error: 'Sin conexion' };
assert.equal(nodes(render(), x => x.type === 'Button' && text(x) === 'Reintentar devolución').length, 1);
assert.match(text(render()), /70,00 por devolver/);
pedido.estado_pago = 'reembolsado'; pedido.pedido_online_reembolsos.estado = 'completado';
assert.equal(nodes(render(), x => x.type === 'Button' && /Reembolsar|Reintentar|Consultar devolución/.test(text(x))).length, 0);
assert.match(text(render()), /Dinero devuelto/);

reset(); pedido.estado = 'recibido'; pedido.estado_pago = 'no_iniciado'; pedido.importe_pagado = 0; pedido.pedido_online_reembolsos = null;
tree = render(); nodes(tree, x => x.type === 'Select' && x.props.value === 'recibido')[0].props.onValueChange('cancelado');
tree = render(); nodes(tree, x => x.type === 'Button' && text(x) === 'Confirmar cancelación')[0].props.onClick();
assert.equal(calls.at(-1)[0].devolver, false, 'Pedido impago no solicita reembolso');
reset(); fixture.puedeReembolsar = false; pedido.estado_pago = 'aprobado'; pedido.importe_pagado = 100;
tree = render();
assert.ok(nodes(tree, x => x.type === 'SelectItem' && x.props.value === 'cancelado').some(x => x.props.disabled));
pedido.estado = 'cancelado';
assert.equal(nodes(render(), x => x.type === 'Button' && /Reembolsar|Reintentar|Consultar devolución/.test(text(x))).length, 0);
console.log('OK handlers UI: confirmar importe, sin devolucion al solo seleccionar, bloqueo mientras procesa, legado cancelado, error/saldo parcial, completado visible, impagos y permisos.');
