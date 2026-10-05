import type { Database, Json } from '@/integrations/supabase/types';

export const ESTADOS_TALLER = {
  recibido: 'Recibido', diagnostico: 'Diagnóstico', presupuestado: 'Presupuestado',
  aprobado: 'Aprobado', en_reparacion: 'En reparación', listo: 'Listo para entregar',
  entregado: 'Entregado', cancelado: 'Cancelado',
} as const;
export type EstadoTaller = keyof typeof ESTADOS_TALLER;
export const TRANSICIONES_TALLER: Partial<Record<EstadoTaller, EstadoTaller>> = {
  recibido: 'diagnostico', presupuestado: 'aprobado', aprobado: 'en_reparacion', en_reparacion: 'listo', listo: 'entregado',
};
export type TallerVehiculo = {
  id: string; comercio_id: string; cliente_id: string; patente: string; marca: string; modelo: string;
  anio: number | null; vin: string | null; kilometraje: number; observaciones: string; activo: boolean;
  created_at: string; updated_at: string;
  marca_id: string | null; modelo_id: string | null;
};
export type TallerMarca = { id: string; comercio_id: string; nombre: string; clave: string; created_at: string };
export type TallerModelo = TallerMarca & { marca_id: string };
export type TallerTecnico = {
  id: string; comercio_id: string; nombre: string; telefono: string; especialidad: string; activo: boolean;
  created_at: string; updated_at: string;
};
export type TallerOrden = {
  id: string; comercio_id: string; numero: number; vehiculo_id: string; cliente_id: string; tecnico_id: string | null;
  kilometraje: number; motivo: string; recepcion: string; diagnostico: string; trabajo_realizado: string; observaciones: string;
  fecha_ingreso: string; turno: string | null; entrega_estimada: string | null; proximo_service: string | null;
  proximo_service_km: number | null; estado: EstadoTaller; aprobacion_cliente: string | null; motivo_cancelacion: string | null;
  presupuesto_id: string | null; venta_id: string | null; entregado_at: string | null; version: number;
  created_at: string; updated_at: string;
};
export type TallerItem = {
  id: string; comercio_id: string; orden_id: string; tipo: 'repuesto' | 'mano_obra' | 'servicio_externo';
  producto_id: string | null; producto_variante_id: string | null; proveedor_id: string | null; descripcion: string;
  cantidad: number; precio_unitario: number; porcentaje_iva: number; costo_unitario: number; total: number; created_at: string;
};
export type TallerEvento = {
  id: string; comercio_id: string; orden_id: string; estado_anterior: string | null; estado_nuevo: string;
  detalle: string; user_id: string | null; created_at: string;
};
type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };
type Rpc<Args, Returns> = { Args: Args; Returns: Returns };
// Extensión tipada local del esquema; evita `any` mientras la migración está pendiente.
export type TallerDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables' | 'Functions'> & {
    Tables: Database['public']['Tables'] & {
      taller_vehiculos: Table<TallerVehiculo>; taller_tecnicos: Table<TallerTecnico>;
      taller_marcas: Table<TallerMarca>; taller_modelos: Table<TallerModelo>;
      taller_ordenes: Table<TallerOrden>; taller_orden_items: Table<TallerItem>; taller_orden_eventos: Table<TallerEvento>;
      producto_variantes: Table<{ id: string; producto_id: string; stock: number; color_id: string | null; talle_id: string | null }>;
      producto_colores: Table<{ id: string; comercio_id: string; nombre: string }>;
      producto_talles: Table<{ id: string; comercio_id: string; nombre: string }>;
    };
    Functions: Database['public']['Functions'] & {
      taller_guardar_catalogo: Rpc<{ p_comercio_id: string; p_tipo: string; p_id: string | null; p_datos: Json }, string>;
      taller_guardar_marca_modelo: Rpc<{ p_comercio_id: string; p_tipo: string; p_nombre: string; p_marca_id: string | null }, string>;
      taller_guardar_orden: Rpc<{ p_comercio_id: string; p_id: string | null; p_version: number | null; p_datos: Json }, string>;
      taller_guardar_item: Rpc<{ p_orden_id: string; p_version: number; p_id: string | null; p_datos: Json; p_eliminar: boolean }, string>;
      taller_cambiar_estado: Rpc<{ p_orden_id: string; p_version: number; p_estado: string; p_detalle: string }, undefined>;
      taller_generar_presupuesto: Rpc<{ p_orden_id: string; p_version: number }, string>;
      taller_facturar_orden: Rpc<{ p_orden_id: string; p_tipo: Database['public']['Enums']['tipo_comprobante']; p_pagos: Json }, string>;
    };
  };
};
