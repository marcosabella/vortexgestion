import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useComercioParametrizacion } from '@/hooks/useComercioParametrizacion';
import type { useUsuariosComercio } from '@/hooks/useUsuariosComercio';
import { accionesUsuario, catalogoPermisos, modulosConPermisos, perfilesUsuario, type AccionUsuario, type PermisosUsuario } from '@/config/usuariosPermisos';
import type { UsuarioComercio } from '@/types/usuario-comercio';
import { restauranteRoles } from '@/config/restauranteRoles';

const schema=z.object({nombre:z.string().trim().min(1,'Ingresá el nombre').max(100),email:z.string().trim().email('Ingresá un correo válido'),password:z.string().max(128),rol:z.enum(['admin','operador']),activo:z.boolean()});
type Values=z.infer<typeof schema>;
export function UsuarioComercioFormulario({data,usuario,inexistente}:{data:ReturnType<typeof useUsuariosComercio>;usuario?:UsuarioComercio;inexistente:boolean}) {
  const navigate=useNavigate();
  const {data:parametros}=useComercioParametrizacion();
  const [permisos,setPermisos]=useState<PermisosUsuario>(usuario?.permisos||{});
  const [perfil,setPerfil]=useState(usuario?.configurado?usuario.perfil:'personalizado');
  const [roles,setRoles]=useState<string[]>(usuario?.restaurante_roles||[]);
  const [sector,setSector]=useState(usuario?.restaurante_sector_id||'');
  const [cobros,setCobros]=useState(usuario?.restaurante_cobros||false);
  const [error,setError]=useState('');
  const form=useForm<Values>({resolver:zodResolver(schema),defaultValues:{nombre:usuario?.nombre||'',email:usuario?.email||'',password:'',rol:usuario?.rol||'operador',activo:usuario?.activo??true}});
  const admin=form.watch('rol')==='admin';
  const pendiente=data.mutation.isPending||form.formState.isSubmitting;
  const habilitados=modulosConPermisos.filter(m=>parametros.modulos[m.key]);
  const permisosHabilitados:PermisosUsuario=Object.fromEntries(Object.entries(permisos).filter(([m,a])=>parametros.modulos[m as keyof typeof parametros.modulos]&&a?.length));
  const elegirPerfil=(id:string)=>{
    setPerfil(id);const base=perfilesUsuario.find(p=>p.id===id)?.permisos||{};
    setPermisos(Object.fromEntries(Object.entries(base).filter(([m])=>parametros.modulos[m as keyof typeof parametros.modulos])));
  };
  const toggle=(modulo:keyof PermisosUsuario,accion:AccionUsuario,checked:boolean)=>{
    setPerfil('personalizado');setPermisos(actual=>{
      const acciones=new Set(actual[modulo]||[]);
      if(checked){acciones.add(accion);acciones.add('consultar');if(modulo==='transporte'&&['crear','editar','facturar'].includes(accion))acciones.add('administrar');}
      else if(accion==='consultar')acciones.clear();else{acciones.delete(accion);if(modulo==='transporte'&&accion==='administrar'){acciones.delete('crear');acciones.delete('editar');acciones.delete('facturar');}}
      return {...actual,[modulo]:Array.from(acciones)};
    });
  };
  const self=usuario?.user_id===data.user?.id;
  return <div className="mx-auto max-w-5xl space-y-5 p-3 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">{usuario?'Editar acceso':'Nuevo usuario'}</h1><p className="text-muted-foreground">{data.comercio?.nombre_comercio}</p></div><Button variant="outline" disabled={pendiente} onClick={()=>navigate('/usuarios')}><ArrowLeft className="mr-2 h-4 w-4" />Volver</Button></header>
    {inexistente?<p role="alert">El usuario no pertenece al comercio seleccionado.</p>:<form className="space-y-6 rounded-xl border p-4 sm:p-6" onSubmit={form.handleSubmit(async values=>{
      setError('');
      if(!usuario&&values.password.length<8){form.setError('password',{message:'Usá una contraseña de al menos 8 caracteres'});return;}
      if(!admin&&values.activo&&!Object.keys(permisosHabilitados).length){setError('Asigná al menos un módulo al usuario.');return;}
      if(!admin&&values.activo&&permisosHabilitados.restaurante?.length){
        if(!roles.length){setError('Asigná una función de Restaurante.');return;}
        if(roles.some(r=>['cocina','barra'].includes(r))&&(roles.length!==1||!sector)){setError('Cocina o barra requieren una sola función y un sector de preparación.');return;}
      }
      try{
        await data.mutation.mutateAsync({...values,nombre:values.nombre,email:values.email,rol:values.rol,activo:values.activo,user_id:usuario?.user_id,version:usuario?.version,perfil,permisos:admin?{}:permisosHabilitados,restaurante_roles:roles,restaurante_sector_id:sector||null,restaurante_cobros:cobros});
        form.setValue('password','');navigate('/usuarios',{replace:true});
      }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar el acceso');}finally{data.mutation.reset();}
    })}>
      {usuario&&!usuario.configurado&&usuario.rol!=='admin'&&<p className="rounded-lg bg-muted p-3 text-sm">Este usuario conserva sus accesos anteriores. Al guardar, se aplicarán únicamente los módulos y permisos que selecciones aquí. Revisalos antes de confirmar.</p>}
      <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="usuario-nombre">Nombre</Label><Input id="usuario-nombre" {...form.register('nombre')} /></div><div><Label htmlFor="usuario-email">Correo de ingreso</Label><Input id="usuario-email" type="email" readOnly={Boolean(usuario)} {...form.register('email')} /></div>
      {!usuario&&<div><Label htmlFor="usuario-password">Contraseña inicial</Label><Input id="usuario-password" type="password" autoComplete="new-password" {...form.register('password')} /><p className="text-xs text-muted-foreground">Ingresa directamente con su correo y contraseña. No se envían mensajes automáticos.</p></div>}
      <div><Label htmlFor="usuario-rol">Rol general</Label><select id="usuario-rol" className="min-h-11 w-full rounded-md border bg-background px-3" disabled={self} {...form.register('rol')}><option value="operador">Usuario con permisos asignados</option><option value="admin">Administrador del comercio</option></select></div></div>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={self} {...form.register('activo')} />Acceso activo al comercio</label>
      {admin?<p className="rounded-lg bg-muted p-3">El administrador gestiona los usuarios y las funciones habilitadas del comercio.</p>:<>
        <div><Label htmlFor="usuario-perfil">Perfil sugerido</Label><select id="usuario-perfil" value={perfil} onChange={e=>elegirPerfil(e.target.value)} className="min-h-11 w-full rounded-md border bg-background px-3">{perfilesUsuario.filter(p=>(!['chofer','coordinador_transporte'].includes(p.id)||parametros.modulos.transporte)&&(p.id!=='operario_campo'||parametros.modulos.campo)).map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
        <p className="text-sm text-muted-foreground">El perfil completa una propuesta de permisos. Podés ajustarla. Configuración del comercio y gestión de usuarios quedan reservadas al administrador.</p>
        <div className="grid gap-4 md:grid-cols-2">{habilitados.map(m=><fieldset key={m.key} className="space-y-2 rounded-lg border p-3"><legend className="px-1 font-semibold">{m.label}</legend>{catalogoPermisos[m.key]?.map(a=><label key={a} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={permisos[m.key]?.includes(a)||false} onChange={e=>toggle(m.key,a,e.target.checked)} />{accionesUsuario[a]}</label>)}</fieldset>)}</div>
        {permisos.restaurante?.length>0&&<fieldset className="space-y-3 rounded-lg border p-4"><legend>Funciones de Restaurante</legend>{restauranteRoles.map(r=><label key={r.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={roles.includes(r.id)} onChange={e=>setRoles(current=>e.target.checked?[...current,r.id]:current.filter(x=>x!==r.id))} />{r.nombre}</label>)}{roles.some(r=>['cocina','barra'].includes(r))&&<div><Label htmlFor="usuario-sector">Sector de preparación</Label><select id="usuario-sector" className="min-h-11 w-full rounded-md border bg-background px-3" value={sector} onChange={e=>setSector(e.target.value)} disabled={data.sectores.isPending||data.sectores.isError}><option value="">Seleccioná el sector</option>{data.sectores.data?.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select>{data.sectores.error&&<p role="alert">No se pudieron cargar los sectores. Volvé a abrir el formulario para reintentar.</p>}</div>}<label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={cobros} onChange={e=>setCobros(e.target.checked)} />Permitir cobros al mozo</label></fieldset>}
      </>}
      {usuario&&<p className="text-sm text-muted-foreground">Se conserva el correo y la contraseña actuales. El titular puede cambiar su contraseña desde Seguridad.</p>}
      {Object.entries(form.formState.errors).map(([k,e])=><p key={k} role="alert" className="text-sm text-destructive">{e.message}</p>)}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={pendiente}>{pendiente?'Guardando…':usuario?'Guardar acceso':'Crear usuario'}</Button><Button type="button" variant="outline" disabled={pendiente} onClick={()=>navigate('/usuarios')}>Cancelar</Button></div>
    </form>}
  </div>;
}
