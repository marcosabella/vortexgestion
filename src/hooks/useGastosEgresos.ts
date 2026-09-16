import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { GastoEgreso } from "@/types/gasto";

const db = supabase as any;
type GastoPayload = Omit<GastoEgreso, "id" | "proveedor">;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "No se pudo completar la operación.";

function invalidateGastos(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["gastos-egresos"] });
  queryClient.invalidateQueries({ queryKey: ["caja-diaria"] });
  queryClient.invalidateQueries({ queryKey: ["cajas-diarias"] });
}

export function useGastosEgresos(desde?: string, hasta?: string) {
  return useQuery({ queryKey: ["gastos-egresos", desde, hasta], queryFn: async () => {
    let query = db.from("gastos_egresos").select("*, proveedor:proveedores(nombre, apellido, razon_social)").order("fecha", { ascending: false });
    if (desde) query = query.gte("fecha", desde);
    if (hasta) query = query.lte("fecha", hasta);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as GastoEgreso[];
  }});
}

export function useCrearGastoEgreso() {
  const queryClient = useQueryClient(); const { toast } = useToast();
  return useMutation({ mutationFn: async (gasto: GastoPayload) => {
    const { data, error } = await db.from("gastos_egresos").insert(gasto).select().single(); if (error) throw error; return data;
  }, onSuccess: () => { invalidateGastos(queryClient); toast({ title: "Gasto registrado", description: "El gasto fue guardado correctamente." }); }});
}

export function useActualizarGastoEgreso() {
  const queryClient = useQueryClient(); const { toast } = useToast();
  return useMutation({ mutationFn: async ({ id, gasto }: { id: string; gasto: GastoPayload }) => {
    const { data, error } = await db.from("gastos_egresos").update(gasto).eq("id", id).select().single(); if (error) throw error; return data;
  }, onSuccess: () => { invalidateGastos(queryClient); toast({ title: "Gasto actualizado", description: "Los cambios fueron guardados correctamente." }); }, onError: error => toast({ variant: "destructive", title: "No se pudo actualizar el gasto", description: errorMessage(error) }) });
}

export function useEliminarGastoEgreso() {
  const queryClient = useQueryClient(); const { toast } = useToast();
  return useMutation({ mutationFn: async (id: string) => {
    const { error } = await db.from("gastos_egresos").delete().eq("id", id); if (error) throw error;
  }, onSuccess: () => { invalidateGastos(queryClient); toast({ title: "Gasto eliminado", description: "El gasto fue eliminado correctamente." }); }, onError: error => toast({ variant: "destructive", title: "No se pudo eliminar el gasto", description: errorMessage(error) }) });
}
