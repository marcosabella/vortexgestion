import type { Cliente } from '@/types/cliente';
import type { TallerOrden, TallerVehiculo, TallerItem } from '@/types/taller';
import type { Venta } from '@/types/venta';
import { numeroOrdenTaller, totalTaller } from './taller';

export function crearDocumentoOrdenTaller({ orden, vehiculo, items, cliente }: { orden: TallerOrden; vehiculo: TallerVehiculo; items: TallerItem[]; cliente?: Cliente }): Venta {
  const venta_items = items.map(item => {
    const total = Number(item.total);
    const subtotal = Math.round(total / (1 + item.porcentaje_iva / 100) * 100) / 100;
    return {
      id: item.id, descripcion_manual: item.descripcion,
      codigo_manual: item.tipo === 'mano_obra' ? 'MO' : item.tipo === 'servicio_externo' ? 'SERV' : 'REP',
      cantidad: item.cantidad, precio_unitario: item.precio_unitario,
      porcentaje_iva: item.porcentaje_iva, subtotal, monto_iva: Math.round((total - subtotal) * 100) / 100, total,
    };
  });
  const total = totalTaller(items);
  const subtotal = venta_items.reduce((sum, item) => sum + item.subtotal, 0);
  return {
    numero_comprobante: numeroOrdenTaller(orden.numero), fecha_venta: orden.fecha_ingreso,
    tipo_comprobante: 'recibo_x', tipo_pago: 'cta_cte',
    cliente_id: orden.cliente_id, cliente_nombre: cliente ? `${cliente.nombre} ${cliente.apellido || ''}`.trim() : 'Cliente no disponible',
    cliente, subtotal, total_iva: Math.round((total - subtotal) * 100) / 100, total, venta_items,
    taller_vehiculo: { patente: vehiculo.patente, marca: vehiculo.marca, modelo: vehiculo.modelo, anio: vehiculo.anio, kilometraje: orden.kilometraje },
  };
}
