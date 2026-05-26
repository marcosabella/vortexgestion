export interface Cheque {
  id?: string;
  numero_cheque: string;
  banco_emisor: string;
  monto: number;
  fecha_emision: string;
  fecha_vencimiento: string;
  emisor_nombre: string;
  emisor_cuit?: string;
  cliente_id?: string;
  venta_id?: string;
  cuenta_corriente_id?: string;
  estado: EstadoCheque;
  observaciones?: string;
  created_at?: string;
  updated_at?: string;
  cliente?: {
    nombre: string;
    apellido: string;
    cuit: string;
  };
}

export type EstadoCheque = 'en_cartera' | 'depositado' | 'rechazado' | 'endosado';

export const ESTADOS_CHEQUE: { value: EstadoCheque; label: string }[] = [
  { value: 'en_cartera', label: 'En Cartera' },
  { value: 'depositado', label: 'Depositado' },
  { value: 'rechazado', label: 'Rechazado' },
  { value: 'endosado', label: 'Endosado' },
];
