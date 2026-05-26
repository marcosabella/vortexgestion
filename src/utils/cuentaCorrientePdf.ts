import { format } from "date-fns";
import { CuentaCorriente, CuentaCorrienteResumen, CONCEPTOS_MOVIMIENTO } from "@/types/cuenta-corriente";
import { Comercio } from "@/types/comercio";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 48;
const RIGHT = 588;
const DETAIL_LEFT = 18;
const DETAIL_RIGHT = 594;
const TABLE_TOP = 226;
const ROW_HEIGHT = 14.75;
const MAX_ROWS_PER_PAGE = 28;

const COLUMNS = [
  { key: "fecha", label: "Fecha Comp.", x: 48, width: 72, align: "center" },
  { key: "comprobante", label: "Comprobante", x: 126, width: 228, align: "left" },
  { key: "debe", label: "Debe", x: 360, width: 72, align: "right" },
  { key: "haber", label: "Haber", x: 438, width: 69.75, align: "right" },
  { key: "saldo", label: "Saldo", x: 516, width: 72, align: "right" },
] as const;

type PdfFont = "F1" | "F2" | "F3";

type PdfRow = {
  fecha: string;
  comprobante: string;
  debe: string;
  haber: string;
  saldo: string;
};

type PdfImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

type CuentaCorrientePdfOptions = {
  comercio?: Comercio | null;
};

const moneyFormatter = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const toPlainText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");

const toPdfText = (value: string) =>
  toPlainText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const sanitizeFilename = (value: string) =>
  toPlainText(value)
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const formatMoney = (value?: number | null) => `$${moneyFormatter.format(Number(value || 0))}`;

const formatDate = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "dd/MM/yyyy");
};

const getLogoUrl = (comercio?: Comercio | null) => comercio?.logo_url?.trim() || "/logo.png";

const resolveAssetUrl = (url: string) => {
  if (typeof window === "undefined") return url;

  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
};

const getConceptoLabel = (concepto: string) =>
  CONCEPTOS_MOVIMIENTO.find((item) => item.value === concepto)?.label || concepto;

const textWidth = (text: string, size: number) => toPlainText(text).length * size * 0.5;

const fitText = (text: string, maxWidth: number, size: number) => {
  const plain = toPlainText(text);
  if (textWidth(plain, size) <= maxWidth) return plain;

  let result = plain;
  while (result.length > 0 && textWidth(`${result}...`, size) > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}...`;
};

const buildRows = (movimientos: CuentaCorriente[]) => {
  const orderedMovimientos = [...movimientos].sort(
    (a, b) => new Date(a.fecha_movimiento).getTime() - new Date(b.fecha_movimiento).getTime()
  );
  let saldo = 0;

  if (!orderedMovimientos.length) {
    return [{ fecha: "", comprobante: "Sin movimientos registrados", debe: "", haber: "", saldo: formatMoney(0) }];
  }

  return orderedMovimientos.map((movimiento) => {
    const monto = Number(movimiento.monto || 0);
    const isDebito = movimiento.tipo_movimiento === "debito";
    saldo += isDebito ? monto : -monto;

    const comprobante = [
      movimiento.venta?.numero_comprobante ? `FACTURA ${movimiento.venta.numero_comprobante}` : getConceptoLabel(movimiento.concepto),
      movimiento.tarjeta ? `Tarjeta ${movimiento.tarjeta.nombre}` : "",
      movimiento.observaciones || "",
    ]
      .filter(Boolean)
      .join(" - ");

    return {
      fecha: formatDate(movimiento.fecha_movimiento),
      comprobante,
      debe: isDebito ? formatMoney(monto) : "",
      haber: !isDebito ? formatMoney(monto) : "",
      saldo: formatMoney(saldo),
    };
  });
};

const opText = (
  text: string,
  x: number,
  yFromTop: number,
  size = 8.5,
  font: PdfFont = "F1",
  align: "left" | "center" | "right" = "left",
  maxWidth?: number
) => {
  const fittedText = maxWidth ? fitText(text, maxWidth, size) : toPlainText(text);
  const width = textWidth(fittedText, size);
  const finalX = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  const y = PAGE_HEIGHT - yFromTop;

  return `BT /${font} ${size} Tf 0 g 1 0 0 1 ${finalX.toFixed(2)} ${y.toFixed(2)} Tm (${toPdfText(fittedText)}) Tj ET`;
};

const opLine = (x1: number, y1Top: number, x2: number, y2Top: number) =>
  `${x1} ${(PAGE_HEIGHT - y1Top).toFixed(2)} m ${x2} ${(PAGE_HEIGHT - y2Top).toFixed(2)} l S`;

const opFillRect = (x: number, yTop: number, width: number, height: number) =>
  `${x} ${(PAGE_HEIGHT - yTop - height).toFixed(2)} ${width} ${height} re f`;

const opImage = (name: string, x: number, yTop: number, width: number, height: number) =>
  `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${(PAGE_HEIGHT - yTop - height).toFixed(2)} cm /${name} Do Q`;

const drawComercioIdentity = (comercio?: Comercio | null, logoImage?: PdfImage | null) => {
  if (logoImage) {
    const boxWidth = 150;
    const boxHeight = 35;
    const scale = Math.min(boxWidth / logoImage.width, boxHeight / logoImage.height);
    const width = logoImage.width * scale;
    const height = logoImage.height * scale;
    const x = 34 + (boxWidth - width) / 2;
    const yTop = 49 + (boxHeight - height) / 2;

    return [opImage("Logo", x, yTop, width, height)];
  }

  return [
    opText(comercio?.nombre_comercio || "COMERCIO", 34, 57, 15.5, "F2", "left", 220),
  ];
};

const getComercioDireccionLineas = (comercio?: Comercio | null) => ({
  calle: [comercio?.calle, comercio?.numero].filter(Boolean).join(" ") || "N/A",
  localidad: [comercio?.localidad, comercio?.provincia].filter(Boolean).join(" ") || "N/A",
});

const drawHeader = (
  resumen: CuentaCorrienteResumen,
  pageNumber: number,
  totalPages: number,
  comercio?: Comercio | null,
  logoImage?: PdfImage | null
) => {
  const cliente = `${resumen.cliente_nombre} ${resumen.cliente_apellido}`.trim() || "Cliente";
  const fechaEmision = formatDate(new Date().toISOString());
  const ultimoMovimiento = resumen.ultimo_movimiento ? formatDate(resumen.ultimo_movimiento) : fechaEmision;
  const comercioDireccion = getComercioDireccionLineas(comercio);

  return [
    "0 0 0 rg",
    "0 0 0 RG",
    "1 w",
    opLine(18, 28, 594, 28),
    opLine(18, 142, 594, 142),
    opLine(18, 28, 18, 142),
    opLine(594, 28, 594, 142),
    opLine(347, 28, 347, 142),
    ...drawComercioIdentity(comercio, logoImage),
    opText(`Razon Social: ${comercio?.nombre_comercio || "N/A"}`, 34, 96, 8.5, "F1", "left", 296),
    opText(comercioDireccion.calle, 34, 110, 8.5, "F1", "left", 296),
    opText(comercioDireccion.localidad, 34, 124, 8.5, "F1", "left", 296),
    opText("Responsable Inscripto", 34, 136, 8.5, "F1", "left", 296),
    opText("RESUMEN CTA CTE", 363, 56, 14.5, "F2", "left", 206),
    opText("Fecha de Emision:", 363, 82, 8.5, "F2"),
    opText(fechaEmision, 452, 82, 8.5, "F1"),
    opText("CUIT:", 363, 96, 8.5, "F2"),
    opText(comercio?.cuit || "N/A", 392, 96, 8.5, "F1"),
    opText("Ingresos Brutos:", 363, 110, 8.5, "F2"),
    opText(comercio?.ingresos_brutos || "N/A", 442, 110, 8.5, "F1"),
    opText("Inicio de Actividades:", 363, 124, 8.5, "F2"),
    opText(formatDate(comercio?.fecha_inicio_actividad) || "N/A", 465, 124, 8.5, "F1"),
    opLine(18, 154, 594, 154),
    opLine(18, 204, 594, 204),
    opLine(18, 154, 18, 204),
    opLine(594, 154, 594, 204),
    opText("CUIT:", 34, 171, 8.5, "F2"),
    opText(resumen.cliente_cuit || "N/A", 64, 171, 8.5, "F1", "left", 126),
    opText("Apellido y Nombre / Razon Social:", 210, 171, 8.5, "F2"),
    opText(cliente, 368, 171, 8.5, "F1", "left", 190),
    opText("Domicilio:", 34, 187, 8.5, "F2"),
    opText("N/A", 84, 187, 8.5, "F1", "left", 160),
    opText("Condicion frente al IVA:", 210, 187, 8.5, "F2"),
    opText("Consumidor Final", 322, 187, 8.5, "F1"),
    opText("Saldo correspondiente al:", 420, 187, 8.5, "F2"),
    opText(ultimoMovimiento, 530, 187, 8.5, "F1", "left", 54),
    opText(`Pagina ${pageNumber}/${totalPages}`, RIGHT, 766, 7.5, "F1", "right"),
  ].filter(Boolean);
};

const drawTable = (rows: PdfRow[]) => {
  const rowCount = Math.max(rows.length, 1);
  const tableBottom = TABLE_TOP + ROW_HEIGHT * (rowCount + 1);
  const headerTop = TABLE_TOP - 0.85;
  const headerBottom = TABLE_TOP + ROW_HEIGHT - 0.85;
  const ops: string[] = [
    "0.851 0.929 0.969 rg",
    opFillRect(DETAIL_LEFT, headerTop, DETAIL_RIGHT - DETAIL_LEFT, ROW_HEIGHT),
    "0 0 0 RG",
    "1 w",
    opLine(DETAIL_LEFT, headerTop, DETAIL_RIGHT, headerTop),
    opLine(DETAIL_LEFT, headerBottom, DETAIL_RIGHT, headerBottom),
    opLine(DETAIL_LEFT, headerTop, DETAIL_LEFT, headerBottom),
    opLine(DETAIL_RIGHT, headerTop, DETAIL_RIGHT, headerBottom),
  ];

  COLUMNS.forEach((column) => {
    const headerX =
      column.align === "center" ? column.x + column.width / 2 : column.align === "right" ? column.x + column.width - 8 : column.x + 6;
    ops.push(opText(column.label, headerX, TABLE_TOP + 9.95, 8.35, "F1", column.align, column.width - 12));
    if (column.x > LEFT) {
      ops.push(opLine(column.x, headerTop, column.x, headerBottom));
    }
  });

  rows.forEach((row, index) => {
    const y = TABLE_TOP + ROW_HEIGHT * (index + 1);

    COLUMNS.forEach((column) => {
      const value = row[column.key];
      const x =
        column.align === "center" ? column.x + column.width / 2 : column.align === "right" ? column.x + column.width - 7 : column.x + 6;
      ops.push(opText(value, x, y + 9.95, 8.35, "F1", column.align, column.width - 12));
    });
  });

  return { ops, tableBottom };
};

const drawSummary = (resumen: CuentaCorrienteResumen, tableBottom: number, isLastPage: boolean) => {
  if (!isLastPage) return [];

  const saldo = Number(resumen.saldo_actual || 0);
  const saldoTexto = saldo > 0 ? "saldo deudor" : saldo < 0 ? "saldo acreedor" : "saldo";

  return [
    opLine(18, tableBottom + 18, 594, tableBottom + 18),
    opText(
      `Usted posee un ${saldoTexto} de: ${formatMoney(Math.abs(saldo))}`,
      PAGE_WIDTH / 2,
      tableBottom + 36,
      8.75,
      "F2",
      "center",
      470
    ),
  ];
};

const drawFooter = () => [
  opText("Sistema de Ventas Web", 214, 763, 7.15, "F3"),
  opText("Resumen de Cuenta Corriente", 331, 763, 7.15, "F3"),
];

const createPageContent = (
  resumen: CuentaCorrienteResumen,
  rows: PdfRow[],
  pageNumber: number,
  totalPages: number,
  isLastPage: boolean,
  comercio?: Comercio | null,
  logoImage?: PdfImage | null
) => {
  const table = drawTable(rows);

  return [
    "q",
    "18 18 576 756 re W n",
    ...drawHeader(resumen, pageNumber, totalPages, comercio, logoImage),
    ...table.ops,
    ...drawSummary(resumen, table.tableBottom, isLastPage),
    ...drawFooter(),
    "Q",
  ].join("\n");
};

const loadLogoImage = async (logoUrl?: string | null): Promise<PdfImage | null> => {
  const trimmedLogoUrl = logoUrl?.trim();
  if (!trimmedLogoUrl || typeof document === "undefined") return null;

  try {
    const response = await fetch(resolveAssetUrl(trimmedLogoUrl), { cache: "force-cache" });
    if (!response.ok) return null;

    const blob = await response.blob();
    const bitmap =
      typeof createImageBitmap === "function"
        ? await createImageBitmap(blob)
        : await new Promise<ImageBitmap | HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            const objectUrl = URL.createObjectURL(blob);

            image.onload = () => {
              URL.revokeObjectURL(objectUrl);
              resolve(image);
            };
            image.onerror = () => {
              URL.revokeObjectURL(objectUrl);
              reject(new Error("No se pudo leer la imagen del logo"));
            };
            image.src = objectUrl;
          });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext("2d");
    if (!context) return null;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const base64 = dataUrl.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    if ("close" in bitmap) {
      bitmap.close();
    }

    return {
      bytes,
      width: canvas.width,
      height: canvas.height,
    };
  } catch (error) {
    console.error("No se pudo cargar el logo para el PDF de cuenta corriente:", error);
    return null;
  }
};

const createPdfBlob = (contents: string[], logoImage?: PdfImage | null) => {
  const encoder = new TextEncoder();
  const pageCount = contents.length;
  const fontObjectId = 3;
  const boldFontObjectId = 4;
  const footerFontObjectId = 5;
  const logoObjectId = logoImage ? 6 : null;
  const firstPageObjectId = logoImage ? 7 : 6;
  const firstContentObjectId = firstPageObjectId + pageCount;
  const objects: Array<Array<string | Uint8Array>> = [
    ["<< /Type /Catalog /Pages 2 0 R >>"],
    [`<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, index) => `${firstPageObjectId + index} 0 R`).join(" ")}] /Count ${pageCount} >>`],
    ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"],
    ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"],
    ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>"],
  ];

  if (logoImage && logoObjectId) {
    objects.push([
      `<< /Type /XObject /Subtype /Image /Width ${logoImage.width} /Height ${logoImage.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoImage.bytes.length} >>\nstream\n`,
      logoImage.bytes,
      "\nendstream",
    ]);
  }

  contents.forEach((_, index) => {
    const xObjectResources = logoObjectId ? `/XObject << /Logo ${logoObjectId} 0 R >> ` : "";
    objects.push([
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /ProcSet [/PDF /Text /ImageC] ${xObjectResources}/Font << /F1 ${fontObjectId} 0 R /F2 ${boldFontObjectId} 0 R /F3 ${footerFontObjectId} 0 R >> >> /Contents ${firstContentObjectId + index} 0 R >>`,
    ]);
  });

  contents.forEach((content) => {
    const length = encoder.encode(content).length;
    objects.push([`<< /Length ${length} >>\nstream\n${content}\nendstream`]);
  });

  const pdfParts: Array<string | Uint8Array> = ["%PDF-1.4\n"];
  let byteLength = encoder.encode(pdfParts[0]).length;
  const offsets = [0];
  const appendPart = (part: string | Uint8Array) => {
    pdfParts.push(part);
    byteLength += typeof part === "string" ? encoder.encode(part).length : part.length;
  };

  objects.forEach((object, index) => {
    offsets.push(byteLength);
    appendPart(`${index + 1} 0 obj\n`);
    object.forEach(appendPart);
    appendPart("\nendobj\n");
  });

  const xrefOffset = byteLength;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    xref += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  appendPart(xref);

  return new Blob(pdfParts, { type: "application/pdf" });
};

export const buildCuentaCorrientePdfFile = (
  resumen: CuentaCorrienteResumen,
  movimientos: CuentaCorriente[],
  options: CuentaCorrientePdfOptions = {}
) => {
  const rows = buildRows(movimientos);
  const pageRows: PdfRow[][] = [];

  for (let index = 0; index < rows.length; index += MAX_ROWS_PER_PAGE) {
    pageRows.push(rows.slice(index, index + MAX_ROWS_PER_PAGE));
  }

  const contents = (logoImage?: PdfImage | null) => (pageRows.length ? pageRows : [[{ fecha: "", comprobante: "Sin movimientos registrados", debe: "", haber: "", saldo: formatMoney(0) }]]).map(
    (rowsForPage, index, allPages) =>
      createPageContent(resumen, rowsForPage, index + 1, allPages.length, index === allPages.length - 1, options.comercio, logoImage)
  );

  return loadLogoImage(getLogoUrl(options.comercio)).then((logoImage) => {
    const blob = createPdfBlob(contents(logoImage), logoImage);
    const clienteFilename = sanitizeFilename(`${resumen.cliente_nombre}-${resumen.cliente_apellido}`) || "cliente";
    const filename = `resumen-cta-cte-${clienteFilename}.pdf`;

    return new File([blob], filename, { type: "application/pdf" });
  });
};

export const buildCuentaCorrienteWhatsAppMessage = (
  resumen: CuentaCorrienteResumen,
  movimientos: CuentaCorriente[]
) => {
  const cliente = `${resumen.cliente_nombre} ${resumen.cliente_apellido}`.trim() || "Cliente";
  const saldoLabel =
    resumen.saldo_actual > 0 ? "Debe" : resumen.saldo_actual < 0 ? "A favor" : "Sin saldo";

  return [
    "Resumen de cuenta corriente",
    `Cliente: ${cliente}`,
    `CUIT: ${resumen.cliente_cuit || "N/A"}`,
    "",
    `Total debitos: ${formatMoney(resumen.total_debitos)}`,
    `Total creditos: ${formatMoney(resumen.total_creditos)}`,
    `Saldo actual: ${formatMoney(Math.abs(resumen.saldo_actual))} (${saldoLabel})`,
    `Movimientos: ${movimientos.length}`,
    "",
    "Se adjunta el resumen en PDF.",
  ].join("\n");
};
