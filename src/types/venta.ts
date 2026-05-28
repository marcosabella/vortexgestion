export interface PagoVenta {
  id?: string;
  comercio_id?: string;
  venta_id?: string;
  tipo_pago: TipoPago;
  monto: number;
  banco_id?: string;
  tarjeta_id?: string;
  cuotas?: number;
  recargo_cuotas?: number;
  cheque_id?: string;
  created_at?: string;
  updated_at?: string;
  banco?: {
    nombre_banco: string;
  };
  tarjeta?: {
    nombre: string;
  };
  cheque?: {
    numero_cheque: string;
    monto: number;
    banco_emisor: string;
  };
}

export interface Venta {
  id?: string;
  comercio_id?: string;
  numero_comprobante: string;
  fecha_venta: string;
  tipo_pago: TipoPago;
  tipo_comprobante: TipoComprobante;
  cliente_id?: string;
  cliente_nombre: string;
  banco_id?: string;
  tarjeta_id?: string;
  cuotas?: number;
  recargo_cuotas?: number;
  porcentaje_descuento?: number;
  monto_descuento?: number;
  porcentaje_recargo?: number;
  monto_recargo?: number;
  subtotal: number;
  total_iva: number;
  total: number;
  observaciones?: string;
  cae?: string;
  cae_vencimiento?: string;
  cae_solicitado_at?: string;
  cae_error?: string;
  created_at?: string;
  updated_at?: string;
  cliente?: {
    nombre: string;
    apellido: string;
    telefono?: string;
  };
  banco?: {
    nombre_banco: string;
    numero_cuenta: string;
  };
  tarjeta?: {
    nombre: string;
  }
  venta_items?: VentaItem[];
  pagos_venta?: PagoVenta[];
}

export interface VentaItem {
  id?: string;
  comercio_id?: string;
  venta_id?: string;
  producto_id?: string | null;
  descripcion_manual?: string | null;
  codigo_manual?: string | null;
  cantidad: number;
  precio_unitario: number;
  porcentaje_iva: number;
  porcentaje_descuento?: number;
  monto_descuento?: number;
  porcentaje_recargo?: number;
  monto_recargo?: number;
  monto_iva: number;
  subtotal: number;
  total: number;
  created_at?: string;
  updated_at?: string;
  producto?: {
    cod_producto: string;
    descripcion: string;
    precio_venta: number;
    porcentaje_iva: number;
  };
}

export type TipoPago = 'contado' | 'transferencia' | 'tarjeta' | 'cheque' | 'cta_cte';

export type TipoComprobante = 
  | 'factura_a'
  | 'factura_b'
  | 'factura_c'
  | 'nota_credito_a'
  | 'nota_credito_b'
  | 'nota_credito_c'
  | 'nota_debito_a'
  | 'nota_debito_b'
  | 'nota_debito_c'
  | 'recibo_a'
  | 'recibo_b'
  | 'recibo_c'
  | 'ticket_fiscal'
  | 'factura_exportacion';

export const TIPOS_PAGO: { value: TipoPago; label: string }[] = [
  { value: 'contado', label: 'Contado' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cta_cte', label: 'Cuenta Corriente' },
];

export const getTipoPagoLabel = (tipo: TipoPago | string) =>
  TIPOS_PAGO.find(t => t.value === tipo)?.label || tipo;

export const getVentaTipoPagoLabel = (venta: Pick<Venta, "tipo_pago" | "pagos_venta">) => {
  const pagos = venta.pagos_venta || [];

  if (pagos.length > 1) return "Pago Mixto";
  if (pagos.length === 1) return getTipoPagoLabel(pagos[0].tipo_pago);

  return getTipoPagoLabel(venta.tipo_pago);
};

export const getPagoMontoBase = (pago: Pick<PagoVenta, "monto" | "recargo_cuotas">) =>
  Math.max(Number(pago.monto || 0) - Number(pago.recargo_cuotas || 0), 0);

export const getTotalPagosBase = (pagos: Pick<PagoVenta, "monto" | "recargo_cuotas">[]) =>
  pagos.reduce((sum, pago) => sum + getPagoMontoBase(pago), 0);

export const getTotalPagos = (pagos: Pick<PagoVenta, "monto">[]) =>
  pagos.reduce((sum, pago) => sum + Number(pago.monto || 0), 0);

export const getTotalRecargoPagos = (pagos: Pick<PagoVenta, "recargo_cuotas">[] = []) =>
  pagos.reduce((sum, pago) => sum + Number(pago.recargo_cuotas || 0), 0);

export const getVentaTotalFinal = (venta: Pick<Venta, "total" | "pagos_venta">) => {
  if (venta.pagos_venta?.length) return getTotalPagos(venta.pagos_venta);

  return Number(venta.total || 0);
};

export const getVentaMontoContado = (venta: Pick<Venta, "tipo_pago" | "total" | "pagos_venta">) => {
  if (venta.pagos_venta?.length) {
    return venta.pagos_venta
      .filter((pago) => pago.tipo_pago === "contado")
      .reduce((sum, pago) => sum + Number(pago.monto || 0), 0);
  }

  return venta.tipo_pago === "contado" ? Number(venta.total || 0) : 0;
};

export const TIPOS_COMPROBANTE: { value: TipoComprobante; label: string }[] = [
  { value: 'ticket_fiscal', label: 'Ticket Fiscal' },
  { value: 'factura_a', label: 'Factura A' },
  { value: 'factura_b', label: 'Factura B' },
  { value: 'factura_c', label: 'Factura C' },
  { value: 'nota_credito_a', label: 'Nota de Crédito A' },
  { value: 'nota_credito_b', label: 'Nota de Crédito B' },
  { value: 'nota_credito_c', label: 'Nota de Crédito C' },
  { value: 'nota_debito_a', label: 'Nota de Débito A' },
  { value: 'nota_debito_b', label: 'Nota de Débito B' },
  { value: 'nota_debito_c', label: 'Nota de Débito C' },
  { value: 'recibo_a', label: 'Recibo A' },
  { value: 'recibo_b', label: 'Recibo B' },
  { value: 'recibo_c', label: 'Recibo C' },
  { value: 'factura_exportacion', label: 'Factura de Exportación' },
];

const COMPROBANTES_CON_IVA_DISCRIMINADO: TipoComprobante[] = [
  'factura_a',
  'nota_credito_a',
  'nota_debito_a',
];

export const discriminaIvaEnComprobante = (tipo: TipoComprobante | string) =>
  COMPROBANTES_CON_IVA_DISCRIMINADO.includes(tipo as TipoComprobante);
