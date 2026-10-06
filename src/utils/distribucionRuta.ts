import type { Comercio } from "@/types/comercio";
import type { ParadaDistribucion, RepartoDistribucion, ResumenDistribucion } from "@/types/distribucion";
import { getFacturaPrintStyles } from "@/utils/facturaPrint";

export type PuntoRuta = { latitud: number; longitud: number };
export type DireccionGeocodificada = { punto: PuntoRuta; calle?: string; numero?: string; localidad?: string; provincia?: string; pais?: string };
export type VisitaRuta = { id: string; cliente: string; direccion: string; telefono: string; pedido: number; punto: PuntoRuta | null };
export const puntoValido = (lat: unknown, lng: unknown): PuntoRuta | null =>
  typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { latitud: lat, longitud: lng } : null;
export const domicilioComercio = (comercio: Comercio) => [comercio.calle, comercio.numero, comercio.localidad, comercio.provincia]
  .map(valor => valor?.trim() || "").filter(valor => /[\p{L}\p{N}]/u.test(valor)).join(" ");
export function visitasRuta(data: ResumenDistribucion, reparto: RepartoDistribucion): VisitaRuta[] {
  return data.paradas.filter(p => p.reparto_id === reparto.id).sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id)).map(p => {
    const pedido = data.pedidos.find(x => x.id === p.pedido_id);
    return { id: p.id, cliente: pedido?.cliente_nombre || "Cliente", direccion: pedido?.direccion || "", telefono: pedido?.telefono || "", pedido: pedido?.numero || 0,
      punto: p.direccion_mapa === pedido?.direccion ? puntoValido(p.latitud, p.longitud) : null };
  });
}
function distancia(a: PuntoRuta, b: PuntoRuta) {
  const rad = Math.PI / 180, dLat = (b.latitud - a.latitud) * rad, dLng = (b.longitud - a.longitud) * rad;
  return Math.sin(dLat / 2) ** 2 + Math.cos(a.latitud * rad) * Math.cos(b.latitud * rad) * Math.sin(dLng / 2) ** 2;
}
// Sugerencia geográfica, no optimización de tránsito ni ventanas horarias.
export function sugerirOrden(visitas: VisitaRuta[], origen: PuntoRuta): VisitaRuta[] {
  if (visitas.some(v => !v.punto)) throw new Error("Ubicá todas las direcciones antes de sugerir el orden.");
  const pendientes = [...visitas], resultado: VisitaRuta[] = [];
  let actual = origen;
  while (pendientes.length) {
    let indice = 0;
    for (let i = 1; i < pendientes.length; i++) if (distancia(actual, pendientes[i].punto!) < distancia(actual, pendientes[indice].punto!)) indice = i;
    const [visita] = pendientes.splice(indice, 1); resultado.push(visita); actual = visita.punto!;
  }
  return resultado;
}
const normalizarDireccion = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(av|avda)\.?\b/g, "avenida").replace(/\bgral\.?\b/g, "general").replace(/[^a-z0-9]+/g, " ").trim();
export function ubicacionAutomatica(direccion: string, lugares: DireccionGeocodificada[]): PuntoRuta | null {
  const texto = ` ${normalizarDireccion(direccion)} `;
  const coinciden = lugares.filter(l => {
    if (!l.calle || !l.numero || !l.localidad || (l.pais && l.pais.toLowerCase() !== "ar")) return false;
    const calle = normalizarDireccion(l.calle).split(" ").filter(t => !["calle", "avenida", "de", "del", "la", "el"].includes(t));
    return calle.length > 0 && calle.every(t => texto.includes(` ${t} `)) && texto.includes(` ${normalizarDireccion(l.numero)} `) && texto.includes(` ${normalizarDireccion(l.localidad)} `);
  });
  if (!coinciden.length) return null;
  const punto = coinciden[0].punto;
  // Dos coincidencias en lugares distintos requieren selección, no se adivina.
  return coinciden.every(l => distancia(punto, l.punto) < 0.0000000001) ? punto : null;
}
export function ordenarPorTiempos(visitas: VisitaRuta[], matriz: (number | null)[][], regreso: boolean): VisitaRuta[] {
  const n = visitas.length, costo = (a: number, b: number) => matriz[a]?.[b] ?? Infinity;
  if (matriz.length !== n + 1 || matriz.some(f => f.length !== n + 1 || f.some(v => v !== null && (!Number.isFinite(v) || v < 0)))) throw new Error("No se recibieron tiempos válidos para todos los clientes.");
  if (!n) return [];
  let orden: number[] = [];
  if (n <= 12) {
    const total = 1 << n, dp = new Float64Array(total * n).fill(Infinity), anterior = new Int16Array(total * n).fill(-1);
    for (let j = 0; j < n; j++) dp[(1 << j) * n + j] = costo(0, j + 1);
    for (let mascara = 1; mascara < total; mascara++) for (let j = 0; j < n; j++) {
      const previo = dp[mascara * n + j]; if (!Number.isFinite(previo)) continue;
      for (let k = 0; k < n; k++) if (!(mascara & (1 << k))) {
        const nueva = mascara | (1 << k), valor = previo + costo(j + 1, k + 1), indice = nueva * n + k;
        if (valor < dp[indice]) { dp[indice] = valor; anterior[indice] = j; }
      }
    }
    let mejor = Infinity, ultimo = -1;
    for (let j = 0; j < n; j++) { const valor = dp[(total - 1) * n + j] + (regreso ? costo(j + 1, 0) : 0); if (valor < mejor) { mejor = valor; ultimo = j; } }
    if (ultimo < 0) throw new Error("No existe un circuito por calles que conecte todas las ubicaciones. Revisá los puntos del mapa.");
    let mascara = total - 1;
    while (ultimo >= 0) { orden.unshift(ultimo); const previo = anterior[mascara * n + ultimo]; mascara ^= 1 << ultimo; ultimo = previo; }
  } else {
    const evaluar = (o: number[]) => o.reduce((sum, j, i) => sum + costo(i ? o[i - 1] + 1 : 0, j + 1), 0) + (regreso ? costo(o.at(-1)! + 1, 0) : 0);
    let mejor = Infinity;
    for (let primero = 0; primero < n; primero++) {
      const propuesta = [primero], pendientes = new Set(Array.from({ length: n }, (_, i) => i)); pendientes.delete(primero);
      while (pendientes.size) { let siguiente = -1, menor = Infinity; for (const j of pendientes) { const d = costo(propuesta.at(-1)! + 1, j + 1); if (d < menor) { menor = d; siguiente = j; } } if (siguiente < 0) break; propuesta.push(siguiente); pendientes.delete(siguiente); }
      const total = pendientes.size ? Infinity : evaluar(propuesta); if (total < mejor) { mejor = total; orden = propuesta; }
    }
    if (!orden.length) throw new Error("No se pudo conectar a todos los clientes. Revisá las ubicaciones del mapa.");
    for (let pasada = 0; pasada < 3; pasada++) {
      let cambio = false;
      for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) { const propuesta = [...orden]; [propuesta[i], propuesta[j]] = [propuesta[j], propuesta[i]]; const valor = evaluar(propuesta); if (valor < mejor) { mejor = valor; orden = propuesta; cambio = true; } }
      if (!cambio) break;
    }
  }
  return orden.map(i => visitas[i]);
}
const ubicacion = (direccion: string, punto: PuntoRuta | null) => punto ? `${punto.latitud},${punto.longitud}` : direccion;
export function enlacesNavegacion(visitas: VisitaRuta[], origen: string, puntoOrigen: PuntoRuta | null, regreso: boolean) {
  const destinos = visitas.map(v => ubicacion(v.direccion, v.punto));
  if (regreso && origen.trim()) destinos.push(ubicacion(origen, puntoOrigen));
  const enlaces: string[] = [];
  let salida = origen.trim() ? ubicacion(origen, puntoOrigen) : "";
  for (let i = 0; i < destinos.length; i += 4) {
    const tramo = destinos.slice(i, i + 4), params = new URLSearchParams({ api: "1", travelmode: "driving", destination: tramo.at(-1)! });
    if (salida) params.set("origin", salida);
    if (tramo.length > 1) params.set("waypoints", tramo.slice(0, -1).join("|"));
    enlaces.push(`https://www.google.com/maps/dir/?${params}`); salida = tramo.at(-1)!;
  }
  return enlaces;
}
export const navegarCliente = (visita: VisitaRuta) => `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination: ubicacion(visita.direccion, visita.punto), travelmode: "driving", dir_action: "navigate" })}`;
const escape = (value: string | number) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
export function buildHojaRutaPrintHtml(data: ResumenDistribucion, reparto: RepartoDistribucion, comercio: Comercio) {
  const visitas = visitasRuta(data, reparto), repartidor = data.usuarios.find(u => u.id === reparto.repartidor_id)?.nombre || "";
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Hoja de ruta ${escape(reparto.nombre)}</title><style>${getFacturaPrintStyles("a4")}
  .ruta.sin-cae{padding-bottom:0}.items-table{border-collapse:collapse;table-layout:fixed}.items-table td{border-bottom:1px solid #ddd;overflow-wrap:anywhere}.items-table tr{break-inside:avoid}.ruta-info{padding:12px}.ruta-info p{margin:6px 0}.nota{padding:12px;border-top:1px solid #000}@media print{*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><div class="factura-container sin-cae ruta"><div class="header"><div class="header-left">${comercio.logo_url ? `<img class="comercio-logo" src="${escape(comercio.logo_url)}" alt="${escape(comercio.nombre_comercio)}"/>` : `<div class="comercio-nombre">${escape(comercio.nombre_comercio)}</div>`}<div class="comercio-datos">${escape(domicilioComercio(comercio))}<br/>CUIT: ${escape(comercio.cuit)}</div></div><div class="header-center"><div class="tipo-letra">HR</div><div class="tipo-codigo">HOJA DE RUTA</div></div><div class="header-right"><div class="factura-titulo">${escape(reparto.nombre)}</div><div class="factura-info">Fecha: ${escape(reparto.fecha.split("-").reverse().join("/"))}<br/>${visitas.length} visitas</div></div></div>
  <div class="ruta-info"><p><strong>Repartidor:</strong> ${escape(repartidor)} · <strong>Vehículo:</strong> ${escape(reparto.vehiculo || "Sin vehículo")}</p><p><strong>Salida:</strong> ${escape(reparto.ruta_origen || domicilioComercio(comercio))}</p><p><strong>Final:</strong> ${reparto.ruta_regreso ? "Regreso al punto de salida" : "Último cliente"}</p></div>
  <table class="items-table"><thead><tr><th style="width:6%">Orden</th><th style="width:24%">Cliente / pedido</th><th style="width:36%">Dirección</th><th style="width:17%">Teléfono</th><th style="width:17%">Hora / visita</th></tr></thead><tbody>${visitas.map((v, i) => `<tr><td>${i + 1}</td><td>${escape(v.cliente)}<br/>Pedido #${v.pedido}</td><td>${escape(v.direccion)}</td><td>${escape(v.telefono || "—")}</td><td>____:____<br/>□ Visitado</td></tr>`).join("")}</tbody></table><div class="nota">Observaciones: ___________________________________________________________________<br/><br/>Documento operativo para organizar las visitas. Los remitos se imprimen por separado.</div></div></body></html>`;
}
export function datosRuta(visitas: VisitaRuta[]) {
  return visitas.map(v => ({ id: v.id, latitud: v.punto?.latitud ?? null, longitud: v.punto?.longitud ?? null }));
}
export const paradaOrden = (a: ParadaDistribucion, b: ParadaDistribucion) => a.orden - b.orden || a.id.localeCompare(b.id);
