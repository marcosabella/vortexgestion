export type PedidoDistribucion = {
  version: number;
  estado_operativo?: string;
  id: string;
  numero: number;
  cliente_id: string;
  cliente_nombre: string;
  direccion: string;
  telefono: string;
  fecha: string;
  observaciones: string;
  estado: "pendiente" | "preparacion" | "listo" | "cancelado";
};
export type ItemDistribucion = {
  id: string;
  pedido_id: string;
  producto_id: string;
  descripcion: string;
  cantidad: number;
  precio: number;
  iva: number;
};
export type RepartoDistribucion = {
  ruta_version?: number;
  ruta_origen?: string;
  ruta_latitud?: number | null;
  ruta_longitud?: number | null;
  ruta_regreso?: boolean;
  circuito_remitos?: boolean;
  papeles_preparados?: boolean;
  id: string;
  nombre: string;
  fecha: string;
  repartidor_id: string;
  vehiculo: string;
  estado:
    | "planificado"
    | "en_reparto"
    | "pendiente_rendicion"
    | "rendido"
    | "cancelado";
  efectivo_rendido: number | null;
  diferencia: number | null;
  observaciones: string;
};
export type ParadaDistribucion = {
  latitud?: number | null;
  longitud?: number | null;
  direccion_mapa?: string;
  id: string;
  reparto_id: string;
  pedido_id: string;
  orden: number;
  venta_id: string | null;
};
export type CargaDistribucion = {
  id: string;
  parada_id: string;
  item_id: string;
  cargada: number;
  entregada: number;
  devuelta: number;
};
export type EventoDistribucion = {
  id: string;
  reparto_id: string;
  parada_id: string | null;
  tipo: string;
  created_at: string;
  datos: {
    monto?: number;
    medio?: string;
    cantidad?: number;
    motivo?: string;
    observaciones?: string;
    carga_id?: string;
    evento_id?: string;
  };
};
export type ResumenDistribucion = {
  remitos?: RemitoDistribucion[];
  remitos_autorizacion?: {
    punto_venta: number;
    cai: string;
    vencimiento: string;
    desde: number;
    hasta: number;
    ultimo: number;
  } | null;
  remito_items?: RemitoItemDistribucion[];
  admin: boolean;
  pedidos: PedidoDistribucion[];
  items: ItemDistribucion[];
  repartos: RepartoDistribucion[];
  paradas: ParadaDistribucion[];
  cargas: CargaDistribucion[];
  eventos: EventoDistribucion[];
  usuarios: { id: string; nombre: string }[];
  saldos: { venta_id: string; saldo: number }[];
};
export type AccionDistribucion =
  | "pedido"
  | "preparar"
  | "listo"
  | "cancelar_pedido"
  | "reparto"
  | "asignar"
  | "quitar"
  | "despachar"
  | "entrega"
  | "devolucion"
  | "cobro"
  | "finalizar"
  | "cancelar_reparto"
  | "rendir"
  | "devolucion_rendida"
  | "anular_cobro"
  | "reabrir"
  | "emitir_remitos"
  | "confirmar_papeles"
  | "confirmar_remito"
  | "foto_remito"
  | "facturar_remito"
  | "devolver_remito";

export type RemitoDistribucion = {
  cliente_cuit: string | null;
  punto_venta: number | null;
  numero_autorizado: number | null;
  cai: string | null;
  cai_vencimiento: string | null;
  id: string;
  numero: number;
  comercio_id: string;
  reparto_id: string;
  parada_id: string;
  cliente_id: string;
  cliente_nombre: string;
  direccion: string;
  telefono: string;
  fecha: string;
  estado: "emitido" | "confirmado" | "anulado";
  recibido_por: string | null;
  firma_papel: boolean;
  motivo: string;
  confirmado_at: string | null;
  foto_path: string | null;
  venta_id: string | null;
};
export type RemitoItemDistribucion = {
  id: string;
  remito_id: string;
  carga_id: string;
  producto_id: string;
  descripcion: string;
  codigo: string;
  cantidad: number;
  recibida: number;
  devuelta: number;
  precio: number;
  iva: number;
};
