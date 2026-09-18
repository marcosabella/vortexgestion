import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CampoOrdenDetail } from "@/types/campo";
import { isCampoUuid } from "@/utils/campo";

type EstadoAvance = "pendiente" | "completo" | "sobre_ejecutado";

export type CampoOrdenAvanceItem = {
  asignacionId: string;
  laborId: string;
  labor: string;
  lote: string;
  codigoLote: string | null;
  unidad: string;
  planificado: number;
  ejecutado: number;
  diferencia: number;
  porcentaje: number;
  estado: EstadoAvance;
};

export type CampoOrdenAvanceLabor = {
  laborId: string;
  labor: string;
  unidad: string;
  planificado: number;
  ejecutado: number;
  diferencia: number;
  porcentaje: number;
  estado: EstadoAvance;
};

export type CampoOrdenAvance = {
  items: CampoOrdenAvanceItem[];
  labores: CampoOrdenAvanceLabor[];
  conteos: { labores: number; lotes: number; confirmados: number; borradores: number; anulados: number };
};

const empty = (): CampoOrdenAvance => ({ items: [], labores: [], conteos: { labores: 0, lotes: 0, confirmados: 0, borradores: 0, anulados: 0 } });
const key = (comercioId?: string | null, ordenId?: string | null) => ["campo", comercioId ?? null, "orden", ordenId ?? null, "avance"] as const;
const valid = (comercioId?: string | null, ordenId?: string | null, access = false, orden?: CampoOrdenDetail | null) => isCampoUuid(comercioId) && isCampoUuid(ordenId) && access && orden?.id === ordenId;
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const normalized = (value: number) => Math.round((value + Number.EPSILON) * 10_000) / 10_000;
function metrics(planificadoValue: unknown, ejecutadoValue: unknown) {
  const planificado = normalized(finite(planificadoValue));
  const ejecutado = normalized(finite(ejecutadoValue));
  const diferencia = normalized(ejecutado - planificado);
  const porcentaje = planificado > 0 ? normalized((ejecutado / planificado) * 100) : 0;
  const estado: EstadoAvance = diferencia < 0 ? "pendiente" : diferencia > 0 ? "sobre_ejecutado" : "completo";
  return { planificado, ejecutado, diferencia, porcentaje, estado };
}

export function useCampoOrdenAvance(comercioId?: string | null, ordenId?: string | null, access = false, orden?: CampoOrdenDetail | null) {
  return useQuery({
    queryKey: key(comercioId, ordenId),
    enabled: valid(comercioId, ordenId, access, orden),
    queryFn: async (): Promise<CampoOrdenAvance> => {
      if (!valid(comercioId, ordenId, access, orden)) return empty();

      const laboresResult = await supabase.from("campo_orden_labores").select("id,nombre,unidad,posicion").eq("comercio_id", comercioId!).eq("orden_id", ordenId!).order("posicion").order("id");
      if (laboresResult.error) throw laboresResult.error;
      const labores = laboresResult.data ?? [];
      const laborIds = labores.map((labor) => labor.id);

      const partesResult = await supabase.from("campo_partes_trabajo").select("id,estado").eq("comercio_id", comercioId!).eq("orden_id", ordenId!);
      if (partesResult.error) throw partesResult.error;
      const partes = partesResult.data ?? [];
      const confirmados = partes.filter((parte) => parte.estado === "confirmado").map((parte) => parte.id);
      const conteosBase = {
        labores: labores.length,
        lotes: 0,
        confirmados: confirmados.length,
        borradores: partes.filter((parte) => parte.estado === "borrador").length,
        anulados: partes.filter((parte) => parte.estado === "anulado").length,
      };
      if (!laborIds.length) return { items: [], labores: [], conteos: conteosBase };

      const asignacionesResult = await supabase.from("campo_orden_labor_lotes").select("id,orden_labor_id,cantidad_planificada,lote:campo_lotes!campo_orden_labor_lotes_lote_id_fkey(id,nombre,codigo_interno)").eq("comercio_id", comercioId!).in("orden_labor_id", laborIds).eq("activo", true).order("id");
      if (asignacionesResult.error) throw asignacionesResult.error;
      const asignaciones = asignacionesResult.data ?? [];
      const conteos = { ...conteosBase, lotes: asignaciones.length };
      if (!asignaciones.length) return { items: [], labores: [], conteos };

      const ejecutadoPorAsignacion = new Map<string, number>();
      if (confirmados.length) {
        const detallesResult = await supabase.from("campo_parte_lotes").select("orden_labor_lote_id,cantidad_ejecutada").eq("comercio_id", comercioId!).in("parte_id", confirmados).eq("activo", true);
        if (detallesResult.error) throw detallesResult.error;
        for (const detalle of detallesResult.data ?? []) {
          if (!asignaciones.some((asignacion) => asignacion.id === detalle.orden_labor_lote_id)) continue;
          ejecutadoPorAsignacion.set(detalle.orden_labor_lote_id, normalized((ejecutadoPorAsignacion.get(detalle.orden_labor_lote_id) ?? 0) + finite(detalle.cantidad_ejecutada)));
        }
      }

      const laborById = new Map(labores.map((labor) => [labor.id, labor]));
      const items: CampoOrdenAvanceItem[] = asignaciones.flatMap((asignacion) => {
        const labor = laborById.get(asignacion.orden_labor_id);
        if (!labor || !asignacion.lote) return [];
        return [{ asignacionId: asignacion.id, laborId: labor.id, labor: labor.nombre, lote: asignacion.lote.nombre, codigoLote: asignacion.lote.codigo_interno, unidad: labor.unidad, ...metrics(asignacion.cantidad_planificada, ejecutadoPorAsignacion.get(asignacion.id) ?? 0) }];
      });
      const laborTotals = new Map<string, { labor: string; unidad: string; planificado: number; ejecutado: number }>();
      for (const item of items) {
        const total = laborTotals.get(item.laborId) ?? { labor: item.labor, unidad: item.unidad, planificado: 0, ejecutado: 0 };
        total.planificado = normalized(total.planificado + item.planificado);
        total.ejecutado = normalized(total.ejecutado + item.ejecutado);
        laborTotals.set(item.laborId, total);
      }
      const resumenLabores = Array.from(laborTotals, ([laborId, total]) => ({ laborId, labor: total.labor, unidad: total.unidad, ...metrics(total.planificado, total.ejecutado) }));
      return { items, labores: resumenLabores, conteos };
    },
  });
}
