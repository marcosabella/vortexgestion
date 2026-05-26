export interface CuentaCorriente {
  id: string;
  cliente_id: string;
  tipo_movimiento: 'debito' | 'credito';
  monto: number;
  concepto: string;
  venta_id?: string;
  tarjeta_id?: string;
  cuotas?: number;
  fecha_movimiento: string;
  observaciones?: string;
  created_at: string;
  updated_at: string;
  cliente?: {
    nombre: string;
    apellido: string;
    cuit: string;
    telefono?: string;
  };
  venta?: {
    numero_comprobante: string;
  };
  tarjeta?: {
    nombre: string;
  }
}

export interface CuentaCorrienteResumen {
  cliente_id: string;
  cliente_nombre: string;
  cliente_apellido: string;
  cliente_cuit: string;
  cliente_telefono?: string;
  total_debitos: number;
  total_creditos: number;
  saldo_actual: number;
  ultimo_movimiento?: string;
}

export const CONCEPTOS_MOVIMIENTO = [
  { value: 'venta_credito', label: 'Venta a Crédito' },
  { value: 'pago_efectivo', label: 'Pago en Efectivo' },
  { value: 'pago_transferencia', label: 'Pago por Transferencia' },
  { value: 'pago_cheque', label: 'Pago con Cheque' },
  { value: 'pago_cuenta_corriente', label: 'Pago en Cuenta Corriente' },
  { value: 'nota_credito', label: 'Nota de Crédito' },
  { value: 'nota_debito', label: 'Nota de Débito' },
  { value: 'ajuste', label: 'Ajuste' },
  { value: 'pago_tarjeta', label: 'Pago con Tarjeta' },
] as const;
