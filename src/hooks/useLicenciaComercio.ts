import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import type { EstadoLicencia, LicenciaComercio } from "@/types/licencia";

type LicenciaRpc = "consultar_licencia_comercio" | "guardar_licencia_comercio" | "generar_comprobante_licencia";
async function rpc<T>(name: LicenciaRpc, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: T; error: { message: string; code?: string } | null }>;
  }).rpc(name, args);
  if (error?.code === "PGRST202") throw new Error("Falta aplicar la migración de licencias mensuales en la base de datos conectada.");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No se recibió la confirmación del servidor.");
  return data;
}

export function useLicenciaComercio(destinatarioId: string, enabled: boolean) {
  const { comercio } = useComercio();
  const client = useQueryClient();
  const { toast } = useToast();
  const key = ["licencia-comercio", comercio?.id, destinatarioId];
  const args = () => {
    if (!comercio?.id || comercio.id === destinatarioId) throw new Error("Seleccioná tu comercio emisor, diferente al comercio destinatario.");
    return { p_comercio_id: comercio.id, p_destinatario_id: destinatarioId };
  };
  const query = useQuery({
    queryKey: key,
    enabled: enabled && Boolean(comercio?.id) && comercio.id !== destinatarioId,
    queryFn: () => rpc<EstadoLicencia>("consultar_licencia_comercio", args()),
  });
  const onError = (error: Error) => toast({ title: "No se pudo completar la operación", description: error.message, variant: "destructive" });
  const guardar = useMutation({
    mutationFn: ({ importe, concepto }: { importe: number; concepto: string }) => rpc<LicenciaComercio>("guardar_licencia_comercio", { ...args(), p_importe: importe, p_concepto: concepto }),
    onSuccess: (configuracion) => {
      client.setQueryData<EstadoLicencia>(key, (previous) => ({ configuracion, comprobantes: previous?.comprobantes || [] }));
      toast({ title: "Licencia guardada", description: "El importe mensual quedó registrado para este comercio." });
    }, onError,
  });
  const generar = useMutation({
    mutationFn: (values: { periodo: string; tipo: string; iva: number; vencimiento: string; emisorId?: string }) => rpc<{ venta_id: string; reutilizado: boolean }>("generar_comprobante_licencia", {
      ...args(), p_periodo: `${values.periodo}-01`, p_tipo_comprobante: values.tipo,
      p_iva: values.iva, p_vencimiento: values.vencimiento, p_emisor_fiscal_id: values.emisorId || null,
    }),
    onSuccess: () => {
      for (const queryKey of [key, ["ventas"], ["clientes"], ["cuenta-corriente"]]) void client.invalidateQueries({ queryKey });
    }, onError,
  });
  return { query, guardar, generar, emisor: comercio };
}
