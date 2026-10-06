import { useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { ArrowDown, ArrowUp, ExternalLink, LocateFixed, MapPin, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useComercio } from "@/hooks/useComercio";
import { useDistribucion } from "@/hooks/useDistribucion";
import { useDistribucionMapa, type CaminoRuta, type LugarRuta } from "@/hooks/useDistribucionMapa";
import type { RepartoDistribucion, ResumenDistribucion } from "@/types/distribucion";
import { datosRuta, domicilioComercio, enlacesNavegacion, navegarCliente, ordenarPorTiempos, puntoValido, ubicacionAutomatica, visitasRuta, type PuntoRuta, type VisitaRuta } from "@/utils/distribucionRuta";
import { HojaRutaImpresion } from "@/components/HojaRutaImpresion";

function AjustarMapa({ puntos }: { puntos: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (puntos.length === 1) map.setView(puntos[0], 16);
    if (puntos.length > 1) map.fitBounds(puntos, { padding: [35, 35], maxZoom: 17 });
  }, [map, puntos]);
  return null;
}
function ElegirPunto({ elegir }: { elegir: (p: PuntoRuta) => void }) {
  useMapEvents({ click: e => elegir({ latitud: e.latlng.lat, longitud: e.latlng.lng }) });
  return null;
}
const coords = (p: PuntoRuta): [number, number] => [p.latitud, p.longitud];
type BorradorRuta = { visitas: VisitaRuta[]; origen: string; punto: PuntoRuta | null; regreso: boolean };

export function DistribucionHojaRuta({ data, reparto }: { data: ResumenDistribucion; reparto: RepartoDistribucion }) {
  const { comercio } = useComercio(), query = useDistribucion(), servicio = useDistribucionMapa();
  const editable = data.admin && reparto.estado === "planificado";
  const direccionComercio = comercio ? domicilioComercio(comercio) : "";
  const inicial = (): BorradorRuta => ({ visitas: visitasRuta(data, reparto), origen: reparto.ruta_origen || direccionComercio, punto: puntoValido(reparto.ruta_latitud, reparto.ruta_longitud), regreso: Boolean(reparto.ruta_regreso) });
  const [ruta, setRuta] = useState(inicial), [cambio, setCambio] = useState(false), [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(""), [camino, setCamino] = useState<{ clave: string; ruta: CaminoRuta } | null>(null);
  const [ubicando, setUbicando] = useState<string | null>(null), [texto, setTexto] = useState(""), [resultados, setResultados] = useState<LugarRuta[]>([]);
  const [latitud, setLatitud] = useState(""), [longitud, setLongitud] = useState("");
  const [geolocalizando, setGeolocalizando] = useState(false), [precision, setPrecision] = useState<number | null>(null);
  const [armando, setArmando] = useState(false), [avance, setAvance] = useState("");
  const solicitudGps = useRef(0), bloqueoGps = useRef(false);
  const solicitudCircuito = useRef(0), bloqueoCircuito = useRef(false);
  const ocupado = guardando || geolocalizando || armando;
  const version = useRef(reparto.ruta_version || 1), bloqueo = useRef(false), intento = useRef<{ firma: string; clave: string } | null>(null);
  const versionActual = reparto.ruta_version || 1;
  useEffect(() => {
    if (!cambio && !guardando && !geolocalizando && !armando) { setRuta(inicial()); version.current = versionActual; }
    // El borrador pendiente se preserva; el backend rechaza una versión desactualizada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionActual, cambio, guardando, geolocalizando, armando, comercio?.id, direccionComercio]);
  useEffect(() => {
    const controlGps = solicitudGps;
    const controlCircuito = solicitudCircuito;
    bloqueoGps.current = false;
    bloqueoCircuito.current = false;
    setGeolocalizando(false);
    setArmando(false);
    return () => { controlGps.current++; controlCircuito.current++; };
  }, [comercio?.id, reparto.id]);
  const puntos = [...(ruta.punto ? [ruta.punto] : []), ...ruta.visitas.flatMap(v => v.punto ? [v.punto] : []), ...(ruta.regreso && ruta.punto ? [ruta.punto] : [])];
  const completa = Boolean(ruta.punto) && ruta.visitas.length > 0 && ruta.visitas.every(v => v.punto);
  const claveCamino = JSON.stringify(puntos), caminoActual = camino?.clave === claveCamino && completa ? camino.ruta : null;
  const lineas = completa ? puntos.map(coords) : [];
  const enlaces = enlacesNavegacion(ruta.visitas, ruta.origen, ruta.punto, ruta.regreso);
  function modificar(nueva: BorradorRuta) { setRuta(nueva); setCambio(true); setError(""); }
  function usarGeolocalizacion() {
    if (!editable || ocupado || bloqueoGps.current) return;
    setError("");
    if (!window.isSecureContext) { setError("Para usar tu ubicación, abrí el sistema mediante HTTPS o desde localhost."); return; }
    if (!navigator.geolocation) { setError("Este dispositivo no permite obtener la ubicación. Podés editar la dirección o marcar la salida en el mapa."); return; }
    bloqueoGps.current = true; setGeolocalizando(true);
    const solicitud = ++solicitudGps.current;
    navigator.geolocation.getCurrentPosition(position => {
      if (solicitud !== solicitudGps.current) return;
      bloqueoGps.current = false; setGeolocalizando(false);
      const punto = puntoValido(position.coords.latitude, position.coords.longitude);
      if (!punto) { setError("El dispositivo devolvió una ubicación inválida. Intentá nuevamente."); return; }
      setRuta(actual => ({ ...actual, origen: `Ubicación actual (${punto.latitud.toFixed(6)}, ${punto.longitud.toFixed(6)})`, punto }));
      setPrecision(Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null);
      setCambio(true);
    }, fallo => {
      if (solicitud !== solicitudGps.current) return;
      bloqueoGps.current = false; setGeolocalizando(false);
      setError(fallo.code === 1 ? "Permití el acceso a tu ubicación en el navegador para usar este punto de salida." : fallo.code === 3 ? "Se agotó el tiempo para obtener tu ubicación. Intentá nuevamente o ubicá la salida en el mapa." : "No se pudo obtener tu ubicación. Revisá el GPS del dispositivo o ubicá la salida en el mapa.");
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  function mover(indice: number, delta: number) {
    const visitas = [...ruta.visitas]; [visitas[indice], visitas[indice + delta]] = [visitas[indice + delta], visitas[indice]]; modificar({ ...ruta, visitas });
  }
  function ubicar(id: string, direccion: string, punto: PuntoRuta | null) {
    setUbicando(id); setTexto(direccion); setResultados([]); setLatitud(punto ? String(punto.latitud) : ""); setLongitud(punto ? String(punto.longitud) : ""); setError("");
  }
  function elegir(punto: PuntoRuta) { setLatitud(String(punto.latitud)); setLongitud(String(punto.longitud)); }
  function confirmarPunto() {
    const p = latitud.trim() && longitud.trim() ? puntoValido(Number(latitud.replace(",", ".")), Number(longitud.replace(",", "."))) : null;
    if (!p) { setError("Indicá coordenadas válidas o elegí un punto en el mapa."); return; }
    modificar(ubicando === "origen" ? { ...ruta, punto: p } : { ...ruta, visitas: ruta.visitas.map(v => v.id === ubicando ? { ...v, punto: p } : v) }); setUbicando(null);
  }
  async function armarCircuito() {
    if (!editable || ocupado || bloqueoCircuito.current || !ruta.visitas.length) return;
    bloqueoCircuito.current = true; setArmando(true); setError("");
    const solicitud = ++solicitudCircuito.current;
    const vigente = () => solicitud === solicitudCircuito.current;
    let nueva = { ...ruta, visitas: ruta.visitas.map(v => ({ ...v })) };
    try {
      const pendientes: string[] = [];
      if (!nueva.punto) {
        setAvance("Ubicando el punto de salida...");
        const lugares = await servicio.buscar(`${nueva.origen}, Argentina`);
        if (!vigente()) return;
        nueva.punto = ubicacionAutomatica(nueva.origen, lugares);
        if (!nueva.punto) pendientes.push("punto de salida");
      }
      for (let i = 0; i < nueva.visitas.length; i++) {
        const visita = nueva.visitas[i];
        if (visita.punto) continue;
        setAvance(`Ubicando cliente ${i + 1} de ${nueva.visitas.length}: ${visita.cliente}...`);
        const lugares = await servicio.buscar(`${visita.direccion}, Argentina`);
        if (!vigente()) return;
        visita.punto = ubicacionAutomatica(visita.direccion, lugares);
        if (!visita.punto) pendientes.push(visita.cliente);
      }
      if (!vigente()) return;
      modificar(nueva);
      if (pendientes.length) throw new Error(`No se identificó una dirección precisa para: ${pendientes.join(", ")}. Revisá calle, número y localidad, o usá Ubicar para marcar esos puntos. Después pulsá Armar circuito nuevamente.`);
      setAvance("Calculando el orden de visita por tiempos de conducción...");
      const matriz = await servicio.tiempos([nueva.punto!, ...nueva.visitas.map(v => v.punto!)]);
      if (!vigente()) return;
      nueva = { ...nueva, visitas: ordenarPorTiempos(nueva.visitas, matriz, nueva.regreso) };
      modificar(nueva);
      const recorrido = [nueva.punto!, ...nueva.visitas.map(v => v.punto!), ...(nueva.regreso ? [nueva.punto!] : [])];
      setAvance("Mostrando el circuito calculado...");
      const geometria = await servicio.calcular(recorrido);
      if (!vigente()) return;
      setCamino({ clave: JSON.stringify(recorrido), ruta: geometria });
      setAvance("Orden de visitas calculado. Guardá la ruta para usarlo en las entregas y la impresión.");
    } catch (e) {
      if (vigente()) { setError(e instanceof Error ? e.message : "No se pudo armar el circuito."); setAvance(""); }
    } finally { if (vigente()) { bloqueoCircuito.current = false; setArmando(false); } }
  }
  async function guardar() {
    if (bloqueo.current || bloqueoGps.current || bloqueoCircuito.current) return;
    bloqueo.current = true; setGuardando(true); setError("");
    const datos = { origen: ruta.origen, latitud: ruta.punto?.latitud ?? null, longitud: ruta.punto?.longitud ?? null, regreso: ruta.regreso, paradas: datosRuta(ruta.visitas) };
    const firma = JSON.stringify({ version: version.current, datos });
    if (intento.current?.firma !== firma) intento.current = { firma, clave: crypto.randomUUID() };
    try { await query.guardarRuta(reparto.id, version.current, datos, intento.current.clave); setCambio(false); intento.current = null; }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar la ruta."); }
    finally { bloqueo.current = false; setGuardando(false); }
  }
  return <div className="space-y-4">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1"><Label htmlFor={`origen-${reparto.id}`}>Punto de salida de la distribuidora</Label><Input id={`origen-${reparto.id}`} value={ruta.origen} disabled={!editable || ocupado} onChange={e => { setPrecision(null); modificar({ ...ruta, origen: e.target.value, punto: null }); }}/></div>
      {editable && <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={ocupado || !direccionComercio.trim()} onClick={() => { setPrecision(null); modificar({ ...ruta, origen: direccionComercio, punto: null }); }}>Usar dirección de mi distribuidora</Button>
        <Button variant="outline" disabled={ocupado} onClick={usarGeolocalizacion}><LocateFixed className="mr-2 h-4 w-4"/>{geolocalizando ? "Obteniendo ubicación..." : "Usar mi ubicación"}</Button>
        <Button variant="outline" disabled={ocupado || !ruta.origen.trim()} onClick={() => { setPrecision(null); ubicar("origen", ruta.origen, ruta.punto); }}><MapPin className="mr-2 h-4 w-4"/>{ruta.punto ? "Cambiar salida" : "Ubicar salida"}</Button>
      </div>}
    </div>
    {precision !== null && <p className="text-xs text-muted-foreground">Precisión GPS: {precision} m</p>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ruta.regreso} disabled={!editable || ocupado} onChange={e => modificar({ ...ruta, regreso: e.target.checked })}/>Regresar al punto de salida después del último cliente</label>
    {ruta.visitas.length === 0 ? <p>Agregá pedidos al reparto para armar la ruta.</p> : <Table>
      <TableHeader><TableRow><TableHead>Orden</TableHead><TableHead>Cliente / pedido</TableHead><TableHead>Dirección</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader>
      <TableBody>{ruta.visitas.map((v, indice) => <TableRow key={v.id}>
        <TableCell className="font-semibold">{indice + 1}</TableCell><TableCell><strong>{v.cliente}</strong><div className="text-sm">Pedido #{v.pedido}{v.telefono && <> · <a className="underline" href={`tel:${v.telefono}`}>{v.telefono}</a></>}</div></TableCell>
        <TableCell>{v.direccion}<div className="text-xs text-muted-foreground">{v.punto ? "Ubicación confirmada" : "Sin ubicar en el mapa"}</div></TableCell>
        <TableCell><div className="flex flex-wrap gap-1">
          {editable && <><Button variant="outline" size="icon" className="h-9 w-9" title="Subir visita" aria-label={`Subir visita a ${v.cliente}`} disabled={ocupado || indice === 0} onClick={() => mover(indice, -1)}><ArrowUp className="h-4 w-4"/></Button><Button variant="outline" size="icon" className="h-9 w-9" title="Bajar visita" aria-label={`Bajar visita a ${v.cliente}`} disabled={ocupado || indice === ruta.visitas.length - 1} onClick={() => mover(indice, 1)}><ArrowDown className="h-4 w-4"/></Button><Button variant="outline" size="sm" disabled={ocupado} onClick={() => ubicar(v.id, v.direccion, v.punto)}><MapPin className="mr-1 h-4 w-4"/>{v.punto ? "Ubicación" : "Ubicar"}</Button></>}
          <Button variant="outline" size="sm" asChild><a href={navegarCliente(v)} target="_blank" rel="noopener noreferrer">Ir al cliente<ExternalLink className="ml-1 h-4 w-4"/></a></Button>
        </div></TableCell>
      </TableRow>)}</TableBody>
    </Table>}
    <div className="flex flex-wrap gap-2">
      {editable && <><Button disabled={ocupado || !ruta.visitas.length || !ruta.origen.trim()} onClick={armarCircuito}><MapPin className="mr-2 h-4 w-4"/>{armando ? "Armando circuito..." : "Armar circuito"}</Button><Button disabled={!cambio || ocupado} onClick={guardar}><Save className="mr-2 h-4 w-4"/>{guardando ? "Guardando..." : "Guardar ruta"}</Button>{cambio && <Button variant="outline" disabled={ocupado} onClick={() => { setCambio(false); setPrecision(null); setAvance(""); setError(""); }}>Descartar cambios</Button>}</>}
      <HojaRutaImpresion data={data} reparto={reparto} disabled={cambio || ocupado}/>
    </div>
    {cambio && <p className="text-sm text-amber-700">Guardá los cambios antes de imprimir. {version.current !== versionActual && "El reparto cambió en otra sesión; descartá el borrador para cargar los datos actuales."}</p>}
    {error && !ubicando && <p className="text-sm text-destructive" role="alert">{error}</p>}
    <div className="flex flex-wrap items-center gap-2"><Button variant="outline" disabled={!completa || servicio.trabajando || ocupado} onClick={async () => { setError(""); try { setCamino({ clave: claveCamino, ruta: await servicio.calcular(puntos) }); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo calcular el recorrido."); } }}>Mostrar recorrido por calles</Button>{caminoActual && <span className="text-sm">{(caminoActual.distancia / 1000).toFixed(1)} km · {Math.ceil(caminoActual.duracion / 60)} min de conducción estimada, sin tiempo de entregas</span>}</div>
    {avance && <p className="text-sm" role="status">{avance}</p>}
    <div className="isolate h-[360px] overflow-hidden rounded-md border">
      <MapContainer center={[-34.6, -64]} zoom={5} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
        {ruta.punto && <CircleMarker center={coords(ruta.punto)} radius={11} pathOptions={{ color: "#15803d", fillOpacity: 1 }}><Tooltip permanent direction="top">Salida</Tooltip><Popup>{ruta.origen}</Popup></CircleMarker>}
        {ruta.visitas.map((v, i) => v.punto && <CircleMarker key={v.id} center={coords(v.punto)} radius={11} pathOptions={{ color: "#2563eb", fillOpacity: 0.9 }}><Tooltip permanent direction="top">{i + 1}</Tooltip><Popup><strong>{i + 1}. {v.cliente}</strong><br/>{v.direccion}<br/><a href={navegarCliente(v)} target="_blank" rel="noopener noreferrer">Navegar al cliente</a></Popup></CircleMarker>)}
        {lineas.length > 1 && <Polyline positions={caminoActual?.puntos || lineas} pathOptions={{ color: "#2563eb", weight: 4, dashArray: caminoActual ? undefined : "8 8" }}/>}<AjustarMapa puntos={puntos.map(coords)}/>
      </MapContainer>
    </div>
    <p className="text-xs text-muted-foreground">Búsqueda: <a className="underline" href="https://photon.komoot.io" target="_blank" rel="noopener noreferrer">Photon</a> · Recorrido: <a className="underline" href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener noreferrer">OSRM / FOSSGIS</a> · <a className="underline" href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Corregir el mapa</a></p>
    <div className="flex flex-wrap gap-2">{enlaces.map((url, i) => <Button key={url} variant="outline" asChild><a href={url} target="_blank" rel="noopener noreferrer">{enlaces.length > 1 ? `Google Maps · tramo ${i + 1}` : "Abrir circuito en Google Maps"}<ExternalLink className="ml-2 h-4 w-4"/></a></Button>)}</div>
    {enlaces.length > 1 && <p className="text-xs text-muted-foreground">El circuito se divide en tramos para conservar todas las visitas al abrirlo desde un celular.</p>}
    <Dialog open={Boolean(ubicando)} onOpenChange={open => { if (!open) { setUbicando(null); setError(""); } }}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-auto"><DialogHeader><DialogTitle>Ubicar {ubicando === "origen" ? "punto de salida" : "cliente"}</DialogTitle><DialogDescription>Buscá calle, número, localidad y provincia. Revisá el resultado o marcá el punto exacto en el mapa antes de confirmar.</DialogDescription></DialogHeader>
        <div className="flex gap-2"><Input aria-label="Dirección para buscar en el mapa" value={texto} onChange={e => setTexto(e.target.value)}/><Button disabled={servicio.trabajando || !texto.trim()} onClick={async () => { setError(""); try { const places = await servicio.buscar(texto); setResultados(places); if (!places.length) setError("No se encontró la dirección. Completá la localidad o marcá el punto manualmente."); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo buscar."); } }}>Buscar</Button></div>
        <div className="space-y-1">{resultados.map((l, i) => <Button key={i} variant="outline" className="h-auto w-full justify-start whitespace-normal text-left" onClick={() => elegir(l.punto)}>{l.nombre}</Button>)}</div>
        <div className="grid grid-cols-2 gap-2"><div><Label htmlFor="ruta-latitud">Latitud</Label><Input id="ruta-latitud" value={latitud} onChange={e => setLatitud(e.target.value)}/></div><div><Label htmlFor="ruta-longitud">Longitud</Label><Input id="ruta-longitud" value={longitud} onChange={e => setLongitud(e.target.value)}/></div></div>
        <div className="isolate h-64 overflow-hidden rounded-md border"><MapContainer center={puntos.length ? coords(puntos[0]) : [-34.6, -64]} zoom={5} className="h-full w-full"><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><ElegirPunto elegir={elegir}/>{puntoValido(Number(latitud), Number(longitud)) && latitud && longitud && <CircleMarker center={[Number(latitud), Number(longitud)]} radius={9} pathOptions={{ color: "#2563eb" }}/>}<AjustarMapa puntos={latitud && longitud && puntoValido(Number(latitud), Number(longitud)) ? [[Number(latitud), Number(longitud)]] : resultados.map(l => coords(l.punto))}/></MapContainer></div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}<Button onClick={confirmarPunto}><LocateFixed className="mr-2 h-4 w-4"/>Confirmar ubicación</Button>
      </DialogContent>
    </Dialog>
  </div>;
}
