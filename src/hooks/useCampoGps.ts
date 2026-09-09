import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isCampoUuid } from "@/utils/campo";
import { campoGpsMetricasKey } from "@/hooks/useCampoGpsMetricas";

export type CampoGpsSesion = { id:string; comercio_id:string; orden_id:string; parte_id:string; operador_id:string; usuario_id:string; estado:"activa"|"pausada"|"finalizada"; iniciada_at:string; pausada_at:string|null; finalizada_at:string|null; segundos_pausados:number };
export type CampoGpsPunto = { id:string; sesion_id:string; secuencia:number; latitud:number; longitud:number; precision_metros:number; registrado_at:string };
type PendingPoint = { client_id:string; secuencia:number; latitud:number; longitud:number; precision_metros:number; registrado_at:string };
const key = (c:string,p:string,s:string) => `vortex-campo:gps:${c}:${p}:${s}`;
const sequenceKey = (c:string,p:string,s:string) => `${key(c,p,s)}:sequence`;
const sessionKey = (c?:string|null,p?:string|null) => ["campo",c,"parte",p,"gps"] as const;
const uuid = () => crypto.randomUUID();

function readQueue(c:string,p:string,s:string): PendingPoint[] { try { const value=localStorage.getItem(key(c,p,s)); return value ? JSON.parse(value) : []; } catch { return []; } }
function writeQueue(c:string,p:string,s:string,points:PendingPoint[]) { localStorage.setItem(key(c,p,s),JSON.stringify(points)); }
function nextSequence(c:string,p:string,s:string) { const prior=Number(localStorage.getItem(sequenceKey(c,p,s))??"0"); const value=Math.max(Date.now(),Number.isSafeInteger(prior)?prior+1:Date.now()); localStorage.setItem(sequenceKey(c,p,s),String(value)); return value; }

export function useCampoGps(comercioId:string|null, ordenId:string|null, parteId:string|null, canView:boolean, canOperate:boolean) {
  const qc=useQueryClient(), watch=useRef<number|null>(null), sessionRef=useRef<CampoGpsSesion|null>(null), [lastPoint,setLastPoint]=useState<PendingPoint|null>(null), [error,setError]=useState<string|null>(null), [queued,setQueued]=useState(0);
  const valid=canView&&isCampoUuid(comercioId)&&isCampoUuid(ordenId)&&isCampoUuid(parteId);
  const query=useQuery({queryKey:sessionKey(comercioId,parteId),enabled:valid,refetchInterval:q=>q.state.data?.estado==="activa"?15000:false,queryFn:async():Promise<CampoGpsSesion|null>=>{const {data,error}=await supabase.from("campo_gps_sesiones").select("id,comercio_id,orden_id,parte_id,operador_id,usuario_id,estado,iniciada_at,pausada_at,finalizada_at,segundos_pausados").eq("comercio_id",comercioId!).eq("parte_id",parteId!).order("iniciada_at",{ascending:false}).limit(1).maybeSingle();if(error)throw error;return data as CampoGpsSesion|null;}});
  const session=query.data??null;
  useEffect(()=>{sessionRef.current=session;setQueued(session&&comercioId&&parteId?readQueue(comercioId,parteId,session.id).length:0)},[session,comercioId,parteId]);
  const points=useQuery({queryKey:[...sessionKey(comercioId,parteId),session?.id,"puntos"],enabled:Boolean(valid&&session),queryFn:async():Promise<CampoGpsPunto[]>=>{const {data,error}=await supabase.from("campo_gps_puntos").select("id,sesion_id,secuencia,latitud,longitud,precision_metros,registrado_at").eq("sesion_id",session!.id).order("secuencia");if(error)throw error;return (data??[]) as CampoGpsPunto[];}});
  const stopWatch=useCallback(()=>{if(watch.current!==null){navigator.geolocation.clearWatch(watch.current);watch.current=null;}},[]);
  const flush=useCallback(async(s:CampoGpsSesion)=>{if(!comercioId||!parteId||!navigator.onLine)return;const pending=readQueue(comercioId,parteId,s.id);if(!pending.length)return;const {error:rpcError}=await supabase.rpc("campo_gps_registrar_puntos",{p_sesion_id:s.id,p_puntos:pending});if(rpcError)throw rpcError;writeQueue(comercioId,parteId,s.id,[]);setQueued(0);await Promise.all([qc.invalidateQueries({queryKey:[...sessionKey(comercioId,parteId),s.id,"puntos"]}),qc.invalidateQueries({queryKey:campoGpsMetricasKey(comercioId,parteId,s.id)})]);},[comercioId,parteId,qc]);
  const enqueue=useCallback((position:GeolocationPosition)=>{const s=sessionRef.current;if(!canOperate||!s||!comercioId||!parteId||s.estado!=="activa")return;const next=[...readQueue(comercioId,parteId,s.id),{client_id:uuid(),secuencia:nextSequence(comercioId,parteId,s.id),latitud:position.coords.latitude,longitud:position.coords.longitude,precision_metros:position.coords.accuracy,registrado_at:new Date(position.timestamp).toISOString()}];writeQueue(comercioId,parteId,s.id,next);setLastPoint(next.at(-1)??null);setQueued(next.length);void flush(s).catch(()=>setError("Sin conexión: los puntos quedan guardados en este dispositivo."));},[canOperate,comercioId,parteId,flush]);
  const startWatch=useCallback((s:CampoGpsSesion)=>{stopWatch();if(!navigator.geolocation){setError("Este navegador no admite geolocalización.");return;}sessionRef.current=s;watch.current=navigator.geolocation.watchPosition(enqueue,e=>setError(e.code===1?"El permiso de ubicación fue denegado.":e.code===2?"No se pudo obtener la ubicación.":"La ubicación tardó demasiado."),{enableHighAccuracy:true,maximumAge:5000,timeout:20000});},[enqueue,stopWatch]);
  const start=useMutation({mutationFn:async()=>{if(!canOperate||!parteId)throw new Error("Parte no disponible");const {data,error:rpcError}=await supabase.rpc("campo_gps_iniciar_sesion",{p_parte_id:parteId});if(rpcError)throw rpcError;return data as CampoGpsSesion;},onSuccess:s=>{qc.setQueryData(sessionKey(comercioId,parteId),s);setError(null);startWatch(s);}});
  const change=useMutation({mutationFn:async(action:"pausar"|"reanudar"|"finalizar")=>{const s=sessionRef.current;if(!canOperate||!s)throw new Error("Sesión no disponible");if(action!=="pausar")await flush(s);const {data,error:rpcError}=await supabase.rpc("campo_gps_cambiar_estado",{p_sesion_id:s.id,p_accion:action});if(rpcError)throw rpcError;return data as CampoGpsSesion;},onSuccess:async(s,action)=>{qc.setQueryData(sessionKey(comercioId,parteId),s);await qc.invalidateQueries({queryKey:campoGpsMetricasKey(comercioId,parteId,s.id)});if(action==="pausar"||action==="finalizar")stopWatch();else startWatch(s);}});
  useEffect(()=>{const online=()=>{const s=sessionRef.current;if(s)void flush(s).catch(()=>undefined)};window.addEventListener("online",online);return()=>{window.removeEventListener("online",online);stopWatch();};},[flush,stopWatch]);
  useEffect(()=>()=>stopWatch(),[parteId,ordenId,stopWatch]);
  useEffect(()=>{if(!canOperate)stopWatch();},[canOperate,stopWatch]);
  return {session,points:points.data??[],lastPoint,error,queued,loading:query.isLoading||points.isLoading,start,pause:()=>change.mutateAsync("pausar"),resume:()=>change.mutateAsync("reanudar"),finish:()=>change.mutateAsync("finalizar"),pending:start.isPending||change.isPending};
}
