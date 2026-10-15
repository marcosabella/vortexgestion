import type { Comercio } from "@/types/comercio";
import type { PagoClienteBorrador } from "@/hooks/useCuentaCorriente";

export interface ReciboPagoCliente {
  id: string;
  comercio_id: string;
  cliente_id: string;
  numero: number;
  solicitud_id: string;
  fecha: string;
  creado_en: string;
  importe: number;
  moneda: string;
  saldo_anterior: number;
  saldo_posterior: number;
  cliente_snapshot: { nombre: string; cuit?: string; telefono?: string };
  comercio_snapshot: Comercio;
  pagos: PagoClienteBorrador[];
  documentos: { numero: string; importe: number }[];
  movimiento_ids: string[];
  observaciones?: string;
  anulado_en?: string | null;
  historico?: {
    movimiento_id: string;
    generado_en: string;
    saldo_a_fecha: string;
  };
}
