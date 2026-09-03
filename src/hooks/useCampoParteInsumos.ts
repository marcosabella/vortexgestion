import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { CampoInsumo, CampoOrdenDetail, CampoParte } from "@/types/campo";
import { isCampoUuid } from "@/utils/campo";

export type CampoParteInsumo = {
  id: string;
  parte_id: string;
  insumo_id: string;
  cantidad: number;
  unidad: string;
  observaciones: string | null;
  activo: boolean;
  insumo: Pick<CampoInsumo, "id" | "nombre" | "codigo_interno" | "unidad" | "activo"> | null;
};

export type CampoParteInsumoValues = {
  insumo_id: string;
  cantidad: number;
  observaciones: string | null;
};

const key = (c?: string | null, o?: string | null, p?: string | null) =>
  ["campo", c ?? null, "orden", o ?? null, "parte", p ?? null, "insumos"] as const;

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
    isCampoUuid(parte.orden_labor_id) && parte.labor !== null;
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
  if (!authorized(c, o, p, access, orden, parte) || !admin ||
    parte?.estado !== "borrador" ||
    ["finalizada", "cancelada"].includes(orden?.estado ?? "")) {
    throw new Error("campo_parte_congelado");
  }
  return { comercioId: c!, parteId: p! };
}

function assertItem(item: CampoParteInsumo | null, id: string, insumoId: string) {
  if (!item || item.id !== id || item.insumo_id !== insumoId) {
    throw new Error("campo_detalle_inexistente");
  }
}

function validateCantidad(cantidad: number) {
  if (!Number.isFinite(cantidad) || cantidad <= 0) throw new Error("campo_cantidad_invalida");
}

function safeMessage(error: unknown) {
  const e = error as { code?: string; message?: string };
  const message = e.message?.toLowerCase() ?? "";
  if (e.code === "23505" || message.includes("duplicate") || message.includes("parte_insumo_key")) return "El insumo ya está agregado al parte. Reactivá el detalle existente si está inactivo.";
  if (message.includes("insumo_inactivo") || message.includes("insumo_invalido")) return "El insumo no existe, no pertenece al comercio o está inactivo.";
  if (message.includes("cantidad_invalida") || message.includes("cantidad_positiva")) return "La cantidad debe ser un número mayor que cero.";
  if (message.includes("insumo_unidad_invalida") || message.includes("unidad_valida")) return "La unidad del insumo no es válida para el alta.";
  if (message.includes("insumo_unidad_inmutable")) return "La unidad histórica del consumo no puede modificarse.";
  if (message.includes("congelado")) return "El parte está confirmado o anulado y no admite cambios.";
  if (message.includes("detalle_inexistente") || e.code === "PGRST116") return "El detalle no existe o no pertenece a este parte.";
  if (e.code === "23514") return "La cantidad, unidad u observaciones no cumplen las reglas permitidas.";
  if (e.code === "42501" || message.includes("row-level security") || message.includes("permission denied")) return "No tenés permisos para modificar los insumos del parte.";
  return "No se pudo guardar el insumo del parte.";
}

export function useCampoParteInsumos(c?: string | null, o?: string | null, p?: string | null, access = false, orden?: CampoOrdenDetail | null, parte?: CampoParte | null) {
  return useQuery({
    queryKey: key(c, o, p),
    enabled: authorized(c, o, p, access, orden, parte),
    queryFn: async (): Promise<CampoParteInsumo[]> => {
      if (!authorized(c, o, p, access, orden, parte)) return [];
      const { data, error } = await supabase.from("campo_parte_insumos").select(
        "id,parte_id,insumo_id,cantidad,unidad,observaciones,activo,insumo:campo_insumos!campo_parte_insumos_insumo_fkey(id,nombre,codigo_interno,unidad,activo)",
      ).eq("comercio_id", c!).eq("parte_id", p!).order("created_at").order("id");
      if (error) throw error;
      return (data ?? []) as CampoParteInsumo[];
    },
  });
}

export function useCampoParteInsumoCandidates(c?: string | null, o?: string | null, p?: string | null, access = false, orden?: CampoOrdenDetail | null, parte?: CampoParte | null) {
  return useQuery({
    queryKey: ["campo", c ?? null, "orden", o ?? null, "parte", p ?? null, "insumos-catalogo"],
    enabled: authorized(c, o, p, access, orden, parte),
    queryFn: async (): Promise<CampoInsumo[]> => {
      if (!authorized(c, o, p, access, orden, parte)) return [];
      const { data, error } = await supabase.from("campo_insumos").select("id,nombre,codigo_interno,unidad,observaciones,activo,created_at,updated_at").eq("comercio_id", c!).eq("activo", true).order("nombre").order("id");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateCampoParteInsumo(c: string | null, o: string | null, p: string | null, access: boolean, admin: boolean, orden: CampoOrdenDetail | null, parte: CampoParte | null, candidates: CampoInsumo[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: CampoParteInsumoValues) => {
      const ids = assertWrite(c, o, p, access, admin, orden, parte);
      validateCantidad(values.cantidad);
      const insumoAutorizado = candidates.find((item) => item.id === values.insumo_id && item.activo && item.unidad);
      if (!insumoAutorizado) throw new Error("campo_insumo_invalido");
      const payload = { comercio_id: ids.comercioId, parte_id: ids.parteId, insumo_id: insumoAutorizado.id, cantidad: values.cantidad, unidad: insumoAutorizado.unidad, observaciones: values.observaciones };
      const { data, error } = await supabase.from("campo_parte_insumos").insert(payload).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: key(c, o, p) });
      toast({ title: "Insumo agregado" });
    },
    onError: (error) => toast({ title: "No se pudo guardar", description: safeMessage(error), variant: "destructive" }),
  });
}

export function useUpdateCampoParteInsumo(c: string | null, o: string | null, p: string | null, access: boolean, admin: boolean, orden: CampoOrdenDetail | null, parte: CampoParte | null, item: CampoParteInsumo | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: CampoParteInsumoValues & { id: string }) => {
      const ids = assertWrite(c, o, p, access, admin, orden, parte);
      assertItem(item, values.id, values.insumo_id);
      validateCantidad(values.cantidad);
      const payload = { cantidad: values.cantidad, observaciones: values.observaciones };
      const { data, error } = await supabase.from("campo_parte_insumos").update(payload).eq("id", values.id).eq("comercio_id", ids.comercioId).eq("parte_id", ids.parteId).eq("insumo_id", values.insumo_id).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: key(c, o, p) });
      toast({ title: "Consumo actualizado" });
    },
    onError: (error) => toast({ title: "No se pudo guardar", description: safeMessage(error), variant: "destructive" }),
  });
}

export function useSetCampoParteInsumoStatus(c: string | null, o: string | null, p: string | null, access: boolean, admin: boolean, orden: CampoOrdenDetail | null, parte: CampoParte | null, item: CampoParteInsumo | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, insumoId, nuevoEstado }: { id: string; insumoId: string; nuevoEstado: boolean }) => {
      const ids = assertWrite(c, o, p, access, admin, orden, parte);
      assertItem(item, id, insumoId);
      if (nuevoEstado) {
        const { data: insumoAutorizado, error: insumoError } = await supabase
          .from("campo_insumos").select("id,activo").eq("id", insumoId)
          .eq("comercio_id", ids.comercioId).eq("activo", true).maybeSingle();
        if (insumoError) throw insumoError;
        if (!insumoAutorizado) throw new Error("campo_insumo_inactivo");
      }
      const payload = { activo: nuevoEstado };
      const { data, error } = await supabase.from("campo_parte_insumos").update(payload).eq("id", id).eq("comercio_id", ids.comercioId).eq("parte_id", ids.parteId).eq("insumo_id", insumoId).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: key(c, o, p) });
      toast({ title: "Estado actualizado" });
    },
    onError: (error) => toast({ title: "No se pudo cambiar el estado", description: safeMessage(error), variant: "destructive" }),
  });
}
