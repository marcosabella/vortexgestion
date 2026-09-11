export type MedioPagoGasto = "efectivo" | "transferencia" | "tarjeta" | "mercado_pago" | "cuenta_corriente" | "otro";
export type EstadoGasto = "pendiente" | "pagado";

export interface GastoEgreso {
  id: string;
  fecha: string;
  categoria: string;
  concepto: string;
  descripcion?: string | null;
  proveedor_id?: string | null;
  monto: number;
  medio_pago: MedioPagoGasto;
  estado: EstadoGasto;
  caja_id?: string | null;
  numero_comprobante?: string | null;
  observaciones?: string | null;
  proveedor?: { nombre?: string; apellido?: string | null; razon_social?: string | null } | null;
}

export const CATEGORIAS_GASTO = ["Alquiler", "Servicios", "Sueldos", "Fletes", "Compras", "Impuestos", "Mantenimiento", "Otros"];
export const MEDIOS_PAGO_GASTO: Array<{ value: MedioPagoGasto; label: string }> = [
  { value: "efectivo", label: "Efectivo" }, { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" }, { value: "mercado_pago", label: "Mercado Pago" },
  { value: "cuenta_corriente", label: "Cuenta corriente" }, { value: "otro", label: "Otro" },
];
