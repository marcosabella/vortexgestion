import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { elegirDestinoBackup, guardarBackup } from "@/utils/guardarBackup";

// Tipos locales hasta regenerar los tipos del esquema al publicar la migración.
const client = supabase as unknown as SupabaseClient;
export async function cloudBackup(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Ingresá con tu cuenta de administrador.");
  const response = await fetch("/.netlify/functions/admin-backups", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("El servicio de copias no está disponible en este sitio.");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "No se pudo procesar la copia.");
  return result;
}
export interface AdminBackup {
  id: string;
  comercio_id: string | null;
  estado: "pendiente" | "procesando" | "completado" | "fallido";
  created_at: string;
  finalizado_at: string | null;
  bytes: number | null;
  sha256: string | null;
  error: string | null;
  resumen: Record<string, unknown> | null;
}

export function useAdminBackups(enabled: boolean) {
  const queryClient = useQueryClient();
  const listado = useQuery({
    queryKey: ["admin-backups"], enabled, refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await client.from("admin_backups").select("id,comercio_id,estado,created_at,finalizado_at,bytes,sha256,error,resumen").order("created_at", { ascending: false }).limit(100);
      if (error) throw new Error("No se pudo cargar el historial. Verificá que la migración de respaldos esté aplicada.");
      return data as AdminBackup[];
    },
  });
  const worker = useQuery({
    queryKey: ["admin-backup-worker"], enabled, refetchInterval: 15000,
    queryFn: async () => {
      try { const result = await cloudBackup({ action: "status" }); return { ready: result.ready === true, restoreReady: result.restoreReady === true }; }
      catch (error) { return { ready: false, restoreReady: false, message: error instanceof Error ? error.message : 'No se pudo consultar el servicio de copias.' }; }
    },
  });
  const generar = useMutation({
    mutationFn: async (comercioId: string | null) => {
      const data = await cloudBackup({ action: "generate", comercioId });
      return data.id as string;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin-backups"] }); },
  });
  const descargar = useMutation({
    mutationFn: async (id: string) => {
      const nombre = `vortex-backup-${id}.tar.gz.enc`;
      const destino = await elegirDestinoBackup(nombre);
      if (destino === null) return;
      const data = await cloudBackup({ action: "download", id });
      if (!data?.url) throw new Error("No se pudo descargar el respaldo. Verificá tu sesión y volvé a intentar.");
      await guardarBackup(data.url, nombre, destino);
    },
  });
  return { listado, worker, generar, descargar };
}
