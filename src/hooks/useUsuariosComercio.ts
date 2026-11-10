import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useComercio } from '@/hooks/useComercio';
import type { Database, Json } from '@/integrations/supabase/types';
import type { AccesoComercio } from '@/config/usuariosPermisos';
import type { UsuarioComercio, UsuarioComercioDatos } from '@/types/usuario-comercio';

type DB = Omit<Database,'public'> & { public: Omit<Database['public'],'Functions'> & { Functions: Database['public']['Functions'] & {
  vortex_mi_acceso: { Args: {p_comercio_id:string}; Returns: Json };
  vortex_listar_usuarios: { Args: {p_comercio_id:string}; Returns: Json };
  vortex_sectores_restaurante: { Args: {p_comercio_id:string}; Returns: Json };
} } };
const db = supabase as unknown as SupabaseClient<DB>;
export function useAccesoComercio() {
  const { user } = useAuth();
  const { comercio } = useComercio();
  return useQuery({ queryKey:['usuario-acceso',comercio?.id,user?.id], enabled:Boolean(comercio && user), staleTime:0, refetchInterval:15000, queryFn:async()=>{
    const {data,error}=await db.rpc('vortex_mi_acceso',{p_comercio_id:comercio!.id});
    if(error) throw error;
    return data as unknown as AccesoComercio | null;
  } });
}
export function useUsuariosComercio() {
  const { comercio } = useComercio();
  const { user } = useAuth();
  const acceso = useAccesoComercio();
  const cache = useQueryClient();
  const query = useQuery({queryKey:['usuarios-comercio',comercio?.id,user?.id],enabled:Boolean(comercio && acceso.data?.admin),queryFn:async()=>{
    const {data,error}=await db.rpc('vortex_listar_usuarios',{p_comercio_id:comercio!.id});
    if(error) throw error;
    return data as unknown as UsuarioComercio[];
  }});
  const mutation=useMutation({gcTime:0,mutationFn:async(values:UsuarioComercioDatos)=>{
    if(!comercio || !acceso.data?.admin) throw Error('Solo administración puede gestionar usuarios');
    const {data,error}=await supabase.functions.invoke<{success:boolean;error?:string}>('usuarios-comercio',{body:{...values,comercio_id:comercio.id,action:values.user_id?'guardar':'crear'}});
    if(error instanceof FunctionsHttpError){const details=await error.context.json().catch(()=>null);throw Error(details?.error || 'No se pudo gestionar el usuario');}
    if(error || !data?.success) throw Error(data?.error || 'No se pudo gestionar el usuario');
  },onSuccess:async()=>{
    // Una baja de acceso también retira del caché datos del usuario anterior.
    await Promise.all(['usuarios-comercio','usuario-acceso','comercio','restaurante-usuarios','restaurante-acceso','restaurante','transporte','campo-acceso'].map(key=>cache.invalidateQueries({queryKey:[key]})));
  }});
  const sectores=useQuery({queryKey:['usuarios-sectores-restaurante',comercio?.id,user?.id],enabled:Boolean(comercio && acceso.data?.admin),queryFn:async()=>{
    const {data,error}=await db.rpc('vortex_sectores_restaurante',{p_comercio_id:comercio!.id});if(error)throw error;return data as unknown as {id:string;nombre:string}[];
  }});
  return {comercio,acceso,query,mutation,user,sectores};
}
