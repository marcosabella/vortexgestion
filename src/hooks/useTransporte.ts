import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useComercio } from '@/hooks/useComercio';
import { useComercioParametrizacion } from '@/hooks/useComercioParametrizacion';
import { useAuth } from '@/contexts/AuthContext';
import type { Json } from '@/integrations/supabase/types';
import type { TransporteDatabase, TransporteDatos } from '@/types/transporte';
import { transporteError } from '@/utils/transporte';
import { toast } from 'sonner';

const db = supabase as unknown as SupabaseClient<TransporteDatabase>;
export function useTransporte() {
  const { comercio } = useComercio();
  const { user } = useAuth();
  const { data: parametros } = useComercioParametrizacion();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['transporte', comercio?.id, user?.id], enabled: Boolean(comercio && user && parametros.modulos.transporte),
    queryFn: async () => {
      const { data, error } = await db.rpc('transporte_datos', { p_comercio_id: comercio!.id });
      if (error) throw error;
      return data as unknown as TransporteDatos;
    },
  });
  const mutation = useMutation({
    mutationFn: async ({ accion, id = null, version = null, datos = {} }: { accion: string; id?: string | null; version?: number | null; datos?: object }) => {
      if (!comercio) throw new Error('Seleccioná un comercio.');
      const { data, error } = await db.rpc('transporte_operar', { p_comercio_id: comercio.id, p_accion: accion, p_id: id, p_version: version, p_datos: JSON.parse(JSON.stringify(datos)) as Json });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all(['transporte', 'ventas', 'presupuestos', 'gastos-egresos', 'cuenta-corriente', 'cuenta-proveedores', 'caja-diaria', 'cajas-diarias'].map(key => client.invalidateQueries({ queryKey: [key] })));
      toast.success('Cambios guardados');
    },
    onError: e => toast.error(transporteError(e)),
  });
  return { ...query, comercio, run: mutation.mutateAsync, isPending: mutation.isPending };
}
