import type { Database, Json } from '@/integrations/supabase/types';

export const ESTADOS_TRANSPORTE = { solicitado: 'Solicitado', asignado: 'Asignado', en_camino: 'En camino', en_lugar: 'En el lugar', trasladando: 'Trasladando', finalizado: 'Finalizado', cancelado: 'Cancelado', no_realizado: 'No realizado' } as const;
export type EstadoTransporte = keyof typeof ESTADOS_TRANSPORTE;
export const TIPOS_TRANSPORTE = { auxilio: 'Auxilio mecánico / remolque', maquinaria: 'Transporte de maquinaria agrícola' } as const;
export type TransporteUnidad = { id: string; comercio_id: string; nombre: string; patente: string; tipo: string; marca: string; modelo: string; kilometraje: number; horas: number; estado: string; activo: boolean; observaciones: string };
export type TransporteChofer = { id: string; comercio_id: string; nombre: string; telefono: string; user_id: string | null; activo: boolean };
export type TransporteTarifa = { id: string; comercio_id: string; nombre: string; cliente_id: string | null; tipo: string; base: number; km_incluidos: number; precio_km: number; precio_hora: number; iva: number; vigente_desde: string; vigente_hasta: string | null; activo: boolean };
export type TransporteServicio = {
  id: string; comercio_id: string; numero: number; tipo: keyof typeof TIPOS_TRANSPORTE; cliente_id: string;
  unidad_id: string | null; equipo_id: string | null; chofer_id: string | null; tarifa_id: string | null;
  estado: EstadoTransporte; presentacion: string; programado_at: string | null; origen: string; destino: string;
  solicitante: string; expediente: string; contacto: string; telefono: string; carga: string; detalles: Record<string, string>;
  km_salida: number | null; km_llegada: number | null; km_aproximacion: number; km_traslado: number; km_retorno: number;
  km_facturables: number; horas_espera: number; adicionales: number; precio_manual: number | null;
  tarifa_snapshot: TransporteTarifa | null; total: number; iva: number; observaciones: string; motivo_cierre: string;
  presupuesto_id: string | null; venta_id: string | null; version: number; created_at: string;
};
export type TransporteLectura = { id: string; comercio_id: string; unidad_id: string; servicio_id: string | null; kilometraje: number; horas: number; motivo: string; created_at: string; user_id: string };
export type TransportePlan = { id: string; comercio_id: string; unidad_id: string; nombre: string; intervalo_km: number | null; intervalo_dias: number | null; intervalo_horas: number | null; proximo_km: number | null; proxima_fecha: string | null; proximas_horas: number | null; aviso_km: number; aviso_dias: number; aviso_horas: number; activo: boolean };
export type TransporteMantenimiento = { id: string; comercio_id: string; unidad_id: string; plan_id: string | null; fecha: string; programado_para: string | null; estado: string; tareas: string; kilometraje: number; horas: number; proveedor_id: string | null; presupuesto: number; gasto_id: string | null; created_at: string };
export type TransporteGasto = { id: string; comercio_id: string; unidad_id: string; servicio_id: string | null; gasto_id: string; litros: number | null; kilometraje: number | null; gasto?: { fecha: string; categoria: string; concepto: string; monto: number; estado: string; medio_pago: string } };
export type TransporteEvento = { id: string; comercio_id: string; servicio_id: string; estado: string; detalle: string; user_id: string; created_at: string };
export type TransporteAdjunto = { id: string; comercio_id: string; servicio_id: string; ruta: string; nombre: string; created_at: string };
export type TransporteDatos = { admin: boolean; permisos?: { crear: boolean; editar: boolean; operar: boolean; facturar: boolean }; unidades: TransporteUnidad[]; choferes: TransporteChofer[]; tarifas: TransporteTarifa[]; servicios: TransporteServicio[]; planes: TransportePlan[]; mantenimientos: TransporteMantenimiento[]; lecturas: TransporteLectura[]; gastos: TransporteGasto[]; eventos: TransporteEvento[]; adjuntos: TransporteAdjunto[]; clientes: { id: string; nombre: string; apellido: string }[]; proveedores: { id: string; nombre: string; apellido: string; razon_social: string }[]; usuarios: { user_id: string; rol: string; nombre?: string; email?: string }[] };
type Rpc<A, R> = { Args: A; Returns: R };
export type TransporteDatabase = Omit<Database, 'public'> & { public: Omit<Database['public'], 'Functions'> & { Functions: Database['public']['Functions'] & {
  transporte_datos: Rpc<{ p_comercio_id: string }, Json>;
  transporte_operar: Rpc<{ p_comercio_id: string; p_accion: string; p_id: string | null; p_version: number | null; p_datos: Json }, string>;
} } };
