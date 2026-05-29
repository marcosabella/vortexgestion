import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ComercioFormData } from "@/types/comercio";
import { useToast } from "@/hooks/use-toast";
import { ComercioParametrizacion, normalizeParametrizacion } from "@/config/parametrizacion";

export interface AdminComercio {
  id: string;
  activo: boolean;
  nombre_comercio: string;
  calle: string;
  numero: string;
  codigo_postal: string;
  telefono?: string;
  cuit: string;
  ingresos_brutos?: string;
  fecha_inicio_actividad: string;
  logo_url?: string;
  localidad: string;
  provincia: string;
  created_at?: string;
  usuario: {
    user_id: string;
    email: string;
    rol: string;
    activo: boolean;
    banned_until: string | null;
    last_sign_in_at: string | null;
  } | null;
}

type AdminResponse<T = Record<string, unknown>> = T & {
  success: boolean;
  error?: string;
};

async function getFunctionErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : "Operacion administrativa fallida";
  const context = (error as { context?: unknown })?.context;

  if (context instanceof Response) {
    try {
      const payload = (await context.json()) as { error?: string };
      return payload.error || fallback;
    } catch {
      return fallback;
    }
  }

  return fallback;
}

async function invokeAdmin<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<AdminResponse<T>>("admin-comercios", {
    body,
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (!data?.success) {
    throw new Error(data?.error || "Operacion administrativa fallida");
  }

  return data;
}

export function useIsAppAdmin() {
  return useQuery({
    queryKey: ["is-app-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_app_admin");
      if (error) return false;
      return Boolean(data);
    },
  });
}

export function useAdminComercios() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const comerciosQuery = useQuery({
    queryKey: ["admin-comercios"],
    queryFn: async () => {
      const data = await invokeAdmin<{ comercios: AdminComercio[] }>({ action: "list" });
      return data.comercios;
    },
  });

  const createComercio = useMutation({
    mutationFn: async ({
      comercio,
      userEmail,
      password,
    }: {
      comercio: ComercioFormData;
      userEmail: string;
      password: string;
    }) => invokeAdmin({ action: "create", comercio, userEmail, password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-comercios"] });
      toast({ title: "Comercio creado", description: "El usuario ya puede ingresar con la contrasena asignada." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const setAccess = useMutation({
    mutationFn: async ({ comercioId, enabled }: { comercioId: string; enabled: boolean }) =>
      invokeAdmin({ action: "setAccess", comercioId, enabled }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-comercios"] });
      toast({
        title: variables.enabled ? "Ingreso habilitado" : "Ingreso deshabilitado",
        description: "El cambio quedo aplicado al comercio y su usuario.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateComercio = useMutation({
    mutationFn: async ({ comercioId, comercio }: { comercioId: string; comercio: ComercioFormData }) =>
      invokeAdmin({ action: "update", comercioId, comercio }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-comercios"] });
      queryClient.invalidateQueries({ queryKey: ["comercio"] });
      toast({ title: "Comercio actualizado", description: "Los datos del comercio quedaron guardados." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createOrUpdateAccess = useMutation({
    mutationFn: async ({
      comercioId,
      userEmail,
      password,
    }: {
      comercioId: string;
      userEmail: string;
      password: string;
    }) => invokeAdmin({ action: "createOrUpdateAccess", comercioId, userEmail, password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-comercios"] });
      toast({ title: "Ingreso configurado", description: "El comercio ya puede ingresar con el usuario asignado." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetPassword = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) =>
      invokeAdmin({ action: "resetPassword", userId, password }),
    onSuccess: () => {
      toast({ title: "Contrasena actualizada", description: "El comercio podra ingresar con la nueva contrasena." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return {
    comerciosQuery,
    createComercio,
    updateComercio,
    setAccess,
    createOrUpdateAccess,
    resetPassword,
  };
}

export function useAdminComercioParametrizacion(comercioId?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const parametrizacionQuery = useQuery({
    queryKey: ["admin-comercio-parametrizacion", comercioId],
    enabled: Boolean(comercioId),
    queryFn: async () => {
      const data = await invokeAdmin<{ parametros: ComercioParametrizacion }>({
        action: "getParametrizacion",
        comercioId,
      });
      return normalizeParametrizacion(data.parametros);
    },
  });

  const updateParametrizacion = useMutation({
    mutationFn: async (parametros: ComercioParametrizacion) =>
      invokeAdmin({ action: "updateParametrizacion", comercioId, parametros }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-comercio-parametrizacion", comercioId] });
      queryClient.invalidateQueries({ queryKey: ["comercio-parametrizacion"] });
      toast({ title: "Parametrizacion guardada", description: "Los cambios quedaron aplicados para el comercio." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return {
    parametrizacionQuery,
    updateParametrizacion,
  };
}
