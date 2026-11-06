export type ProgramaReferidos = {
  aviso_estado?: "activo" | "archivado" | "eliminado";
  mensaje?: string | null; condiciones?: string | null;
  campana_id: string; titulo: string; codigo: string; modal_visto_at: string | null;
  notificacion_leida_at: string | null; pendientes: number; meses_bonificados: number;
};
export type EstadoReferido = "consulta" | "contactado" | "pago_confirmado" | "bonificado" | "descartado";
export type Referido = {
  id: string; comercio_id: string; campana_id: string; estado: EstadoReferido;
  nuevo_comercio_id: string | null; evidencia_pago: string | null; creado_en: string;
  bonificado_at: string | null; vigencia_anterior: string | null; vigencia_nueva: string | null;
  consulta: { nombre: string; negocio: string; email: string; telefono: string };
  participacion: { codigo: string; comercio: { nombre_comercio: string } };
};
export const estadosReferido: Record<EstadoReferido, string> = {
  consulta: "Consulta recibida", contactado: "En contacto", pago_confirmado: "Primer pago confirmado", bonificado: "Mes bonificado", descartado: "Descartado",
};
