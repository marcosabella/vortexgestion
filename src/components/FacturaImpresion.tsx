import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAfipConfig } from "@/hooks/useAfipConfig";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import { Venta } from "@/types/venta";
import { generarQRAfip } from "@/utils/afipQr";
import { buildFacturaHtmlFile } from "@/utils/facturaPrint";

interface FacturaImpresionProps {
  venta: Venta;
}

export const FacturaImpresion = ({ venta }: FacturaImpresionProps) => {
  const { comercio } = useComercio();
  const { data: afipConfig } = useAfipConfig();
  const { toast } = useToast();
  const [isOpening, setIsOpening] = useState(false);

  const handlePrint = async () => {
    setIsOpening(true);

    let qrDataUrl = "";

    if (venta.cae?.trim() && comercio && afipConfig) {
      try {
        qrDataUrl = await generarQRAfip({
          fecha: venta.fecha_venta,
          cuit: comercio.cuit,
          puntoVenta: afipConfig.punto_venta,
          tipoComprobante: venta.tipo_comprobante,
          numeroComprobante: venta.numero_comprobante,
          importe: venta.total,
          cae: venta.cae,
        });
      } catch (error) {
        console.error("Error generando QR ARCA para impresion:", error);
      }
    }

    const comprobanteFile = buildFacturaHtmlFile({ venta, comercio, afipConfig, qrDataUrl });
    const url = URL.createObjectURL(comprobanteFile);
    const facturaWindow = window.open(url, "_blank");

    if (!facturaWindow) {
      URL.revokeObjectURL(url);
      toast({
        title: "No se pudo abrir el PDF",
        description: "Revise si el navegador bloqueo la ventana emergente.",
        variant: "destructive",
      });
      setIsOpening(false);
      return;
    }

    facturaWindow.opener = null;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setIsOpening(false);
  };

  return (
    <Button onClick={handlePrint} variant="outline" size="sm" disabled={isOpening}>
      <Printer className="h-4 w-4 mr-2" />
      {isOpening ? "Abriendo..." : "Imprimir Factura"}
    </Button>
  );
};
