// Resumen real con consultas simuladas; sin conexiones a Supabase.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import path from 'node:path';

const repo=process.cwd(), require=createRequire(import.meta.url);
const fixture=`
const clients=Array.from({length:1002},(_,i)=>({id:'c'+i,nombre:'Cliente '+i,apellido:'Prueba',cuit:String(i),telefono:''}));
clients[1000]={...clients[1000],nombre:'MUNICIPALIDAD DE',apellido:'MATTALDI'};
const movements=[
 {id:'d',cliente_id:'c1000',tipo_movimiento:'debito',monto:119000.04,fecha_movimiento:'2026-09-09',cliente:clients[1000]},
 {id:'p',cliente_id:'c1000',tipo_movimiento:'credito',monto:119000.04,fecha_movimiento:'2026-09-10',cliente:clients[1000]},
 {id:'debt',cliente_id:'c0',tipo_movimiento:'debito',monto:100,fecha_movimiento:'2026-09-09',cliente:clients[0]},
];
export const calls=[];
export const supabase={from(table){const call={table,tenant:null,from:0,to:999};calls.push(call);return {
 select(){return this},eq(key,value){if(key==='comercio_id')call.tenant=value;return this},order(){return this},
 range(from,to){call.from=from;call.to=to;return Promise.resolve({data:(table==='clientes'?clients:movements).slice(from,to+1),error:null})}
}}};
export const useQuery=options=>options;
export const useMutation=options=>options;
export const useQueryClient=()=>({invalidateQueries:()=>{}});
export const useToast=()=>({toast:()=>{}});
export const useComercio=()=>({comercio:{id:'tenant-local'}});
`;
const entry=`import {useCuentaCorriente} from './src/hooks/useCuentaCorriente';import {calls} from 'fixtures';
const hook=useCuentaCorriente();
export const summary=await hook.useResumenCuentaCorriente(true).queryFn();
export const pending=await hook.useResumenCuentaCorriente().queryFn();
export {calls};`;
const bundle=await build({stdin:{contents:entry,loader:'ts',resolveDir:repo},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/^(fixtures|@tanstack\/react-query|@\/integrations\/supabase\/client|@\/hooks\/(useComercio|use-toast))$/},()=>({path:'fixtures',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:fixture,loader:'js'}));
 b.onResolve({filter:/^@\//},args=>({path:require.resolve(path.join(repo,'src',args.path.slice(2))+'.ts')}));
}}]});
const result=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
assert.equal(result.summary.length,1002,'Incluye clientes de todas las paginas, incluso sin movimientos');
assert.equal(result.pending.length,1,'Los reportes mantienen solo cuentas con saldo');
const municipalidad=result.summary.find(row=>row.cliente_id==='c1000');
assert.equal(municipalidad.saldo_actual,0,'Cuenta saldada disponible');
assert.equal(municipalidad.total_creditos,119000.04);
assert.equal(municipalidad.ultimo_movimiento,'2026-09-10','Conserva ultima fecha al inicializar desde clientes');
assert.equal(result.summary.find(row=>row.cliente_id==='c1001').total_debitos,0,'Cliente sin movimientos disponible');
assert.ok(result.calls.every(call=>call.tenant==='tenant-local'),'Todas las consultas incluyen comercio');
assert.ok(result.calls.some(call=>call.table==='clientes' && call.from===1000),'Lee clientes posteriores a la primera pagina');
console.log('OK Resumen real: saldados, sin movimientos, paginacion, fechas, filtro por comercio y reportes con saldo.');
