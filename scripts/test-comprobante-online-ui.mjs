// Handlers del componente real, con UI/hooks aislados y sin red.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
const fixtureSource = `
const states=[];let cursor=0;export const begin=()=>{cursor=0};export const reset=()=>{states.length=0;cursor=0};
export const useState=initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=v]};
export const jsx=(type,props)=>({type,props});export const jsxs=jsx;export const Fragment='Fragment';export const Suspense='Suspense';export const lazy=()=> 'DetalleVenta';
export const calls=[];export const fixture={multi:false,pending:false,emitters:[{id:'emitter',activo:true,razon_social:'Emisor',cuit_emisor:'20123456786'}]};
export const useComercioParametrizacion=()=>({data:{funciones:{multiples_cuit:fixture.multi}}});
export const useEmisoresFiscales=()=>({data:fixture.emitters,error:null,isLoading:false});
export const useComprobantePedidoOnline=()=>({isPending:fixture.pending,mutate:(...args)=>calls.push(args)});
export const VentasList='VentasList';export const Button='Button',Dialog='Dialog',DialogContent='DialogContent',DialogHeader='DialogHeader',DialogTitle='DialogTitle',DialogDescription='DialogDescription',DialogFooter='DialogFooter';
export const Select='Select',SelectTrigger='SelectTrigger',SelectValue='SelectValue',SelectContent='SelectContent',SelectItem='SelectItem';`;
const bundle = await build({ stdin: { contents: "export {PedidoOnlineComprobante as Component} from './src/components/pedidos/PedidoOnlineComprobante.tsx';export {begin,reset,calls,fixture} from 'fixture';", resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', plugins: [{ name: 'isolated', setup(b) {
    b.onResolve({ filter: /^react$|^react\/jsx-runtime$|^fixture$|^@\/hooks\/|^@\/components\// }, () => ({ path: 'fixture', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: fixtureSource, loader: 'js' }));
  } }] });
const module = { exports: {} }; vm.runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, Intl });
const { Component, begin, reset, calls, fixture } = module.exports;
const pedido = { id: 'order', numero: 24, cliente_nombre: 'Cliente', total: 242, estado: 'confirmado', estado_pago: 'aprobado', venta_id: null, pedido_online_reembolsos: null, pedido_online_cancelaciones: null };
let puedeGenerar = true;
let habilitado = true;
const render = () => { begin(); return Component({ pedido, puedeGenerar, trabajando: false, habilitado }); };
function nodes(node, predicate, result = []) {
  if (Array.isArray(node)) { for (const child of node) nodes(child, predicate, result); return result; }
  if (!node || typeof node !== 'object') return result;
  if (predicate(node)) result.push(node);
  nodes(node.props?.children, predicate, result); return result;
}
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : node == null || node === false ? '' : String(node);
const button = (tree, label) => nodes(tree, x => x.type === 'Button' && text(x) === label)[0];
for (const state of ['confirmado', 'preparando', 'listo', 'entregado']) { pedido.estado = state; assert.ok(button(render(), 'Generar comprobante de venta')); }
for (const state of ['recibido', 'cancelado']) { pedido.estado = state; assert.equal(button(render(), 'Generar comprobante de venta'), undefined); }
pedido.estado = 'confirmado';pedido.estado_pago = 'parcialmente_reembolsado'; assert.equal(button(render(), 'Generar comprobante de venta'), undefined);
pedido.estado_pago = 'aprobado'; let tree = render(); button(tree, 'Generar comprobante de venta').props.onClick();
assert.equal(calls.length, 0);
tree = render(); assert.equal(nodes(tree, x => x.type === 'Dialog')[0].props.open, true);
nodes(tree, x => x.type === 'Select' && x.props.value === 'recibo_x')[0].props.onValueChange('factura_b');
tree = render(); fixture.pending = true; assert.equal(button(render(), 'Generando…').props.disabled, true); fixture.pending = false;
button(tree, 'Generar comprobante').props.onClick();
assert.equal(calls[0][0].tipo, 'factura_b'); assert.equal(calls[0][0].pedidoId, 'order'); assert.equal('total' in calls[0][0], false);
calls[0][1].onSuccess({ venta_id: 'sale' });
tree = render(); assert.equal(nodes(tree, x => x.type === 'DetalleVenta')[0].props.detalleId, 'sale');
pedido.venta_id = 'sale'; assert.equal(button(render(), 'Generar comprobante de venta'), undefined); assert.ok(button(render(), 'Ver comprobante de venta'));
pedido.pedido_online_cancelaciones = { nota_credito_id: 'note', estado: 'fiscal_pendiente' }; button(render(), 'Ver nota de crédito').props.onClick();
assert.equal(nodes(render(), x => x.type === 'DetalleVenta')[0].props.detalleId, 'note');
reset();pedido.venta_id = null;pedido.pedido_online_cancelaciones = null;fixture.multi = true;
button(render(), 'Generar comprobante de venta').props.onClick();
tree = render(); assert.equal(button(tree, 'Generar comprobante').props.disabled, true);
nodes(tree, x => x.type === 'Select' && x.props.value === '')[0].props.onValueChange('emitter');
tree = render(); assert.equal(button(tree, 'Generar comprobante').props.disabled, false); button(tree, 'Generar comprobante').props.onClick(); assert.equal(calls.at(-1)[0].emisorId, 'emitter');
puedeGenerar = false; assert.equal(button(render(), 'Generar comprobante de venta').props.disabled, true);
habilitado = false; assert.equal(button(render(), 'Generar comprobante de venta'), undefined); assert.match(text(render()), /pendiente de habilitación/);
console.log('OK UI comprobante: estados actuales sin Enviado, pago aprobado, confirmacion, tipo/emisor, doble clic bloqueado, una sola venta y consulta de nota de credito.');
