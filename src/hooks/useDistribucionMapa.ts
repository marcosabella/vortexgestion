import { useState } from "react";
import { puntoValido, type DireccionGeocodificada, type PuntoRuta } from "@/utils/distribucionRuta";

export type LugarRuta = DireccionGeocodificada & { nombre: string };
export type CaminoRuta = { puntos: [number, number][]; distancia: number; duracion: number };
const lugaresCache = new Map<string, LugarRuta[]>();
const caminosCache = new Map<string, CaminoRuta>();
const matricesCache = new Map<string, (number | null)[][]>();
const colas = { buscar: Promise.resolve(), camino: Promise.resolve() };
const ultimaConsulta = { buscar: 0, camino: 0 };
function consultaLimitada<T>(servicio: "buscar" | "camino", consultar: () => Promise<T>): Promise<T> {
  const resultado = colas[servicio].then(async () => {
    const demora = 1100 - (Date.now() - ultimaConsulta[servicio]);
    if (demora > 0) await new Promise(resolve => setTimeout(resolve, demora));
    ultimaConsulta[servicio] = Date.now();
    return consultar();
  });
  colas[servicio] = resultado.then(() => undefined, () => undefined);
  return resultado;
}
const routerUrl = () => (import.meta.env.VITE_DISTRIBUCION_ROUTER_URL || "https://routing.openstreetmap.de/routed-car/route/v1/driving").replace(/\/$/, "");
async function json(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), credentials: "omit" });
  if (!response.ok) throw new Error("El servicio de mapas no respondió. Podés ubicar el punto manualmente.");
  return response.json();
}
export function useDistribucionMapa() {
  const [trabajando, setTrabajando] = useState(false);
  async function buscar(direccion: string): Promise<LugarRuta[]> {
    const texto = direccion.trim();
    if (!texto) throw new Error("Indicá calle, número y localidad.");
    if (lugaresCache.has(texto)) return lugaresCache.get(texto)!;
    setTrabajando(true);
    try {
      const endpoint = import.meta.env.VITE_DISTRIBUCION_GEOCODER_URL || "https://photon.komoot.io/api/";
      const url = new URL(endpoint); url.searchParams.set("q", texto); url.searchParams.set("limit", "5");
      const data = await consultaLimitada("buscar", () => json(url.toString()));
      const lugares: LugarRuta[] = [];
      for (const feature of data.features || []) {
        const point = puntoValido(feature.geometry?.coordinates?.[1], feature.geometry?.coordinates?.[0]);
        if (!point || feature.geometry?.type !== "Point") continue;
        const p = feature.properties || {};
        const nombre = [...new Set([p.name, p.street, p.housenumber, p.city, p.district, p.state, p.country].filter(Boolean))].join(", ");
        lugares.push({ nombre: nombre || texto, punto: point, calle: typeof p.street === "string" ? p.street : undefined, numero: p.housenumber ? String(p.housenumber) : undefined,
          localidad: typeof p.city === "string" ? p.city : undefined, provincia: typeof p.state === "string" ? p.state : undefined, pais: typeof p.countrycode === "string" ? p.countrycode : undefined });
      }
      if (lugaresCache.size >= 100) lugaresCache.clear();
      lugaresCache.set(texto, lugares); return lugares;
    } finally { setTrabajando(false); }
  }
  async function calcular(puntos: PuntoRuta[]): Promise<CaminoRuta> {
    if (puntos.length < 2 || puntos.length > 100) throw new Error("El recorrido necesita entre 2 y 100 ubicaciones.");
    const coords = puntos.map(p => `${p.longitud},${p.latitud}`).join(";");
    if (caminosCache.has(coords)) return caminosCache.get(coords)!;
    setTrabajando(true);
    try {
      const data = await consultaLimitada("camino", () => json(`${routerUrl()}/${coords}?overview=full&geometries=geojson&steps=false`));
      const r = data.routes?.[0];
      if (data.code !== "Ok" || !r?.geometry?.coordinates?.length) throw new Error("No se encontró un recorrido por calles entre esos puntos. Revisá las ubicaciones.");
      const camino: CaminoRuta = { puntos: r.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]), distancia: r.distance, duracion: r.duration };
      if (caminosCache.size >= 50) caminosCache.clear();
      caminosCache.set(coords, camino); return camino;
    } finally { setTrabajando(false); }
  }
  async function tiempos(puntos: PuntoRuta[]): Promise<(number | null)[][]> {
    if (puntos.length < 2 || puntos.length > 100) throw new Error("El circuito admite de 1 a 99 clientes.");
    const coords = puntos.map(p => `${p.longitud},${p.latitud}`).join(";");
    if (matricesCache.has(coords)) return matricesCache.get(coords)!;
    setTrabajando(true);
    try {
      const endpoint = routerUrl().replace(/\/route\/v1\//, "/table/v1/");
      const data = await consultaLimitada("camino", () => json(`${endpoint}/${coords}?annotations=duration`));
      if (data.code !== "Ok" || !Array.isArray(data.durations)) throw new Error("No se pudieron calcular los tiempos entre clientes.");
      if (matricesCache.size >= 30) matricesCache.clear(); matricesCache.set(coords, data.durations);
      return data.durations;
    } finally { setTrabajando(false); }
  }
  return { buscar, calcular, tiempos, trabajando };
}
