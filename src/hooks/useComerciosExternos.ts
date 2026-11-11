import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useComercio } from '@/hooks/useComercio';
import { useToast } from '@/hooks/use-toast';

export type ComercioExterno = {
  id: string; comercio_id: string; cliente_id: string; nombre_comercio: string;
  sistema: string; url_sistema: string; importe_mensual: number; concepto: string;
  fecha_ingreso_sistema: string | null; membresia_vigente_hasta: string | null;
  cliente_nombre: string; cliente_cuit: string; cliente_situacion_afip: string; emisor_nombre: string;
};
export type ComercioExternoForm = {
  id?: string; cliente_id: string; nombre_comercio: string; sistema: string; url_sistema: string;
  importe_mensual: number; concepto: string; fecha_ingreso_sistema: string; membresia_vigente_hasta: string;
};
type PanelExternos = { externos: ComercioExterno[]; licencias: { destinatario_comercio_id: string; importe_mensual: number }[] };
type RpcExterno = 'listar_comercios_externos' | 'guardar_comercio_externo' | 'eliminar_comercio_externo';
async function rpc<T>(name: RpcExterno, args: object): Promise<T> {
  const { data, error } = await (supabase as unknown as { rpc: (name: string, args: object) => Promise<{ data: T; error: { message: string; code?: string } | null }> }).rpc(name, args);
  if (error?.code === 'PGRST202' || error?.code === '42P01') throw new Error('Falta aplicar la migración de comercios externos en Vortex.');
  if (error) throw new Error(error.message);
  return data;
}
export function useComerciosExternos(enabled = true) {
  const { comercio } = useComercio();
  const client = useQueryClient();
  const { toast } = useToast();
  const query = useQuery({ queryKey: ['admin-comercios-externos', comercio?.id], enabled,
    queryFn: () => rpc<PanelExternos>('listar_comercios_externos', { p_comercio_id: comercio?.id || null }),
  });
  const emisorId = () => { if (!comercio?.id) throw new Error('Seleccioná tu comercio emisor.'); return comercio.id; };
  const invalidar = () => { void client.invalidateQueries({ queryKey: ['admin-comercios-externos'] }); void client.invalidateQueries({ queryKey: ['licencia-comercio'] }); };
  const onError = (error: Error) => toast({ title: 'No se pudo completar la operación', description: error.message, variant: 'destructive' });
  const guardar = useMutation({ mutationFn: (values: ComercioExternoForm) => rpc<string>('guardar_comercio_externo', {
    p_comercio_id: emisorId(), p_id: values.id || null, p_cliente_id: values.cliente_id,
    p_nombre: values.nombre_comercio.trim(), p_sistema: values.sistema.trim(), p_url: new URL(values.url_sistema.trim()).href,
    p_importe: values.importe_mensual, p_concepto: values.concepto.trim(), p_fecha_alta: values.fecha_ingreso_sistema || null, p_vigencia: values.membresia_vigente_hasta || null,
  }), onSuccess: () => { invalidar(); toast({ title: 'Comercio externo guardado', description: 'Se conserva el cliente y su historial de facturación.' }); }, onError });
  const eliminar = useMutation({ mutationFn: (id: string) => rpc<void>('eliminar_comercio_externo', { p_comercio_id: emisorId(), p_destinatario_id: id }),
    onSuccess: () => { invalidar(); toast({ title: 'Registro externo eliminado', description: 'El cliente y sus movimientos se conservan.' }); }, onError });
  return { query, guardar, eliminar, comercio };
}
