export interface Banco {
  id: string;
  nombre_banco: string;
  sucursal: string;
  numero_cuenta: string;
  cbu: string;
  tipo_cuenta: TipoCuentaBancaria;
  observaciones?: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export type TipoCuentaBancaria = 
  | 'CA_PESOS'      // Cuenta de Ahorro en Pesos
  | 'CA_USD'        // Cuenta de Ahorro en USD
  | 'CC_PESOS'      // Cuenta Corriente en Pesos
  | 'CC_USD'        // Cuenta Corriente en USD
  | 'CAJA_AHORRO'   // Caja de Ahorro
  | 'CUENTA_SUELDO'; // Cuenta Sueldo

export const TIPOS_CUENTA_BANCARIA = [
  { value: 'CA_PESOS', label: 'Cuenta de Ahorro - Pesos' },
  { value: 'CA_USD', label: 'Cuenta de Ahorro - USD' },
  { value: 'CC_PESOS', label: 'Cuenta Corriente - Pesos' },
  { value: 'CC_USD', label: 'Cuenta Corriente - USD' },
  { value: 'CAJA_AHORRO', label: 'Caja de Ahorro' },
  { value: 'CUENTA_SUELDO', label: 'Cuenta Sueldo' },
] as const;