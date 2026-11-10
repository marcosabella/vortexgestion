import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useUsuariosComercio } from '@/hooks/useUsuariosComercio';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UsuarioComercioFormulario } from '@/components/usuarios/UsuarioComercioFormulario';
import { perfilesUsuario } from '@/config/usuariosPermisos';
export default function UsuariosComercio({ formulario=false }: {formulario?:boolean}) {
  const data=useUsuariosComercio();
  const {usuarioId}=useParams();
  const [buscar,setBuscar]=useState('');
  if(data.acceso.isPending || !data.comercio) return <p className="p-6">Verificando acceso…</p>;
  if(data.acceso.error) return <div className="space-y-3 p-6" role="alert"><p>No se pudo verificar el acceso a usuarios. Revisá que la actualización esté instalada.</p><Button onClick={()=>void data.acceso.refetch()}>Reintentar</Button></div>;
  if(!data.acceso.data?.admin) return <p role="alert" className="p-6">Solo el administrador del comercio puede gestionar usuarios y permisos.</p>;
  if(data.query.isPending) return <p className="p-6">Cargando usuarios…</p>;
  if(data.query.error) return <div className="space-y-3 p-6" role="alert"><p>No se pudieron cargar los usuarios.</p><Button onClick={()=>void data.query.refetch()}>Reintentar</Button></div>;
  const usuario=data.query.data?.find(u=>u.user_id===usuarioId);
  if(formulario) return <UsuarioComercioFormulario key={`${data.comercio.id}-${usuarioId||'nuevo'}`} data={data} usuario={usuario} inexistente={Boolean(usuarioId && !usuario)} />;
  const usuarios=(data.query.data||[]).filter(u=>`${u.nombre} ${u.email}`.toLocaleLowerCase('es').includes(buscar.trim().toLocaleLowerCase('es')));
  return <div className="space-y-5 p-3 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Usuarios y permisos</h1><p className="text-muted-foreground">{data.comercio.nombre_comercio}</p></div><Button asChild><Link to="/usuarios/nuevo"><Plus className="mr-2 h-4 w-4" />Nuevo usuario</Link></Button></header>
    <p className="text-sm text-muted-foreground">Administrá las cuentas de tu comercio y sus accesos a Gestión y a los módulos habilitados. Desactivar conserva el historial.</p>
    <Input aria-label="Buscar usuarios" className="max-w-md" placeholder="Buscar por nombre o correo…" value={buscar} onChange={e=>setBuscar(e.target.value)} />
    <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Usuario</TableHead><TableHead>Perfil y acceso</TableHead><TableHead>Estado</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{usuarios.map(u=><TableRow key={u.user_id}><TableCell><p className="font-medium">{u.nombre}</p><p>{u.email}</p></TableCell><TableCell>{u.rol==='admin'?'Administrador':!u.configurado?'Acceso existente':perfilesUsuario.find(p=>p.id===u.perfil)?.nombre||'Personalizado'}{!u.configurado && <p className="text-xs text-muted-foreground">Conserva los permisos anteriores hasta configurar su acceso.</p>}</TableCell><TableCell>{u.activo?'Activo':'Inactivo'}</TableCell><TableCell><Button asChild variant="outline"><Link to={`/usuarios/${u.user_id}/editar`}>Editar acceso</Link></Button></TableCell></TableRow>)}{!usuarios.length&&<TableRow><TableCell colSpan={4}>No hay usuarios para esta búsqueda.</TableCell></TableRow>}</TableBody></Table></div>
  </div>;
}
