import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import { AlertTriangle, MapPin, Pause, Play, Square } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCampoGps } from "@/hooks/useCampoGps";

function Fit({points}:{points:[number,number][]}) { const map=useMap(); useEffect(()=>{if(points.length===1)map.setView(points[0],16);else if(points.length>1)map.fitBounds(points,{padding:[20,20]});},[map,points]); return null; }
const duration=(s:string,paused:number,end:string|null)=>{const seconds=Math.max(0,Math.floor(((end?new Date(end):new Date()).getTime()-new Date(s).getTime())/1000)-paused);return `${String(Math.floor(seconds/3600)).padStart(2,"0")}:${String(Math.floor(seconds%3600/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;};

export function ParteGpsSeguimiento({comercioId,ordenId,parteId,canView,canTrack}:{comercioId:string;ordenId:string;parteId:string;canView:boolean;canTrack:boolean}) {
  const gps=useCampoGps(comercioId,ordenId,parteId,canView,canTrack), [now,setNow]=useState(Date.now());
  useEffect(()=>{if(gps.session?.estado!=="activa")return;const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[gps.session?.estado]);
  const coords=useMemo(()=>gps.points.map(x=>[x.latitud,x.longitud] as [number,number]),[gps.points]); const active=gps.session?.estado==="activa", paused=gps.session?.estado==="pausada";
  return <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5"/>Recorrido GPS</CardTitle>{gps.session&&<Badge variant={active?"success":paused?"secondary":"outline"}>{active?"En seguimiento":paused?"Pausado":"Finalizado"}</Badge>}</div></CardHeader><CardContent className="space-y-4">
    {!gps.session&&<Button disabled={!canTrack||gps.pending} onClick={()=>gps.start.mutate()}><Play className="mr-2 h-4 w-4"/>Iniciar seguimiento</Button>}
    {gps.session&&<><div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div>Duración<br/><strong>{duration(gps.session.iniciada_at,gps.session.segundos_pausados,gps.session.finalizada_at)}</strong></div><div>Puntos<br/><strong>{gps.points.length+gps.queued}</strong></div><div>Última precisión<br/><strong>{gps.lastPoint?`${Math.round(gps.lastPoint.precision_metros)} m`:"—"}</strong></div><div>En cola<br/><strong>{gps.queued}</strong></div></div>{canTrack&&gps.session.estado!=="finalizada"&&<div className="flex flex-wrap gap-2">{active?<Button variant="outline" disabled={gps.pending} onClick={()=>void gps.pause()}><Pause className="mr-2 h-4 w-4"/>Pausar</Button>:<Button disabled={gps.pending} onClick={()=>void gps.resume()}><Play className="mr-2 h-4 w-4"/>Reanudar</Button>}<Button variant="destructive" disabled={gps.pending} onClick={()=>void gps.finish()}><Square className="mr-2 h-4 w-4"/>Finalizar</Button></div>}</>}
    {(gps.error||!canTrack)&&<Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertDescription>{gps.error??"Solo el operador propietario, activo y vinculado puede registrar este recorrido."}</AlertDescription></Alert>}
    <Alert><AlertTriangle className="h-4 w-4"/><AlertDescription>La captura funciona mientras la aplicación está abierta. Puede detenerse si cerrás el navegador, bloqueás la pantalla o el sistema suspende la aplicación.</AlertDescription></Alert>
    {coords.length>0&&<div className="h-72 overflow-hidden rounded-md border"><MapContainer center={coords.at(-1)!} zoom={16} className="h-full w-full" scrollWheelZoom><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><Polyline positions={coords} pathOptions={{color:"#2563eb",weight:4}}/>{coords.map((point,index)=><CircleMarker key={`${point[0]}-${point[1]}-${index}`} center={point} radius={index===coords.length-1?6:3} pathOptions={{color:index===coords.length-1?"#16a34a":"#2563eb"}}/>)}<Fit points={coords}/></MapContainer></div>}
  </CardContent></Card>;
}
