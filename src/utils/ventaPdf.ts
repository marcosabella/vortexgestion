import { format } from "date-fns";
import { Comercio } from "@/types/comercio";
import { TIPOS_COMPROBANTE, Venta, getPagoMontoBase, getTipoPagoLabel, getVentaTipoPagoLabel } from "@/types/venta";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 42;
const START_Y = 800;
const LINE_HEIGHT = 13;
const MAX_LINES_PER_PAGE = 58;

const moneyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});

const toPdfText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const sanitizeFilename = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const formatMoney = (value?: number | null) => moneyFormatter.format(Number(value || 0));

const formatDateTime = (value?: string | null) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return format(date, "dd/MM/yyyy HH:mm");
};

const formatDateOnly = (value?: string | null) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return format(date, "dd/MM/yyyy");
};

const wrapLine = (line: string, maxLength = 88) => {
  if (line.length <= maxLength) return [line];

  const words = line.split(" ");
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) lines.push(current);
  return lines;
};

const buildSaleLines = (venta: Venta, comercio?: Comercio | null) => {
  const tipoComprobante =
    TIPOS_COMPROBANTE.find((tipo) => tipo.value === venta.tipo_comprobante)?.label || "Comprobante";
  const comercioDireccion = [
    comercio?.calle,
    comercio?.numero,
    comercio?.localidad,
    comercio?.provincia,
  ]
    .filter(Boolean)
    .join(" ");

  const lines: string[] = [
    comercio?.nombre_comercio || "COMERCIO",
    comercio?.cuit ? `CUIT: ${comercio.cuit}` : "",
    comercioDireccion ? `Domicilio: ${comercioDireccion}` : "",
    "",
    `${tipoComprobante} ${venta.numero_comprobante}`,
    `Fecha: ${formatDateTime(venta.fecha_venta)}`,
    `Cliente: ${venta.cliente_nombre || "Consumidor Final"}`,
    `Condicion de venta: ${getVentaTipoPagoLabel(venta)}`,
    "",
    "Detalle de la venta",
    "Cant.  Descripcion                                      P.Unit.      Total",
    "--------------------------------------------------------------------------",
  ].filter((line) => line !== "");

  if (venta.venta_items?.length) {
    venta.venta_items.forEach((item) => {
      const descripcion = item.producto?.descripcion || item.descripcion_manual || item.producto?.cod_producto || "Producto";
      const cantidad = Number(item.cantidad || 0).toLocaleString("es-AR");
      const precio = formatMoney(item.precio_unitario);
      const total = formatMoney(item.total);
      const ajustes = [
        Number(item.monto_descuento || 0) > 0 ? `desc. ${formatMoney(item.monto_descuento)}` : "",
        Number(item.monto_recargo || 0) > 0 ? `recargo ${formatMoney(item.monto_recargo)}` : "",
      ].filter(Boolean).join(", ");
      const descripcionConAjustes = ajustes ? `${descripcion} (${ajustes})` : descripcion;
      lines.push(`${cantidad.padEnd(6)} ${descripcionConAjustes}`.slice(0, 52).padEnd(52) + precio.padStart(12) + total.padStart(12));
    });
  } else {
    lines.push("Sin detalle de items");
  }

  lines.push(
    "",
    `Subtotal: ${formatMoney(venta.subtotal)}`,
    ...(Number(venta.monto_descuento || 0) > 0 || Number(venta.porcentaje_descuento || 0) > 0
      ? [`Descuento venta: ${Number(venta.porcentaje_descuento || 0).toLocaleString("es-AR")}% + ${formatMoney(venta.monto_descuento)}`]
      : []),
    ...(Number(venta.monto_recargo || 0) > 0 || Number(venta.porcentaje_recargo || 0) > 0
      ? [`Recargo venta: ${Number(venta.porcentaje_recargo || 0).toLocaleString("es-AR")}% + ${formatMoney(venta.monto_recargo)}`]
      : []),
    `IVA: ${formatMoney(venta.total_iva)}`,
    `Total: ${formatMoney(venta.total)}`,
    "",
    "Pagos"
  );

  if (venta.pagos_venta?.length) {
    venta.pagos_venta.forEach((pago) => {
      const recargo = pago.recargo_cuotas && pago.recargo_cuotas > 0
        ? ` + recargo ${formatMoney(pago.recargo_cuotas)}`
        : "";
      lines.push(`${getTipoPagoLabel(pago.tipo_pago)}: ${formatMoney(getPagoMontoBase(pago))}${recargo}`);
    });
  } else {
    lines.push(`${getVentaTipoPagoLabel(venta)}: ${formatMoney(venta.total)}`);
  }

  if (venta.cae) {
    lines.push("", `CAE: ${venta.cae}`, `Vto. CAE: ${formatDateOnly(venta.cae_vencimiento)}`);
  }

  if (venta.observaciones) {
    lines.push("", `Observaciones: ${venta.observaciones}`);
  }

  return lines.flatMap((line) => wrapLine(line));
};

const createPageContent = (lines: string[], pageNumber: number, totalPages: number) => {
  const textLines = lines
    .map((line, index) => `1 0 0 1 ${MARGIN_X} ${START_Y - index * LINE_HEIGHT} Tm (${toPdfText(line)}) Tj`)
    .join("\n");

  return [
    "BT",
    "/F1 10 Tf",
    "0 g",
    textLines,
    "ET",
    "BT",
    "/F1 8 Tf",
    "0 g",
    `1 0 0 1 ${PAGE_WIDTH - 90} 28 Tm`,
    `(Pag. ${pageNumber}/${totalPages}) Tj`,
    "ET",
  ].join("\n");
};

const createPdfBlob = (pageLines: string[][]) => {
  const encoder = new TextEncoder();
  const pageCount = pageLines.length;
  const fontObjectId = 3;
  const firstPageObjectId = 4;
  const firstContentObjectId = firstPageObjectId + pageCount;
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, index) => `${firstPageObjectId + index} 0 R`).join(" ")}] /Count ${pageCount} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
  ];

  pageLines.forEach((_, index) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /ProcSet [/PDF /Text] /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${firstContentObjectId + index} 0 R >>`
    );
  });

  pageLines.forEach((lines, index) => {
    const content = createPageContent(lines, index + 1, pageCount);
    const length = encoder.encode(content).length;
    objects.push(`<< /Length ${length} >>\nstream\n${content}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([encoder.encode(pdf)], { type: "application/pdf" });
};

export const buildVentaPdfFile = (venta: Venta, comercio?: Comercio | null) => {
  const lines = buildSaleLines(venta, comercio);
  const pageLines: string[][] = [];

  for (let index = 0; index < lines.length; index += MAX_LINES_PER_PAGE) {
    pageLines.push(lines.slice(index, index + MAX_LINES_PER_PAGE));
  }

  const blob = createPdfBlob(pageLines.length ? pageLines : [["Comprobante sin detalle"]]);
  const filename = `comprobante-${sanitizeFilename(venta.numero_comprobante || "venta")}.pdf`;

  return new File([blob], filename, { type: "application/pdf" });
};
