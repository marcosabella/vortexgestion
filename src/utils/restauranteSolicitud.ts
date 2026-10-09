import type { Json } from "@/integrations/supabase/types";
import type { AccionRestaurante, ResumenRestaurante } from "@/types/restaurante";

export function restaurantePedidoIntento(datos: Json) {
  return datos && typeof datos === "object" && !Array.isArray(datos) && typeof datos.pedido_id === "string" ? datos.pedido_id : null;
}

// Sólo estados de cocina: una lectura posterior confirma que el avance ya ocurrió.
// Los cobros, cierres y demás acciones siempre conservan su comprobación por clave.
export function restauranteCocinaIntentoResuelto(data: ResumenRestaurante, intento: { accion: AccionRestaurante; datos: Json }) {
  const etapas: Partial<Record<AccionRestaurante, string[]>> = {
    aceptar: ["aceptada", "preparacion", "lista", "entregada", "cancelada"],
    preparar: ["preparacion", "lista", "entregada", "cancelada"],
    listo: ["lista", "entregada", "cancelada"],
  };
  const estados = etapas[intento.accion]; const datos = intento.datos;
  if (!estados || !datos || typeof datos !== "object" || Array.isArray(datos)) return false;
  const pedido = data.pedidos.find(p => p.id === restaurantePedidoIntento(datos));
  if (!pedido || typeof datos.version !== "number" || !Number.isInteger(datos.version) || pedido.version <= datos.version) return false;
  const items = data.items.filter(i => i.pedido_id === pedido.id && (typeof datos.item_id === "string"
    ? i.id === datos.item_id : typeof datos.comanda_id === "string" && i.comanda_id === datos.comanda_id));
  return items.length > 0 && items.every(i => estados.includes(i.estado));
}

// Si se pierde la respuesta, el intento conserva su clave para comprobarlo sin duplicarlo.
export async function restauranteSolicitud<T>(consulta: (signal: AbortSignal) => PromiseLike<T>, limiteMs = 15000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("El servidor no respondió a tiempo. Verificá la conexión y volvé a comprobar el resultado."));
      controller.abort();
    }, limiteMs);
  });
  try { return await Promise.race([consulta(controller.signal), limite]); }
  finally { clearTimeout(timer); }
}
