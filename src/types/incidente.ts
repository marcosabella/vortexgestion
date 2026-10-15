export type IncidenteEstado = "pendiente" | "en_revision" | "resuelto";
export type IncidenteOrigen = "consulta" | "guardado" | "aviso" | "navegador";

export interface Incidente {
  id: string;
  comercio_id: string;
  user_id: string | null;
  creado_en: string;
  modulo: string;
  ruta: string;
  origen: IncidenteOrigen;
  codigo: string | null;
  mensaje: string;
  estado: IncidenteEstado;
  notas: string;
  actualizado_en: string;
  comercio: { nombre_comercio: string } | null;
}

export interface IncidenteRegistro {
  p_comercio_id: string;
  p_modulo: string;
  p_ruta: string;
  p_origen: IncidenteOrigen;
  p_codigo: string;
  p_mensaje: string;
}

export const incidenteEstados: Record<IncidenteEstado, string> = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  resuelto: "Resuelto",
};

export const incidenteOrigenes: Record<IncidenteOrigen, string> = {
  consulta: "Consulta de datos",
  guardado: "Guardado / operación",
  aviso: "Aviso de error",
  navegador: "Navegador",
};
