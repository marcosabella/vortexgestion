import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { CampoEstablecimientoCreatePayload, CampoEstablecimientoListItem } from "@/types/campo";

function campoCreateErrorMessage(error: unknown) {
  const supabaseError = error as { code?: string; message?: string };
  const message = supabaseError.message?.toLocaleLowerCase("es") ?? "";

  if (supabaseError.code === "23505" && message.includes("codigo")) {
    return "Ya existe un establecimiento con ese código interno en el comercio.";
  }

  if (
    message.includes("cliente pertenece a otro comercio") ||
    message.includes("cliente indicado no existe") ||
    message.includes("relación cliente")
  ) {
    return "El cliente seleccionado no es válido para el comercio activo.";
  }

  if (
    supabaseError.code === "42501" ||
    message.includes("no tenés permisos") ||
    message.includes("row-level security") ||
    message.includes("permission denied")
  ) {
    return "No tenés permisos para crear establecimientos en este comercio.";
  }

  return "No se pudo crear el establecimiento. Revisá los datos e intentá nuevamente.";
}

export function useCampoEstablecimientos(comercioId?: string | null, hasAccess = false) {
  return useQuery({
    queryKey: ["campo", comercioId ?? null, "establecimientos"],
    enabled: Boolean(comercioId && hasAccess),
    queryFn: async (): Promise<CampoEstablecimientoListItem[]> => {
      if (!comercioId || !hasAccess) return [];

      const { data, error } = await supabase
        .from("campo_establecimientos")
        .select(`
          id,
          nombre,
          codigo_interno,
          cliente_id,
          localidad,
          superficie_total_ha,
          activo,
          cliente:clientes!campo_establecimientos_cliente_id_fkey(
            nombre,
            apellido
          )
        `)
        .eq("comercio_id", comercioId)
        .order("nombre", { ascending: true })
        .order("id", { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCampoEstablecimiento(comercioId?: string | null, isAdmin = false) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      values: Omit<CampoEstablecimientoCreatePayload, "comercio_id">,
    ) => {
      if (!comercioId || !isAdmin) {
        throw new Error("No tenés permisos para crear establecimientos en este comercio.");
      }

      if (!values.cliente_id) {
        throw new Error("El cliente es obligatorio.");
      }

      const payload: CampoEstablecimientoCreatePayload = {
        comercio_id: comercioId,
        cliente_id: values.cliente_id,
        nombre: values.nombre,
        codigo_interno: values.codigo_interno,
        direccion: values.direccion,
        localidad: values.localidad,
        provincia: values.provincia,
        superficie_total_ha: values.superficie_total_ha,
        contacto_nombre: values.contacto_nombre,
        contacto_telefono: values.contacto_telefono,
        observaciones: values.observaciones,
        activo: values.activo,
      };

      const { data, error } = await supabase
        .from("campo_establecimientos")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["campo", comercioId, "establecimientos"],
      });
      toast({
        title: "Establecimiento creado",
        description: "El establecimiento quedó registrado correctamente.",
      });
    },
    onError: (error) => {
      toast({
        title: "No se pudo crear el establecimiento",
        description: campoCreateErrorMessage(error),
        variant: "destructive",
      });
    },
  });
}
