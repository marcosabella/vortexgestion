import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "@/hooks/use-toast";
import { isCampoUuid } from "@/utils/campo";
import {
  campoComercialError,
  type TarifaFormValues,
  tarifaPayload,
} from "@/utils/campoComercial";

type TarifaRow = Database["public"]["Tables"]["campo_tarifas"]["Row"];
export type CampoTarifa =
  & Omit<TarifaRow, "comercio_id" | "created_by" | "updated_by">
  & {
    cliente: { nombre: string; apellido: string | null } | null;
    establecimiento: { nombre: string } | null;
  };
export const campoTarifasKey = (id: string | null) =>
  ["campo", id, "tarifas"];
export const campoTarifasSelect =
  "id,nombre,codigo_interno,unidad,nivel,cliente_id,establecimiento_id,precio_unitario,porcentaje_iva,moneda,vigente_desde,vigente_hasta,observaciones,activo,created_at,updated_at,cliente:clientes!campo_tarifas_cliente_fkey(nombre,apellido),establecimiento:campo_establecimientos!campo_tarifas_establecimiento_fkey(nombre)";

// Se vuelve a comprobar sesión y membresía dentro de cada mutación.
export async function requireCampoAdmin(
  comercioId: string | null,
  allowed: boolean,
) {
  if (!isCampoUuid(comercioId) || !allowed) throw new Error("sin_permisos");
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("campo_auth_requerida");
  const { data, error } = await supabase.from("comercio_usuarios").select("rol")
    .eq("comercio_id", comercioId).eq("user_id", auth.user.id).eq(
      "activo",
      true,
    ).maybeSingle();
  if (error) throw error;
  if (data?.rol !== "admin") throw new Error("sin_permisos");
  return comercioId;
}
export async function validateCampoScope(
  cid: string,
  clienteId: string | null,
  establecimientoId: string | null,
) {
  if (!clienteId) {
    if (establecimientoId) throw new Error("campo_tarifa_alcance_incompatible");
    return;
  }
  if (!isCampoUuid(clienteId)) {
    throw new Error("campo_tarifa_alcance_incompatible");
  }
  const { data: clientes, error } = await supabase.from("clientes").select("id")
    .eq("comercio_id", cid).eq("id", clienteId);
  if (error) throw error;
  if (!clientes?.some((c) => c.id === clienteId)) {
    throw new Error("campo_tarifa_alcance_incompatible");
  }
  if (establecimientoId) {
    if (!isCampoUuid(establecimientoId)) {
      throw new Error("campo_tarifa_alcance_incompatible");
    }
    const { data: establecimientos, error: e } = await supabase.from(
      "campo_establecimientos",
    ).select("id,cliente_id")
      .eq("comercio_id", cid).eq("cliente_id", clienteId).eq(
        "id",
        establecimientoId,
      );
    if (e) throw e;
    if (
      !establecimientos?.some((x) =>
        x.id === establecimientoId && x.cliente_id === clienteId
      )
    ) throw new Error("campo_tarifa_alcance_incompatible");
  }
}
export function useCampoTarifas(comercioId: string | null, hasAccess: boolean) {
  return useQuery({
    queryKey: campoTarifasKey(comercioId),
    enabled: isCampoUuid(comercioId) && hasAccess,
    queryFn: async (): Promise<CampoTarifa[]> => {
      if (!isCampoUuid(comercioId) || !hasAccess) {
        throw new Error("sin_permisos");
      }
      const { data, error } = await supabase.from("campo_tarifas").select(
        campoTarifasSelect,
      )
        .eq("comercio_id", comercioId).order("nombre", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
async function requireTarifa(cid: string, id: string, rows: CampoTarifa[]) {
  if (!isCampoUuid(id) || !rows.some((r) => r.id === id)) {
    throw new Error("campo_tarifa_no_disponible");
  }
  const { data, error } = await supabase.from("campo_tarifas").select(
    "id,cliente_id,establecimiento_id",
  ).eq("comercio_id", cid).eq("id", id).single();
  if (error) throw error;
  return data;
}
function notifyError(error: unknown) {
  toast({
    title: "No se pudo guardar",
    description: campoComercialError(error),
    variant: "destructive",
  });
}
export function useSaveCampoTarifa(
  comercioId: string | null,
  allowed: boolean,
  rows: CampoTarifa[],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      { id, values }: { id?: string; values: TarifaFormValues },
    ) => {
      const cid = await requireCampoAdmin(comercioId, allowed);
      const payload = tarifaPayload(values);
      await validateCampoScope(
        cid,
        payload.cliente_id,
        payload.establecimiento_id,
      );
      if (id !== undefined) {
        await requireTarifa(cid, id, rows);
        const { data, error } = await supabase.from("campo_tarifas").update(
          payload,
        )
          .eq("id", id).eq("comercio_id", cid).select("id").single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from("campo_tarifas").insert({
        comercio_id: cid,
        ...payload,
      }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: campoTarifasKey(comercioId),
        exact: true,
      });
      toast({ title: "Tarifa guardada" });
    },
    onError: notifyError,
  });
}
export function useSetCampoTarifaStatus(
  comercioId: string | null,
  allowed: boolean,
  rows: CampoTarifa[],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const cid = await requireCampoAdmin(comercioId, allowed);
      const tarifa = await requireTarifa(cid, id, rows);
      await validateCampoScope(
        cid,
        tarifa.cliente_id,
        tarifa.establecimiento_id,
      );
      if (typeof activo !== "boolean") throw new Error("campo_tarifa_invalida");
      const { data, error } = await supabase.from("campo_tarifas").update({
        activo,
      })
        .eq("id", id).eq("comercio_id", cid).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: campoTarifasKey(comercioId),
        exact: true,
      });
      toast({ title: "Estado de tarifa actualizado" });
    },
    onError: notifyError,
  });
}
