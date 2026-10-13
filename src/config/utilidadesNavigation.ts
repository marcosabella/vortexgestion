import { Banknote, Receipt, ShieldAlert, Users } from "lucide-react";

export const utilidadesSecciones = [
  { vista: "cotizaciones", title: "Cotizaciones de divisas", icon: Banknote },
  { vista: "deudores", title: "Central de Deudores", icon: Users },
  { vista: "cheques-rechazados", title: "Cheques rechazados", icon: Receipt },
  { vista: "cheques-denunciados", title: "Cheques denunciados", icon: ShieldAlert },
] as const;
export type VistaUtilidades = typeof utilidadesSecciones[number]["vista"];
