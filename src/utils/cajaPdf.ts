import { format } from "date-fns";
import { buildCajaResumen, CajaDiaria, esMovimientoManual, getCajaMovimientoLabel } from "@/types/caja";
import { Comercio } from "@/types/comercio";
import { getTipoPagoLabel, getVentaTipoPagoLabel, PagoVenta, Venta } from "@/types/venta";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LAYOUT_WIDTH = 612;
const A4_HORIZONTAL_SCALE = PAGE_WIDTH / LAYOUT_WIDTH;
const DETAIL_LEFT = 18;
const DETAIL_RIGHT = 594;
const TABLE_TOP = 188;
const ROW_HEIGHT = 15;
const MAX_ROWS_PER_PAGE = 26;
const CONTENT_BOTTOM = 790;
const SECTION_GAP = 28;

const CAJA_COLUMNS = [
  { key: "fecha", label: "Fecha", x: 24, width: 72, align: "center" },
  { key: "estado", label: "Estado", x: 96, width: 66, align: "center" },
  { key: "apertura", label: "Apertura", x: 162, width: 78, align: "right" },
  { key: "sistema", label: "Sistema", x: 240, width: 78, align: "right" },
  { key: "real", label: "Real", x: 318, width: 78, align: "right" },
  { key: "diferencia", label: "Diferencia", x: 396, width: 78, align: "right" },
  { key: "cierre", label: "Cierre", x: 474, width: 114, align: "center" },
] as const;

const RESUMEN_COLUMNS = [
  { key: "cuenta", label: "Cuenta", x: 24, width: 330, align: "left" },
  { key: "debe", label: "Debe", x: 354, width: 114, align: "right" },
  { key: "haber", label: "Haber", x: 468, width: 120, align: "right" },
] as const;

const INFO_COLUMNS = [
  { key: "campo", label: "Campo", x: 24, width: 156, align: "left" },
  { key: "valor", label: "Valor", x: 180, width: 408, align: "left" },
] as const;

const ARQUEO_COLUMNS = [
  { key: "formaPago", label: "Forma de pago", x: 24, width: 258, align: "left" },
  { key: "cantidad", label: "Cant.", x: 282, width: 84, align: "right" },
  { key: "monto", label: "Monto", x: 366, width: 222, align: "right" },
] as const;

const EFECTIVO_COLUMNS = [
  { key: "concepto", label: "Concepto", x: 24, width: 372, align: "left" },
  { key: "importe", label: "Importe", x: 396, width: 192, align: "right" },
] as const;

const MOVIMIENTOS_COLUMNS = [
  { key: "fecha", label: "Fecha", x: 24, width: 84, align: "center" },
  { key: "tipo", label: "Tipo", x: 108, width: 66, align: "center" },
  { key: "concepto", label: "Concepto", x: 174, width: 126, align: "left" },
  { key: "descripcion", label: "Descripcion", x: 300, width: 168, align: "left" },
  { key: "monto", label: "Monto", x: 468, width: 120, align: "right" },
] as const;

const VENTAS_COLUMNS = [
  { key: "hora", label: "Hora", x: 24, width: 54, align: "center" },
  { key: "comprobante", label: "Comprobante", x: 78, width: 108, align: "left" },
  { key: "cliente", label: "Cliente", x: 186, width: 150, align: "left" },
  { key: "formaPago", label: "Forma de pago", x: 336, width: 132, align: "left" },
  { key: "total", label: "Total", x: 468, width: 120, align: "right" },
] as const;

type PdfFont = "F1" | "F2" | "F3";

type CajaPdfRow = {
  fecha: string;
  estado: string;
  apertura: string;
  sistema: string;
  real: string;
  diferencia: string;
  cierre: string;
};

type ResumenPdfRow = {
  cuenta: string;
  debe: string;
  haber: string;
};

type InfoPdfRow = {
  campo: string;
  valor: string;
};

type ArqueoPdfRow = {
  formaPago: string;
  cantidad: string;
  monto: string;
};

type EfectivoPdfRow = {
  concepto: string;
  importe: string;
};

type MovimientoPdfRow = {
  fecha: string;
  tipo: string;
  concepto: string;
  descripcion: string;
  monto: string;
};

type VentaPdfRow = {
  hora: string;
  comprobante: string;
  cliente: string;
  formaPago: string;
  total: string;
};

type PrintableRow = Record<string, string>;

type PrintableSection<TRow extends PrintableRow = PrintableRow> = {
  title: string;
  rows: TRow[];
  columns: readonly { key: keyof TRow; label: string; x: number; width: number; align: "left" | "center" | "right" }[];
  getRowFont?: (row: TRow) => PdfFont;
};

type DetailPage = {
  sections: PrintableSection[];
};

type CajaBalanceFila = {
  cuenta: string;
  debe: number;
  haber: number;
};

type CajaBalance = {
  filas: CajaBalanceFila[];
  totalDebe: number;
  totalHaber: number;
  saldoPeriodo: number;
  totalVentas: number;
  cierreSistema: number;
  cierreReal: number;
  diferencia: number;
};

type PdfImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

type CajaPdfOptions = {
  comercio?: Comercio | null;
  rango: string;
  balance: CajaBalance;
  reportTitle?: string;
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

const formatCajaDate = (value?: string | null) => (value ? formatDate(`${value}T00:00:00`) : "");

const formatDateTime = (value?: string | null) => formatDate(value, "dd/MM/yyyy HH:mm") || "-";

const getLogoUrl = (comercio?: Comercio | null) => comercio?.logo_url?.trim() || "";

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
  calle: [comercio?.calle, comercio?.numero].filter(Boolean).join(" ") || "N/A",
  localidad: [comercio?.localidad, comercio?.provincia].filter(Boolean).join(" ") || "N/A",
});

const drawHeader = (
  options: CajaPdfOptions,
  pageNumber: number,
  totalPages: number,
  logoImage?: PdfImage | null,
) => {
  const comercio = options.comercio;
  const fechaEmision = formatDate(new Date().toISOString());
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
    opText(options.reportTitle || "LISTADO DE CAJA", 363, 56, 14.5, "F2", "left", 206),
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

const buildCajaRows = (cajas: CajaDiaria[]): CajaPdfRow[] => {
  if (!cajas.length) {
    return [{ fecha: "", estado: "Sin cajas registradas", apertura: "", sistema: "", real: "", diferencia: "", cierre: "" }];
  }

  return cajas.map((caja) => ({
    fecha: formatCajaDate(caja.fecha),
    estado: caja.estado === "abierta" ? "Abierta" : "Cerrada",
    apertura: formatMoney(caja.monto_apertura),
    sistema: formatMoney(caja.monto_cierre_sistema),
    real: formatMoney(caja.monto_cierre_real),
    diferencia: formatMoney(caja.diferencia),
    cierre: caja.cerrado_at ? formatDate(caja.cerrado_at, "dd/MM/yyyy HH:mm") : "-",
  }));
};

const buildResumenRows = (balance: CajaBalance): ResumenPdfRow[] => {
  const rows = balance.filas.length
    ? balance.filas.map((fila) => ({
        cuenta: fila.cuenta,
        debe: fila.debe ? formatMoney(fila.debe) : "-",
        haber: fila.haber ? formatMoney(fila.haber) : "-",
      }))
    : [{ cuenta: "No hay movimientos para el rango seleccionado", debe: "-", haber: "-" }];

  return [
    ...rows,
    { cuenta: "Total", debe: formatMoney(balance.totalDebe), haber: formatMoney(balance.totalHaber) },
    { cuenta: "Saldo del periodo", debe: formatMoney(balance.saldoPeriodo), haber: "" },
  ];
};

const getPagosVenta = (venta: Venta): PagoVenta[] => {
  if (venta.pagos_venta?.length) return venta.pagos_venta;

  return [
    {
      tipo_pago: venta.tipo_pago,
      monto: venta.total,
      banco_id: venta.banco_id,
      tarjeta_id: venta.tarjeta_id,
      cuotas: venta.cuotas,
      recargo_cuotas: venta.recargo_cuotas || 0,
    },
  ];
};

const getClienteVenta = (venta: Venta) => {
  const clienteRelacion = [venta.cliente?.nombre, venta.cliente?.apellido].filter(Boolean).join(" ").trim();
  return clienteRelacion || venta.cliente_nombre || "Consumidor Final";
};

const buildInfoRows = (caja: CajaDiaria): InfoPdfRow[] => [
  { campo: "Fecha", valor: formatCajaDate(caja.fecha) || "-" },
  { campo: "Estado", valor: caja.estado === "abierta" ? "Abierta" : "Cerrada" },
  { campo: "Apertura", valor: caja.abierto_at ? formatDate(caja.abierto_at, "dd/MM/yyyy HH:mm") : "-" },
  { campo: "Monto apertura", valor: formatMoney(caja.monto_apertura) },
  { campo: "Observacion apertura", valor: caja.observaciones_apertura || "-" },
];

const buildArqueoRows = (caja: CajaDiaria): ArqueoPdfRow[] => {
  const resumen = buildCajaResumen(caja, caja.ventas || []);
  const rows = resumen.pagosPorTipo.map((pago) => ({
    formaPago: getTipoPagoLabel(pago.tipo),
    cantidad: String(pago.cantidad),
    monto: formatMoney(pago.monto),
  }));

  if (!rows.length) {
    return [{ formaPago: "Sin pagos registrados", cantidad: "-", monto: "-" }];
  }

  return [
    ...rows,
    { formaPago: "Total ventas", cantidad: String(resumen.cantidadVentas), monto: formatMoney(resumen.totalVentas) },
  ];
};

const buildEfectivoRows = (caja: CajaDiaria): EfectivoPdfRow[] => {
  const resumen = buildCajaResumen(caja, caja.ventas || []);

  return [
    { concepto: "Monto de apertura", importe: formatMoney(caja.monto_apertura) },
    { concepto: "Ventas en efectivo", importe: formatMoney(resumen.totalContado) },
    { concepto: "Ingresos manuales", importe: formatMoney(resumen.ingresosManuales) },
    { concepto: "Egresos manuales", importe: formatMoney(resumen.egresosManuales) },
    { concepto: "Total efectivo sistema", importe: formatMoney(resumen.totalSistema) },
  ];
};

const buildMovimientoRows = (caja: CajaDiaria): MovimientoPdfRow[] => {
  const movimientos = (caja.caja_movimientos || []).filter(esMovimientoManual);

  if (!movimientos.length) {
    return [{ fecha: "", tipo: "Sin movimientos manuales", concepto: "", descripcion: "", monto: "" }];
  }

  return movimientos.map((movimiento) => ({
    fecha: formatDateTime(movimiento.fecha_movimiento || movimiento.created_at || caja.fecha),
    tipo: getCajaMovimientoLabel(movimiento.tipo),
    concepto: movimiento.concepto || "-",
    descripcion: movimiento.descripcion || "-",
    monto: formatMoney(movimiento.monto),
  }));
};

const buildVentaRows = (caja: CajaDiaria): VentaPdfRow[] => {
  const ventas = caja.ventas || [];

  if (!ventas.length) {
    return [{ hora: "", comprobante: "Sin ventas para esta caja", cliente: "", formaPago: "", total: "" }];
  }

  return ventas.map((venta) => ({
    hora: formatDate(venta.fecha_venta, "HH:mm") || "-",
    comprobante: venta.numero_comprobante || "-",
    cliente: getClienteVenta(venta),
    formaPago: getVentaTipoPagoLabel({ tipo_pago: venta.tipo_pago, pagos_venta: getPagosVenta(venta) }),
    total: formatMoney(venta.total),
  }));
};

const buildCierreRows = (caja: CajaDiaria): EfectivoPdfRow[] => [
  { concepto: "Cierre sistema", importe: caja.monto_cierre_sistema == null ? "-" : formatMoney(caja.monto_cierre_sistema) },
  { concepto: "Cierre real", importe: caja.monto_cierre_real == null ? "-" : formatMoney(caja.monto_cierre_real) },
  { concepto: "Diferencia", importe: caja.diferencia == null ? "-" : formatMoney(caja.diferencia) },
  { concepto: "Fecha de cierre", importe: caja.cerrado_at ? formatDate(caja.cerrado_at, "dd/MM/yyyy HH:mm") : "-" },
  { concepto: "Observacion cierre", importe: caja.observaciones_cierre || "-" },
];

const buildCajaDetailSections = (caja: CajaDiaria): PrintableSection[] => {
  const fecha = formatCajaDate(caja.fecha) || "-";

  return [
    { title: `Caja diaria - ${fecha}`, rows: buildInfoRows(caja), columns: INFO_COLUMNS },
    { title: "Arqueo por forma de pago", rows: buildArqueoRows(caja), columns: ARQUEO_COLUMNS, getRowFont: (row) => (row.formaPago === "Total ventas" ? "F2" : "F1") },
    { title: "Resumen de efectivo", rows: buildEfectivoRows(caja), columns: EFECTIVO_COLUMNS, getRowFont: (row) => (row.concepto === "Total efectivo sistema" ? "F2" : "F1") },
    { title: "Movimientos manuales", rows: buildMovimientoRows(caja), columns: MOVIMIENTOS_COLUMNS },
    { title: "Ventas de la caja", rows: buildVentaRows(caja), columns: VENTAS_COLUMNS },
    { title: "Cierre registrado", rows: buildCierreRows(caja), columns: EFECTIVO_COLUMNS },
  ];
};

const getSectionHeight = (rowCount: number) => ROW_HEIGHT * (Math.max(rowCount, 1) + 1) + 18;

const paginateDetailSections = (cajas: CajaDiaria[]): DetailPage[] => {
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

      const takeRows = Math.min(remainingRows.length, maxRows);
      const rows = remainingRows.slice(0, takeRows);
      const height = getSectionHeight(rows.length);

      currentPage.sections.push({ ...section, title, rows });
      currentTop += height + SECTION_GAP;
      remainingRows = remainingRows.slice(takeRows);
      title = `${section.title} (cont.)`;

      if (remainingRows.length) pushPage();
    }
  };

  cajas.forEach((caja, cajaIndex) => {
    if (cajaIndex > 0) pushPage();
    buildCajaDetailSections(caja).forEach((section) => {
      const height = getSectionHeight(section.rows.length);
      if (currentPage.sections.length && currentTop + height > CONTENT_BOTTOM) pushPage();
      addSection(section);
    });
  });

  pushPage();
  return pages;
};

const drawTable = <TRow extends Record<string, string>>(
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
  opText("Listado de Caja", 331, PAGE_HEIGHT - 29, 7.15, "F3"),
];

const createPageContent = (
  options: CajaPdfOptions,
  cajaRows: CajaPdfRow[],
  resumenRows: ResumenPdfRow[],
  pageNumber: number,
  totalPages: number,
  isLastPage: boolean,
  logoImage?: PdfImage | null,
) => {
  const cajaTable = drawTable("Cajas registradas", cajaRows, CAJA_COLUMNS, TABLE_TOP);
  const resumenTable = isLastPage
    ? drawTable("Resumen de caja por rango", resumenRows, RESUMEN_COLUMNS, cajaTable.tableBottom + 38, (row) =>
        row.cuenta === "Total" || row.cuenta === "Saldo del periodo" ? "F2" : "F1",
      )
    : { ops: [], tableBottom: cajaTable.tableBottom };

  return [
    "q",
    `${A4_HORIZONTAL_SCALE.toFixed(6)} 0 0 1 0 0 cm`,
    `18 18 576 ${PAGE_HEIGHT - 36} re W n`,
    ...drawHeader(options, pageNumber, totalPages, logoImage),
    ...cajaTable.ops,
    ...resumenTable.ops,
    ...drawFooter(),
    "Q",
  ].join("\n");
};

const createDetailPageContent = (
  options: CajaPdfOptions,
  detailPage: DetailPage,
  pageNumber: number,
  totalPages: number,
  logoImage?: PdfImage | null,
) => {
  let currentTop = TABLE_TOP;
  const sectionOps = detailPage.sections.flatMap((section) => {
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
    console.error("No se pudo cargar el logo para el PDF de caja:", error);
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

export const buildCajaPdfFile = (cajas: CajaDiaria[], options: CajaPdfOptions) => {
  const rows = buildCajaRows(cajas);
  const resumenRows = buildResumenRows(options.balance);
  const listingPages = [rows.slice(0, MAX_ROWS_PER_PAGE)];
  return loadLogoImage(getLogoUrl(options.comercio)).then((logoImage) => {
    const totalPages = listingPages.length;
    const listadoContents = listingPages.map((rowsForPage, index) =>
      createPageContent(options, rowsForPage, resumenRows, index + 1, totalPages, index === listingPages.length - 1, logoImage),
    );
    const blob = createPdfBlob(listadoContents, logoImage);
    const filename = `listado-caja-${sanitizeFilename(options.rango) || "reporte"}.pdf`;

    return new File([blob], filename, { type: "application/pdf" });
  });
};

export const buildCajaDiariaPdfFile = (
  caja: CajaDiaria,
  options: Omit<CajaPdfOptions, "balance" | "reportTitle"> & { reportTitle?: string },
) => {
  return loadLogoImage(getLogoUrl(options.comercio)).then((logoImage) => {
    const detailPages = paginateDetailSections([caja]);
    const totalPages = detailPages.length || 1;
    const detailOptions: CajaPdfOptions = {
      ...options,
      reportTitle: options.reportTitle || "CAJA DIARIA",
      balance: {
        filas: [],
        totalDebe: 0,
        totalHaber: 0,
        saldoPeriodo: 0,
        totalVentas: 0,
        cierreSistema: 0,
        cierreReal: 0,
        diferencia: 0,
      },
    };
    const contents = detailPages.map((detailPage, index) =>
      createDetailPageContent(detailOptions, detailPage, index + 1, totalPages, logoImage),
    );
    const blob = createPdfBlob(contents, logoImage);
    const filename = `caja-diaria-${sanitizeFilename(options.rango) || "reporte"}.pdf`;

    return new File([blob], filename, { type: "application/pdf" });
  });
};
