export interface EmisorFiscal {
  id: string;
  comercio_id: string;
  cuit_emisor: string;
  razon_social: string;
  punto_venta: number;
  ambiente: "homologacion" | "produccion";
  situacion_afip: string;
  domicilio: string;
  localidad: string;
  provincia: string;
  ingresos_brutos: string;
  fecha_inicio_actividad: string | null;
  activo: boolean;
  predeterminado: boolean;
  certificado_vencimiento: string | null;
  tiene_certificados: boolean;
}

export type EmisorFiscalSnapshot = Pick<EmisorFiscal, "id" | "cuit_emisor" | "razon_social" | "punto_venta" | "ambiente" | "situacion_afip" | "domicilio" | "localidad" | "provincia" | "ingresos_brutos" | "fecha_inicio_actividad">;
export type GuardarEmisorFiscal = Omit<EmisorFiscal, "id" | "comercio_id" | "tiene_certificados"> & { id?: string; eliminar_certificados?: boolean; certificado_crt?: string; certificado_key?: string };
