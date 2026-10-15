import type { IncidenteOrigen, IncidenteRegistro } from "@/types/incidente";

export const incidenteModulos: Record<string, string> = {
  inicio: "Inicio", clientes: "Clientes", proveedores: "Proveedores", compras: "Compras",
  productos: "Productos", ventas: "Ventas", presupuestos: "Presupuestos", caja: "Caja",
  "cuenta-corriente": "Cuenta corriente", "gastos-egresos": "Gastos y egresos",
  bancos: "Bancos", tarjetas: "Tarjetas", cheques: "Cheques", comercio: "Mi Comercio",
  seguridad: "Seguridad", afip: "ARCA", whatsapp: "WhatsApp", "mercado-pago": "Mercado Pago",
  "pedidos-online": "Pedidos online", "tienda-online": "Tienda online", extintores: "Extintores",
  restaurante: "Restaurante", distribucion: "Distribución", taller: "Taller", campo: "Campo",
  utilidades: "Utilidades", listados: "Listados", notificaciones: "Notificaciones",
};

// Se conservan solo segmentos conocidos; nunca query strings, hashes o identificadores.
const segmentos = new Set([...Object.keys(incidenteModulos),
  "nuevo", "nueva", "editar", "cuenta-corriente", "ordenes", "ordenes-trabajo", "partes",
  "establecimientos", "lotes", "maquinarias", "operarios", "operadores", "insumos", "tarifas",
  "telemetria", "partes-pendientes", "vehiculos", "tecnicos", "conceptos", "agenda", "pedidos",
  "salon", "cocina", "reservas", "envios", "cobros", "cargas", "remitos", "repartos"]);

export function contextoRutaIncidente(pathname: string) {
  const partes = pathname.split(/[?#]/, 1)[0].split("/").filter(Boolean);
  const modulo = partes[0] || "inicio";
  if (!incidenteModulos[modulo]) return null;
  return { modulo, ruta: `/${partes.map((parte) => segmentos.has(parte) ? parte : ":id").join("/")}`.slice(0, 200) };
}

export function sanitizarMensajeIncidente(value: string) {
  return value
    .replace(/https?:\/\/[^\s<>]+/gi, "[URL]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [oculto]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token]")
    .replace(/\b(?:sb_secret_|sb_publishable_)[A-Za-z0-9_-]+\b/g, "[clave]")
    .replace(/\b(password|contrase[ñn]a|token|authorization|api[_-]?key|secret)\b\s*[:=]\s*\S+/gi, "$1=[oculto]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[id]")
    .replace(/\([^)]*\)\s*=\s*\([^)]*\)/g, "[datos omitidos]")
    .replace(/(["'`])[^"'`\r\n]*\1/g, (texto) =>
      /^"(?:ind_|idx_|productos_)[a-z0-9_]+"$/.test(texto) ? texto : "[dato]")
    .replace(/\b\d{7,}\b/g, "[número]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 1600).trim();
}

type Contexto = { userId: string; comercioId: string; pathname: string };
type Enviar = (registro: IncidenteRegistro) => Promise<unknown>;
let contexto: Contexto | null = null;
let enviar: Enviar | null = null;
const recientes = new Map<string, number>();
let enviados: number[] = [];
let ultimaOperacion = 0;

export const capturarContextoIncidente = () => contexto ? { ...contexto } : null;

export function configurarIncidentes(next: Contexto | null, transport: Enviar | null) {
  if (contexto?.userId !== next?.userId || contexto?.comercioId !== next?.comercioId) {
    recientes.clear();
    enviados = [];
    ultimaOperacion = 0;
  }
  contexto = next;
  enviar = transport;
}

// No guarda payloads, stack traces, tokens ni datos de formularios. Nunca interrumpe la operación.
export function registrarIncidente(error: unknown, origen: IncidenteOrigen, captura = capturarContextoIncidente()) {
  try {
    if (!contexto || !enviar) return;
    if (!captura || captura.userId !== contexto.userId || captura.comercioId !== contexto.comercioId) {
      // También descarta el toast que pueda emitir el callback tardío de la operación.
      if (origen === "consulta" || origen === "guardado") ultimaOperacion = Date.now();
      return;
    }
    const ruta = contextoRutaIncidente(captura.pathname);
    if (!ruta) return;
    const objeto = error && typeof error === "object" ? error as { message?: unknown; code?: unknown } : null;
    const mensaje = sanitizarMensajeIncidente(typeof objeto?.message === "string"
      ? objeto.message : typeof error === "string" ? error : "Error sin detalle disponible");
    if (!mensaje) return;
    const codigo = typeof objeto?.code === "string" && /^[a-z0-9_-]{1,40}$/i.test(objeto.code) ? objeto.code : "";
    const ahora = Date.now();
    // El aviso de pantalla suele repetir el error ya registrado por React Query.
    if (origen === "aviso" && ahora - ultimaOperacion < 1000) return;
    const clave = `${ruta.modulo}|${ruta.ruta}|${codigo}|${mensaje}`;
    if (ahora - (recientes.get(clave) ?? 0) < 5000) return;
    enviados = enviados.filter((time) => ahora - time < 60000);
    if (enviados.length >= 30) return;
    recientes.set(clave, ahora);
    if (recientes.size > 100) recientes.delete(recientes.keys().next().value);
    enviados.push(ahora);
    if (origen === "consulta" || origen === "guardado") ultimaOperacion = ahora;
    void enviar({ p_comercio_id: captura.comercioId, p_modulo: ruta.modulo, p_ruta: ruta.ruta,
      p_origen: origen, p_codigo: codigo, p_mensaje: mensaje }).catch(() => undefined);
  } catch {
    // El monitor tampoco reporta sus propios fallos para evitar ciclos.
  }
}
