import { useState } from "react";
import { FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAfipConfig } from "@/hooks/useAfipConfig";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import { getVentaTotalFinal, Venta } from "@/types/venta";
import { generarQRAfip } from "@/utils/afipQr";
import { buildFacturaPrintHtml } from "@/utils/facturaPrint";
import { useComercioParametrizacion } from "@/hooks/useComercioParametrizacion";

interface FacturaImpresionProps {
  venta: Venta;
  documentType?: "venta" | "presupuesto";
}

const printHtml = async (html: string) => {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const frameDocument = frame.contentDocument;
  const frameWindow = frame.contentWindow;

  if (!frameDocument || !frameWindow) {
    frame.remove();
    throw new Error("No se pudo preparar el comprobante para imprimir");
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();

  await Promise.all(
    Array.from(frameDocument.images).map(
      (image) => new Promise<void>((resolve) => {
        if (image.complete) return resolve();
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      }),
    ),
  );
  await frameDocument.fonts?.ready;

  const removeFrame = () => window.setTimeout(() => frame.remove(), 500);
  frameWindow.addEventListener("afterprint", removeFrame, { once: true });
  frameWindow.focus();
  frameWindow.print();
  window.setTimeout(() => {
    if (frame.isConnected) frame.remove();
  }, 60_000);
};

export const FacturaImpresion = ({ venta, documentType = "venta" }: FacturaImpresionProps) => {
  const { comercio } = useComercio();
  const { data: afipConfig } = useAfipConfig();
  const { data: parametrizacion } = useComercioParametrizacion();
  const { toast } = useToast();
  const [openingAction, setOpeningAction] = useState<"print" | "pdf" | null>(null);

  const openFactura = async (action: "print" | "pdf") => {
    setOpeningAction(action);

    let qrDataUrl = "";

    if (venta.cae?.trim() && comercio && afipConfig) {
      try {
        qrDataUrl = await generarQRAfip({
          fecha: venta.fecha_venta,
          cuit: comercio.cuit,
          puntoVenta: afipConfig.punto_venta,
          tipoComprobante: venta.tipo_comprobante,
          numeroComprobante: venta.numero_comprobante,
          importe: getVentaTotalFinal(venta),
          cae: venta.cae,
        });
      } catch (error) {
        console.error("Error generando QR ARCA para impresion:", error);
      }
    }

    const comprobanteHtml = buildFacturaPrintHtml(
      { venta, comercio, afipConfig, qrDataUrl, documentType, formato: parametrizacion.impresion.formato_comprobante },
    );
    try {
      await printHtml(comprobanteHtml);
    } catch (error) {
      toast({
        title: "No se pudo imprimir el comprobante",
        description: error instanceof Error ? error.message : "Intente nuevamente.",
        variant: "destructive",
      });
      setOpeningAction(null);
      return;
    }
    if (action === "pdf") {
      toast({
        title: "Descargar comprobante en PDF",
        description: 'Seleccione "Guardar como PDF" en el dialogo de impresion.',
      });
    }
    setOpeningAction(null);
  };

  return (
    <>
      <Button
        onClick={() => openFactura("print")}
        size="sm"
        variant="print"
        disabled={openingAction !== null}
      >
        <Printer className="h-4 w-4 mr-2" />
        {openingAction === "print" ? "Abriendo..." : documentType === "presupuesto" ? "Imprimir" : "Imprimir Factura"}
      </Button>
      <Button
        onClick={() => openFactura("pdf")}
        size="sm"
        className="bg-red-600 text-white hover:bg-red-700"
        disabled={openingAction !== null}
      >
        <FileDown className="h-4 w-4 mr-2" />
        {openingAction === "pdf" ? "Generando..." : "PDF"}
      </Button>
    </>
  );
};
