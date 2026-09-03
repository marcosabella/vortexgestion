import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { isCampoUuid } from "@/utils/campo";
import type { CampoOrdenDetail, CampoOrdenLaborListItem, CampoParte, CampoParteFormValues } from "@/types/campo";

const listKey = (c?: string | null, o?: string | null) => ["campo", c ?? null, "orden", o ?? null, "partes"] as const;
const detailKey = (c?: string | null, o?: string | null, p?: string | null) => ["campo", c ?? null, "orden", o ?? null, "parte", p ?? null] as const;
function guard(c: string | null | undefined, o: string | null | undefined, ok: boolean, orden?: CampoOrdenDetail | null) {
  if (!isCampoUuid(c) || !isCampoUuid(o) || !ok || !orden || orden.id !== o) throw new Error("campo_sin_acceso");
  return { c, o };
}
const payloadValues = (v: CampoParteFormValues) => ({ fecha_trabajo: v.fecha_trabajo, hora_inicio: v.hora_inicio || null, hora_fin: v.hora_fin || null, descripcion: v.descripcion.trim() || null, observaciones: v.observaciones.trim() || null, condiciones_climaticas: v.condiciones_climaticas.trim() || null });
function safeMessage(error: unknown) {
  const e = error as { code?: string; message?: string }, message = e.message?.toLowerCase() ?? "";
  if (message.includes("labor_invalida") || message.includes("labor_inactiva")) return "La labor no está disponible para esta orden.";
  if (message.includes("congelado") || message.includes("no_confirmable") || message.includes("no_anulable")) return "El parte cambió de estado y ya no admite esta operación.";
  if (e.code === "PGRST116") return "El parte no existe, cambió de estado o no pertenece a esta orden.";
  if (e.code === "42501" || message.includes("row-level security") || message.includes("permission denied") || message.includes("sin_acceso")) return "No tenés permisos para modificar este parte.";
  return "No se pudo completar la operación sobre el parte.";
}

export function useCampoPartes(c?: string | null, o?: string | null, ok = false, orden?: CampoOrdenDetail | null) {
  return useQuery({ queryKey: listKey(c, o), enabled: isCampoUuid(c) && isCampoUuid(o) && ok && orden?.id === o, queryFn: async (): Promise<CampoParte[]> => {
    const x = guard(c, o, ok, orden);
    const { data, error } = await supabase.from("campo_partes_trabajo").select("id,orden_id,orden_labor_id,numero,estado,fecha_trabajo,hora_inicio,hora_fin,descripcion,observaciones,condiciones_climaticas,confirmado_at,anulado_at,motivo_anulacion,created_at,updated_at,labor:campo_orden_labores!campo_partes_labor_fkey(nombre,codigo_interno,unidad,activo)").eq("comercio_id", x.c).eq("orden_id", x.o).order("numero", { ascending: false }).order("id", { ascending: false });
    if (error) throw error;
    return (data ?? []) as CampoParte[];
  } });
}
export function useCampoParte(c?: string | null, o?: string | null, p?: string | null, ok = false, orden?: CampoOrdenDetail | null) {
  return useQuery({ queryKey: detailKey(c, o, p), enabled: isCampoUuid(c) && isCampoUuid(o) && isCampoUuid(p) && ok && orden?.id === o, queryFn: async (): Promise<CampoParte | null> => {
    const x = guard(c, o, ok, orden);
    if (!isCampoUuid(p)) return null;
    const { data, error } = await supabase.from("campo_partes_trabajo").select("id,orden_id,orden_labor_id,numero,estado,fecha_trabajo,hora_inicio,hora_fin,descripcion,observaciones,condiciones_climaticas,confirmado_at,anulado_at,motivo_anulacion,created_at,updated_at,labor:campo_orden_labores!campo_partes_labor_fkey(nombre,codigo_interno,unidad,activo)").eq("id", p).eq("comercio_id", x.c).eq("orden_id", x.o).maybeSingle();
    if (error) throw error;
    return data as CampoParte | null;
  } });
}
function useInvalidations(c?: string | null, o?: string | null, p?: string | null) {
  const q = useQueryClient();
  return () => Promise.all([q.invalidateQueries({ queryKey: listKey(c, o), exact: true }), q.invalidateQueries({ queryKey: detailKey(c, o, p), exact: true }), q.invalidateQueries({ queryKey: ["campo", c, "orden", o], exact: true }), q.invalidateQueries({ queryKey: ["campo", c, "ordenes"], exact: true }), q.invalidateQueries({ queryKey: ["campo", c, "orden", o, "avance"], exact: true })]);
}
export function useCreateCampoParte(c: string | null, o: string | null, ok: boolean, orden: CampoOrdenDetail | null, labores: CampoOrdenLaborListItem[]) {
  const invalidate = useInvalidations(c, o);
  return useMutation({ mutationFn: async (v: CampoParteFormValues) => {
    const x = guard(c, o, ok, orden), labor = labores.find((item) => item.id === v.orden_labor_id && item.activo);
    if (!["planificada", "en_progreso"].includes(orden!.estado) || !labor || labor.orden_id !== x.o) throw new Error("campo_labor_invalida");
    const payload = { comercio_id: x.c, orden_id: x.o, orden_labor_id: labor.id, ...payloadValues(v) };
    const { data, error } = await supabase.from("campo_partes_trabajo").insert(payload).select("id,numero,estado").single();
    if (error) throw error;
    return data;
  }, onSuccess: async () => { await invalidate(); toast({ title: "Parte creado" }); }, onError: (error) => toast({ title: "No se pudo crear el parte", description: safeMessage(error), variant: "destructive" }) });
}
export function useUpdateCampoParte(c: string | null, o: string | null, p: string | null, ok: boolean, orden: CampoOrdenDetail | null, parte: CampoParte | null) {
  const invalidate = useInvalidations(c, o, p);
  return useMutation({ mutationFn: async (v: CampoParteFormValues) => {
    const x = guard(c, o, ok, orden);
    if (!isCampoUuid(p) || !parte || parte.id !== p || parte.orden_id !== x.o || parte.orden_labor_id !== v.orden_labor_id || parte.estado !== "borrador") throw new Error("campo_parte_congelado");
    const payload = payloadValues(v);
    const { data, error } = await supabase.from("campo_partes_trabajo").update(payload).eq("id", p).eq("comercio_id", x.c).eq("orden_id", x.o).eq("orden_labor_id", parte.orden_labor_id).eq("estado", "borrador").select("id").single();
    if (error) throw error;
    return data;
  }, onSuccess: async () => { await invalidate(); toast({ title: "Cabecera del parte actualizada" }); }, onError: (error) => toast({ title: "No se pudo actualizar el parte", description: safeMessage(error), variant: "destructive" }) });
}
export function useConfirmCampoParte(c: string | null, o: string | null, p: string | null, ok: boolean, orden: CampoOrdenDetail | null, parte: CampoParte | null) {
  const invalidate = useInvalidations(c, o, p);
  return useMutation({ mutationFn: async () => { guard(c, o, ok, orden); if (!isCampoUuid(p) || !parte || parte.id !== p || parte.orden_id !== o || parte.estado !== "borrador") throw new Error("campo_parte_no_confirmable"); const { data, error } = await supabase.rpc("campo_confirmar_parte", { p_parte_id: p }); if (error) throw error; return data; }, onSuccess: async (data) => { await invalidate(); toast({ title: `Parte N.º ${data.numero} confirmado` }); }, onError: (error) => toast({ title: "No se pudo confirmar el parte", description: safeMessage(error), variant: "destructive" }) });
}
export function useAnnulCampoParte(c: string | null, o: string | null, p: string | null, ok: boolean, orden: CampoOrdenDetail | null, parte: CampoParte | null) {
  const invalidate = useInvalidations(c, o, p);
  return useMutation({ mutationFn: async (rawMotivo: string) => { guard(c, o, ok, orden); const motivo = rawMotivo.trim(); if (!motivo || !isCampoUuid(p) || !parte || parte.id !== p || parte.orden_id !== o || parte.estado !== "confirmado") throw new Error("campo_parte_no_anulable"); const { data, error } = await supabase.rpc("campo_anular_parte", { p_parte_id: p, p_motivo: motivo }); if (error) throw error; return data; }, onSuccess: async () => { await invalidate(); toast({ title: "Parte anulado" }); }, onError: (error) => toast({ title: "No se pudo anular el parte", description: safeMessage(error), variant: "destructive" }) });
}
