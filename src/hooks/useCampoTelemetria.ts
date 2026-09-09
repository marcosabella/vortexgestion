import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { TelemetriaMuestra } from "@/utils/campoTelemetriaParser";

const root = (comercioId: string | null) => ["campo", comercioId, "telemetria"] as const;
export const telemetriaKey = (comercioId: string | null, suffix: string, id?: string | null) => [...root(comercioId), suffix, id ?? null] as const;
const fail = (error: unknown) => { throw error; };
export type TelemetriaInicio = { id: string; maquinariaId: string; ordenId?: string | null; parteId?: string | null; sesionGpsId?: string | null; formato: "csv" | "gpx"; nombreArchivo: string; hash: string };

export function useCampoTelemetria(comercioId: string | null, allowed: boolean) {
  return useQuery({ queryKey: telemetriaKey(comercioId,"list"), enabled:Boolean(comercioId && allowed), queryFn: async () => {
    if (!comercioId || !allowed) return [];
    const { data,error }=await supabase.from("campo_telemetria_importaciones").select("id,maquinaria_id,orden_id,parte_id,sesion_gps_id,formato,origen,nombre_archivo,estado,inicio_at,fin_at,cantidad_muestras,cantidad_validas,cantidad_descartadas,created_at,maquinaria:campo_maquinarias!campo_telemetria_importaciones_maquinaria_fkey(nombre)").eq("comercio_id",comercioId).order("created_at",{ascending:false});
    if(error) fail(error); return data ?? [];
  }});
}
export function useCampoTelemetriaReferences(comercioId: string | null, allowed: boolean) {
  return useQuery({ queryKey: telemetriaKey(comercioId,"references"), enabled:Boolean(comercioId && allowed), queryFn: async () => {
    if(!comercioId || !allowed) return {maquinarias:[],ordenes:[],partes:[],sesiones:[]};
    const [maquinarias,ordenes,partes,sesiones]=await Promise.all([
      supabase.from("campo_maquinarias").select("id,nombre,activo").eq("comercio_id",comercioId).eq("activo",true).order("nombre"),
      supabase.from("campo_ordenes_trabajo").select("id,numero,estado").eq("comercio_id",comercioId).order("numero",{ascending:false}),
      supabase.from("campo_partes_trabajo").select("id,orden_id,numero,estado").eq("comercio_id",comercioId).order("numero",{ascending:false}),
      supabase.from("campo_gps_sesiones").select("id,parte_id,estado").eq("comercio_id",comercioId).order("iniciada_at",{ascending:false}),
    ]);
    for(const result of [maquinarias,ordenes,partes,sesiones]) if(result.error) fail(result.error);
    return {maquinarias:maquinarias.data??[],ordenes:ordenes.data??[],partes:partes.data??[],sesiones:sesiones.data??[]};
  }});
}
export function useCampoTelemetriaDetalle(comercioId:string|null, importacionId:string|null, allowed:boolean) {
  const enabled=Boolean(comercioId&&importacionId&&allowed);
  const estado=useQuery({queryKey:telemetriaKey(comercioId,"estado",importacionId),enabled,queryFn:async()=>{const {data,error}=await supabase.rpc("campo_telemetria_estado_importacion",{p_importacion_id:importacionId!});if(error)fail(error);return data;}});
  const resumen=useQuery({queryKey:telemetriaKey(comercioId,"resumen",importacionId),enabled,queryFn:async()=>{const {data,error}=await supabase.rpc("campo_telemetria_resumen_importacion",{p_importacion_id:importacionId!});if(error)fail(error);return data;}});
  return {estado,resumen};
}
export function useCampoTelemetriaImportar(comercioId:string|null, allowed:boolean) {
  const client=useQueryClient();
  const invalidate=async(id?:string)=>{await client.invalidateQueries({queryKey:telemetriaKey(comercioId,"list")}); if(id){await client.invalidateQueries({queryKey:telemetriaKey(comercioId,"estado",id)});await client.invalidateQueries({queryKey:telemetriaKey(comercioId,"resumen",id)});}};
  const iniciar=useMutation({mutationFn:async(v:TelemetriaInicio)=>{if(!allowed)throw new Error("No tenes permisos para importar telemetria.");const {data,error}=await supabase.rpc("campo_telemetria_iniciar_importacion",{p_id:v.id,p_maquinaria_id:v.maquinariaId,p_orden_id:v.ordenId??null,p_parte_id:v.parteId??null,p_sesion_gps_id:v.sesionGpsId??null,p_formato:v.formato,p_origen:"manual",p_nombre_archivo:v.nombreArchivo,p_hash_sha256:v.hash});if(error)fail(error);return data;},onSuccess:()=>invalidate()});
  const cargar=useMutation({mutationFn:async({id,samples}:{id:string;samples:TelemetriaMuestra[]})=>{if(!allowed)throw new Error("No tenes permisos para importar telemetria.");const {data,error}=await supabase.rpc("campo_telemetria_cargar_muestras",{p_importacion_id:id,p_muestras:samples as unknown as Json});if(error)fail(error);return data;},onSuccess:(_data,v)=>invalidate(v.id)});
  const finalizar=useMutation({mutationFn:async({id,cancelar}:{id:string;cancelar:boolean})=>{if(!allowed)throw new Error("No tenes permisos para importar telemetria.");const {data,error}=await supabase.rpc("campo_telemetria_finalizar_importacion",{p_importacion_id:id,p_cancelar:cancelar});if(error)fail(error);return data;},onSuccess:(_data,v)=>invalidate(v.id)});
  return {iniciar,cargar,finalizar};
}
