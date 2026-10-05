import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { TallerDatabase } from '@/types/taller';
import { useComercio } from '@/hooks/useComercio';
import { useComercioParametrizacion } from '@/hooks/useComercioParametrizacion';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Venta } from '@/types/venta';

const db = supabase as unknown as SupabaseClient<TallerDatabase>;

export function tallerError(error: unknown): string {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message || '');
  const messages: Record<string, string> = {
    version_desactualizada: 'Otra persona modificó la orden. Actualizá los datos y volvé a intentar.',
    sin_permisos_o_deshabilitado: 'El módulo no está habilitado o no tenés permisos de administrador.',
    detalle_congelado: 'El presupuesto ya está emitido. El detalle de esa orden está protegido.',
    presupuesto_protegido: 'Este presupuesto pertenece a Taller. Gestioná el trabajo desde su orden.',
    orden_no_lista: 'La orden debe estar lista para entregar antes de generar la venta.',
    pagos_no_coinciden: 'La suma de los pagos debe coincidir con el total.',
    trabajo_realizado_requerido: 'Completá el trabajo realizado antes de marcar la orden como lista.',
    kilometraje_inferior: 'El kilometraje no puede ser inferior al registrado en el vehículo.',
    motivo_requerido: 'Registrá la aprobación del cliente o el motivo de cancelación.',
    detalle_vacio: 'Agregá repuestos o mano de obra con un total mayor a cero.',
    transicion_invalida: 'La orden cambió o no permite pasar al estado elegido.',
    otro_comercio: 'El registro relacionado no pertenece al comercio actual.',
  };
  for (const [key, value] of Object.entries(messages)) if (message.includes(key)) return value;
  if (/23505|duplicate key/.test(message)) return 'Ya existe un vehículo con esa patente en el comercio.';
  if (/PGRST20[025]|does not exist|schema cache/.test(message)) return 'La base todavía no tiene instalada la migración de Vortex Taller.';
  return message || 'No se pudo completar la operación.';
}

export function useTaller() {
  const { comercio } = useComercio();
  const { user } = useAuth();
  const { data: parametros } = useComercioParametrizacion();
  const client = useQueryClient();
  const comercioId = comercio?.id;
  const enabled = Boolean(comercioId && parametros.modulos.taller);
  const access = useQuery({
    queryKey: ['taller', comercioId, 'acceso', user?.id], enabled: enabled && Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from('comercio_usuarios').select('rol').eq('comercio_id', comercioId!).eq('user_id', user!.id).eq('activo', true).maybeSingle();
      if (error) throw error;
      return data?.rol === 'admin';
    },
  });
  const query = useQuery({
    queryKey: ['taller', comercioId, 'datos'], enabled,
    queryFn: async () => {
      const [vehiculos, tecnicos, ordenes, items] = await Promise.all([
        db.from('taller_vehiculos').select('*').eq('comercio_id', comercioId!).order('patente'),
        db.from('taller_tecnicos').select('*').eq('comercio_id', comercioId!).order('nombre'),
        db.from('taller_ordenes').select('*').eq('comercio_id', comercioId!).order('fecha_ingreso', { ascending: false }),
        db.from('taller_orden_items').select('*').eq('comercio_id', comercioId!),
      ]);
      for (const result of [vehiculos, tecnicos, ordenes, items]) if (result.error) throw result.error;
      return { vehiculos: vehiculos.data ?? [], tecnicos: tecnicos.data ?? [], ordenes: ordenes.data ?? [], items: items.data ?? [] };
    },
  });
  type Functions = TallerDatabase['public']['Functions'];
  type FunctionName = 'taller_guardar_catalogo' | 'taller_guardar_marca_modelo' | 'taller_guardar_orden' | 'taller_guardar_item' | 'taller_cambiar_estado' | 'taller_generar_presupuesto' | 'taller_facturar_orden';
  type Operation = { [Name in FunctionName]: { name: Name; args: Functions[Name]['Args'] } }[FunctionName];
  const mutation = useMutation({
    mutationFn: async (operation: Operation) => {
      if (!comercioId || !access.data) throw new Error('taller_sin_permisos_o_deshabilitado');
      const { data, error } = await db.rpc(operation.name, operation.args);
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all(['taller', 'presupuestos', 'ventas', 'productos', 'cuenta-corriente', 'caja-diaria-ventas'].map(key => client.invalidateQueries({ queryKey: [key] })));
      toast.success('Cambios guardados');
    },
    onError: (error) => toast.error(tallerError(error)),
  });
  return {
    comercio, comercioId, isAdmin: access.data === true, isLoading: query.isLoading || access.isLoading,
    error: query.error || access.error, refetch: query.refetch,
    vehiculos: query.data?.vehiculos ?? [], tecnicos: query.data?.tecnicos ?? [], ordenes: query.data?.ordenes ?? [], items: query.data?.items ?? [],
    run: mutation.mutateAsync, isPending: mutation.isPending,
  };
}

export function useTallerMarcasModelos(comercioId: string | undefined) {
  return useQuery({
    queryKey: ['taller', comercioId, 'marcas-modelos'], enabled: Boolean(comercioId),
    queryFn: async () => {
      const [marcas, modelos] = await Promise.all([
        db.from('taller_marcas').select('*').eq('comercio_id', comercioId!).order('nombre'),
        db.from('taller_modelos').select('*').eq('comercio_id', comercioId!).order('nombre'),
      ]);
      if (marcas.error) throw marcas.error;
      if (modelos.error) throw modelos.error;
      return { marcas: marcas.data ?? [], modelos: modelos.data ?? [] };
    },
  });
}

export function useTallerEventos(ordenId: string | undefined, comercioId: string | undefined) {
  return useQuery({
    queryKey: ['taller', comercioId, 'eventos', ordenId], enabled: Boolean(ordenId && comercioId),
    queryFn: async () => {
      const { data, error } = await db.from('taller_orden_eventos').select('*').eq('comercio_id', comercioId!).eq('orden_id', ordenId!).order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTallerVariantes(productoId: string | null) {
  return useQuery({
    queryKey: ['taller', 'variantes', productoId], enabled: Boolean(productoId),
    queryFn: async () => {
      const { data, error } = await db.from('producto_variantes').select('*').eq('producto_id', productoId!);
      if (error) throw error;
      const colorIds = (data ?? []).flatMap(row => row.color_id ? [row.color_id] : []);
      const talleIds = (data ?? []).flatMap(row => row.talle_id ? [row.talle_id] : []);
      const [colores, talles] = await Promise.all([
        colorIds.length ? db.from('producto_colores').select('id,nombre').in('id', colorIds) : Promise.resolve({ data: [], error: null }),
        talleIds.length ? db.from('producto_talles').select('id,nombre').in('id', talleIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (colores.error) throw colores.error;
      if (talles.error) throw talles.error;
      return (data ?? []).map(row => ({ ...row, color: colores.data?.find(color => color.id === row.color_id), talle: talles.data?.find(talle => talle.id === row.talle_id) }));
    },
  });
}

export const tallerJson = (value: object): Json => JSON.parse(JSON.stringify(value)) as Json;

export function useTallerDocumento(comercioId: string | undefined, id: string | null | undefined, tipo: 'venta' | 'presupuesto') {
  return useQuery({
    queryKey: ['taller', comercioId, 'documento', tipo, id], enabled: Boolean(comercioId && id),
    queryFn: async (): Promise<Venta | null> => {
      const relations = tipo === 'venta' ? 'venta_items(*,producto:productos(cod_producto,descripcion,precio_venta,porcentaje_iva)),pagos_venta(*)' : 'presupuesto_items(*,producto:productos(cod_producto,descripcion,precio_venta,porcentaje_iva)),presupuesto_pagos(*)';
      const { data, error } = await db.from(tipo === 'venta' ? 'ventas' : 'presupuestos').select(`*,cliente:clientes(nombre,apellido,cuit,calle,numero,localidad,provincia,codigo_postal,telefono,situacion_afip,tipo_persona),${relations}`).eq('comercio_id', comercioId!).eq('id', id!).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as Venta & { presupuesto_items?: Venta['venta_items']; presupuesto_pagos?: Venta['pagos_venta'] };
      return tipo === 'venta' ? row : { ...row, venta_items: row.presupuesto_items, pagos_venta: row.presupuesto_pagos };
    },
  });
}
