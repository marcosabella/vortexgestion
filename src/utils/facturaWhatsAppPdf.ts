import { AfipConfig } from "@/types/afip";
import { Comercio } from "@/types/comercio";
import { Venta } from "@/types/venta";
import { buildFacturaPrintHtml } from "@/utils/facturaPrint";

interface FacturaWhatsAppPdfOptions {
  venta: Venta;
  comercio?: Comercio | null;
  afipConfig?: AfipConfig | null;
  qrDataUrl?: string;
}

const PDF_MARGIN_MM = 8;

const sanitizeFilename = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const waitForImages = async (documentElement: Document) => {
  await Promise.all(
    Array.from(documentElement.images).map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }

          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        })
    )
  );
};

export const buildFacturaWhatsAppPdfFile = async (options: FacturaWhatsAppPdfOptions) => {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "794px";
  iframe.style.height = "1123px";
  iframe.style.border = "0";

  document.body.appendChild(iframe);

  try {
    const frameDocument = iframe.contentDocument;

    if (!frameDocument) {
      throw new Error("No se pudo crear el documento del comprobante");
    }

    frameDocument.open();
    frameDocument.write(buildFacturaPrintHtml(options));
    frameDocument.close();

    await waitForImages(frameDocument);
    await frameDocument.fonts?.ready;

    const facturaElement = frameDocument.querySelector<HTMLElement>(".factura-container");

    if (!facturaElement) {
      throw new Error("No se encontro el comprobante para exportar");
    }

    const canvas = await html2canvas(facturaElement, {
      backgroundColor: "#ffffff",
      logging: false,
      scale: 2,
      useCORS: true,
    });
    const pdf = new jsPDF({ format: "a4", orientation: "portrait", unit: "mm" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - PDF_MARGIN_MM * 2;
    const contentHeight = pageHeight - PDF_MARGIN_MM * 2;

    pdf.addImage(canvas, "PNG", PDF_MARGIN_MM, PDF_MARGIN_MM, contentWidth, contentHeight, undefined, "FAST");

    const filename = `comprobante-${sanitizeFilename(options.venta.numero_comprobante || "venta")}.pdf`;

    return new File([pdf.output("blob")], filename, { type: "application/pdf" });
  } finally {
    iframe.remove();
  }
};
