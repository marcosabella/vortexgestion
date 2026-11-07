import type { ApicolaFila } from './apicola';
import type { StockApicola } from './apicolaComercial';

export type CosechaApicola = ApicolaFila & { codigo: string; campana_id: string; apiario_id: string; fecha: string; alzas: number; responsable: string; estado: string };
export type ExtraccionApicola = ApicolaFila & { codigo: string; campana_id: string; fecha: string; sala: string; responsable: string; kg: number; estado: string };
export type LoteMielApicola = ApicolaFila & { codigo: string; extraccion_id: string; floracion: string; humedad: number | null; estado_calidad: 'pendiente' | 'liberado' | 'bloqueado' };
export type TamborApicola = ApicolaFila & { codigo: string; lote_id: string; fecha: string; bruto: number; tara: number; neto: number; ubicacion: string; estado: string };
export type OrigenExtraccionApicola = { comercio_id: string; extraccion_id: string; cosecha_id: string; alzas: number };
export type SalaApicola = ApicolaFila & { codigo: string; nombre: string; tipo: string; habilitacion: string; contacto: string; activo: boolean };
export type AnalisisApicola = ApicolaFila & { lote_id: string; fecha: string; muestra: string; laboratorio: string; resultado: string; humedad: number | null; informe: string };
export type ProduccionApicola = { salas: SalaApicola[]; analisis: AnalisisApicola[]; cosechas: CosechaApicola[]; extracciones: ExtraccionApicola[]; lotes: LoteMielApicola[]; tambores: TamborApicola[]; origenes: OrigenExtraccionApicola[]; stock: StockApicola };
export type VistaProduccionApicola = 'cosechas' | 'extracciones' | 'lotes' | 'tambores';
