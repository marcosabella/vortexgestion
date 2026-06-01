import { Producto } from "@/types/producto";

type EtiquetaProductoPdfOptions = {
  producto: Producto;
  anchoCm: number;
  altoCm: number;
  logoUrl?: string;
};

type LogoImage = {
  dataUrl: string;
  format: "PNG" | "JPEG";
  width: number;
  height: number;
};

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_MARGIN_MM = 5;

const CODE_128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const formatCurrency = (amount: number, currency: Producto["tipo_moneda"]) => {
  const symbol = currency === "USD" || currency === "USD_BLUE" ? "US$" : "$";
  return `${symbol} ${Number(amount || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const sanitizeFilename = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const normalizeCode128Value = (value: string) =>
  value
    .trim()
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code <= 126;
    })
    .join("");

const buildCode128B = (value: string) => {
  const normalized = normalizeCode128Value(value);
  if (!normalized) {
    throw new Error("El producto no tiene un codigo valido para generar la etiqueta");
  }

  const values = [104, ...normalized.split("").map((char) => char.charCodeAt(0) - 32)];
  const checksum = values.reduce((sum, code, index) => sum + code * (index === 0 ? 1 : index), 0) % 103;

  return {
    value: normalized,
    patterns: [...values, checksum, 106].map((code) => CODE_128_PATTERNS[code]),
  };
};

const drawBarcode = (
  pdf: import("jspdf").jsPDF,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  const barcode = buildCode128B(value);
  const totalModules = barcode.patterns.reduce(
    (sum, pattern) => sum + pattern.split("").reduce((patternSum, digit) => patternSum + Number(digit), 0),
    0
  );
  const moduleWidth = width / totalModules;
  let currentX = x;

  pdf.setFillColor(0, 0, 0);
  barcode.patterns.forEach((pattern) => {
    pattern.split("").forEach((digit, index) => {
      const segmentWidth = Number(digit) * moduleWidth;
      if (index % 2 === 0) {
        pdf.rect(currentX, y, segmentWidth, height, "F");
      }
      currentX += segmentWidth;
    });
  });

  return barcode.value;
};

const fitText = (pdf: import("jspdf").jsPDF, text: string, maxWidth: number) => {
  if (pdf.getTextWidth(text) <= maxWidth) return text;

  let output = text;
  while (output.length > 1 && pdf.getTextWidth(`${output}...`) > maxWidth) {
    output = output.slice(0, -1);
  }

  return `${output}...`;
};

const splitTextToLines = (pdf: import("jspdf").jsPDF, text: string, maxWidth: number) =>
  pdf.splitTextToSize(text, maxWidth).map((line) => String(line));

const getLineHeight = (fontSize: number) => fontSize * 0.3528 * 1.12;

const getFittedMultilineText = (
  pdf: import("jspdf").jsPDF,
  text: string,
  maxWidth: number,
  maxHeight: number,
  preferredFontSize: number,
  minFontSize: number
) => {
  let fontSize = preferredFontSize;
  let lines = splitTextToLines(pdf, text, maxWidth);
  let lineHeight = getLineHeight(fontSize);

  while (fontSize > minFontSize && lines.length * lineHeight > maxHeight) {
    fontSize = Math.max(minFontSize, fontSize - 0.25);
    pdf.setFontSize(fontSize);
    lines = splitTextToLines(pdf, text, maxWidth);
    lineHeight = getLineHeight(fontSize);
  }

  return { lines, fontSize, lineHeight };
};

const drawCenteredText = (
  pdf: import("jspdf").jsPDF,
  text: string,
  x: number,
  y: number,
  width: number
) => {
  pdf.text(fitText(pdf, text, width), x + width / 2, y, { align: "center" });
};

const resolveAssetUrl = (url: string) => {
  if (/^https?:\/\//i.test(url) || url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }

  return `${window.location.origin}${url.startsWith("/") ? url : `/${url}`}`;
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen del logo"));
    reader.readAsDataURL(blob);
  });

const getImageSize = (dataUrl: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
    image.onerror = () => reject(new Error("No se pudo cargar la imagen del logo"));
    image.src = dataUrl;
  });

const loadLogoImage = async (logoUrl?: string): Promise<LogoImage | null> => {
  const trimmedLogoUrl = logoUrl?.trim();
  if (!trimmedLogoUrl || typeof window === "undefined") return null;

  try {
    const response = await fetch(resolveAssetUrl(trimmedLogoUrl), { cache: "force-cache" });
    if (!response.ok) throw new Error("No se pudo descargar el logo");

    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    const size = await getImageSize(dataUrl);
    return {
      dataUrl,
      format: blob.type.toLowerCase().includes("jpeg") || blob.type.toLowerCase().includes("jpg") ? "JPEG" : "PNG",
      ...size,
    };
  } catch (error) {
    console.error("No se pudo cargar el logo para las etiquetas:", error);
    return null;
  }
};

const drawLogo = (
  pdf: import("jspdf").jsPDF,
  logoImage: LogoImage,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  const scale = Math.min(width / logoImage.width, height / logoImage.height);
  const logoWidth = logoImage.width * scale;
  const logoHeight = logoImage.height * scale;
  const logoX = x + (width - logoWidth) / 2;
  const logoY = y + (height - logoHeight) / 2;

  pdf.addImage(logoImage.dataUrl, logoImage.format, logoX, logoY, logoWidth, logoHeight, undefined, "FAST");
};

const drawCenteredMultilineText = (
  pdf: import("jspdf").jsPDF,
  lines: string[],
  x: number,
  y: number,
  width: number,
  lineHeight: number
) => {
  lines.forEach((line, index) => {
    pdf.text(line, x + width / 2, y + index * lineHeight, { align: "center" });
  });
};

const getLabelLayout = (labelHeight: number, padding: number, hasLogo: boolean) => {
  const logoHeight = hasLogo ? Math.max(4, Math.min(6, labelHeight * 0.2)) : 0;
  const logoTop = padding + 1;
  const contentTop = padding + 3.5;
  const codeTextHeight = Math.max(3.5, Math.min(5, labelHeight * 0.12));
  const codeTextY = labelHeight - padding - 0.8;
  const barcodeBottom = codeTextY - codeTextHeight - 1.2;
  const barcodeTop = Math.max(padding + 10, barcodeBottom - Math.max(6, Math.min(labelHeight * 0.26, 12)));
  const barcodeHeight = Math.max(4, barcodeBottom - barcodeTop);
  const priceY = Math.max(contentTop + 4.5, barcodeTop - 2.2);
  const descriptionY = Math.max(contentTop, priceY - 5.2);

  return {
    logoTop,
    logoHeight,
    descriptionY,
    priceY,
    barcodeY: barcodeTop,
    barcodeHeight,
    codeTextY,
  };
};

const drawPortraitLabel = (
  pdf: import("jspdf").jsPDF,
  producto: Producto,
  price: string,
  code: string,
  logoImage: LogoImage | null,
  x: number,
  y: number,
  labelWidth: number,
  labelHeight: number,
  padding: number,
  innerWidth: number
) => {
  let cursorY = y + padding + 1.2;
  const bottomY = y + labelHeight - padding;
  const codeTextHeight = Math.max(3.4, Math.min(4.8, labelHeight * 0.08));
  const barcodeHeight = Math.max(7, Math.min(labelHeight * 0.18, 14));
  const barcodeY = bottomY - codeTextHeight - barcodeHeight - 1.2;
  const priceFontSize = Math.max(6, Math.min(11, labelWidth * 0.24));
  const priceLineHeight = getLineHeight(priceFontSize);

  if (logoImage) {
    const naturalLogoHeight = innerWidth * (logoImage.height / logoImage.width);
    const logoHeight = Math.min(Math.max(6, naturalLogoHeight), Math.max(8, labelHeight * 0.24));
    drawLogo(pdf, logoImage, x + padding, cursorY, innerWidth, logoHeight);
    cursorY += logoHeight + 2;
  }

  pdf.setTextColor(0, 0, 0);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(Math.max(5, Math.min(8.5, labelWidth * 0.18)));

  const descriptionMaxHeight = Math.max(5, barcodeY - cursorY - priceLineHeight - 4);
  const description = getFittedMultilineText(
    pdf,
    producto.descripcion || "Producto",
    innerWidth,
    descriptionMaxHeight,
    Math.max(5, Math.min(8.5, labelWidth * 0.18)),
    3.6
  );

  pdf.setFontSize(description.fontSize);
  drawCenteredMultilineText(pdf, description.lines, x + padding, cursorY, innerWidth, description.lineHeight);
  cursorY += description.lines.length * description.lineHeight + 2;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(priceFontSize);
  drawCenteredText(pdf, price, x + padding, Math.min(cursorY + priceLineHeight, barcodeY - 2), innerWidth);

  const renderedCode = drawBarcode(pdf, code, x + padding, barcodeY, innerWidth, barcodeHeight);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(Math.max(4.2, Math.min(6.4, labelWidth * 0.13)));
  drawCenteredText(pdf, renderedCode, x + padding, bottomY - 0.6, innerWidth);
};

export const buildProductoEtiquetasPdfFile = async ({
  producto,
  anchoCm,
  altoCm,
  logoUrl,
}: EtiquetaProductoPdfOptions) => {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ format: "a4", orientation: "portrait", unit: "mm" });
  const logoImage = await loadLogoImage(logoUrl);
  const labelWidth = Math.max(10, anchoCm * 10);
  const labelHeight = Math.max(10, altoCm * 10);
  const printableWidth = A4_WIDTH_MM - PAGE_MARGIN_MM * 2;
  const printableHeight = A4_HEIGHT_MM - PAGE_MARGIN_MM * 2;
  const columns = Math.floor(printableWidth / labelWidth);
  const rows = Math.floor(printableHeight / labelHeight);

  if (columns < 1 || rows < 1) {
    throw new Error("El tamano de etiqueta no entra en una hoja A4");
  }

  const code = producto.cod_barras?.trim() || producto.cod_producto.trim();
  const price = formatCurrency(producto.precio_venta, producto.tipo_moneda);
  const gridWidth = columns * labelWidth;
  const gridHeight = rows * labelHeight;
  const startX = PAGE_MARGIN_MM + (printableWidth - gridWidth) / 2;
  const startY = PAGE_MARGIN_MM + (printableHeight - gridHeight) / 2;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = startX + column * labelWidth;
      const y = startY + row * labelHeight;
      const padding = Math.max(1.5, Math.min(3, labelWidth * 0.06));
      const innerWidth = labelWidth - padding * 2;
      const isPortraitLabel = labelHeight > labelWidth;
      const layout = getLabelLayout(labelHeight, padding, Boolean(logoImage));
      const logoWidth = logoImage ? Math.min(innerWidth * 0.28, Math.max(7, layout.logoHeight * 2)) : 0;
      const textOffset = logoImage ? logoWidth + 1 : 0;
      const textWidth = Math.max(innerWidth * 0.45, innerWidth - textOffset);

      pdf.setDrawColor(220, 220, 220);
      pdf.setLineWidth(0.1);
      pdf.rect(x, y, labelWidth, labelHeight);

      if (isPortraitLabel) {
        drawPortraitLabel(pdf, producto, price, code, logoImage, x, y, labelWidth, labelHeight, padding, innerWidth);
        continue;
      }

      if (logoImage) {
        drawLogo(pdf, logoImage, x + padding, y + layout.logoTop, logoWidth, layout.logoHeight);
      }

      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(Math.max(5, Math.min(9, labelHeight * 0.18)));
      drawCenteredText(pdf, producto.descripcion || "Producto", x + padding + textOffset, y + layout.descriptionY, textWidth);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(Math.max(6, Math.min(12, labelHeight * 0.2)));
      drawCenteredText(pdf, price, x + padding + textOffset, y + layout.priceY, textWidth);

      const renderedCode = drawBarcode(pdf, code, x + padding, y + layout.barcodeY, innerWidth, layout.barcodeHeight);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(Math.max(4.5, Math.min(7, labelHeight * 0.12)));
      drawCenteredText(pdf, renderedCode, x + padding, y + layout.codeTextY, innerWidth);
    }
  }

  const filename = `etiquetas-${sanitizeFilename(producto.cod_barras || producto.cod_producto || "producto")}.pdf`;
  return new File([pdf.output("blob")], filename, { type: "application/pdf" });
};
