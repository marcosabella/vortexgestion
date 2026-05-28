import { useState } from "react";
import { FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAfipConfig } from "@/hooks/useAfipConfig";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import { getVentaTotalFinal, Venta } from "@/types/venta";
import { generarQRAfip } from "@/utils/afipQr";
import { buildFacturaHtmlFile } from "@/utils/facturaPrint";

interface FacturaImpresionProps {
  venta: Venta;
}

export const FacturaImpresion = ({ venta }: FacturaImpresionProps) => {
  const { comercio } = useComercio();
  const { data: afipConfig } = useAfipConfig();
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

    const comprobanteFile = buildFacturaHtmlFile(
      { venta, comercio, afipConfig, qrDataUrl },
      { autoPrint: action === "pdf" }
    );
    const url = URL.createObjectURL(comprobanteFile);
    const facturaWindow = window.open(url, "_blank");

    if (!facturaWindow) {
      URL.revokeObjectURL(url);
      toast({
        title: "No se pudo abrir el PDF",
        description: "Revise si el navegador bloqueo la ventana emergente.",
        variant: "destructive",
      });
      setOpeningAction(null);
      return;
    }

    facturaWindow.opener = null;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
        className="bg-sky-600 text-white hover:bg-sky-700"
        disabled={openingAction !== null}
      >
        <Printer className="h-4 w-4 mr-2" />
        {openingAction === "print" ? "Abriendo..." : "Imprimir Factura"}
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
