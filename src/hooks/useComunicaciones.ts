import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import type { CrearNotificacionPayload, Notificacion } from "@/hooks/useNotificaciones";

const api = supabase as SupabaseClient;

export function usePresentacionesComunicaciones(enabled: boolean) {
  return useQuery({
    queryKey: ["admin-presentaciones-comunicaciones"], enabled,
    refetchInterval: 30_000, refetchOnWindowFocus: "always",
    queryFn: async () => {
      const registros: { comercio_id: string; notificacion_id: string; presentada_at: string }[] = [];
      for (let desde = 0; ; desde += 500) {
        const { data, error } = await api.from("notificacion_presentaciones")
          .select("comercio_id,notificacion_id,presentada_at").order("comercio_id").order("notificacion_id").range(desde, desde + 499);
        if (error) throw error;
        registros.push(...data);
        if (data.length < 500) break;
      }
      return registros;
    },
  });
}

export function useGuardarComunicacion() {
  const client = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (payload: CrearNotificacionPayload & { id?: string }) => {
      const { id, ...contenido } = payload;
      const { data, error } = await api.rpc("admin_guardar_comunicacion", { p_payload: contenido, p_id: id || null });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin-notificaciones"] });
      void client.invalidateQueries({ queryKey: ["admin-presentaciones-comunicaciones"] });
      void client.invalidateQueries({ queryKey: ["notificaciones"] });
      void client.invalidateQueries({ queryKey: ["modales-notificaciones"] });
      toast({ title: "Notificación guardada", description: "Disponible para los comercios destinatarios." });
    },
    onError: (error: Error) => toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" }),
  });
}

export function useModalesNotificaciones() {
  const { comercio } = useComercio();
  const client = useQueryClient();
  const pendientes = useQuery({
    queryKey: ["modales-notificaciones", comercio?.id], enabled: Boolean(comercio?.id),
    refetchInterval: 30_000, refetchOnWindowFocus: "always", refetchOnReconnect: "always", retry: false,
    queryFn: async () => {
      const { data, error } = await api.rpc("mis_modales_pendientes", { p_comercio_id: comercio!.id });
      if (error) throw error;
      return (data || []) as Notificacion[];
    },
  });
  const confirmar = useMutation({
    mutationFn: async ({ comercioId, notificacionId }: { comercioId: string; notificacionId: string }) => {
      const { error } = await api.rpc("confirmar_presentacion_notificacion", { p_comercio_id: comercioId, p_notificacion_id: notificacionId });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      client.setQueryData<Notificacion[]>(["modales-notificaciones", variables.comercioId], data => data?.filter(item => item.id !== variables.notificacionId));
      void client.invalidateQueries({ queryKey: ["modales-notificaciones", variables.comercioId] });
      void client.invalidateQueries({ queryKey: ["admin-notificaciones"] });
    },
  });
  return { pendientes, confirmar };
}
