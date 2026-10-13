export type MesaQr = { mesa_id: string; nombre: string; qr_token: string };
export type AperturaQr = MesaQr & { apertura_token: string };
export type ConsultaMesa = {
  comercio: string; mesa: string;
  carta: { id: string; descripcion: string; precio: number; sector: string }[];
  estado_consulta: "vigente" | "vencida" | "sin_apertura" | "requiere_acceso";
  consumo: null | { total: number; items: { id: string; descripcion: string; cantidad: number; precio: number; subtotal: number; adicionales: string[] }[] };
};
