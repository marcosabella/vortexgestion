import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { GastoEgreso } from "@/types/gasto";

const db = supabase as any;

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
  return useMutation({ mutationFn: async (gasto: Omit<GastoEgreso, "id" | "proveedor">) => {
    const { data, error } = await db.from("gastos_egresos").insert(gasto).select().single(); if (error) throw error; return data;
  }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["gastos-egresos"] }); queryClient.invalidateQueries({ queryKey: ["caja-diaria"] }); toast({ title: "Gasto registrado", description: "El gasto fue guardado correctamente." }); }});
}
