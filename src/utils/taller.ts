import { z } from 'zod';
import type { TallerItem, TallerOrden } from '@/types/taller';

export const vehiculoSchema = z.object({
  cliente_id: z.string().uuid('Seleccioná un cliente'),
  patente: z.string().transform(value => value.toUpperCase().replace(/[^A-Z0-9]/g, '')).pipe(z.string().min(3).max(15)),
  marca: z.string().trim().min(1, 'Ingresá la marca'), modelo: z.string().trim().min(1, 'Ingresá el modelo'),
  kilometraje: z.coerce.number().int().min(0),
});
export const itemTallerSchema = z.object({
  tipo: z.enum(['repuesto', 'mano_obra', 'servicio_externo']), descripcion: z.string().trim().min(1),
  cantidad: z.coerce.number().positive().max(999999), precio_unitario: z.coerce.number().min(0).max(999999999),
  porcentaje_iva: z.coerce.number().min(0).max(100), costo_unitario: z.coerce.number().min(0).max(999999999),
}).superRefine((item, context) => {
  if (item.tipo === 'repuesto' && !Number.isInteger(item.cantidad)) context.addIssue({ code: 'custom', path: ['cantidad'], message: 'Los repuestos requieren cantidades enteras' });
});
export const moneyTaller = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);
export const fechaTaller = (value?: string | null) => value ? (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : new Date(value).toLocaleString('es-AR')) : '—';
export const hoyTaller = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const numeroOrdenTaller = (numero: number) => `OT-${String(numero).padStart(6, '0')}`;
export const totalTaller = (items: TallerItem[]) => items.reduce((sum, item) => sum + Number(item.total), 0);
export const resumenTaller = (ordenes: TallerOrden[], items: TallerItem[]) => ({
  abiertas: ordenes.filter(orden => !['cancelado', 'entregado'].includes(orden.estado)).length,
  listas: ordenes.filter(orden => orden.estado === 'listo').length,
  pendientesFacturar: ordenes.filter(orden => orden.estado === 'listo' && !orden.venta_id).length,
  totalFacturado: totalTaller(items.filter(item => ordenes.some(orden => orden.id === item.orden_id && orden.venta_id))),
});
