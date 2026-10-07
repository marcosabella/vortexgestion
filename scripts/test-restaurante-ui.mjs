// Renderizado local con datos ficticios. No inicia sesión ni accede a Supabase.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Module, { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server.js';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pedido={id:'pedido',numero:1,modalidad:'delivery',cliente_id:null,cliente_nombre:'Cliente prueba',direccion:'Calle prueba',telefono:'123',comensales:1,prometido_at:null,prioridad:true,observaciones:'Sin sal',instrucciones_envio:'Tocar timbre',costo_envio:20,iva_envio:21,total:220,cobrado:100,estado:'en_atencion',cuenta:'abierta',armado:true,version:4,venta_id:null,unido_a:null,creado_por:'admin',created_at:new Date().toISOString()};
const fixture={admin:true,usuario_id:'admin',permisos:['pedidos','salon','cocina','despacho','envios','cobros','cierre','configuracion'],sector_id:null,config:{modalidades:['delivery','retiro','mesa'],impresion:'58mm',iva_envio:21},sectores:[{id:'sector',nombre:'Cocina',activo:true,impresion:null}],mesas:[{id:'mesa',nombre:'Mesa 1',capacidad:4,activo:true}],carta:[{id:'carta',producto_id:'producto',sector_id:'sector',afecta_stock:false,activo:true,descripcion:'Plato prueba',precio:200,iva:21,stock:0}],adicionales:[],pedidos:[pedido],items:[{id:'item',pedido_id:'pedido',carta_id:'carta',sector_id:'sector',comanda_id:'comanda',producto_id:'producto',descripcion:'Plato prueba',cantidad:1,precio:200,iva:21,afecta_stock:false,adicionales:[],observaciones:'Sin sal',estado:'lista',created_at:pedido.created_at}],comandas:[{id:'comanda',numero:1,pedido_id:'pedido',sector_id:'sector',impresiones:0,aviso_cancelacion:false,created_at:pedido.created_at}],cuenta_mesas:[],envios:[{id:'envio',pedido_id:'pedido',repartidor_id:'admin',estado:'en_camino',observaciones:'',salida_at:pedido.created_at,entrega_at:null}],cobros:[{id:'cobro',pedido_id:'pedido',monto:100,medio:'contado',pagador:'',usuario_id:'admin',anulado:false,motivo_anulacion:'',rendicion_id:null,created_at:pedido.created_at}],cobro_items:[],rendiciones:[],eventos:[],usuarios:[{id:'admin',nombre:'Admin',admin:true}],asignaciones:[]};
const hookSource=`export const fixture=${JSON.stringify(fixture)};
export const useRestaurante=()=>({data:fixture,error:null,isLoading:false,trabajando:false,pendientes:[],operar:async()=>null,refetch:async()=>{},reintentar:async()=>{}});
export const useComercio=()=>({comercio:{id:'comercio',nombre_comercio:'Prueba local'}});
export const useToast=()=>({toast:()=>{}});
export const useClientes=()=>({data:[]});
export const useProductos=()=>({productos:[{id:'producto',descripcion:'Plato prueba',tipo_moneda:'ARS',precio_venta:200}]});
export const useRestauranteVenta=()=>({data:null,isLoading:false,error:null,refetch:async()=>{}});
export const useComercioParametrizacion=()=>({data:{impresion:{formato_comprobante:"a4"}}});
export const useObtenerCAE=()=>({mutate:()=>{},isPending:false});`;
const bundle=await build({stdin:{contents:`export {default as Restaurante} from './src/pages/Restaurante'; export {restauranteComandaHtml,restauranteCuentaHtml} from './src/utils/restaurantePrint'; export {restauranteSaldo,restauranteTiempo} from './src/utils/restaurante'; export {getFacturaPrintStyles} from './src/utils/facturaPrint';export {fixture} from 'test-fixture';`,resolveDir:repo,loader:'tsx'},write:false,bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom','react-router-dom','react/jsx-runtime'],plugins:[{name:'local-fixtures',setup(b){b.onResolve({filter:/^@\/components\/VentasList$/},()=>({path:'sales',namespace:'fixture-sales'}));b.onLoad({filter:/.*/,namespace:'fixture-sales'},()=>({contents:'export const VentasList=()=>null;',loader:'js'}));b.onResolve({filter:/^@\/components\/FacturaImpresion$/},()=>({path:'print',namespace:'fixture-print'}));b.onLoad({filter:/.*/,namespace:'fixture-print'},()=>({contents:'export const FacturaImpresion=()=>null;',loader:'js'}));b.onResolve({filter:/^test-fixture$|^@\/hooks\/(useRestaurante|useComercio|use-toast|useClientes|useProductos|useVentas|useRestauranteVenta|useComercioParametrizacion)$/},()=>({path:'hooks',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:hookSource,loader:'js'}));b.onResolve({filter:/^@\//},args=>({path:path.join(repo,'src',args.path.slice(2))+(/\.(tsx?|jsx?)$/.test(args.path)?'': requireResolveExtension(args.path))}));}}]});
function requireResolveExtension(specifier){const require=createRequire(import.meta.url);for(const ext of ['.tsx','.ts','.jsx','.js']){try{require.resolve(path.join(repo,'src',specifier.slice(2))+ext);return ext;}catch{ /* probar extensión siguiente */ }}throw new Error('No se encontró '+specifier);}
const compiled=new Module(path.join(repo,'scripts','.restaurante-render.cjs'));compiled.filename=path.join(repo,'scripts','.restaurante-render.cjs');compiled.paths=Module._nodeModulePaths(path.join(repo,'scripts'));compiled._compile(bundle.outputFiles[0].text,compiled.filename);
const {Restaurante,restauranteComandaHtml,restauranteCuentaHtml,restauranteSaldo,restauranteTiempo,getFacturaPrintStyles,fixture:state}=compiled.exports;
if(!globalThis.navigator)Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
const render=vista=>renderToStaticMarkup(React.createElement(StaticRouter,{location:'/restaurante/'+vista},React.createElement(Restaurante,{vista})));
for(const vista of fixture.permisos){const html=render(vista);assert.match(html,/Vortex Restaurante/);if(vista!=='configuracion'){assert.match(html,/<table/);assert.doesNotMatch(html,/<article/);assert.match(html,/>Acciones<\/th>/);}if(vista==='cocina')assert.match(html,/Plato prueba/);if(vista==='salon')assert.match(html,/Mesa 1/);if(vista==='envios')assert.match(html,/Registrar entrega/);if(vista==='configuracion')assert.match(html,/Usuarios y funciones/);console.log('OK render '+vista);}
const rendicionDisabled=()=>{const button=render('cierre').match(/<button[^>]*>[\s\S]*?Recibir rendición<\/button>/g)?.at(-1);assert.ok(button,'Falta botón de rendición');const tag=button.slice(button.lastIndexOf('<button'),button.indexOf('>',button.lastIndexOf('<button'))+1);return /\sdisabled(?:=|\s|>)/.test(tag);};
assert.equal(rendicionDisabled(),true,'No habilitar un envío en camino');
state.envios[0].estado='entregado';assert.equal(rendicionDisabled(),false,'Habilitar efectivo de entrega resuelta');
state.cobros[0].rendicion_id='rendicion';assert.equal(rendicionDisabled(),true,'No habilitar cobros ya rendidos');
state.cobros[0].rendicion_id=null;state.cobros[0].anulado=true;assert.equal(rendicionDisabled(),true,'No habilitar cobros anulados');
state.cobros[0].anulado=false;state.cobros[0].medio='transferencia';assert.equal(rendicionDisabled(),true,'No habilitar transferencias');
state.cobros[0].medio='contado';state.envios[0].estado='incidencia';assert.equal(rendicionDisabled(),true,'Resolver incidencia antes de rendir');
state.envios[0].estado='en_camino';
state.pedidos[0].venta_id='venta-prueba';assert.match(render('pedidos'),/Ver venta/);assert.doesNotMatch(render('pedidos'),/href="\/ventas/);state.pedidos[0].venta_id=null;
console.log('OK disponibilidad de rendición y enlace al comprobante vinculado');
const reloj=structuredClone(state);const orden=reloj.pedidos[0];orden.created_at='2026-10-07T12:00:00Z';
assert.equal(restauranteTiempo(reloj,orden,Date.parse('2026-10-07T12:15:00Z')).minutos,15);
for(const [estado,accion] of [['completado','cerrar'],['cancelado','cancelar'],['unido','unir']]){
  orden.estado=estado;reloj.eventos=[{pedido_id:orden.id,accion,created_at:'2026-10-07T12:30:00Z'}];
  for(const ahora of ['2026-10-07T12:45:00Z','2026-10-08T18:00:00Z'])assert.deepEqual(restauranteTiempo(reloj,orden,Date.parse(ahora)),{minutos:30,finalizado:true});
}
reloj.eventos=[];assert.deepEqual(restauranteTiempo(reloj,orden,Date.now()),{minutos:null,finalizado:true});
console.log('OK tiempo detenido al cerrar, cancelar o unir; sin inventar duración si falta el evento');
assert.equal(restauranteSaldo(state,state.pedidos[0]).saldo,120);
const unsafe=structuredClone(state);unsafe.items[0].descripcion='<script>alert(1)</script>';unsafe.pedidos[0].cliente_nombre='<img src=x onerror=alert(1)>';
for(const html of [restauranteComandaHtml(unsafe,unsafe.comandas[0],{nombre_comercio:'Prueba'}),restauranteCuentaHtml(unsafe,unsafe.pedidos[0],{nombre_comercio:'Prueba'})]){assert.doesNotMatch(html,/<script>|<img src=x/);assert.match(html,/&lt;script&gt;/);}
console.log('OK saldo visible e impresión con contenido escapado');
const comercioPrint={id:'comercio',nombre_comercio:'Comercio & prueba',logo_url:'data:image/png;base64,imagen',calle:'San Martín',numero:'123',localidad:'Jovita',provincia:'Córdoba',cuit:'20123456789',telefono:'555123',situacion_afip:'Responsable Inscripto',ingresos_brutos:'12345',fecha_inicio_actividad:'2020-01-01'};
for(const formato of ['a4','58mm']){
  const cuenta=restauranteCuentaHtml(state,state.pedidos[0],comercioPrint,formato);
  const comanda=restauranteComandaHtml(state,{...state.comandas[0],impresiones:2},comercioPrint,formato);
  for(const html of [cuenta,comanda]){
    assert.ok(html.includes(getFacturaPrintStyles(formato)),'Reutilizar los estilos exactos de la app');
    assert.match(html,/class="comercio-logo"/);assert.match(html,/Comercio &amp; prueba/);assert.match(html,/20123456789/);assert.match(html,/San Martín 123 Jovita Córdoba/);
    assert.match(html,/class="header-left"/);assert.match(html,/class="header-right"/);assert.match(html,/class="items-table"/);
    assert.match(html,/print-color-adjust:exact/);
  }
  assert.match(cuenta,/DETALLE DE CUENTA · NO VÁLIDO COMO FACTURA/);assert.match(cuenta,/Cobrado:/);assert.match(cuenta,/Saldo:/);assert.match(cuenta,/Servicio de delivery/);
  assert.match(comanda,/REIMPRESIÓN · COMANDA/);assert.match(comanda,/Sin sal/);assert.doesNotMatch(comanda,/Total:|Cobrado:|Saldo:/);
  const sinLogo=restauranteCuentaHtml(state,state.pedidos[0],{...comercioPrint,logo_url:''},formato);assert.match(sinLogo,/class="comercio-nombre">Comercio &amp; prueba/);
  console.log('OK cuenta y comanda con encabezado y estilos compartidos: '+formato);
}
const cartaCancelada=structuredClone(state);cartaCancelada.items[0].estado='cancelada';
assert.doesNotMatch(restauranteCuentaHtml(cartaCancelada,cartaCancelada.pedidos[0],comercioPrint),/Plato prueba/);
assert.match(restauranteComandaHtml(cartaCancelada,cartaCancelada.comandas[0],comercioPrint),/CANCELADO/);
