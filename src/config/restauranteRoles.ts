export const restauranteRoles = [
  { id: "mozo", nombre: "Mozo / moza", permisos: ["salon"] },
  { id: "repartidor", nombre: "Repartidor", permisos: ["envios"] },
  { id: "cocina", nombre: "Cocina", permisos: ["cocina"] },
  { id: "barra", nombre: "Barra", permisos: ["cocina"] },
] as const;
export type RolRestaurante = typeof restauranteRoles[number]["id"];
