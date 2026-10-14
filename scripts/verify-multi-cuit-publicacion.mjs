// Verificación sin sesión de usuario: disponibilidad del RPC y protección de acceso.
// No crea emisores ni ventas, no solicita CAE.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEnv } from 'vite';
const env=loadEnv('production',process.cwd(),'VITE_');
assert.equal(env.VITE_SUPABASE_PROJECT_ID,'zhtqkygjvaaizbdwwsbi');
const headers={apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'};
const response=await fetch(env.VITE_SUPABASE_URL+'/rest/v1/rpc/listar_emisores_fiscales',{method:'POST',headers,body:JSON.stringify({p_comercio_id:'00000000-0000-0000-0000-000000000001'}),signal:AbortSignal.timeout(20000)});
const error=await response.json();
assert.notEqual(error.code,'PGRST202','La función debe estar en la caché de esquema');
assert.equal(error.code,'42501','El acceso anónimo debe estar bloqueado');
console.log('OK producción: listar_emisores_fiscales disponible; acceso sin sesión bloqueado.');
if(process.argv.includes('--frontend')){
 const site='https://vortexgestion.netlify.app';
 const htmlResponse=await fetch(site+'/?verify='+Date.now(),{signal:AbortSignal.timeout(20000)});
 assert.equal(htmlResponse.status,200);
 const html=await htmlResponse.text(),local=readFileSync('dist/index.html','utf8');
 const assets=[...local.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(m=>m[1]);
 assert.ok(assets.length>0);
 for(const asset of assets){assert.ok(html.includes(asset),'Publicación actual: '+asset);const res=await fetch(site+asset,{signal:AbortSignal.timeout(20000)});assert.equal(res.status,200,asset);}
 console.log('OK Netlify: página y assets del build actual disponibles por HTTPS.');
}
