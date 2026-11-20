interface DestinoBackup {
  createWritable(): Promise<WritableStream<Uint8Array>>;
}

type VentanaConGuardado = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<DestinoBackup>;
};

// Se abre antes de pedir la URL para conservar la activación del clic del usuario.
export async function elegirDestinoBackup(nombre: string): Promise<DestinoBackup | null | undefined> {
  const ventana = window as VentanaConGuardado;
  if (!ventana.showSaveFilePicker) return undefined;
  try {
    return await ventana.showSaveFilePicker({
      suggestedName: nombre,
      types: [{ description: "Copia de seguridad Vortex cifrada", accept: { "application/octet-stream": [".enc"] } }],
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
}

export async function guardarBackup(url: string, nombre: string, destino: DestinoBackup | undefined) {
  if (destino) {
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error("No se pudo descargar la copia. Volvé a intentar.");
    await response.body.pipeTo(await destino.createWritable());
    return;
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = nombre;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
