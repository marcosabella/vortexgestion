import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { CampoOrdenDetail, CampoParte } from "@/types/campo";
import { isCampoUuid } from "@/utils/campo";

export type CampoParteLote = {
  id: string;
  parte_id: string;
  orden_labor_lote_id: string;
  cantidad_ejecutada: number;
  observaciones: string | null;
  activo: boolean;
  asignacion: {
    id: string;
    orden_labor_id: string;
    cantidad_planificada: number;
    activo: boolean;
    lote: {
      id: string;
      nombre: string;
      codigo_interno: string | null;
      activo: boolean;
    } | null;
  } | null;
};
export type CampoParteLoteCandidate = NonNullable<CampoParteLote["asignacion"]>;
export type CampoParteLoteValues = {
  orden_labor_lote_id: string;
  cantidad_ejecutada: number;
  observaciones: string | null;
};

const key = (c?: string | null, o?: string | null, p?: string | null) =>
  [
    "campo",
    c ?? null,
    "orden",
    o ?? null,
    "parte",
    p ?? null,
    "lotes",
  ] as const;
function authorized(
  c: string | null | undefined,
  o: string | null | undefined,
  p: string | null | undefined,
  access: boolean,
  orden?: CampoOrdenDetail | null,
  parte?: CampoParte | null,
) {
  return isCampoUuid(c) && isCampoUuid(o) && isCampoUuid(p) && access &&
    orden?.id === o && parte?.id === p && parte.orden_id === o &&
    isCampoUuid(parte.orden_labor_id);
}
function assertWrite(
  c: string | null,
  o: string | null,
  p: string | null,
  access: boolean,
  isAdmin: boolean,
  orden: CampoOrdenDetail | null,
  parte: CampoParte | null,
) {
  if (
    !authorized(c, o, p, access, orden, parte) || !isAdmin ||
    parte?.estado !== "borrador" ||
    ["finalizada", "cancelada"].includes(orden?.estado ?? "")
  ) throw new Error("campo_parte_congelado");
  return { c: c!, p: p! };
}
function errorMessage(error: unknown) {
  const e = error as { code?: string; message?: string },
    m = e.message?.toLowerCase() ?? "";
  if (e.code === "23505") {
    return "La asignación ya fue utilizada en este parte.";
  }
  if (m.includes("fijo")) {
    return "Para una labor fija, la cantidad debe ser exactamente 1.";
  }
  if (e.code === "23514" || m.includes("cantidad")) {
    return "La cantidad debe ser un número mayor que cero.";
  }
  if (m.includes("congelado")) {
    return "El parte está confirmado o anulado y no admite cambios.";
  }
  if (m.includes("asignacion_planificada_inactiva")) {
    return "La asignación planificada está inactiva.";
  }
  if (m.includes("asignacion_planificada_invalida")) {
    return "La asignación no pertenece a la labor autorizada.";
  }
  if (m.includes("lote") && m.includes("inactiv")) {
    return "El lote está inactivo.";
  }
  if (
    e.code === "42501" || m.includes("row-level security") ||
    m.includes("permission denied")
  ) return "No tenés permisos para modificar avances.";
  if (e.code === "PGRST116") {
    return "El avance no existe o no pertenece al parte.";
  }
  return "No se pudo guardar el avance. Revisá los datos e intentá nuevamente.";
}

export function useCampoParteLotes(
  c?: string | null,
  o?: string | null,
  p?: string | null,
  access = false,
  orden?: CampoOrdenDetail | null,
  parte?: CampoParte | null,
) {
  return useQuery({
    queryKey: key(c, o, p),
    enabled: authorized(c, o, p, access, orden, parte),
    queryFn: async (): Promise<
      { items: CampoParteLote[]; candidates: CampoParteLoteCandidate[] }
    > => {
      if (!authorized(c, o, p, access, orden, parte)) {
        return { items: [], candidates: [] };
      }
      const detail = await supabase.from("campo_parte_lotes").select(
        "id,parte_id,orden_labor_lote_id,cantidad_ejecutada,observaciones,activo,asignacion:campo_orden_labor_lotes!campo_parte_lotes_asignacion_fkey(id,orden_labor_id,cantidad_planificada,activo,lote:campo_lotes!campo_orden_labor_lotes_lote_id_fkey(id,nombre,codigo_interno,activo))",
      ).eq("comercio_id", c!).eq("parte_id", p!).order("created_at").order(
        "id",
      );
      if (detail.error) throw detail.error;
      const planned = await supabase.from("campo_orden_labor_lotes").select(
        "id,orden_labor_id,cantidad_planificada,activo,lote:campo_lotes!campo_orden_labor_lotes_lote_id_fkey(id,nombre,codigo_interno,activo)",
      ).eq("comercio_id", c!).eq("orden_labor_id", parte!.orden_labor_id).eq(
        "activo",
        true,
      ).order("id");
      if (planned.error) throw planned.error;
      const items = (detail.data ?? []) as CampoParteLote[],
        used = new Set(items.map((x) => x.orden_labor_lote_id));
      const candidates = (planned.data ?? []).filter((x) =>
        x.lote?.activo && !used.has(x.id)
      ) as CampoParteLoteCandidate[];
      return { items, candidates };
    },
  });
}

export function useCreateCampoParteLote(
  c: string | null,
  o: string | null,
  p: string | null,
  access: boolean,
  isAdmin: boolean,
  orden: CampoOrdenDetail | null,
  parte: CampoParte | null,
  candidates: CampoParteLoteCandidate[],
) {
  const q = useQueryClient();
  return useMutation({
    mutationFn: async (v: CampoParteLoteValues) => {
      const x = assertWrite(c, o, p, access, isAdmin, orden, parte),
        candidate = candidates.find((a) =>
          a.id === v.orden_labor_lote_id &&
          a.orden_labor_id === parte!.orden_labor_id && a.activo &&
          a.lote?.activo
        );
      if (!candidate) throw new Error("campo_asignacion_planificada_invalida");
      if (!Number.isFinite(v.cantidad_ejecutada) || v.cantidad_ejecutada <= 0) {
        throw new Error("cantidad inválida");
      }
      if (parte!.labor?.unidad === "fijo" && v.cantidad_ejecutada !== 1) {
        throw new Error("campo_cantidad_fijo_debe_ser_uno");
      }
      const payload = {
        comercio_id: x.c,
        parte_id: x.p,
        orden_labor_lote_id: candidate.id,
        cantidad_ejecutada: v.cantidad_ejecutada,
        observaciones: v.observaciones,
      };
      const { data, error } = await supabase.from("campo_parte_lotes").insert(
        payload,
      ).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        q.invalidateQueries({ queryKey: key(c, o, p) }),
        q.invalidateQueries({ queryKey: ["campo", c, "orden", o, "avance"] }),
      ]);
      toast({ title: "Avance agregado" });
    },
    onError: (e) =>
      toast({
        title: "No se pudo guardar",
        description: errorMessage(e),
        variant: "destructive",
      }),
  });
}
function assertItem(
  item: CampoParteLote | null,
  id: string,
  assignmentId: string,
) {
  if (!item || item.id !== id || item.orden_labor_lote_id !== assignmentId) {
    throw new Error("relación ajena");
  }
}
export function useUpdateCampoParteLote(
  c: string | null,
  o: string | null,
  p: string | null,
  access: boolean,
  isAdmin: boolean,
  orden: CampoOrdenDetail | null,
  parte: CampoParte | null,
  item: CampoParteLote | null,
) {
  const q = useQueryClient();
  return useMutation({
    mutationFn: async (
      v: {
        id: string;
        orden_labor_lote_id: string;
        cantidad_ejecutada: number;
        observaciones: string | null;
      },
    ) => {
      const x = assertWrite(c, o, p, access, isAdmin, orden, parte);
      assertItem(item, v.id, v.orden_labor_lote_id);
      if (!Number.isFinite(v.cantidad_ejecutada) || v.cantidad_ejecutada <= 0) {
        throw new Error("cantidad inválida");
      }
      if (parte!.labor?.unidad === "fijo" && v.cantidad_ejecutada !== 1) {
        throw new Error("campo_cantidad_fijo_debe_ser_uno");
      }
      const payload = {
        cantidad_ejecutada: v.cantidad_ejecutada,
        observaciones: v.observaciones,
      };
      const { data, error } = await supabase.from("campo_parte_lotes").update(
        payload,
      ).eq("id", v.id).eq("comercio_id", x.c).eq("parte_id", x.p).eq(
        "orden_labor_lote_id",
        v.orden_labor_lote_id,
      ).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        q.invalidateQueries({ queryKey: key(c, o, p) }),
        q.invalidateQueries({ queryKey: ["campo", c, "orden", o, "avance"] }),
      ]);
      toast({ title: "Avance actualizado" });
    },
    onError: (e) =>
      toast({
        title: "No se pudo guardar",
        description: errorMessage(e),
        variant: "destructive",
      }),
  });
}
export function useSetCampoParteLoteStatus(
  c: string | null,
  o: string | null,
  p: string | null,
  access: boolean,
  isAdmin: boolean,
  orden: CampoOrdenDetail | null,
  parte: CampoParte | null,
  item: CampoParteLote | null,
) {
  const q = useQueryClient();
  return useMutation({
    mutationFn: async (
      v: { id: string; orden_labor_lote_id: string; nuevoEstado: boolean },
    ) => {
      const x = assertWrite(c, o, p, access, isAdmin, orden, parte);
      assertItem(item, v.id, v.orden_labor_lote_id);
      if (v.nuevoEstado && (!item?.asignacion?.activo || item.asignacion.lote?.activo !== true)) {
        throw new Error("campo_asignacion_planificada_inactiva");
      }
      const payload = { activo: v.nuevoEstado };
      const { data, error } = await supabase.from("campo_parte_lotes").update(
        payload,
      ).eq("id", v.id).eq("comercio_id", x.c).eq("parte_id", x.p).eq(
        "orden_labor_lote_id",
        v.orden_labor_lote_id,
      ).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        q.invalidateQueries({ queryKey: key(c, o, p) }),
        q.invalidateQueries({ queryKey: ["campo", c, "orden", o, "avance"] }),
      ]);
      toast({ title: "Estado actualizado" });
    },
    onError: (e) =>
      toast({
        title: "No se pudo cambiar el estado",
        description: errorMessage(e),
        variant: "destructive",
      }),
  });
}
