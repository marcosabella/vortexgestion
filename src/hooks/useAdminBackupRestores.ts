import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { cloudBackup } from "@/hooks/useAdminBackups";

const client = supabase as unknown as SupabaseClient;
export interface AdminBackupRestore {
  id: string;
  comercio_id: string | null;
  estado: "cargando" | "analisis_pendiente" | "analizando" | "listo" | "restauracion_pendiente" | "restaurando" | "completado" | "fallido" | "interrumpido";
  created_at: string;
  updated_at: string;
  backup_previo_id: string | null;
  error: string | null;
  resumen: { comercio_id: string | null; comercio_original_id?: string; fecha: string; comercios: Array<{ id: string; nombre: string }>; archivos: number; filas: number; identidades: string } | null;
}
export const estadosRestauracion: Record<AdminBackupRestore["estado"], string> = {
  cargando: "Archivo pendiente de carga", analisis_pendiente: "Análisis pendiente", analizando: "Analizando copia", listo: "Lista para revisar", restauracion_pendiente: "Restauración pendiente", restaurando: "Restaurando · mantenimiento", completado: "Restauración completada", fallido: "Análisis fallido", interrumpido: "Interrumpida · mantenimiento",
};

export function useAdminBackupRestores(enabled: boolean) {
  const cache = useQueryClient();
  const refresh = () => { void cache.invalidateQueries({ queryKey: ["admin-backup-restores"] }); void cache.invalidateQueries({ queryKey: ["admin-backups"] }); };
  const listado = useQuery({
    queryKey: ["admin-backup-restores"], enabled, refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await client.from("admin_backup_restores").select("id,comercio_id,estado,created_at,updated_at,backup_previo_id,error,resumen").order("created_at", { ascending: false }).limit(100);
      if (error) throw new Error("No se pudo consultar restauraciones. Verificá su habilitación en el servidor.");
      return data as AdminBackupRestore[];
    },
  });
  const cargar = useMutation({
    mutationFn: async (file: File) => {
      if (!file.name.endsWith(".enc") || file.size < 37 || file.size > 268435456) throw new Error("Elegí una copia Vortex cifrada (.enc) de hasta 256 MB.");
      const result = await cloudBackup({ action: "restore-upload", bytes: file.size });
      const { error } = await supabase.storage.from("admin-backups").uploadToSignedUrl(result.path, result.token, file, { contentType: "application/octet-stream" });
      if (error) throw new Error("No se pudo cargar la copia. Volvé a seleccionar el archivo para reintentar.");
      return result.id as string;
    }, onSettled: refresh,
  });
  const analizar = useMutation({ mutationFn: (id: string) => cloudBackup({ action: "restore-inspect", id }), onSettled: refresh });
  const aplicar = useMutation({
    mutationFn: ({ id, comercioId }: { id: string; comercioId: string | null }) => cloudBackup({ action: "restore-apply", id, comercioId, confirmation: comercioId ? `RESTAURAR ${comercioId}` : "RESTAURAR TODOS" }), onSettled: refresh,
  });
  const reintentar = useMutation({ mutationFn: (id: string) => cloudBackup({ action: "restore-retry", id }), onSettled: refresh });
  return { listado, cargar, analizar, aplicar, reintentar };
}
