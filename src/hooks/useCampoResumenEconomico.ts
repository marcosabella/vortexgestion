import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isCampoUuid } from "@/utils/campo";

type Moneda = "ARS" | "USD";
type Totales = { previsto_neto: number; previsto_iva: number; previsto_total: number; efectivo_neto: number; efectivo_iva: number; efectivo_total: number; costo_efectivo_conocido: number; cantidad_costos_desconocidos: number; margen_conocido: number; margen_completo: boolean };
export type CampoResumenEconomico = { version: 1; orden_id: string; comercio_id: string; estado: string; ingresos_por_labor: Array<{ labor_id: string; nombre: string; unidad: string; moneda: Moneda; porcentaje_iva: number; neto_previsto: number; iva_previsto: number; total_previsto: number; neto_efectivo: number; iva_efectivo: number; total_efectivo: number }>; totales_por_moneda: Record<Moneda, Totales>; advertencias: string[] };

export const campoResumenEconomicoKey = (comercioId?: string | null, ordenId?: string | null) => ["campo", comercioId ?? null, "orden", ordenId ?? null, "economico"] as const;
export const invalidateCampoResumenEconomico = (queryClient: QueryClient, comercioId?: string | null, ordenId?: string | null) => queryClient.invalidateQueries({ queryKey: campoResumenEconomicoKey(comercioId, ordenId), exact: true });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isMoneda = (value: unknown): value is Moneda => value === "ARS" || value === "USD";
const isTotales = (value: unknown): value is Totales => isRecord(value) && isNumber(value.previsto_neto) && isNumber(value.previsto_iva) && isNumber(value.previsto_total) && isNumber(value.efectivo_neto) && isNumber(value.efectivo_iva) && isNumber(value.efectivo_total) && isNumber(value.costo_efectivo_conocido) && isNumber(value.cantidad_costos_desconocidos) && Number.isInteger(value.cantidad_costos_desconocidos) && value.cantidad_costos_desconocidos >= 0 && isNumber(value.margen_conocido) && typeof value.margen_completo === "boolean";
function parseResumen(value: unknown): CampoResumenEconomico {
  if (!isRecord(value) || value.version !== 1 || typeof value.orden_id !== "string" || typeof value.comercio_id !== "string" || typeof value.estado !== "string" || !Array.isArray(value.advertencias) || !value.advertencias.every((item) => typeof item === "string") || !isRecord(value.totales_por_moneda) || !isTotales(value.totales_por_moneda.ARS) || !isTotales(value.totales_por_moneda.USD) || !Array.isArray(value.ingresos_por_labor)) throw new Error("campo_resumen_invalido");
  if (!value.ingresos_por_labor.every((item) => isRecord(item) && typeof item.labor_id === "string" && typeof item.nombre === "string" && typeof item.unidad === "string" && isMoneda(item.moneda) && isNumber(item.porcentaje_iva) && isNumber(item.neto_previsto) && isNumber(item.iva_previsto) && isNumber(item.total_previsto) && isNumber(item.neto_efectivo) && isNumber(item.iva_efectivo) && isNumber(item.total_efectivo))) throw new Error("campo_resumen_invalido");
  return value as CampoResumenEconomico;
}
export function useCampoResumenEconomico(comercioId?: string | null, ordenId?: string | null, enabled = false) {
  return useQuery({ queryKey: campoResumenEconomicoKey(comercioId, ordenId), enabled: enabled && isCampoUuid(comercioId) && isCampoUuid(ordenId), queryFn: async () => { const { data, error } = await supabase.rpc("campo_resumen_economico_orden", { p_orden_id: ordenId! }); if (error) throw error; const resumen = parseResumen(data); if (resumen.orden_id !== ordenId || resumen.comercio_id !== comercioId) throw new Error("campo_resumen_invalido"); return resumen; } });
}
