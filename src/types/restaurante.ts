import type { Json } from "@/integrations/supabase/types";

export type PermisoRestaurante = "pedidos" | "salon" | "cocina" | "despacho" | "envios" | "cobros" | "cierre" | "configuracion";
export type ModalidadRestaurante = "delivery" | "retiro" | "mesa";
export type AccionRestaurante = "config" | "sector" | "mesa" | "carta" | "adicional" | "permisos" | "pedido" | "agregar" | "enviar" | "aceptar" | "preparar" | "listo" | "reconocer" | "impresion" | "servir" | "armar" | "retirar" | "asignar_envio" | "salida" | "entregar" | "incidencia" | "cancelar" | "cancelar_item" | "mover_mesa" | "unir" | "solicitar_cuenta" | "cobro" | "anular_cobro" | "cerrar" | "rendir" | "reserva_guardar" | "reserva_cancelar" | "reserva_ausente" | "reserva_recibir";
export type PedidoRestaurante = {
  id: string; numero: number; modalidad: ModalidadRestaurante; cliente_id: string | null;
  cliente_nombre: string; direccion: string; telefono: string; comensales: number;
  prometido_at: string | null; prioridad: boolean; observaciones: string; instrucciones_envio: string;
  iva_envio: number; costo_envio: number; total: number; cobrado: number; estado: "borrador" | "confirmado" | "en_atencion" | "completado" | "cancelado" | "unido";
  cuenta: "abierta" | "solicitada" | "cerrada"; armado: boolean; version: number;
  venta_id: string | null; unido_a: string | null; creado_por: string; created_at: string;
};
export type ItemRestaurante = {
  id: string; pedido_id: string; carta_id: string; sector_id: string; comanda_id: string | null;
  producto_id: string; descripcion: string; cantidad: number; precio: number; iva: number;
  afecta_stock: boolean; adicionales: { id: string; nombre: string; precio: number }[];
  observaciones: string; estado: "borrador" | "pendiente" | "aceptada" | "preparacion" | "lista" | "entregada" | "cancelada";
  created_at: string;
};
export type ComandaRestaurante = { id: string; numero: number; pedido_id: string; sector_id: string; impresiones: number; aviso_cancelacion: boolean; created_at: string };
export type CobroRestaurante = { id: string; pedido_id: string; monto: number; medio: string; pagador: string; usuario_id: string; recibido_por?: string | null; responsable_id?: string; anulado: boolean; motivo_anulacion: string; rendicion_id: string | null; created_at: string };
export type ResumenRestaurante = {
  admin: boolean; usuario_id: string; permisos: PermisoRestaurante[]; sector_id: string | null;
  config: { modalidades: ModalidadRestaurante[]; impresion: "58mm" | "a4"; iva_envio: number };
  sectores: { id: string; nombre: string; activo: boolean; impresion: "58mm" | "a4" | null }[];
  mesas: { id: string; nombre: string; capacidad: number; activo: boolean }[];
  carta: { id: string; producto_id: string; sector_id: string; afecta_stock: boolean; activo: boolean; descripcion: string; precio: number; iva: number; stock: number }[];
  adicionales: { id: string; nombre: string; precio: number; activo: boolean }[];
  pedidos: PedidoRestaurante[]; items: ItemRestaurante[]; comandas: ComandaRestaurante[];
  cuenta_mesas: { id: string; pedido_id: string; mesa_id: string; activa: boolean }[];
  envios: { id: string; pedido_id: string; repartidor_id: string; estado: "asignado" | "en_camino" | "entregado" | "incidencia" | "cancelado"; observaciones: string; salida_at: string | null; entrega_at: string | null }[];
  cobros: CobroRestaurante[];
  cobro_items: { cobro_id: string; item_id: string; cantidad: number }[];
  rendiciones: { id: string; usuario_id: string; esperado: number; recibido: number; diferencia: number; observaciones: string; created_at: string }[];
  eventos: { id: string; pedido_id: string; accion: string; datos: { motivo?: string; item_id?: string }; usuario_id: string; created_at: string }[];
  usuarios: { id: string; nombre: string; admin: boolean }[];
  asignaciones: { usuario_id: string; permisos: PermisoRestaurante[]; sector_id: string | null }[];
};
export type OperarRestaurante = (accion: AccionRestaurante, datos: Json) => Promise<string | null>;
export type ContextoRestaurante = { data: ResumenRestaurante; operar: OperarRestaurante; trabajando: boolean; errorOperacion?: string | null };
