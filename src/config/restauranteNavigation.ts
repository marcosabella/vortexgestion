import { ClipboardList, UtensilsCrossed, CookingPot, PackageCheck, Truck, CreditCard, Banknote, Settings } from "lucide-react";
export const restauranteSecciones = [
  { vista: "pedidos", title: "Pedidos", icon: ClipboardList },
  { vista: "salon", title: "Salón y mesas", icon: UtensilsCrossed },
  { vista: "cocina", title: "Cocina y comandas", icon: CookingPot },
  { vista: "despacho", title: "Despacho y retiro", icon: PackageCheck },
  { vista: "envios", title: "Envíos", icon: Truck },
  { vista: "cobros", title: "Cuentas y cobros", icon: CreditCard },
  { vista: "cierre", title: "Cierre y rendición", icon: Banknote },
  { vista: "configuracion", title: "Configuración", icon: Settings },
] as const;
export type VistaRestaurante = typeof restauranteSecciones[number]["vista"];
