import { readFile, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const project = 'zhtqkygjvaaizbdwwsbi';
const token = JSON.parse(await readFile('private-backups/admin-generator/management.json','utf8')).token;
const response = await fetch(`https://api.supabase.com/v1/projects/${project}/api-keys`,{headers:{Authorization:`Bearer ${token}`}});
if(!response.ok) throw new Error('No se pudo preparar el ensayo');
const keys = await response.json();
const db = createClient(`https://${project}.supabase.co`,keys.find((k)=>k.name==='service_role').api_key,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:admins,error:adminError}=await db.from('app_admins').select('user_id').limit(1);
if(adminError||!admins?.length) throw new Error('No hay administrador para el ensayo');
const {data:identity,error:identityError}=await db.auth.admin.getUserById(admins[0].user_id);
if(identityError) throw new Error('No se pudo consultar la identidad administradora');
// generateLink crea un token para verificar la sesión, sin enviar ningún correo.
const {data:link,error:linkError}=await db.auth.admin.generateLink({type:'magiclink',email:identity.user.email});
if(linkError) throw new Error('No se pudo preparar la sesión de ensayo');
const {data:session,error:sessionError}=await db.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'magiclink'});
if(sessionError) throw new Error('No se pudo iniciar la sesión de ensayo');
try {
 const headers={Authorization:`Bearer ${session.session.access_token}`,'Content-Type':'application/json'};
 const status=await fetch('https://vortexgestion.netlify.app/.netlify/functions/admin-backups',{method:'POST',headers,body:JSON.stringify({action:'status'})});
 console.log(`Estado del servicio: HTTP ${status.status}`);
 if(!status.ok) { console.log((await status.text()).slice(0,500)); throw new Error('Servicio no disponible'); }
 if(process.argv.includes('--status')) process.exitCode=0;
 else {
  const {data:comercios}=await db.from('comercio').select('id').order('created_at').limit(1);
  const comercioId=process.argv.includes('--general')?null:comercios[0].id;
  const generated=await fetch('https://vortexgestion.netlify.app/.netlify/functions/admin-backups',{method:'POST',headers,body:JSON.stringify({action:'generate',comercioId})});
  const result=await generated.json();
  if(!generated.ok) throw new Error(result.error||'No se pudo iniciar la copia');
  console.log(`Copia solicitada: ${result.id}`);
  let backup;
  for(let i=0;i<85;i++) {
   await new Promise((r)=>setTimeout(r,10000));
   const {data}=await db.from('admin_backups').select('id,estado,bytes,error,resumen').eq('id',result.id).single();
   backup=data;
   if(i%3===0) console.log(`Estado: ${backup.estado}`);
   if(['completado','fallido'].includes(backup.estado)) break;
  }
  await writeFile('private-backups/admin-generator/last-live-test.json',JSON.stringify(backup,null,2));
  console.log(JSON.stringify(backup));
  if(backup.estado!=='completado') throw new Error('El ensayo no completó la copia');
 }
} finally { await db.auth.admin.signOut(session.session.access_token,'local'); }
