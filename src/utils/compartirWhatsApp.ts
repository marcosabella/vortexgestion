// El archivo debe estar preparado antes del clic: compartir y abrir ventanas
// requieren la activacion del usuario y no pueden esperar a generar el PDF.
export async function compartirPdfWhatsApp(data: ShareData, chatUrl: string, soloChat = false) {
  if (!soloChat && navigator.share && navigator.canShare?.({ files: data.files })) {
    try {
      await navigator.share(data);
      return "compartido";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelado";
      // El llamador ofrece otro clic para abrir el chat; el permiso del clic
      // original puede haberse consumido al intentar compartir.
      throw error;
    }
  }

  window.open(chatUrl, "_blank", "noopener,noreferrer");
  const file = data.files?.[0];
  if (file) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return "descargado";
}
