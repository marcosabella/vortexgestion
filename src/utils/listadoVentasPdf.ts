import { format } from "date-fns";
import { Comercio } from "@/types/comercio";
import {
  TIPOS_COMPROBANTE,
  Venta,
  discriminaIvaEnComprobante,
  getVentaTipoPagoLabel,
  getVentaTotalFinal,
} from "@/types/venta";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LAYOUT_WIDTH = 612;
const A4_HORIZONTAL_SCALE = PAGE_WIDTH / LAYOUT_WIDTH;
const DETAIL_LEFT = 18;
const DETAIL_RIGHT = 594;
const TABLE_TOP = 188;
const ROW_HEIGHT = 15;
const CONTENT_BOTTOM = 790;
const SECTION_GAP = 28;

const DETALLE_COLUMNS = [
  { key: "fecha", label: "Fecha", x: 24, width: 84, align: "center" },
  { key: "comprobante", label: "Comprobante", x: 108, width: 78, align: "left" },
  { key: "tipo", label: "Tipo", x: 186, width: 66, align: "left" },
  { key: "cliente", label: "Cliente", x: 252, width: 90, align: "left" },
  { key: "formaPago", label: "Pago", x: 342, width: 66, align: "left" },
  { key: "subtotal", label: "Neto", x: 408, width: 54, align: "right" },
  { key: "iva", label: "IVA", x: 462, width: 42, align: "right" },
  { key: "total", label: "Total", x: 504, width: 84, align: "right" },
] as const;

const COMPROBANTE_COLUMNS = [
  { key: "tipo", label: "Tipo de comprobante", x: 24, width: 258, align: "left" },
  { key: "cantidad", label: "Cantidad", x: 282, width: 84, align: "right" },
  { key: "total", label: "Total", x: 366, width: 120, align: "right" },
  { key: "promedio", label: "Promedio", x: 486, width: 102, align: "right" },
] as const;

const CLIENTE_COLUMNS = [
  { key: "puesto", label: "#", x: 24, width: 42, align: "center" },
  { key: "cliente", label: "Cliente", x: 66, width: 270, align: "left" },
  { key: "cantidad", label: "Cantidad", x: 336, width: 78, align: "right" },
  { key: "total", label: "Total", x: 414, width: 96, align: "right" },
  { key: "promedio", label: "Promedio", x: 510, width: 78, align: "right" },
] as const;

type PdfFont = "F1" | "F2" | "F3";
type PrintableRow = Record<string, string>;
type PrintableSection<TRow extends PrintableRow = PrintableRow> = {
  title: string;
  rows: TRow[];
  columns: readonly { key: keyof TRow; label: string; x: number; width: number; align: "left" | "center" | "right" }[];
  getRowFont?: (row: TRow) => PdfFont;
};
type DetailPage = { sections: PrintableSection[] };
type PdfImage = { bytes: Uint8Array; width: number; height: number };
type ListadoVentasPdfOptions = {
  comercio?: Comercio | null;
  rango: string;
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

const formatDate = (value?: string | null, pattern = "dd/MM/yyyy") => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, pattern);
};

const getLogoUrl = (comercio?: Comercio | null) => comercio?.logo_url?.trim() || "";

const isPrintableComercioValue = (value?: string | null) => {
  const trimmed = value?.trim() || "";
  return trimmed.length > 0 && !/^[.\s]+$/.test(trimmed);
};

const resolveAssetUrl = (url: string) => {
  if (typeof window === "undefined") return url;

  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
};

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

const opText = (
  text: string,
  x: number,
  yFromTop: number,
  size = 8.5,
  font: PdfFont = "F1",
  align: "left" | "center" | "right" = "left",
  maxWidth?: number,
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

  return [opText(comercio?.nombre_comercio || "COMERCIO", 34, 57, 15.5, "F2", "left", 220)];
};

const getComercioDireccionLineas = (comercio?: Comercio | null) => ({
  calle: [comercio?.calle, comercio?.numero].filter(isPrintableComercioValue).join(" "),
  localidad: [comercio?.localidad, comercio?.provincia].filter(isPrintableComercioValue).join(" "),
});

const drawHeader = (
  options: ListadoVentasPdfOptions,
  pageNumber: number,
  totalPages: number,
  logoImage?: PdfImage | null,
) => {
  const comercio = options.comercio;
  const fechaEmision = formatDate(new Date().toISOString());
  const comercioDireccion = getComercioDireccionLineas(comercio);
  const razonSocial = logoImage ? `Razon Social: ${comercio?.nombre_comercio || "N/A"}` : "";

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
    razonSocial && opText(razonSocial, 34, 96, 8.5, "F1", "left", 296),
    comercioDireccion.calle && opText(comercioDireccion.calle, 34, 110, 8.5, "F1", "left", 296),
    comercioDireccion.localidad && opText(comercioDireccion.localidad, 34, 124, 8.5, "F1", "left", 296),
    opText("Responsable Inscripto", 34, 136, 8.5, "F1", "left", 296),
    opText("REPORTE DE VENTAS", 363, 56, 14.5, "F2", "left", 206),
    opText("Fecha de Emision:", 363, 82, 8.5, "F2"),
    opText(fechaEmision, 452, 82, 8.5, "F1"),
    opText("CUIT:", 363, 96, 8.5, "F2"),
    opText(comercio?.cuit || "N/A", 392, 96, 8.5, "F1"),
    opText("Ingresos Brutos:", 363, 110, 8.5, "F2"),
    opText(comercio?.ingresos_brutos || "N/A", 442, 110, 8.5, "F1"),
    opText("Inicio de Actividades:", 363, 124, 8.5, "F2"),
    opText(formatDate(comercio?.fecha_inicio_actividad) || "N/A", 465, 124, 8.5, "F1"),
    opText(`Rango: ${options.rango}`, 18, 162, 9, "F2", "left", 440),
    opText(`Pagina ${pageNumber}/${totalPages}`, 588, PAGE_HEIGHT - 26, 7.5, "F1", "right"),
  ].filter(Boolean);
};

const getClienteVenta = (venta: Venta) => {
  const clienteRelacion = [venta.cliente?.nombre, venta.cliente?.apellido].filter(Boolean).join(" ").trim();
  return clienteRelacion || venta.cliente_nombre || "Consumidor Final";
};

const getTipoComprobanteLabel = (tipo: string) =>
  TIPOS_COMPROBANTE.find((item) => item.value === tipo)?.label || tipo;

const buildDetalleRows = (ventas: Venta[]) => {
  if (!ventas.length) {
    return [
      {
        fecha: "",
        comprobante: "Sin ventas para el rango seleccionado",
        tipo: "",
        cliente: "",
        formaPago: "",
        subtotal: "",
        iva: "",
        total: "",
      },
    ];
  }

  return ventas.map((venta) => {
    const muestraIva = discriminaIvaEnComprobante(venta.tipo_comprobante);

    return {
      fecha: formatDate(venta.fecha_venta, "dd/MM/yyyy HH:mm") || "-",
      comprobante: venta.numero_comprobante || "-",
      tipo: getTipoComprobanteLabel(venta.tipo_comprobante),
      cliente: getClienteVenta(venta),
      formaPago: getVentaTipoPagoLabel(venta),
      subtotal: muestraIva ? formatMoney(venta.subtotal) : "-",
      iva: muestraIva ? formatMoney(venta.total_iva) : "-",
      total: formatMoney(getVentaTotalFinal(venta)),
    };
  });
};

const buildComprobanteRows = (ventas: Venta[]) => {
  const comprobantes = new Map<string, { tipo: string; cantidad: number; total: number }>();

  ventas.forEach((venta) => {
    const current = comprobantes.get(venta.tipo_comprobante) || {
      tipo: getTipoComprobanteLabel(venta.tipo_comprobante),
      cantidad: 0,
      total: 0,
    };
    current.cantidad += 1;
    current.total += getVentaTotalFinal(venta);
    comprobantes.set(venta.tipo_comprobante, current);
  });

  const rows = Array.from(comprobantes.values()).sort((a, b) => b.total - a.total);
  if (!rows.length) return [{ tipo: "Sin datos para mostrar", cantidad: "", total: "", promedio: "" }];

  return rows.map((row) => ({
    tipo: row.tipo,
    cantidad: String(row.cantidad),
    total: formatMoney(row.total),
    promedio: formatMoney(row.cantidad ? row.total / row.cantidad : 0),
  }));
};

const buildClienteRows = (ventas: Venta[]) => {
  const clientes = new Map<string, { cliente: string; cantidad: number; total: number }>();

  ventas.forEach((venta) => {
    const clienteId = venta.cliente_id || "sin-cliente";
    const current = clientes.get(clienteId) || { cliente: getClienteVenta(venta), cantidad: 0, total: 0 };
    current.cantidad += 1;
    current.total += getVentaTotalFinal(venta);
    clientes.set(clienteId, current);
  });

  const rows = Array.from(clientes.values()).sort((a, b) => b.total - a.total);
  if (!rows.length) return [{ puesto: "", cliente: "Sin datos para mostrar", cantidad: "", total: "", promedio: "" }];

  return rows.map((row, index) => ({
    puesto: String(index + 1),
    cliente: row.cliente,
    cantidad: String(row.cantidad),
    total: formatMoney(row.total),
    promedio: formatMoney(row.cantidad ? row.total / row.cantidad : 0),
  }));
};

const getSectionHeight = (rowCount: number) => ROW_HEIGHT * (Math.max(rowCount, 1) + 1) + 18;

const paginateSections = (sections: PrintableSection[]): DetailPage[] => {
  const pages: DetailPage[] = [];
  let currentPage: DetailPage = { sections: [] };
  let currentTop = TABLE_TOP;

  const pushPage = () => {
    if (currentPage.sections.length) pages.push(currentPage);
    currentPage = { sections: [] };
    currentTop = TABLE_TOP;
  };

  const addSection = (section: PrintableSection) => {
    let remainingRows = [...section.rows];
    let title = section.title;

    while (remainingRows.length) {
      const available = CONTENT_BOTTOM - currentTop;
      const maxRows = Math.max(Math.floor((available - 18) / ROW_HEIGHT) - 1, 0);

      if (maxRows <= 0) {
        pushPage();
        continue;
      }

      const rows = remainingRows.slice(0, maxRows);
      const height = getSectionHeight(rows.length);
      currentPage.sections.push({ ...section, title, rows });
      currentTop += height + SECTION_GAP;
      remainingRows = remainingRows.slice(maxRows);
      title = `${section.title} (cont.)`;

      if (remainingRows.length) pushPage();
    }
  };

  sections.forEach((section) => {
    const height = getSectionHeight(section.rows.length);
    if (currentPage.sections.length && currentTop + height > CONTENT_BOTTOM) pushPage();
    addSection(section);
  });

  pushPage();
  return pages;
};

const drawTable = <TRow extends PrintableRow>(
  title: string,
  rows: TRow[],
  columns: readonly { key: keyof TRow; label: string; x: number; width: number; align: "left" | "center" | "right" }[],
  top: number,
  getRowFont: (row: TRow) => PdfFont = () => "F1",
) => {
  const rowCount = Math.max(rows.length, 1);
  const tableBottom = top + ROW_HEIGHT * (rowCount + 1);
  const headerTop = top - 0.85;
  const headerBottom = top + ROW_HEIGHT - 0.85;
  const ops: string[] = [
    opText(title, DETAIL_LEFT, top - 11, 9.5, "F2"),
    "0.851 0.929 0.969 rg",
    opFillRect(DETAIL_LEFT, headerTop, DETAIL_RIGHT - DETAIL_LEFT, ROW_HEIGHT),
  ];

  columns.forEach((column) => {
    const headerX =
      column.align === "center" ? column.x + column.width / 2 : column.align === "right" ? column.x + column.width - 8 : column.x + 6;
    ops.push(opText(column.label, headerX, top + 9.95, 8.35, "F1", column.align, column.width - 12));
  });

  ops.push(
    opLine(DETAIL_LEFT, headerTop, DETAIL_RIGHT, headerTop),
    opLine(DETAIL_LEFT, headerBottom, DETAIL_RIGHT, headerBottom),
    opLine(DETAIL_LEFT, headerTop, DETAIL_LEFT, headerBottom),
    opLine(DETAIL_RIGHT, headerTop, DETAIL_RIGHT, headerBottom),
  );

  columns.slice(1).forEach((column) => {
    ops.push(opLine(column.x, headerTop, column.x, headerBottom));
  });

  rows.forEach((row, index) => {
    const y = top + ROW_HEIGHT * (index + 1);
    const rowFont = getRowFont(row);

    columns.forEach((column) => {
      const x =
        column.align === "center" ? column.x + column.width / 2 : column.align === "right" ? column.x + column.width - 7 : column.x + 6;
      ops.push(opText(row[column.key] || "", x, y + 9.95, 8.35, rowFont, column.align, column.width - 12));
    });
  });

  return { ops, tableBottom };
};

const drawFooter = () => [
  opText("Sistema de Ventas Web", 214, PAGE_HEIGHT - 29, 7.15, "F3"),
  opText("Reporte de Ventas", 331, PAGE_HEIGHT - 29, 7.15, "F3"),
];

const createPageContent = (
  options: ListadoVentasPdfOptions,
  page: DetailPage,
  pageNumber: number,
  totalPages: number,
  logoImage?: PdfImage | null,
) => {
  let currentTop = TABLE_TOP;
  const sectionOps = page.sections.flatMap((section) => {
    const table = drawTable(section.title, section.rows, section.columns, currentTop, section.getRowFont);
    currentTop = table.tableBottom + SECTION_GAP;
    return table.ops;
  });

  return [
    "q",
    `${A4_HORIZONTAL_SCALE.toFixed(6)} 0 0 1 0 0 cm`,
    `18 18 576 ${PAGE_HEIGHT - 36} re W n`,
    ...drawHeader(options, pageNumber, totalPages, logoImage),
    ...sectionOps,
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

    if ("close" in bitmap) bitmap.close();

    return { bytes, width: canvas.width, height: canvas.height };
  } catch (error) {
    console.error("No se pudo cargar el logo para el PDF de ventas:", error);
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

  const pdfHeader = "%PDF-1.4\n";
  const pdfParts: Array<string | Uint8Array> = [pdfHeader];
  let byteLength = encoder.encode(pdfHeader).length;
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

export const buildListadoVentasPdfFile = (ventas: Venta[], options: ListadoVentasPdfOptions) => {
  const orderedVentas = [...ventas].sort(
    (a, b) => new Date(a.fecha_venta).getTime() - new Date(b.fecha_venta).getTime(),
  );
  const sections: PrintableSection[] = [
    { title: "Detalle de ventas", rows: buildDetalleRows(orderedVentas), columns: DETALLE_COLUMNS },
    { title: "Ventas por tipo de comprobantes", rows: buildComprobanteRows(orderedVentas), columns: COMPROBANTE_COLUMNS },
    { title: "Ranking de venta por cliente", rows: buildClienteRows(orderedVentas), columns: CLIENTE_COLUMNS },
  ];
  const pages = paginateSections(sections);

  return loadLogoImage(getLogoUrl(options.comercio)).then((logoImage) => {
    const contents = pages.map((page, index) =>
      createPageContent(options, page, index + 1, pages.length || 1, logoImage),
    );
    const blob = createPdfBlob(contents.length ? contents : [createPageContent(options, { sections }, 1, 1, logoImage)], logoImage);
    const filename = `reporte-ventas-${sanitizeFilename(options.rango) || "reporte"}.pdf`;

    return new File([blob], filename, { type: "application/pdf" });
  });
};
