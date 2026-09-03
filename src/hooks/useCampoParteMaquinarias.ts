import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type {
  CampoMaquinaria,
  CampoOrdenDetail,
  CampoParte,
} from "@/types/campo";
import { isCampoUuid } from "@/utils/campo";
export type CampoParteMaquinaria = {
  id: string;
  parte_id: string;
  maquinaria_id: string;
  horas_uso: number | null;
  lectura_inicial: number | null;
  lectura_final: number | null;
  unidad_lectura: string | null;
  observaciones: string | null;
  activo: boolean;
  maquinaria:
    | Pick<
      CampoMaquinaria,
      "id" | "nombre" | "codigo_interno" | "identificacion" | "tipo" | "activo"
    >
    | null;
};
export type CampoParteMaquinariaValues = {
  maquinaria_id: string;
  horas_uso: number | null;
  lectura_inicial: number | null;
  lectura_final: number | null;
  unidad_lectura: "hora" | "km" | null;
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
    "maquinarias",
  ] as const;
function authorized(
  c: string | null | undefined,
  o: string | null | undefined,
  p: string | null | undefined,
  a: boolean,
  orden?: CampoOrdenDetail | null,
  parte?: CampoParte | null,
) {
  return isCampoUuid(c) && isCampoUuid(o) && isCampoUuid(p) && a &&
    orden?.id === o && parte?.id === p && parte.orden_id === o &&
    isCampoUuid(parte.orden_labor_id);
}
function assertWrite(
  c: string | null,
  o: string | null,
  p: string | null,
  a: boolean,
  admin: boolean,
  orden: CampoOrdenDetail | null,
  parte: CampoParte | null,
) {
  if (
    !authorized(c, o, p, a, orden, parte) || !admin ||
    parte?.estado !== "borrador" ||
    ["finalizada", "cancelada"].includes(orden?.estado ?? "")
  ) throw new Error("campo_parte_congelado");
  return { c: c!, p: p! };
}
function validate(v: CampoParteMaquinariaValues) {
  if (
    v.horas_uso !== null && (!Number.isFinite(v.horas_uso) || v.horas_uso <= 0)
  ) throw new Error("horas inválidas");
  for (const n of [v.lectura_inicial, v.lectura_final]) {
    if (n !== null && (!Number.isFinite(n) || n < 0)) {
      throw new Error("lectura inválida");
    }
  }
  if (
    v.lectura_inicial !== null && v.lectura_final !== null &&
    v.lectura_final < v.lectura_inicial
  ) throw new Error("lecturas incoherentes");
  const has = v.lectura_inicial !== null || v.lectura_final !== null;
  if (has && !["hora", "km"].includes(v.unidad_lectura ?? "")) {
    throw new Error("unidad inválida");
  }
  if (!has && v.unidad_lectura !== null) throw new Error("unidad inválida");
}
function message(error: unknown) {
  const e = error as { code?: string; message?: string },
    m = e.message?.toLowerCase() ?? "";
  if (e.code === "23505") return "La maquinaria ya fue agregada al parte.";
  if (m.includes("maquinaria_inactiva")) return "La maquinaria está inactiva.";
  if (m.includes("maquinaria_invalida")) {
    return "La maquinaria no existe o no pertenece al comercio.";
  }
  if (m.includes("congelado")) return "El parte está confirmado o anulado.";
  if (m.includes("horas")) return "Las horas deben ser mayores que cero.";
  if (m.includes("lectura")) return "Revisá las lecturas y su unidad.";
  if (e.code === "23514") {
    return "Los datos de uso no cumplen las reglas permitidas.";
  }
  if (
    e.code === "42501" || m.includes("row-level security") ||
    m.includes("permission denied")
  ) return "No tenés permisos para modificar maquinarias del parte.";
  if (e.code === "PGRST116") {
    return "La asignación no existe o no pertenece al parte.";
  }
  return "No se pudo guardar la maquinaria del parte.";
}
export function useCampoParteMaquinarias(
  c?: string | null,
  o?: string | null,
  p?: string | null,
  a = false,
  orden?: CampoOrdenDetail | null,
  parte?: CampoParte | null,
) {
  return useQuery({
    queryKey: key(c, o, p),
    enabled: authorized(c, o, p, a, orden, parte),
    queryFn: async (): Promise<
      { items: CampoParteMaquinaria[]; candidates: CampoMaquinaria[] }
    > => {
      if (!authorized(c, o, p, a, orden, parte)) {
        return { items: [], candidates: [] };
      }
      const d = await supabase.from("campo_parte_maquinarias").select(
        "id,parte_id,maquinaria_id,horas_uso,lectura_inicial,lectura_final,unidad_lectura,observaciones,activo,maquinaria:campo_maquinarias!campo_parte_maquinarias_maquinaria_fkey(id,nombre,codigo_interno,identificacion,tipo,activo)",
      ).eq("comercio_id", c!).eq("parte_id", p!).order("created_at").order(
        "id",
      );
      if (d.error) throw d.error;
      const cat = await supabase.from("campo_maquinarias").select(
        "id,nombre,codigo_interno,tipo,marca,modelo,identificacion,anio,observaciones,activo,created_at,updated_at",
      ).eq("comercio_id", c!).eq("activo", true).order("nombre").order("id");
      if (cat.error) throw cat.error;
      const items = (d.data ?? []) as CampoParteMaquinaria[],
        used = new Set(items.map((x) => x.maquinaria_id));
      return {
        items,
        candidates: (cat.data ?? []).filter((x) => !used.has(x.id)),
      };
    },
  });
}
export function useCreateCampoParteMaquinaria(
  c: string | null,
  o: string | null,
  p: string | null,
  a: boolean,
  admin: boolean,
  orden: CampoOrdenDetail | null,
  parte: CampoParte | null,
  candidates: CampoMaquinaria[],
) {
  const q = useQueryClient();
  return useMutation({
    mutationFn: async (v: CampoParteMaquinariaValues) => {
      const x = assertWrite(c, o, p, a, admin, orden, parte),
        machine = candidates.find((m) => m.id === v.maquinaria_id && m.activo);
      if (!machine) throw new Error("campo_maquinaria_invalida");
      validate(v);
      const payload = {
        comercio_id: x.c,
        parte_id: x.p,
        maquinaria_id: machine.id,
        horas_uso: v.horas_uso,
        lectura_inicial: v.lectura_inicial,
        lectura_final: v.lectura_final,
        unidad_lectura: v.unidad_lectura,
        observaciones: v.observaciones,
      };
      const { data, error } = await supabase.from("campo_parte_maquinarias")
        .insert(payload).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await q.invalidateQueries({ queryKey: key(c, o, p) });
      toast({ title: "Maquinaria agregada" });
    },
    onError: (e) =>
      toast({
        title: "No se pudo guardar",
        description: message(e),
        variant: "destructive",
      }),
  });
}
function assertItem(i: CampoParteMaquinaria | null, id: string, mid: string) {
  if (!i || i.id !== id || i.maquinaria_id !== mid) {
    throw new Error("asignación ajena");
  }
}
export function useUpdateCampoParteMaquinaria(
  c: string | null,
  o: string | null,
  p: string | null,
  a: boolean,
  admin: boolean,
  orden: CampoOrdenDetail | null,
  parte: CampoParte | null,
  item: CampoParteMaquinaria | null,
) {
  const q = useQueryClient();
  return useMutation({
    mutationFn: async (v: CampoParteMaquinariaValues & { id: string }) => {
      const x = assertWrite(c, o, p, a, admin, orden, parte);
      assertItem(item, v.id, v.maquinaria_id);
      validate(v);
      const payload = {
        horas_uso: v.horas_uso,
        lectura_inicial: v.lectura_inicial,
        lectura_final: v.lectura_final,
        unidad_lectura: v.unidad_lectura,
        observaciones: v.observaciones,
      };
      const { data, error } = await supabase.from("campo_parte_maquinarias")
        .update(payload).eq("id", v.id).eq("comercio_id", x.c).eq(
          "parte_id",
          x.p,
        ).eq("maquinaria_id", v.maquinaria_id).select("id").single();
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
        description: message(e),
        variant: "destructive",
      }),
  });
}
export function useSetCampoParteMaquinariaStatus(
  c: string | null,
  o: string | null,
  p: string | null,
  a: boolean,
  admin: boolean,
  orden: CampoOrdenDetail | null,
  parte: CampoParte | null,
  item: CampoParteMaquinaria | null,
) {
  const q = useQueryClient();
  return useMutation({
    mutationFn: async (
      v: { id: string; maquinaria_id: string; nuevoEstado: boolean },
    ) => {
      const x = assertWrite(c, o, p, a, admin, orden, parte);
      assertItem(item, v.id, v.maquinaria_id);
      if (v.nuevoEstado && item?.maquinaria?.activo !== true) {
        throw new Error("campo_maquinaria_inactiva");
      }
      const payload = { activo: v.nuevoEstado };
      const { data, error } = await supabase.from("campo_parte_maquinarias")
        .update(payload).eq("id", v.id).eq("comercio_id", x.c).eq(
          "parte_id",
          x.p,
        ).eq("maquinaria_id", v.maquinaria_id).select("id").single();
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
        description: message(e),
        variant: "destructive",
      }),
  });
}
