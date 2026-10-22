import { Venta } from "@/types/venta";

export interface Presupuesto extends Venta {
  origen_taller_automatico?: boolean;
  estado: "pendiente" | "confirmado";
  venta_id?: string | null;
  confirmado_at?: string | null;
  venta_vinculada?: Pick<Venta, "id" | "numero_comprobante" | "fecha_venta" | "total"> | null;
}
