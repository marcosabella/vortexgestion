export interface PagoVenta {
  es_reembolso?: boolean;
  reembolso_confirmado?: number;
  id?: string;
  comercio_id?: string;
  venta_id?: string;
  tipo_pago: TipoPago;
  monto: number;
  banco_id?: string;
  tarjeta_id?: string;
  cuotas?: number;
  recargo_cuotas?: number;
  porcentaje_comision_aplicado?: number;
  comision_snapshot_at?: string | null;
  monto_comision_estimado?: number;
  monto_neto_estimado?: number;
  monto_comision_real?: number | null;
  monto_neto_acreditado?: number | null;
  fecha_acreditacion?: string | null;
  referencia_liquidacion?: string | null;
  observaciones_conciliacion?: string | null;
  estado_conciliacion?: "no_aplica" | "pendiente" | "conciliada" | "con_diferencia" | "anulada";
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
  origen_pedido_online_id?: string | null;
  comprobante_asociado_id?: string | null;
  anulado_at?: string | null;
  emisor_fiscal_id?: string | null;
  emisor_snapshot?: import("@/types/emisorFiscal").EmisorFiscalSnapshot | null;
  punto_venta?: number | null;
  taller_vehiculo?: { patente: string; marca: string; modelo: string; anio: number | null; kilometraje: number } | null;
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
  origen_orden_trabajo?: boolean;
  cae?: string;
  cae_vencimiento?: string;
  cae_solicitado_at?: string;
  cae_error?: string;
  created_at?: string;
  updated_at?: string;
  cliente?: {
    nombre: string;
    apellido: string;
    cuit?: string;
    calle?: string;
    piso?: string;
    departamento?: string;
    numero?: string;
    codigo_postal?: string;
    localidad?: string;
    provincia?: string;
    telefono?: string;
    situacion_afip?: string;
    tipo_persona?: string;
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
  producto_variante_id?: string | null;
  variante?: {
    color?: { nombre: string } | null;
    talle?: { nombre: string } | null;
  } | null;
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

export const getVentaItemCodigo = (item: Pick<VentaItem, "producto" | "codigo_manual">) => {
  const codigo = item.producto?.cod_producto || item.codigo_manual?.trim() || "";

  return codigo.toUpperCase() === "MANUAL" ? "" : codigo;
};

export const getVentaItemDescripcion = (item: Pick<VentaItem, "producto" | "producto_id" | "producto_variante_id" | "variante" | "descripcion_manual">) => {
  const descripcion = item.producto?.descripcion || (item.producto_id ? item.producto?.cod_producto : item.descripcion_manual) || "Item manual";
  const detalle = [item.variante?.color?.nombre, item.variante?.talle?.nombre].filter(Boolean).join(" ");
  return detalle ? `${descripcion} - ${detalle}` : descripcion;
};

export type TipoPago = 'contado' | 'transferencia' | 'tarjeta' | 'cheque' | 'cta_cte' | 'mercado_pago';

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
  | 'recibo_x'
  | 'ticket_fiscal'
  | 'factura_exportacion';

export const TIPOS_PAGO: { value: TipoPago; label: string }[] = [
  { value: 'contado', label: 'Contado' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cta_cte', label: 'Cuenta Corriente' },
  { value: 'mercado_pago', label: 'Mercado Pago' },
];

export const getTipoPagoLabel = (tipo: TipoPago | string) =>
  tipo === 'mercado_pago' ? 'Mercado Pago' : TIPOS_PAGO.find(t => t.value === tipo)?.label || tipo;

export const getVentaTipoPagoLabel = (venta: Pick<Venta, "tipo_pago" | "pagos_venta">) => {
  const pagos = venta.pagos_venta || [];

  if (pagos.length > 1) return "Pago Mixto";
  if (pagos.length === 1) return getTipoPagoLabel(pagos[0].tipo_pago);

  return getTipoPagoLabel(venta.tipo_pago);
};

export const formatNumeroComprobante = (
  value: string | null | undefined,
  puntoVenta?: number | null,
  tipoComprobante?: string | null,
) => {
  const original = String(value || "").trim();
  if (!original) return "";

  const normalized = original.replace(/\s/g, "");
  const formattedMatch = normalized.match(/^(\d{1,4})-(\d{1,8})$/);
  if (tipoComprobante === "recibo_x") {
    const numero = formattedMatch?.[2] || (/^\d{1,8}$/.test(normalized) ? normalized : "");
    return numero ? `000X - ${numero.padStart(8, "0")}` : original;
  }

  if (formattedMatch) {
    return `${formattedMatch[1].padStart(4, "0")} - ${formattedMatch[2].padStart(8, "0")}`;
  }

  if (!/^\d{1,8}$/.test(normalized)) return original;

  const puntoVentaValido = Number.isInteger(puntoVenta) && Number(puntoVenta) > 0
    ? Number(puntoVenta)
    : 1;

  return `${String(puntoVentaValido).padStart(4, "0")} - ${normalized.padStart(8, "0")}`;
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

// Importe comercial neto; los documentos conservan sus importes originales para imprimir/ARCA.
export const getVentaImporteContable = (venta: Pick<Venta, "total" | "pagos_venta" | "origen_pedido_online_id" | "comprobante_asociado_id" | "anulado_at" | "cae">) => {
  if (venta.origen_pedido_online_id && venta.anulado_at) return 0;
  const total = getVentaTotalFinal(venta);
  if (venta.origen_pedido_online_id && venta.comprobante_asociado_id) return venta.cae?.trim() ? -total : 0;
  return total;
};

type VentaConPagos = Pick<Venta, "tipo_pago" | "total" | "pagos_venta" | "banco_id" | "tarjeta_id" | "cuotas" | "recargo_cuotas">;

export const esImputacionCuentaCorriente = (pago: Pick<PagoVenta, "tipo_pago">) =>
  pago.tipo_pago === "cta_cte";

export const esPagoIngresoEfectivo = (pago: Pick<PagoVenta, "tipo_pago">) =>
  !esImputacionCuentaCorriente(pago);

export const getPagosVenta = (venta: VentaConPagos): PagoVenta[] => {
  if (venta.pagos_venta?.length) return venta.pagos_venta;

  return [{
    tipo_pago: venta.tipo_pago,
    monto: getVentaTotalFinal(venta),
    banco_id: venta.banco_id,
    tarjeta_id: venta.tarjeta_id,
    cuotas: venta.cuotas,
    recargo_cuotas: venta.recargo_cuotas || 0,
  }];
};

export const esVentaCuentaCorriente = (venta: VentaConPagos) => {
  const pagos = getPagosVenta(venta);
  return venta.tipo_pago === "cta_cte"
    || (pagos.length > 0 && pagos.every(esImputacionCuentaCorriente));
};

export const getPagosVentaEfectivos = (venta: VentaConPagos) =>
  getPagosVenta(venta).filter(esPagoIngresoEfectivo).map(pago => ({
    ...pago,
    monto: pago.es_reembolso ? -Number(pago.reembolso_confirmado || 0) : Number(pago.monto || 0) - Number(pago.reembolso_confirmado || 0),
  }));

export const getVentaMontoContado = (venta: Pick<Venta, "tipo_pago" | "total" | "pagos_venta">) => {
  if (venta.pagos_venta?.length) {
    return venta.pagos_venta
      .filter((pago) => pago.tipo_pago === "contado")
      .reduce((sum, pago) => sum + Number(pago.monto || 0), 0);
  }

  return venta.tipo_pago === "contado" ? Number(venta.total || 0) : 0;
};

export const TIPOS_COMPROBANTE: { value: TipoComprobante; label: string }[] = [
  { value: 'recibo_x', label: 'Recibo X' },
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
