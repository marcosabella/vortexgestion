export type CompraEstado =
  | "borrador"
  | "enviada"
  | "parcial"
  | "recibida"
  | "cancelada";

export type CompraItem = {
  id: string;
  producto_id: string;
  descripcion: string;
  cantidad_solicitada: number;
  cantidad_recibida: number;
  costo_unitario: number;
  porcentaje_iva: number;
  porcentaje_descuento?: number;
  monto_descuento?: number;
  porcentaje_recargo?: number;
  monto_recargo?: number;
  actualizar_costo: boolean;
  producto?: { cod_producto: string; descripcion: string } | null;
};

export type Compra = {
  id: string;
  proveedor_id: string;
  numero: string;
  fecha: string;
  estado: CompraEstado;
  observaciones?: string | null;
  subtotal?: number;
  porcentaje_descuento?: number;
  monto_descuento?: number;
  porcentaje_recargo?: number;
  monto_recargo?: number;
  total?: number;
  modalidad_pago?: string;
  factura_numero?: string | null;
  fecha_vencimiento?: string | null;
  proveedor: {
    nombre?: string;
    apellido?: string;
    razon_social?: string | null;
    cuit?: string;
  } | null;
  compra_items: CompraItem[];
};
