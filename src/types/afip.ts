export interface AfipConfig {
  id?: string;
  punto_venta: number;
  cuit_emisor: string;
  ambiente: 'homologacion' | 'produccion';
  certificado_crt?: string;
  certificado_key?: string;
  nombre_certificado_crt?: string;
  nombre_certificado_key?: string;
  activo: boolean;
  created_at?: string;
  updated_at?: string;
}

export type AfipConfigInsert = Omit<AfipConfig, 'id' | 'created_at' | 'updated_at'>;
export type AfipConfigUpdate = Partial<AfipConfigInsert>;

export const AMBIENTES_AFIP = [
  { value: 'homologacion', label: 'Homologación (Testing)' },
  { value: 'produccion', label: 'Producción' },
] as const;

export const TIPOS_COMPROBANTE = [
  { value: 'factura_a', label: 'Factura A' },
  { value: 'factura_b', label: 'Factura B' },
  { value: 'factura_c', label: 'Factura C' },
  { value: 'nota_credito_a', label: 'Nota de Crédito A' },
  { value: 'nota_credito_b', label: 'Nota de Crédito B' },
  { value: 'nota_credito_c', label: 'Nota de Crédito C' },
  { value: 'nota_debito_a', label: 'Nota de Débito A' },
  { value: 'nota_debito_b', label: 'Nota de Débito B' },
  { value: 'nota_debito_c', label: 'Nota de Débito C' },
] as const;
