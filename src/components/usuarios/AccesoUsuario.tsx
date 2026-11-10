import { useEffect, useRef, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAccesoComercio } from '@/hooks/useUsuariosComercio';
import { useComercio } from '@/hooks/useComercio';
import { useComercioParametrizacion } from '@/hooks/useComercioParametrizacion';
import { inicioUsuario, puedeAbrirRuta } from '@/config/usuariosPermisos';
import { Button } from '@/components/ui/button';
export function AccesoUsuario({children}:{children:ReactNode}) {
  const query=useAccesoComercio();
  const {comercio}=useComercio();
  const {data:parametros}=useComercioParametrizacion();
  const {pathname}=useLocation();
  const cache=useQueryClient();
  const anterior=useRef<{comercio:string;firma:string}|null>(null);
  const firma=JSON.stringify(query.data);
  useEffect(()=>{
    if(!comercio || !query.data)return;
    if(anterior.current?.comercio===comercio.id && anterior.current.firma!==firma) {
      cache.removeQueries({predicate:q=>!['usuario-acceso','comercio','comercio-parametrizacion'].includes(String(q.queryKey[0]))});
    }
    anterior.current={comercio:comercio.id,firma};
  },[comercio,query.data,firma,cache]);
  if(!comercio)return children;
  if(query.isPending)return <p className="p-6">Verificando permisos…</p>;
  if(query.error)return <div className="space-y-3 p-6" role="alert"><p>No se pudo verificar tu acceso. Revisá que la actualización de usuarios esté instalada.</p><Button onClick={()=>void query.refetch()}>Reintentar</Button></div>;
  if(!query.data?.activo)return <p role="alert" className="p-6">Tu acceso al comercio está desactivado. Comunicate con administración.</p>;
  if(pathname==='/sin-acceso')return <p role="alert" className="p-6">No tenés funciones asignadas. Comunicate con el administrador del comercio.</p>;
  if(query.data.configurado&&!query.data.admin&&pathname==='/')return <Navigate to={inicioUsuario(query.data,parametros.modulos)} replace />;
  if(!puedeAbrirRuta(query.data,pathname))return <div className="space-y-3 p-6" role="alert"><p>No tenés permiso para acceder a esta función.</p><Button asChild><Link to={inicioUsuario(query.data,parametros.modulos)}>Ir a mis funciones</Link></Button></div>;
  return children;
}
