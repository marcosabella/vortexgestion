export type ReservaRestaurante = {
  id: string; mesa_id: string; cliente_id: string | null; nombre: string; telefono: string;
  comensales: number; inicio: string; fin: string; observaciones: string; motivo: string;
  estado: "confirmada" | "atendida" | "cancelada" | "ausente"; pedido_id: string | null; version: number;
};
