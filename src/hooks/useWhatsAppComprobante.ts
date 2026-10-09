import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

export function useWhatsAppConexion(comercioId?: string, enabled = true) {
  return useQuery({
    queryKey: ["whatsapp-conexion-estado", comercioId],
    enabled: enabled && Boolean(comercioId),
    retry: false,
    queryFn: async () => {
      // Esta tabla todavia no esta incluida en los tipos generados.
      const { data, error } = await (supabase as SupabaseClient)
        .from("whatsapp_comercios").select("estado")
        .eq("comercio_id", comercioId!).maybeSingle();
      if (error) throw error;
      return data as { estado: string } | null;
    },
  });
}

const fileToBase64 = async (file: File) => {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < buffer.length; index += 0x8000) binary += String.fromCharCode(...buffer.subarray(index, index + 0x8000));
  return btoa(binary);
};

export async function enviarComprobantePorWhatsApp({ ventaId, comercioId, file, caption }: { ventaId: string; comercioId: string; file: File; caption: string }) {
  const { data, error } = await supabase.functions.invoke("whatsapp-enviar-comprobante", {
    body: { ventaId, comercioId, pdfBase64: await fileToBase64(file), filename: file.name, caption },
  });
  if (error) {
    const details = error.context instanceof Response
      ? await error.context.json().catch(() => null)
      : null;
    throw new Error(details?.error || error.message || "No se pudo enviar el comprobante por WhatsApp");
  }
  if (data?.error) throw new Error(data.error);
  return data as { success: boolean; messageId?: string | null };
}
