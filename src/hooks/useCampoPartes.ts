import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { isCampoUuid } from "@/utils/campo";
import type { Database } from "@/integrations/supabase/types";
import type { CampoOrdenDetail, CampoOrdenLaborListItem, CampoParte, CampoParteFormValues } from "@/types/campo";

const listKey = (c?: string | null, o?: string | null) => ["campo", c ?? null, "orden", o ?? null, "partes"] as const;
const detailKey = (c?: string | null, o?: string | null, p?: string | null) => ["campo", c ?? null, "orden", o ?? null, "parte", p ?? null] as const;
export const pendingPartesKey = (c?: string | null) => ["campo", c ?? null, "partes", "pendientes"] as const;
export const parteHistoryKey = (c?: string | null, o?: string | null, p?: string | null) => ["campo", c ?? null, "orden", o ?? null, "parte", p ?? null, "historial"] as const;
export const ordenHistoryKey = (c?: string | null, o?: string | null) => ["campo", c ?? null, "orden", o ?? null, "historial"] as const;
const parteSelect = "id,orden_id,orden_labor_id,numero,estado,fecha_trabajo,hora_inicio,hora_fin,descripcion,observaciones,condiciones_climaticas,propietario_user_id,propietario_operario_id,enviado_at,rechazado_at,motivo_rechazo,confirmado_at,anulado_at,motivo_anulacion,descartado_at,motivo_descarte,created_at,updated_at,labor:campo_orden_labores!campo_partes_labor_fkey(nombre,codigo_interno,unidad,activo),propietario_operario:campo_operarios!campo_partes_propietario_operario_fkey(nombre,codigo_interno)";

function guard(c: string | null | undefined, o: string | null | undefined, ok: boolean, orden?: CampoOrdenDetail | null) {
  if (!isCampoUuid(c) || !isCampoUuid(o) || !ok || !orden || orden.id !== o) throw new Error("campo_sin_acceso");
  return { c, o };
}
const payloadValues = (v: CampoParteFormValues) => ({ p_fecha_trabajo: v.fecha_trabajo, p_hora_inicio: v.hora_inicio || undefined, p_hora_fin: v.hora_fin || undefined, p_descripcion: v.descripcion.trim() || undefined, p_observaciones: v.observaciones.trim() || undefined, p_condiciones_climaticas: v.condiciones_climaticas.trim() || undefined });

export function campoParteErrorMessage(error: unknown) {
  const e = error as { code?: string; message?: string }, message = e.message?.toLowerCase() ?? "";
  const messages: Array<[string, string]> = [
    ["campo_operador_no_vinculado", "Tu usuario no tiene un operario activo vinculado."], ["campo_parte_no_disponible", "El parte no existe o no está disponible para tu usuario."],
    ["campo_parte_no_editable", "El parte ya no puede editarse."], ["campo_parte_no_enviable", "El parte ya no puede enviarse."], ["campo_parte_no_confirmable", "El parte debe estar enviado para aprobarlo."],
    ["campo_parte_no_rechazable", "El parte ya no puede rechazarse."], ["campo_parte_no_reabrible", "El parte ya no puede reabrirse."], ["campo_parte_no_descartable", "El parte ya no puede descartarse."],
    ["campo_rechazo_requiere_motivo", "Ingresá un motivo de rechazo."], ["campo_descarte_requiere_motivo", "Ingresá un motivo de descarte."], ["campo_anulacion_requiere_motivo", "Ingresá un motivo de anulación."],
    ["campo_orden_no_admite_partes", "La orden ya no admite partes."], ["campo_parte_sin_lotes", "Agregá al menos un avance por lote activo."], ["campo_parte_lotes_invalidos", "Revisá los avances por lote activos."],
    ["campo_parte_operarios_invalidos", "Revisá los operarios activos del parte."], ["campo_parte_maquinarias_invalidas", "Revisá las maquinarias activas del parte."], ["campo_parte_insumos_invalidos", "Revisá los insumos activos del parte."],
  ];
  const known = messages.find(([key]) => message.includes(key));
  if (known) return known[1];
  if (e.code === "PGRST116") return "El registro no existe, cambió de estado o no está disponible.";
  if (e.code === "42501" || message.includes("row-level security") || message.includes("permission denied") || message.includes("sin_acceso")) return "No tenés permisos para realizar esta operación.";
  return "No se pudo completar la operación. Intentá nuevamente.";
}

export function useCampoPartes(c?: string | null, o?: string | null, ok = false, orden?: CampoOrdenDetail | null) {
  return useQuery({ queryKey: listKey(c, o), enabled: isCampoUuid(c) && isCampoUuid(o) && ok && orden?.id === o, queryFn: async (): Promise<CampoParte[]> => {
    const x = guard(c, o, ok, orden); const { data, error } = await supabase.from("campo_partes_trabajo").select(parteSelect).eq("comercio_id", x.c).eq("orden_id", x.o).order("numero", { ascending: false }).order("id", { ascending: false });
    if (error) throw error; return (data ?? []) as unknown as CampoParte[];
  } });
}
export function useCampoParte(c?: string | null, o?: string | null, p?: string | null, ok = false, orden?: CampoOrdenDetail | null) {
  return useQuery({ queryKey: detailKey(c, o, p), enabled: isCampoUuid(c) && isCampoUuid(o) && isCampoUuid(p) && ok && orden?.id === o, queryFn: async (): Promise<CampoParte | null> => {
    const x = guard(c, o, ok, orden); if (!isCampoUuid(p)) return null; const { data, error } = await supabase.from("campo_partes_trabajo").select(parteSelect).eq("id", p).eq("comercio_id", x.c).eq("orden_id", x.o).maybeSingle();
    if (error) throw error; return data as unknown as CampoParte | null;
  } });
}

export type CampoParteHistorial = Database["public"]["Tables"]["campo_parte_estado_historial"]["Row"];
export type CampoOrdenHistorial = Database["public"]["Tables"]["campo_orden_estado_historial"]["Row"];
export function useCampoParteHistorial(c?: string | null, o?: string | null, p?: string | null, ok = false) { return useQuery({ queryKey: parteHistoryKey(c,o,p), enabled: ok && isCampoUuid(c) && isCampoUuid(o) && isCampoUuid(p), queryFn: async (): Promise<CampoParteHistorial[]> => { const {data,error}=await supabase.from("campo_parte_estado_historial").select("id,parte_id,estado_anterior,estado_nuevo,motivo,actor_user_id,created_at,metadata,comercio_id").eq("comercio_id",c!).eq("parte_id",p!).order("created_at",{ascending:true}).order("id",{ascending:true}); if(error) throw error; return data??[]; } }); }
export function useCampoOrdenHistorial(c?: string | null, o?: string | null, ok = false) { return useQuery({ queryKey: ordenHistoryKey(c,o), enabled: ok && isCampoUuid(c) && isCampoUuid(o), queryFn: async (): Promise<CampoOrdenHistorial[]> => { const {data,error}=await supabase.from("campo_orden_estado_historial").select("id,orden_id,estado_anterior,estado_nuevo,motivo,actor_user_id,created_at,metadata,comercio_id").eq("comercio_id",c!).eq("orden_id",o!).order("created_at",{ascending:true}).order("id",{ascending:true}); if(error) throw error; return data??[]; } }); }

function useInvalidations(c?: string | null, o?: string | null, p?: string | null) { const q=useQueryClient(); return ()=>Promise.all([
  q.invalidateQueries({queryKey:listKey(c,o),exact:true}), q.invalidateQueries({queryKey:detailKey(c,o,p),exact:true}), q.invalidateQueries({queryKey:parteHistoryKey(c,o,p),exact:true}),
  q.invalidateQueries({queryKey:pendingPartesKey(c),exact:true}), q.invalidateQueries({queryKey:["campo",c,"orden",o],exact:true}), q.invalidateQueries({queryKey:["campo",c,"ordenes"],exact:true}),
  q.invalidateQueries({queryKey:ordenHistoryKey(c,o),exact:true}), q.invalidateQueries({queryKey:["campo",c,"orden",o,"avance"],exact:true}),
]); }

export function useCreateCampoParte(c:string|null,o:string|null,ok:boolean,orden:CampoOrdenDetail|null,labores:CampoOrdenLaborListItem[]) { const invalidate=useInvalidations(c,o); return useMutation({mutationFn:async(v:CampoParteFormValues)=>{const x=guard(c,o,ok,orden), labor=labores.find(item=>item.id===v.orden_labor_id&&item.activo); if(!orden||!["planificada","en_progreso"].includes(orden.estado)||!labor||labor.orden_id!==x.o) throw new Error("campo_orden_no_admite_partes"); const {data,error}=await supabase.rpc("campo_crear_parte",{p_orden_id:x.o,p_orden_labor_id:labor.id,...payloadValues(v)}); if(error) throw error; return data;},onSuccess:async()=>{await invalidate();toast({title:"Parte creado"});},onError:e=>toast({title:"No se pudo crear el parte",description:campoParteErrorMessage(e),variant:"destructive"})}); }
export function useUpdateCampoParte(c:string|null,o:string|null,p:string|null,ok:boolean,orden:CampoOrdenDetail|null,parte:CampoParte|null) { const invalidate=useInvalidations(c,o,p); return useMutation({mutationFn:async(v:CampoParteFormValues)=>{const x=guard(c,o,ok,orden); if(!isCampoUuid(p)||!parte||parte.id!==p||parte.orden_id!==x.o||parte.orden_labor_id!==v.orden_labor_id||parte.estado!=="borrador") throw new Error("campo_parte_no_editable"); const values=payloadValues(v); const {data,error}=await supabase.from("campo_partes_trabajo").update({fecha_trabajo:values.p_fecha_trabajo,hora_inicio:values.p_hora_inicio??null,hora_fin:values.p_hora_fin??null,descripcion:values.p_descripcion??null,observaciones:values.p_observaciones??null,condiciones_climaticas:values.p_condiciones_climaticas??null}).eq("id",p).eq("comercio_id",x.c).eq("orden_id",x.o).eq("orden_labor_id",parte.orden_labor_id).eq("estado","borrador").select("id").single(); if(error) throw error; return data;},onSuccess:async()=>{await invalidate();toast({title:"Cabecera actualizada"});},onError:e=>toast({title:"No se pudo actualizar el parte",description:campoParteErrorMessage(e),variant:"destructive"})}); }

function useParteMutationContext(c:string|null,o:string|null,p:string|null,ok:boolean,orden:CampoOrdenDetail|null,parte:CampoParte|null) { const invalidate=useInvalidations(c,o,p); const assert=()=>{guard(c,o,ok,orden);if(!isCampoUuid(p)||!parte||parte.id!==p||parte.orden_id!==o) throw new Error("campo_parte_no_disponible");return p;}; return {invalidate,assert}; }
export function useSendCampoParte(c:string|null,o:string|null,p:string|null,ok:boolean,orden:CampoOrdenDetail|null,parte:CampoParte|null) { const x=useParteMutationContext(c,o,p,ok,orden,parte); return useMutation({mutationFn:async()=>{const id=x.assert();if(parte?.estado!=="borrador")throw new Error("campo_parte_no_enviable");const {data,error}=await supabase.rpc("campo_enviar_parte",{p_parte_id:id});if(error)throw error;return data;},onSuccess:async()=>{await x.invalidate();toast({title:"Parte enviado"});},onError:e=>toast({title:"No se pudo enviar",description:campoParteErrorMessage(e),variant:"destructive"})}); }
export function useConfirmCampoParte(c:string|null,o:string|null,p:string|null,ok:boolean,orden:CampoOrdenDetail|null,parte:CampoParte|null) { const x=useParteMutationContext(c,o,p,ok,orden,parte); return useMutation({mutationFn:async()=>{const id=x.assert();if(parte?.estado!=="enviado")throw new Error("campo_parte_no_confirmable");const {data,error}=await supabase.rpc("campo_confirmar_parte",{p_parte_id:id});if(error)throw error;return data;},onSuccess:async data=>{await x.invalidate();toast({title:`Parte N.º ${data.numero} confirmado`});},onError:e=>toast({title:"No se pudo confirmar",description:campoParteErrorMessage(e),variant:"destructive"})}); }
export function useRejectCampoParte(c:string|null,o:string|null,p:string|null,ok:boolean,orden:CampoOrdenDetail|null,parte:CampoParte|null) { const x=useParteMutationContext(c,o,p,ok,orden,parte); return useMutation({mutationFn:async(raw:string)=>{const id=x.assert(),motivo=raw.trim();if(!motivo)throw new Error("campo_rechazo_requiere_motivo");if(parte?.estado!=="enviado")throw new Error("campo_parte_no_rechazable");const {data,error}=await supabase.rpc("campo_rechazar_parte",{p_parte_id:id,p_motivo:motivo});if(error)throw error;return data;},onSuccess:async()=>{await x.invalidate();toast({title:"Parte rechazado"});},onError:e=>toast({title:"No se pudo rechazar",description:campoParteErrorMessage(e),variant:"destructive"})}); }
export function useReopenCampoParte(c:string|null,o:string|null,p:string|null,ok:boolean,orden:CampoOrdenDetail|null,parte:CampoParte|null) { const x=useParteMutationContext(c,o,p,ok,orden,parte); return useMutation({mutationFn:async()=>{const id=x.assert();if(parte?.estado!=="rechazado")throw new Error("campo_parte_no_reabrible");const {data,error}=await supabase.rpc("campo_reabrir_parte",{p_parte_id:id});if(error)throw error;return data;},onSuccess:async()=>{await x.invalidate();toast({title:"Parte reabierto"});},onError:e=>toast({title:"No se pudo reabrir",description:campoParteErrorMessage(e),variant:"destructive"})}); }
export function useDiscardCampoParte(c:string|null,o:string|null,p:string|null,ok:boolean,orden:CampoOrdenDetail|null,parte:CampoParte|null) { const x=useParteMutationContext(c,o,p,ok,orden,parte); return useMutation({mutationFn:async(raw:string)=>{const id=x.assert(),motivo=raw.trim();if(!motivo)throw new Error("campo_descarte_requiere_motivo");if(!parte||!["borrador","rechazado"].includes(parte.estado))throw new Error("campo_parte_no_descartable");const {data,error}=await supabase.rpc("campo_descartar_parte",{p_parte_id:id,p_motivo:motivo});if(error)throw error;return data;},onSuccess:async()=>{await x.invalidate();toast({title:"Parte descartado"});},onError:e=>toast({title:"No se pudo descartar",description:campoParteErrorMessage(e),variant:"destructive"})}); }
export function useAnnulCampoParte(c:string|null,o:string|null,p:string|null,ok:boolean,orden:CampoOrdenDetail|null,parte:CampoParte|null) { const x=useParteMutationContext(c,o,p,ok,orden,parte); return useMutation({mutationFn:async(raw:string)=>{const id=x.assert(),motivo=raw.trim();if(!motivo)throw new Error("campo_anulacion_requiere_motivo");if(parte?.estado!=="confirmado")throw new Error("campo_parte_no_anulable");const {data,error}=await supabase.rpc("campo_anular_parte",{p_parte_id:id,p_motivo:motivo});if(error)throw error;return data;},onSuccess:async()=>{await x.invalidate();toast({title:"Parte anulado"});},onError:e=>toast({title:"No se pudo anular",description:campoParteErrorMessage(e),variant:"destructive"})}); }
