import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import type { Json } from "@/integrations/supabase/types";

export type NotificacionCategoria = "general" | "sistema" | "abono" | "comprobante";
export type NotificacionPrioridad = "baja" | "normal" | "alta";

export interface Notificacion {
  id: string;
  titulo: string;
  mensaje: string;
  categoria: NotificacionCategoria;
  prioridad: NotificacionPrioridad;
  comprobante_numero: string | null;
  comprobante_fecha: string | null;
  comprobante_monto: number | null;
  comprobante_periodo: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  metadata?: Json;
  leida?: boolean;
  destinatarios?: string[];
  lecturas?: NotificacionLectura[];
}

export interface NotificacionLectura {
  comercio_id: string | null;
  read_at: string;
}

export interface CrearNotificacionPayload {
  titulo: string;
  mensaje: string;
  categoria: NotificacionCategoria;
  prioridad: NotificacionPrioridad;
  comercioIds: string[];
  comprobante_numero?: string;
  comprobante_fecha?: string;
  comprobante_monto?: number | null;
  comprobante_periodo?: string;
  metadata?: Json;
}

export interface ModificarNotificacionPayload extends CrearNotificacionPayload {
  id: string;
}

export const categoriaLabels: Record<NotificacionCategoria, string> = {
  general: "General",
  sistema: "Sistema",
  abono: "Abono",
  comprobante: "Comprobante",
};

export const prioridadLabels: Record<NotificacionPrioridad, string> = {
  baja: "Baja",
  normal: "Normal",
  alta: "Alta",
};

export function useNotificaciones() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { comercio } = useComercio();

  const notificacionesQuery = useQuery({
    queryKey: ["notificaciones", comercio?.id],
    enabled: Boolean(comercio?.id),
    queryFn: async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user || !comercio?.id) return [];

      const { data: notificaciones, error } = await supabase
        .from("notificaciones")
        .select("*, notificacion_destinatarios(comercio_id)")
        .eq("activo", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // La politica de lectura permite ver las notificaciones de cualquiera de los
      // comercios del usuario. La pantalla, en cambio, debe trabajar solamente con
      // el comercio seleccionado; de lo contrario el intento de marcarla como leida
      // usa otro comercio y RLS rechaza el INSERT.
      const visiblesEnComercio = (notificaciones || []).filter((notificacion) => {
        const destinatarios = notificacion.notificacion_destinatarios || [];
        return destinatarios.length === 0
          || destinatarios.some((destinatario) => destinatario.comercio_id === comercio.id);
      });

      const ids = visiblesEnComercio.map((notificacion) => notificacion.id);
      if (ids.length === 0) return [];

      const { data: lecturas, error: lecturasError } = await supabase
        .from("notificacion_lecturas")
        .select("notificacion_id")
        .eq("user_id", user.id)
        .eq("comercio_id", comercio.id)
        .in("notificacion_id", ids);

      if (lecturasError) throw lecturasError;

      const leidas = new Set((lecturas || []).map((lectura) => lectura.notificacion_id));

      return visiblesEnComercio.map(({ notificacion_destinatarios: _destinatarios, ...notificacion }) => ({
        ...notificacion,
        categoria: notificacion.categoria as NotificacionCategoria,
        prioridad: notificacion.prioridad as NotificacionPrioridad,
        leida: leidas.has(notificacion.id),
      })) as Notificacion[];
    },
  });

  const marcarLeida = useMutation({
    mutationFn: async (notificacionId: string) => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user || !comercio?.id) throw new Error("No se pudo resolver el comercio actual");

      const { error } = await supabase.from("notificacion_lecturas").upsert(
        {
          notificacion_id: notificacionId,
          comercio_id: comercio.id,
          user_id: user.id,
          read_at: new Date().toISOString(),
        },
        { onConflict: "notificacion_id,user_id,comercio_id" },
      );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificaciones", comercio?.id] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const notificaciones = notificacionesQuery.data || [];
  const noLeidas = notificaciones.filter((notificacion) => !notificacion.leida).length;

  return {
    notificacionesQuery,
    notificaciones,
    noLeidas,
    marcarLeida,
  };
}

export function useAdminNotificaciones(enabled = true) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const notificacionesQuery = useQuery({
    queryKey: ["admin-notificaciones"],
    enabled,
    queryFn: async () => {
      const { data: notificaciones, error } = await supabase
        .from("notificaciones")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const ids = (notificaciones || []).map((notificacion) => notificacion.id);
      const destinatariosPorNotificacion = new Map<string, string[]>();
      const lecturasPorNotificacion = new Map<string, NotificacionLectura[]>();

      if (ids.length > 0) {
        const [destinatariosResult, lecturasResult] = await Promise.all([
          supabase
            .from("notificacion_destinatarios")
            .select("notificacion_id,comercio_id")
            .in("notificacion_id", ids),
          supabase
            .from("notificacion_lecturas")
            .select("notificacion_id,comercio_id,read_at")
            .in("notificacion_id", ids)
            .order("read_at", { ascending: true }),
        ]);

        const { data: destinatarios, error: destinatariosError } = destinatariosResult;

        if (destinatariosError) throw destinatariosError;
        if (lecturasResult.error) throw lecturasResult.error;

        for (const destinatario of destinatarios || []) {
          const current = destinatariosPorNotificacion.get(destinatario.notificacion_id) || [];
          current.push(destinatario.comercio_id);
          destinatariosPorNotificacion.set(destinatario.notificacion_id, current);
        }

        // Una notificacion puede ser abierta por varios usuarios del mismo comercio.
        // Para el administrador alcanza con conservar la primera lectura del comercio.
        for (const lectura of lecturasResult.data || []) {
          const current = lecturasPorNotificacion.get(lectura.notificacion_id) || [];
          if (!current.some(({ comercio_id }) => comercio_id === lectura.comercio_id)) {
            current.push({ comercio_id: lectura.comercio_id, read_at: lectura.read_at });
            lecturasPorNotificacion.set(lectura.notificacion_id, current);
          }
        }
      }

      return (notificaciones || []).map((notificacion) => ({
        ...notificacion,
        categoria: notificacion.categoria as NotificacionCategoria,
        prioridad: notificacion.prioridad as NotificacionPrioridad,
        destinatarios: destinatariosPorNotificacion.get(notificacion.id) || [],
        lecturas: lecturasPorNotificacion.get(notificacion.id) || [],
      })) as Notificacion[];
    },
  });

  const crearNotificacion = useMutation({
    mutationFn: async (payload: CrearNotificacionPayload) => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("Usuario no autenticado");

      const { data: notificacion, error } = await supabase
        .from("notificaciones")
        .insert({
          titulo: payload.titulo,
          mensaje: payload.mensaje,
          categoria: payload.categoria,
          prioridad: payload.prioridad,
          comprobante_numero: payload.comprobante_numero || null,
          comprobante_fecha: payload.comprobante_fecha || null,
          comprobante_monto: payload.comprobante_monto ?? null,
          comprobante_periodo: payload.comprobante_periodo || null,
          metadata: payload.metadata || {},
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      if (!notificacion) throw new Error("No se pudo crear la notificacion");

      if (payload.comercioIds.length > 0) {
        const { error: destinatariosError } = await supabase.from("notificacion_destinatarios").insert(
          payload.comercioIds.map((comercioId) => ({
            notificacion_id: notificacion.id,
            comercio_id: comercioId,
          })),
        );

        if (destinatariosError) {
          await supabase.from("notificaciones").update({ activo: false }).eq("id", notificacion.id);
          throw destinatariosError;
        }
      }

      return notificacion;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notificaciones"] });
      queryClient.invalidateQueries({ queryKey: ["notificaciones"] });
      toast({ title: "Notificacion enviada", description: "Los comercios destinatarios ya pueden verla." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const desactivarNotificacion = useMutation({
    mutationFn: async (notificacionId: string) => {
      const { error } = await supabase
        .from("notificaciones")
        .update({ activo: false })
        .eq("id", notificacionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notificaciones"] });
      queryClient.invalidateQueries({ queryKey: ["notificaciones"] });
      toast({ title: "Notificacion archivada", description: "Ya no sera visible para los comercios." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const reactivarNotificacion = useMutation({
    mutationFn: async (notificacionId: string) => {
      const { error } = await supabase
        .from("notificaciones")
        .update({ activo: true })
        .eq("id", notificacionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notificaciones"] });
      queryClient.invalidateQueries({ queryKey: ["notificaciones"] });
      toast({
        title: "Notificacion restaurada",
        description: "Volvio a estar visible para los comercios destinatarios.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const modificarNotificacion = useMutation({
    mutationFn: async (payload: ModificarNotificacionPayload) => {
      const { data: destinatariosActuales, error: destinatariosActualesError } = await supabase
        .from("notificacion_destinatarios")
        .select("comercio_id")
        .eq("notificacion_id", payload.id);

      if (destinatariosActualesError) throw destinatariosActualesError;

      const actuales = new Set((destinatariosActuales || []).map(({ comercio_id }) => comercio_id));
      const nuevos = new Set(payload.comercioIds);
      const destinatariosAAgregar = payload.comercioIds.filter((id) => !actuales.has(id));
      const destinatariosAQuitar = [...actuales].filter((id) => !nuevos.has(id));

      const { error: updateError } = await supabase
        .from("notificaciones")
        .update({
          titulo: payload.titulo,
          mensaje: payload.mensaje,
          categoria: payload.categoria,
          prioridad: payload.prioridad,
          comprobante_numero: payload.comprobante_numero || null,
          comprobante_fecha: payload.comprobante_fecha || null,
          comprobante_monto: payload.comprobante_monto ?? null,
          comprobante_periodo: payload.comprobante_periodo || null,
          ...(payload.metadata !== undefined ? { metadata: payload.metadata } : {}),
        })
        .eq("id", payload.id);

      if (updateError) throw updateError;

      // Primero se agregan los nuevos destinos para evitar que una edicion quede
      // momentaneamente publicada para todos si falla una operacion posterior.
      if (destinatariosAAgregar.length > 0) {
        const { error } = await supabase.from("notificacion_destinatarios").insert(
          destinatariosAAgregar.map((comercioId) => ({
            notificacion_id: payload.id,
            comercio_id: comercioId,
          })),
        );
        if (error) throw error;
      }

      if (destinatariosAQuitar.length > 0) {
        const { error } = await supabase
          .from("notificacion_destinatarios")
          .delete()
          .eq("notificacion_id", payload.id)
          .in("comercio_id", destinatariosAQuitar);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notificaciones"] });
      queryClient.invalidateQueries({ queryKey: ["notificaciones"] });
      toast({ title: "Notificacion modificada", description: "Los cambios fueron guardados." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const eliminarNotificacion = useMutation({
    mutationFn: async (notificacionId: string) => {
      const { error } = await supabase.from("notificaciones").delete().eq("id", notificacionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notificaciones"] });
      queryClient.invalidateQueries({ queryKey: ["notificaciones"] });
      toast({ title: "Notificacion eliminada", description: "La notificacion se elimino definitivamente." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return {
    notificacionesQuery,
    crearNotificacion,
    desactivarNotificacion,
    reactivarNotificacion,
    modificarNotificacion,
    eliminarNotificacion,
  };
}
