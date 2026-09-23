import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useComercio } from "@/hooks/useComercio";
import { GastoEgreso } from "@/types/gasto";

// Los objetos nuevos se incorporan por migración y todavía no forman parte de los tipos generados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type GastoPayload = Omit<GastoEgreso, "id" | "proveedor">;
export type CategoriaGasto = { id: string; nombre: string };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "No se pudo completar la operación.";

function invalidateGastos(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["gastos-egresos"] });
  queryClient.invalidateQueries({ queryKey: ["caja-diaria"] });
  queryClient.invalidateQueries({ queryKey: ["cajas-diarias"] });
  queryClient.invalidateQueries({ queryKey: ["cuenta-proveedores"] });
}

export function useGastosEgresos(desde?: string, hasta?: string) {
  const { comercio } = useComercio(); const comercioId = comercio?.id;
  return useQuery({ queryKey: ["gastos-egresos", comercioId, desde, hasta], enabled: Boolean(comercioId), queryFn: async () => {
    let query = db.from("gastos_egresos").select("*, proveedor:proveedores(nombre, apellido, razon_social, cuit)").eq("comercio_id", comercioId).order("fecha", { ascending: false });
    if (desde) query = query.gte("fecha", desde);
    if (hasta) query = query.lte("fecha", hasta);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as GastoEgreso[];
  }});
}

export function useCategoriasGastos() {
  const { comercio } = useComercio(); const comercioId = comercio?.id;
  return useQuery({ queryKey: ["gastos-egresos-categorias", comercioId], enabled: Boolean(comercioId), queryFn: async () => {
    const { data, error } = await db.from("gastos_egresos_categorias").select("id, nombre").eq("comercio_id", comercioId).order("nombre");
    if (error) throw error;
    return (data || []) as CategoriaGasto[];
  }});
}

export function useCrearCategoriaGasto() {
  const queryClient = useQueryClient(); const { comercio } = useComercio();
  return useMutation({ mutationFn: async (nombre: string) => {
    if (!comercio?.id) throw new Error("Seleccioná un comercio antes de agregar una categoría.");
    const { data, error } = await db.from("gastos_egresos_categorias").insert({ nombre: nombre.trim(), comercio_id: comercio.id }).select("id, nombre").single();
    if (error) throw error;
    return data as CategoriaGasto;
  }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["gastos-egresos-categorias"] }) });
}

export function useCrearGastoEgreso() {
  const queryClient = useQueryClient(); const { toast } = useToast(); const { comercio } = useComercio();
  return useMutation({ mutationFn: async (gasto: GastoPayload) => {
    if (!comercio?.id) throw new Error("Seleccioná un comercio antes de registrar el gasto.");
    const { data, error } = await db.from("gastos_egresos").insert({ ...gasto, comercio_id: comercio.id }).select().single(); if (error) throw error; return data;
  }, onSuccess: () => { invalidateGastos(queryClient); toast({ title: "Gasto registrado", description: "El gasto fue guardado correctamente." }); }});
}

export function useActualizarGastoEgreso() {
  const queryClient = useQueryClient(); const { toast } = useToast(); const { comercio } = useComercio();
  return useMutation({ mutationFn: async ({ id, gasto }: { id: string; gasto: GastoPayload }) => {
    if (!comercio?.id) throw new Error("Seleccioná un comercio antes de modificar el gasto.");
    const { data, error } = await db.from("gastos_egresos").update({ ...gasto, comercio_id: comercio.id }).eq("id", id).eq("comercio_id", comercio.id).select().single(); if (error) throw error; return data;
  }, onSuccess: () => { invalidateGastos(queryClient); toast({ title: "Gasto actualizado", description: "Los cambios fueron guardados correctamente." }); }, onError: error => toast({ variant: "destructive", title: "No se pudo actualizar el gasto", description: errorMessage(error) }) });
}

export function useEliminarGastoEgreso() {
  const queryClient = useQueryClient(); const { toast } = useToast(); const { comercio } = useComercio();
  return useMutation({ mutationFn: async (id: string) => {
    if (!comercio?.id) throw new Error("Seleccioná un comercio antes de eliminar el gasto.");
    const { error } = await db.from("gastos_egresos").delete().eq("id", id).eq("comercio_id", comercio.id); if (error) throw error;
  }, onSuccess: () => { invalidateGastos(queryClient); toast({ title: "Gasto eliminado", description: "El gasto fue eliminado correctamente." }); }, onError: error => toast({ variant: "destructive", title: "No se pudo eliminar el gasto", description: errorMessage(error) }) });
}
