import type { PedidoOnline } from '@/hooks/usePedidosOnline';

export interface RelacionesPedidoOnline { reembolsos: boolean; cancelaciones: boolean }
interface ErrorConsulta { code?: string; message: string; details?: string; hint?: string }
type Consultar = (relaciones: RelacionesPedidoOnline) => PromiseLike<{ data: unknown; error: ErrorConsulta | null }>;

// El frontend puede desplegarse/desarrollarse antes de las migraciones opcionales.
// Solo se omite la relacion que PostgREST identifica como ausente; no se ocultan
// errores de permisos, red, ni relaciones del nucleo de pedidos.
export async function cargarPedidosOnlineCompatibles(consultar: Consultar) {
  const relaciones: RelacionesPedidoOnline = { reembolsos: true, cancelaciones: true };
  for (let intento = 0; intento < 3; intento++) {
    const { data, error } = await consultar({ ...relaciones });
    if (!error) return {
      pedidos: ((data || []) as PedidoOnline[]).map(pedido => ({
        ...pedido,
        pedido_online_reembolsos: relaciones.reembolsos ? pedido.pedido_online_reembolsos : null,
        pedido_online_cancelaciones: relaciones.cancelaciones ? pedido.pedido_online_cancelaciones : null,
      })),
      reembolsosDisponibles: relaciones.reembolsos,
      comprobantesDisponibles: relaciones.reembolsos && relaciones.cancelaciones,
    };
    const detalle = [error.message, error.details, error.hint].filter(Boolean).join(' ');
    if (['PGRST200', 'PGRST205', '42P01'].includes(error.code || '')) {
      if (relaciones.cancelaciones && detalle.includes('pedido_online_cancelaciones')) { relaciones.cancelaciones = false; continue; }
      if (relaciones.reembolsos && detalle.includes('pedido_online_reembolsos')) { relaciones.reembolsos = false; continue; }
    }
    throw new Error(error.message);
  }
  throw new Error('No se pudo comprobar el esquema disponible de pedidos online');
}
