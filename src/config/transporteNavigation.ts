import { CalendarClock, ClipboardList, Gauge, LayoutDashboard, Receipt, Truck, Users, Wallet, Wrench } from 'lucide-react';
export const transporteSecciones = [
  { vista: 'resumen', title: 'Resumen', icon: LayoutDashboard },
  { vista: 'servicios', title: 'Servicios y traslados', icon: ClipboardList },
  { vista: 'unidades', title: 'Unidades y equipos', icon: Truck },
  { vista: 'choferes', title: 'Choferes', icon: Users },
  { vista: 'lecturas', title: 'Kilómetros y horas', icon: Gauge },
  { vista: 'tarifas', title: 'Tarifas y convenios', icon: Wallet },
  { vista: 'liquidacion', title: 'Liquidación y facturación', icon: Receipt },
  { vista: 'gastos', title: 'Gastos de transporte', icon: Wallet },
  { vista: 'planes', title: 'Planes y alertas', icon: CalendarClock },
  { vista: 'mantenimientos', title: 'Mantenimientos', icon: Wrench },
] as const;
export type TransporteVista = typeof transporteSecciones[number]['vista'];

export const transporteFormularios = {
  servicios: { accion: 'servicio', titulo: 'servicio', editable: true },
  unidades: { accion: 'unidad', titulo: 'unidad o equipo', editable: true },
  choferes: { accion: 'chofer', titulo: 'chofer', editable: true },
  lecturas: { accion: 'lectura', titulo: 'lectura de kilómetros y horas', editable: false },
  tarifas: { accion: 'tarifa', titulo: 'tarifa o convenio', editable: true },
  planes: { accion: 'plan', titulo: 'plan de mantenimiento', editable: true },
  gastos: { accion: 'gasto', titulo: 'gasto de transporte', editable: false },
  mantenimientos: { accion: 'mantenimiento', titulo: 'mantenimiento', editable: true },
} as const;
export type TransporteFormularioVista = keyof typeof transporteFormularios;
