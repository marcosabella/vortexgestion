export const CONCEPTO_LICENCIA = "LICENCIA MENSUAL VORTEX";

export interface LicenciaComercio {
  id: string;
  comercio_id: string;
  destinatario_comercio_id: string;
  importe_mensual: number;
  concepto: string;
}

export interface ComprobanteLicencia {
  id: string;
  periodo: string;
  venta_id: string | null;
  importe: number;
  concepto: string;
  numero_comprobante: string | null;
  tipo_comprobante: string | null;
  cae: string | null;
  cae_error: string | null;
}

export interface EstadoLicencia {
  configuracion: LicenciaComercio | null;
  comprobantes: ComprobanteLicencia[];
}
