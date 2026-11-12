import { z } from 'zod';
import type { TransportePlan, TransporteServicio, TransporteUnidad } from '@/types/transporte';

export const transporteImporte = (valor: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor || 0);
export const transporteSchema = z.record(z.union([z.string(), z.number(), z.boolean(), z.null(), z.record(z.string())]));
export const PRESENTACIONES_TRANSPORTE: Record<string, string> = { pendiente_documentacion: 'Sin documentación (opcional)', pendiente_autorizacion: 'Pendiente de autorización', listo: 'Listo para facturar', observado: 'Observado', rechazado: 'Rechazado' };
export function transporteMotivoNoFacturar(s: Pick<TransporteServicio, 'venta_id' | 'estado' | 'presentacion' | 'total'>): string | null {
  if (s.venta_id) return 'Registrado en Ventas';
  if (s.estado !== 'finalizado') return 'Primero finalizá el servicio';
  if (!['pendiente_documentacion', 'listo'].includes(s.presentacion)) return 'Revisá la autorización, observación o rechazo del servicio';
  if (!(Number(s.total) > 0)) return 'El servicio debe tener un importe mayor a cero';
  return null;
}
export function totalTransporte(s: Pick<TransporteServicio, 'precio_km' | 'precio_manual' | 'tarifa_snapshot' | 'km_facturables' | 'horas_espera' | 'adicionales'>): number {
  const t = s.tarifa_snapshot;
  const base = s.precio_km != null ? Number(s.precio_km) * s.km_facturables : s.precio_manual ?? (t ? Number(t.base) + Math.max(0, s.km_facturables - Number(t.km_incluidos)) * Number(t.precio_km) + s.horas_espera * Number(t.precio_hora) : 0);
  return Math.round((base + s.adicionales) * 100) / 100;
}
export function alertaTransporte(p: TransportePlan, u?: TransporteUnidad, hoy = new Date()): 'vencido' | 'proximo' | 'vigente' {
  const fecha = p.proxima_fecha ? new Date(`${p.proxima_fecha}T00:00:00`) : null;
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const dias = fecha ? Math.round((fecha.getTime() - inicio.getTime()) / 86400000) : Infinity;
  const km = p.proximo_km !== null && u ? p.proximo_km - u.kilometraje : Infinity;
  const horas = p.proximas_horas !== null && u ? p.proximas_horas - u.horas : Infinity;
  if (Math.min(dias, km, horas) <= 0) return 'vencido';
  return dias <= p.aviso_dias || km <= p.aviso_km || horas <= p.aviso_horas ? 'proximo' : 'vigente';
}
export const transporteError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message || error);
  if (message.includes('transporte_servicios_check1')) return 'La unidad principal y el equipo adicional deben ser distintos. Si no usás un acoplado, dejá Equipo / acoplado sin seleccionar.';
  if (/schema cache|does not exist|PGRST202/.test(message)) return 'Falta instalar la migración de Vortex Transporte en esta base.';
  return message.replace(/^transporte_/, '').replace(/_/g, ' ');
};
