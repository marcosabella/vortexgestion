import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { isCampoUuid } from "@/utils/campo";

export type CampoComprobante = {
  id: string; orden_id: string; venta_id: string; moneda: "ARS" | "USD"; estado: string; created_at: string;
  venta: { id: string; numero_comprobante: string; tipo_comprobante: string; fecha_venta: string; tipo_pago: string; total: number; cae: string | null } | null;
};

export const campoComprobantesKey = (comercioId?: string | null, ordenId?: string | null) =>
  ["campo", comercioId ?? null, "orden", ordenId ?? null, "comprobantes"] as const;

type TipoComprobante = Database["public"]["Enums"]["tipo_comprobante"];

const enabled = (comercioId?: string | null, ordenId?: string | null, admin = false) =>
  admin && isCampoUuid(comercioId) && isCampoUuid(ordenId);

const message = (error: unknown) => {
  const value = error as { code?: string; message?: string };
  const text = value.message?.toLowerCase() ?? "";
  if (text.includes("no_finalizada")) return "La orden debe estar finalizada para facturar.";
  if (text.includes("ya_facturada")) return "La moneda seleccionada ya tiene un comprobante Campo.";
  if (text.includes("sin_ejecucion")) return "No hay ejecución facturable confirmada para esa moneda.";
  if (text.includes("idempotency")) return "El intento de facturación ya fue procesado o sus datos no coinciden.";
  if (value.code === "42501" || text.includes("no_disponible")) return "No tenés permisos para facturar esta orden.";
  return "No se pudo facturar la orden. Verificá los datos e intentá nuevamente.";
};

export function useCampoOrdenComprobantes(comercioId?: string | null, ordenId?: string | null, isAdmin = false) {
  return useQuery({
    queryKey: campoComprobantesKey(comercioId, ordenId), enabled: enabled(comercioId, ordenId, isAdmin),
    queryFn: async (): Promise<CampoComprobante[]> => {
      if (!enabled(comercioId, ordenId, isAdmin)) return [];
      const { data, error } = await supabase.from("campo_orden_comprobantes").select("id,orden_id,venta_id,moneda,estado,created_at,venta:ventas!campo_orden_comprobantes_venta_fkey(id,numero_comprobante,tipo_comprobante,fecha_venta,tipo_pago,total,cae)")
        .eq("comercio_id", comercioId!).eq("orden_id", ordenId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CampoComprobante[];
    },
  });
}

export function useFacturarCampoOrden(comercioId?: string | null, ordenId?: string | null, isAdmin = false, ordenFinalizada = false) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { moneda: "ARS" | "USD"; tipo: string; puntoVenta: number; modalidad: "transferencia" | "cta_cte"; idempotencyKey: string }) => {
      if (!enabled(comercioId, ordenId, isAdmin) || !ordenFinalizada) throw new Error("La orden no está disponible para facturación.");
      if (!Number.isInteger(input.puntoVenta) || input.puntoVenta <= 0) throw new Error("El punto de venta debe ser un entero positivo.");
      const { data, error } = await supabase.rpc("campo_facturar_orden", { p_orden_id: ordenId!, p_moneda: input.moneda, p_tipo_comprobante: input.tipo as TipoComprobante, p_punto_venta: input.puntoVenta, p_modalidad: input.modalidad, p_idempotency_key: input.idempotencyKey });
      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, values) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: campoComprobantesKey(comercioId, ordenId), exact: true }),
        client.invalidateQueries({ queryKey: ["campo", comercioId, "orden", ordenId], exact: true }),
        client.invalidateQueries({ queryKey: ["campo", comercioId, "ordenes"], exact: true }),
        client.invalidateQueries({ queryKey: ["ventas"] }),
        ...(values.modalidad === "cta_cte" ? [client.invalidateQueries({ queryKey: ["cuenta-corriente"] })] : []),
      ]);
    },
    meta: { errorMessage: message },
  });
}

export { message as campoFacturacionErrorMessage };
