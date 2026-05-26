export interface TarjetaCredito {
  id: string;
  nombre: string;
  activa: boolean;
  observaciones?: string;
  created_at: string;
  updated_at: string;
  tarjeta_cuotas?: TarjetaCuota[];
}

export interface TarjetaCuota {
  id: string;
  tarjeta_id: string;
  cantidad_cuotas: number;
  porcentaje_recargo: number;
  activa: boolean;
  created_at: string;
  updated_at: string;
  tarjeta?: {
    nombre: string;
  };
}

export interface TarjetaConCuotas extends TarjetaCredito {
  cuotas_disponibles: TarjetaCuota[];
}

export const CUOTAS_PREDEFINIDAS = [
  { cuotas: 1, label: '1 cuota (sin interés)' },
  { cuotas: 3, label: '3 cuotas' },
  { cuotas: 6, label: '6 cuotas' },
  { cuotas: 9, label: '9 cuotas' },
  { cuotas: 12, label: '12 cuotas' },
  { cuotas: 18, label: '18 cuotas' },
  { cuotas: 24, label: '24 cuotas' },
] as const;