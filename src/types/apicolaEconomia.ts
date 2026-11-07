import type { ApicolaFila } from './apicola';

export type OrigenEconomicoApicola = 'compra' | 'gasto' | 'venta' | 'estimado';
export type MonedaApicola = 'ARS' | 'USD';
export type DocumentoEconomicoApicola = { id: string; origen: OrigenEconomicoApicola; numero: string; fecha: string; moneda: MonedaApicola; total: number; saldo: number; detalle: string };
export type ImputacionApicola = ApicolaFila & { campana_id: string; apiario_id: string | null; campana: string; apiario: string | null; fecha: string; tipo: 'costo' | 'ingreso'; origen: OrigenEconomicoApicola; concepto: string; actividad: string; criterio: string; importe: number; moneda: MonedaApicola; estado: 'vigente' | 'anulado'; motivo_anulacion: string | null; documento_snapshot: { numero?: string; fecha?: string; total?: number; moneda?: string; cliente?: string } };
export type ResumenEconomicoApicola = { moneda: MonedaApicola; ingresos: number; costos_documentados: number; costos_estimados: number; resultado_estimado: number };
export type ResultadoApicola = { campana_id: string; campana: string; apiario_id: string | null; apiario: string | null; moneda: MonedaApicola; ingresos: number; costos: number; resultado_estimado: number };
export type EconomiaApicola = { items: ImputacionApicola[]; total: number; resumen: ResumenEconomicoApicola[]; campanas_apiarios: ResultadoApicola[]; actividades: { actividad: string; moneda: MonedaApicola; importe: number }[] };
export const actividadesEconomicasApicolas = { alimentacion: 'Alimentación', sanidad: 'Sanidad', reinas: 'Reinas', reposicion: 'Reposición', mano_obra: 'Mano de obra', combustible: 'Combustible', traslados: 'Traslados', extraccion: 'Extracción', arrendamientos: 'Arrendamientos', envases: 'Envases', fraccionado: 'Fraccionado', mantenimiento: 'Mantenimiento', comercializacion: 'Comercialización', otros: 'Otros' };
