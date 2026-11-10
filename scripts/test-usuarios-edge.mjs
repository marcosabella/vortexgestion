// Handler real de usuarios con Auth/RPC simulados; no realiza conexiones.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { build } from 'esbuild';
const source=readFileSync('supabase/functions/usuarios-comercio/index.ts','utf8');
const bundle=await build({stdin:{contents:source,loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'iife',plugins:[{name:'supabase-fake',setup(b){b.onResolve({filter:/^https:/},()=>({path:'client',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:'export const createClient=(url,key,options)=>globalThis.fixture.client(key,options);',loader:'js'}));}}]});
const c='10000000-0000-0000-0000-000000000010',actor='10000000-0000-0000-0000-000000000001',u='10000000-0000-0000-0000-000000000002';
const valid={comercio_id:c,action:'crear',nombre:'Persona',email:'persona@example.test',password:'Password123',rol:'operador',activo:true,permisos:{clientes:['consultar']}};
let fixture,handler,passed=0;
function reset(){
 fixture={authenticated:true,admin:true,allowed:[],created:[],deleted:[],saved:[],createError:false,rpcError:false,client(key,options){
  if(key==='service')return {auth:{admin:{createUser:async payload=>{this.created.push(payload);return this.createError?{data:{},error:{message:'error'}}:{data:{user:{id:u}},error:null};},deleteUser:async id=>{this.deleted.push(id);return {error:null};}}}};
  return {auth:{getUser:async()=>({data:{user:this.authenticated&&options.global.headers.Authorization==='Bearer test'?{id:actor}:null},error:null})},rpc:async(name,args)=>{
   if(name==='vortex_listar_usuarios')return this.admin?{data:this.allowed,error:null}:{data:null,error:{message:'denied'}};
   if(name!=='vortex_guardar_usuario')throw Error('RPC inesperada');this.saved.push(args);return {data:u,error:this.rpcError?{message:'Rechazo de permisos'}:null};
  }};
 }};
 const sandbox={Request,Response,console:{error:()=>{}},fixture,Deno:{env:{get:k=>({SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'service',SUPABASE_ANON_KEY:'anon'}[k])},serve:cb=>{handler=cb;}}};
 vm.runInNewContext(bundle.outputFiles[0].text,sandbox);
}
async function request(body,auth='Bearer test'){const response=await handler(new Request('https://example.test/functions/v1/usuarios-comercio',{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};}
async function test(label,fn){reset();await fn();passed++;console.log('OK '+label);}
await test('Rechaza sesión inválida antes de crear identidades',async()=>{fixture.authenticated=false;assert.equal((await request(valid)).status,401);assert.equal(fixture.created.length,0);});
await test('Rechaza no administrador antes de usar service_role',async()=>{fixture.admin=false;assert.equal((await request(valid)).status,403);assert.equal(fixture.created.length,0);});
await test('Rechaza datos incompletos sin crear cuenta',async()=>{assert.equal((await request({...valid,password:'123'})).status,400);assert.equal(fixture.created.length,0);});
await test('No duplica usuario existente del comercio',async()=>{fixture.allowed=[{user_id:u,email:valid.email}];assert.equal((await request(valid)).status,400);assert.equal(fixture.created.length,0);});
await test('Alta confirma correo sin enviar mensajes y vincula actor/tenant confiables',async()=>{
 const r=await request(valid);assert.equal(r.status,200);assert.equal(fixture.created[0].email_confirm,true);assert.equal(fixture.created[0].app_metadata.vortex_alta_comercio,c);assert.equal(fixture.created[0].app_metadata.vortex_alta_actor,actor);assert.equal(fixture.saved[0].p_user_id,u);assert.equal(fixture.saved[0].p_nuevo,true);assert.equal(fixture.deleted.length,0);
});
await test('Error en permisos revierte sólo la identidad recién creada',async()=>{fixture.rpcError=true;assert.equal((await request(valid)).status,400);assert.deepEqual(fixture.deleted,[u]);});
await test('Email de otra cuenta no se apropia ni cambia credenciales',async()=>{fixture.createError=true;assert.equal((await request(valid)).status,400);assert.equal(fixture.saved.length,0);assert.equal(fixture.deleted.length,0);});
await test('Editar no crea ni cambia contraseñas globales',async()=>{fixture.allowed=[{user_id:u,email:valid.email}];const r=await request({...valid,action:'guardar',user_id:u,version:1,password:''});assert.equal(r.status,200);assert.equal(fixture.created.length,0);assert.equal(fixture.saved[0].p_nuevo,false);assert.equal(fixture.saved[0].p_version,1);});
await test('Editar rechaza contraseña ajena y usuario de otro comercio',async()=>{fixture.allowed=[{user_id:u,email:valid.email}];assert.equal((await request({...valid,action:'guardar',user_id:u,version:1})).status,400);fixture.allowed=[];assert.equal((await request({...valid,action:'guardar',user_id:u,version:1,password:''})).status,400);assert.equal(fixture.saved.length,0);});
console.log(passed+' pruebas del handler de usuarios correctas. Sin Supabase.');
