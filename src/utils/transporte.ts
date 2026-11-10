import { z } from 'zod';
import type { TransportePlan, TransporteServicio, TransporteUnidad } from '@/types/transporte';

export const transporteImporte = (valor: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valor || 0);
export const transporteSchema = z.record(z.union([z.string(), z.number(), z.boolean(), z.null(), z.record(z.string())]));
export function totalTransporte(s: Pick<TransporteServicio, 'precio_manual' | 'tarifa_snapshot' | 'km_facturables' | 'horas_espera' | 'adicionales'>): number {
  const t = s.tarifa_snapshot;
  const base = s.precio_manual ?? (t ? Number(t.base) + Math.max(0, s.km_facturables - Number(t.km_incluidos)) * Number(t.precio_km) + s.horas_espera * Number(t.precio_hora) : 0);
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
  if (/schema cache|does not exist|PGRST202/.test(message)) return 'Falta instalar la migración de Vortex Transporte en esta base.';
  return message.replace(/^transporte_/, '').replace(/_/g, ' ');
};
