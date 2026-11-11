import { getTotalPagos, getTotalPagosBase, type PagoVenta } from '@/types/venta';

export const COMPROBANTES_LIQUIDACION = ['recibo_x', 'factura_a', 'factura_b', 'factura_c'] as const;
export type ComprobanteLiquidacion = typeof COMPROBANTES_LIQUIDACION[number];
export type CondicionLiquidacion = 'contado' | 'cta_cte';

export function prepararPagosLiquidacion(condicion: CondicionLiquidacion, pagos: PagoVenta[], total: number) {
  if (condicion === 'cta_cte') return [];
  if (!pagos.length) throw new Error('Agregá la forma de pago para la venta de contado.');
  if (pagos.some(p => !['contado', 'transferencia', 'tarjeta', 'cheque'].includes(p.tipo_pago))) throw new Error('Usá la condición Cuenta corriente para dejar el servicio pendiente de cobro.');
  if (pagos.some(p => !Number.isFinite(Number(p.monto)) || Number(p.monto) <= 0 || !Number.isFinite(Number(p.recargo_cuotas || 0)) || Number(p.recargo_cuotas || 0) < 0 || Number(p.recargo_cuotas || 0) > Number(p.monto))) throw new Error('Revisá los importes de los pagos.');
  if (Math.round(getTotalPagosBase(pagos) * 100) !== Math.round(total * 100)) throw new Error('Los pagos deben cubrir el total de los servicios.');
  if (pagos.some(p => (p.tipo_pago === 'transferencia' && !p.banco_id) || (p.tipo_pago === 'tarjeta' && !p.tarjeta_id) || (p.tipo_pago === 'cheque' && !p.cheque_id))) throw new Error('Completá los datos de banco, tarjeta o cheque del pago.');
  return pagos.map(p => ({
    tipo_pago: p.tipo_pago, monto: Math.round(Number(p.monto) * 100) / 100,
    ...(p.banco_id ? { banco_id: p.banco_id } : {}),
    ...(p.tarjeta_id ? { tarjeta_id: p.tarjeta_id } : {}),
    ...(p.cheque_id ? { cheque_id: p.cheque_id } : {}),
    ...(p.cuotas ? { cuotas: Number(p.cuotas) } : {}),
    ...(p.recargo_cuotas ? { recargo_cuotas: Math.round(Number(p.recargo_cuotas) * 100) / 100 } : {}),
  }));
}

export const totalLiquidacion = (condicion: CondicionLiquidacion, pagos: PagoVenta[], total: number) =>
  condicion === 'cta_cte' ? total : Math.round((total + getTotalPagos(pagos) - getTotalPagosBase(pagos)) * 100) / 100;
