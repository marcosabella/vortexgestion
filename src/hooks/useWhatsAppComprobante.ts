import { supabase } from "@/integrations/supabase/client";

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
