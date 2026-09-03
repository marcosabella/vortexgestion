import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type {
  CampoOperario,
  CampoOrdenDetail,
  CampoParte,
} from "@/types/campo";
import { isCampoUuid } from "@/utils/campo";

export type CampoParteOperario = {
  id: string;
  parte_id: string;
  operario_id: string;
  funcion: string | null;
  horas_trabajadas: number | null;
  observaciones: string | null;
  activo: boolean;
  operario:
    | Pick<CampoOperario, "id" | "nombre" | "codigo_interno" | "activo">
    | null;
};
export type CampoParteOperarioValues = {
  operario_id: string;
  funcion: string | null;
  horas_trabajadas: number | null;
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
    "operarios",
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
  admin: boolean,
  orden: CampoOrdenDetail | null,
  parte: CampoParte | null,
) {
  if (
    !authorized(c, o, p, access, orden, parte) || !admin ||
    parte?.estado !== "borrador" ||
    ["finalizada", "cancelada"].includes(orden?.estado ?? "")
  ) throw new Error("campo_parte_congelado");
  return { c: c!, p: p! };
}
function safeMessage(error: unknown) {
  const e = error as { code?: string; message?: string },
    m = e.message?.toLowerCase() ?? "";
  if (e.code === "23505") return "El operario ya fue agregado a este parte.";
  if (m.includes("operario_inactivo")) return "El operario está inactivo.";
  if (m.includes("operario_invalido")) {
    return "El operario no existe o no pertenece al comercio.";
  }
  if (m.includes("congelado")) return "El parte está confirmado o anulado.";
  if (e.code === "23514" && m.includes("horas")) {
    return "Las horas deben ser mayores que cero.";
  }
  if (e.code === "23514" && m.includes("funcion")) {
    return "La función no es válida.";
  }
  if (
    e.code === "42501" || m.includes("row-level security") ||
    m.includes("permission denied")
  ) return "No tenés permisos para modificar operarios del parte.";
  if (e.code === "PGRST116") {
    return "La asignación no existe o no pertenece al parte.";
  }
  return "No se pudo guardar el operario del parte.";
}
export function useCampoParteOperarios(
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
      { items: CampoParteOperario[]; candidates: CampoOperario[] }
    > => {
      if (!authorized(c, o, p, access, orden, parte)) {
        return { items: [], candidates: [] };
      }
      const details = await supabase.from("campo_parte_operarios").select(
        "id,parte_id,operario_id,funcion,horas_trabajadas,observaciones,activo,operario:campo_operarios!campo_parte_operarios_operario_fkey(id,nombre,codigo_interno,activo)",
      ).eq("comercio_id", c!).eq("parte_id", p!).order("created_at").order(
        "id",
      );
      if (details.error) throw details.error;
      const catalog = await supabase.from("campo_operarios").select(
        "id,nombre,codigo_interno,documento,telefono,observaciones,activo,created_at,updated_at",
      ).eq("comercio_id", c!).eq("activo", true).order("nombre").order("id");
      if (catalog.error) throw catalog.error;
      const items = (details.data ?? []) as CampoParteOperario[],
        used = new Set(items.map((x) => x.operario_id));
      return {
        items,
        candidates: (catalog.data ?? []).filter((x) => !used.has(x.id)),
      };
    },
  });
}
export function useCreateCampoParteOperario(
  c: string | null,
  o: string | null,
  p: string | null,
  access: boolean,
  admin: boolean,
  orden: CampoOrdenDetail | null,
  parte: CampoParte | null,
  candidates: CampoOperario[],
) {
  const q = useQueryClient();
  return useMutation({
    mutationFn: async (v: CampoParteOperarioValues) => {
      const x = assertWrite(c, o, p, access, admin, orden, parte),
        candidate = candidates.find((a) => a.id === v.operario_id && a.activo);
      if (!candidate) throw new Error("campo_operario_invalido");
      const payload = {
        comercio_id: x.c,
        parte_id: x.p,
        operario_id: candidate.id,
        funcion: v.funcion,
        horas_trabajadas: v.horas_trabajadas,
        observaciones: v.observaciones,
      };
      const { data, error } = await supabase.from("campo_parte_operarios")
        .insert(payload).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await q.invalidateQueries({ queryKey: key(c, o, p) });
      toast({ title: "Operario agregado" });
    },
    onError: (e) =>
      toast({
        title: "No se pudo guardar",
        description: safeMessage(e),
        variant: "destructive",
      }),
  });
}
function assertItem(
  item: CampoParteOperario | null,
  id: string,
  operarioId: string,
) {
  if (!item || item.id !== id || item.operario_id !== operarioId) {
    throw new Error("detalle ajeno");
  }
}
export function useUpdateCampoParteOperario(
  c: string | null,
  o: string | null,
  p: string | null,
  access: boolean,
  admin: boolean,
  orden: CampoOrdenDetail | null,
  parte: CampoParte | null,
  item: CampoParteOperario | null,
) {
  const q = useQueryClient();
  return useMutation({
    mutationFn: async (
      v: {
        id: string;
        operario_id: string;
        funcion: string | null;
        horas_trabajadas: number | null;
        observaciones: string | null;
      },
    ) => {
      const x = assertWrite(c, o, p, access, admin, orden, parte);
      assertItem(item, v.id, v.operario_id);
      const payload = {
        funcion: v.funcion,
        horas_trabajadas: v.horas_trabajadas,
        observaciones: v.observaciones,
      };
      const { data, error } = await supabase.from("campo_parte_operarios")
        .update(payload).eq("id", v.id).eq("comercio_id", x.c).eq(
          "parte_id",
          x.p,
        ).eq("operario_id", v.operario_id).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await q.invalidateQueries({ queryKey: key(c, o, p) });
      toast({ title: "Asignación actualizada" });
    },
    onError: (e) =>
      toast({
        title: "No se pudo guardar",
        description: safeMessage(e),
        variant: "destructive",
      }),
  });
}
export function useSetCampoParteOperarioStatus(
  c: string | null,
  o: string | null,
  p: string | null,
  access: boolean,
  admin: boolean,
  orden: CampoOrdenDetail | null,
  parte: CampoParte | null,
  item: CampoParteOperario | null,
) {
  const q = useQueryClient();
  return useMutation({
    mutationFn: async (
      v: { id: string; operario_id: string; nuevoEstado: boolean },
    ) => {
      const x = assertWrite(c, o, p, access, admin, orden, parte);
      assertItem(item, v.id, v.operario_id);
      if (v.nuevoEstado && item?.operario?.activo !== true) {
        throw new Error("campo_operario_inactivo");
      }
      const payload = { activo: v.nuevoEstado };
      const { data, error } = await supabase.from("campo_parte_operarios")
        .update(payload).eq("id", v.id).eq("comercio_id", x.c).eq(
          "parte_id",
          x.p,
        ).eq("operario_id", v.operario_id).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await q.invalidateQueries({ queryKey: key(c, o, p) });
      toast({ title: "Estado actualizado" });
    },
    onError: (e) =>
      toast({
        title: "No se pudo cambiar el estado",
        description: safeMessage(e),
        variant: "destructive",
      }),
  });
}
