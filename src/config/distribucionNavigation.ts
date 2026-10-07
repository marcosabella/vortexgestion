import { ClipboardList, Package, CalendarDays, Truck, Banknote, FileText } from "lucide-react";

export const distribucionSecciones = [
  { vista: "pedidos", title: "Pedidos", url: "/distribucion/pedidos", icon: ClipboardList },
  { vista: "preparacion", title: "Preparación", url: "/distribucion/preparacion", icon: Package },
  { vista: "planificacion", title: "Planificación y salida", url: "/distribucion/planificacion", icon: CalendarDays },
  { vista: "repartos", title: "Repartos en curso", url: "/distribucion/repartos", icon: Truck },
  { vista: "rendiciones", title: "Cierre y rendición", url: "/distribucion/rendiciones", icon: Banknote },
  { vista: "facturacion", title: "Facturación", url: "/distribucion/facturacion", icon: FileText },
] as const;

export type VistaDistribucion = typeof distribucionSecciones[number]["vista"];
