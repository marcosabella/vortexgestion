import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type {
  CampoClienteOption,
  CampoEstablecimientoListItem,
  CampoOrdenCreateParams,
  CampoOrdenCreatePayload,
  CampoOrdenListItem,
} from "@/types/campo";
import { isCampoUuid } from "@/utils/campo";

function campoOrdenCreateErrorMessage(error: unknown) {
  const supabaseError = error as { code?: string; message?: string };
  const message = supabaseError.message?.toLocaleLowerCase("es") ?? "";

  if (supabaseError.code === "23505" && message.includes("codigo")) {
    return "Ya existe una orden con ese código interno en el comercio.";
  }
  if (
    message.includes("campo_cliente_no_coincide_establecimiento") ||
    message.includes("cliente seleccionado no coincide")
  ) {
    return "El cliente seleccionado no coincide con el establecimiento.";
  }
  if (message.includes("campo_establecimiento_inactivo") || message.includes("establecimiento seleccionado está inactivo")) {
    return "El establecimiento seleccionado está inactivo.";
  }
  if (message.includes("campo_cliente_invalido") || message.includes("cliente seleccionado no es válido")) {
    return "El cliente seleccionado no es válido para el comercio activo.";
  }
  if (
    message.includes("campo_establecimiento_invalido") ||
    message.includes("establecimiento seleccionado no es válido")
  ) {
    return "El establecimiento seleccionado no es válido para el comercio activo.";
  }
  if (
    supabaseError.code === "42501" ||
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    message.includes("no tenés permisos")
  ) {
    return "No tenés permisos para crear órdenes en este comercio.";
  }
  return "No se pudo crear la orden. Revisá los datos e intentá nuevamente.";
}

export function useCampoOrdenes(comercioId?: string | null, hasAccess = false) {
  return useQuery({
    queryKey: ["campo", comercioId ?? null, "ordenes"],
    enabled: Boolean(comercioId && hasAccess),
    queryFn: async (): Promise<CampoOrdenListItem[]> => {
      if (!comercioId || !hasAccess) return [];

      const { data, error } = await supabase
        .from("campo_ordenes_trabajo")
        .select(`
          id,
          numero,
          codigo_interno,
          estado,
          fecha_inicio_planificada,
          fecha_fin_planificada,
          descripcion,
          cliente_id,
          establecimiento_id,
          created_at,
          cliente:clientes!campo_ordenes_trabajo_cliente_id_fkey(
            nombre,
            apellido
          ),
          establecimiento:campo_establecimientos!campo_ordenes_trabajo_establecimiento_id_fkey(
            nombre
          )
        `)
        .eq("comercio_id", comercioId)
        .order("numero", { ascending: false })
        .order("id", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCampoOrden(
  comercioId: string | null | undefined,
  hasAccess: boolean,
  isAdmin: boolean,
  clientesAutorizados: CampoClienteOption[],
  establecimientosAutorizados: CampoEstablecimientoListItem[],
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: CampoOrdenCreateParams) => {
      if (!isCampoUuid(comercioId) || !hasAccess || !isAdmin) {
        throw new Error("No tenés permisos para crear órdenes en este comercio.");
      }
      if (!isCampoUuid(values.cliente_id) || !clientesAutorizados.some((cliente) => cliente.id === values.cliente_id)) {
        throw new Error("El cliente seleccionado no es válido para el comercio activo.");
      }

      const establecimiento = establecimientosAutorizados.find(
        (item) => item.id === values.establecimiento_id,
      );
      if (!isCampoUuid(values.establecimiento_id) || !establecimiento) {
        throw new Error("El establecimiento seleccionado no es válido para el comercio activo.");
      }
      if (!establecimiento.activo) {
        throw new Error("El establecimiento seleccionado está inactivo.");
      }
      if (establecimiento.cliente_id !== values.cliente_id) {
        throw new Error("El cliente seleccionado no coincide con el establecimiento.");
      }

      const payload: CampoOrdenCreatePayload = {
        comercio_id: comercioId,
        cliente_id: values.cliente_id,
        establecimiento_id: values.establecimiento_id,
        codigo_interno: values.codigo_interno,
        fecha_inicio_planificada: values.fecha_inicio_planificada,
        fecha_fin_planificada: values.fecha_fin_planificada,
        descripcion: values.descripcion,
        observaciones: values.observaciones,
      };

      const { data, error } = await supabase
        .from("campo_ordenes_trabajo")
        .insert(payload)
        .select("id, numero, estado")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["campo", comercioId, "ordenes"] });
      toast({
        title: `Orden N.º ${data.numero} creada`,
        description: "La cabecera quedó guardada en estado borrador.",
      });
    },
    onError: (error) => {
      toast({
        title: "No se pudo crear la orden",
        description: campoOrdenCreateErrorMessage(error),
        variant: "destructive",
      });
    },
  });
}
