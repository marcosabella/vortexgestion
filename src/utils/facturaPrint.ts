import { format } from "date-fns";
import { AfipConfig } from "@/types/afip";
import { Comercio } from "@/types/comercio";
import { getVentaTipoPagoLabel, Venta } from "@/types/venta";

interface FacturaPrintOptions {
  venta: Venta;
  comercio?: Comercio | null;
  afipConfig?: AfipConfig | null;
  qrDataUrl?: string;
}

const CODIGOS_COMPROBANTE: Record<string, string> = {
  factura_a: "001",
  factura_b: "006",
  factura_c: "011",
  nota_credito_a: "003",
  nota_credito_b: "008",
  nota_credito_c: "013",
  nota_debito_a: "002",
  nota_debito_b: "007",
  nota_debito_c: "012",
  recibo_a: "004",
  recibo_b: "009",
  recibo_c: "015",
  ticket_fiscal: "083",
  factura_exportacion: "019",
};

const MONEDA_FORMATTER = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const escapeHtml = (value?: string | number | null) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatMoney = (value?: number | null) => MONEDA_FORMATTER.format(Number(value || 0));

const formatDate = (value?: string | null) => {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return format(date, "dd/MM/yyyy");
};

const sanitizeFilename = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const getLogoUrl = (comercio?: Comercio | null) => comercio?.logo_url?.trim() || "/logo.png";

export const getFacturaPrintStyles = () => `
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    line-height: 1.35;
    padding: 12px;
  }

  .factura-container {
    border: 1px solid #000;
    margin: 0 auto;
    max-width: 800px;
    min-height: 1080px;
    padding-bottom: 178px;
    position: relative;
    width: 100%;
  }

  .factura-container.sin-cae {
    padding-bottom: 72px;
  }

  .copy-indicator {
    font-size: 12px;
    font-weight: 700;
    padding: 6px;
    text-align: center;
  }

  .header {
    border-bottom: 1px solid #000;
    border-top: 1px solid #000;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 82px minmax(0, 1fr);
    min-height: 154px;
  }

  .header-left,
  .header-right {
    padding: 10px 12px;
  }

  .header-left {
    border-right: 2px solid #000;
    text-align: center;
  }

  .header-right {
    border-left: 2px solid #000;
  }

  .header-center {
    align-items: center;
    display: flex;
    flex-direction: column;
    justify-content: center;
    position: relative;
  }

  .header-center::before {
    background: #000;
    content: "";
    height: 19px;
    left: 50%;
    position: absolute;
    top: -19px;
    transform: translateX(-50%);
    width: 2px;
  }

  .comercio-nombre {
    font-size: 17px;
    font-weight: 700;
    line-height: 1.1;
    margin-bottom: 8px;
    text-transform: uppercase;
  }

  .comercio-logo {
    display: block;
    height: 82px;
    margin: 0 auto 10px;
    max-width: 240px;
    object-fit: contain;
    object-position: center;
    width: auto;
  }

  .info-line {
    margin-bottom: 4px;
  }

  .comercio-datos {
    font-size: 11px;
    line-height: 1.35;
  }

  .tipo-letra {
    font-size: 38px;
    font-weight: 700;
    line-height: 1;
  }

  .tipo-codigo {
    font-size: 9px;
    font-weight: 700;
    margin-top: 3px;
  }

  .factura-titulo {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 10px;
    text-transform: uppercase;
  }

  .factura-info strong {
    display: inline-block;
    min-width: 118px;
  }

  .numero-line strong span {
    display: inline-block;
    font-size: 25px;
    font-weight: 700;
    margin-right: 16px;
    padding: 15px;
  }

  .periodo-section {
    border-bottom: 1px solid #000;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .periodo-item {
    padding: 6px 10px;
  }

  .periodo-item:first-child {
    border-right: 1px solid #000;
  }

  .cliente-section {
    border-bottom: 1px solid #000;
    padding: 8px 10px;
  }

  .cliente-row {
    display: grid;
    gap: 14px;
    grid-template-columns: 1fr 2fr;
    margin-bottom: 5px;
  }

  .cliente-row.full {
    grid-template-columns: 1fr;
  }

  .items-table {
    width: 100%;
  }

  .items-table th {
    background: #d9edf7;
    border-bottom: 1px solid #000;
    border-right: 1px solid #000;
    font-size: 9px;
    font-weight: 700;
    padding: 6px 4px;
    text-align: center;
  }

  .items-table th:last-child,
  .items-table td:last-child {
    border-right: none;
  }

  .items-table td {
    font-size: 9px;
    padding: 6px 4px;
    vertical-align: top;
  }

  .empty-rows td {
    border-bottom: none !important;
    height: 120px;
  }

  .text-right {
    text-align: right;
  }

  .text-center {
    text-align: center;
  }

  .totales-section {
    background: #fff;
    //border-right: 1px solid #000;
    bottom: 178px;
    left: 0;
    padding: 8px 10px;
    position: absolute;
    right: 0;
  }

  .totales-section::after {
    //background: #000;
    bottom: 0;
    content: "";
    position: absolute;
    right: 0;
    top: 0;
    width: 1px;
  }

  .sin-cae .totales-section {
    bottom: 42px;
  }

  .totales-grid {
    margin-left: auto;
    margin-right: 10px;
    width: 310px;
  }

  .totales-row {
    display: grid;
    gap: 10px;
    grid-template-columns: 1fr 120px;
    margin-bottom: 4px;
  }

  .totales-row.total-final {
    border-top: 1px solid #000;
    font-size: 13px;
    font-weight: 700;
    margin-top: 6px;
    padding-top: 5px;
  }

  .footer-section {
    border-top: 1px solid #000;
    bottom: 20px;
    display: grid;
    gap: 14px;
    grid-template-columns: 120px 1fr 220px;
    left: 0;
    min-height: 136px;
    padding: 10px;
    position: absolute;
    right: 0;
  }

  .qr-container {
    align-items: center;
    border: 1px solid #bbb;
    display: flex;
    height: 104px;
    justify-content: center;
    overflow: hidden;
    width: 104px;
  }

  .qr-container img {
    height: 100%;
    object-fit: contain;
    width: 100%;
  }

  .arca-logo {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0;
    margin-bottom: 4px;
  }

  .arca-caption {
    font-size: 8px;
    max-width: 230px;
  }

  .footer-center {
    align-self: end;
  }

  .cae-info {
    align-self: end;
    font-size: 11px;
    text-align: right;
  }

  .cae-info div {
    margin-bottom: 4px;
  }

  .disclaimer-full {
    border-top: 1px solid #ccc;
    bottom: 0;
    color: #555;
    font-size: 7px;
    left: 0;
    padding: 4px 10px;
    position: absolute;
    right: 0;
    text-align: center;
  }

  .page-number {
    bottom: 4px;
    font-size: 8px;
    left: 10px;
    position: absolute;
  }

  @media print {
    @page {
      margin: 8mm;
      size: A4;
    }

    body {
      padding: 0;
    }

    .factura-container {
      min-height: calc(297mm - 16mm);
    }
  }
`;

const getTipoComprobanteLetra = (tipo: string) => {
  if (tipo.includes("_a")) return "A";
  if (tipo.includes("_b")) return "B";
  if (tipo.includes("_c")) return "C";
  return "X";
};

const getTipoComprobanteNombre = (tipo: string) => {
  if (tipo.includes("factura") && !tipo.includes("exportacion")) return "FACTURA";
  if (tipo.includes("nota_credito")) return "NOTA DE CREDITO";
  if (tipo.includes("nota_debito")) return "NOTA DE DEBITO";
  if (tipo.includes("recibo")) return "RECIBO";
  if (tipo === "ticket_fiscal") return "TICKET FISCAL";
  if (tipo === "factura_exportacion") return "FACTURA DE EXPORTACION";
  return "COMPROBANTE";
};

const formatNumeroComprobante = (venta: Venta, afipConfig?: AfipConfig | null) => {
  const parts = venta.numero_comprobante.split("-");

  if (parts.length === 2) {
    return {
      puntoVenta: parts[0].padStart(5, "0"),
      numero: parts[1].padStart(8, "0"),
    };
  }

  return {
    puntoVenta: afipConfig?.punto_venta?.toString().padStart(5, "0") || "00001",
    numero: venta.numero_comprobante.padStart(8, "0"),
  };
};

const getTipoPagoLabel = (venta: Venta) => {
  const pagoLabel = getVentaTipoPagoLabel(venta);
  if (pagoLabel === "Pago Mixto") return pagoLabel;
  if (venta.tipo_pago === "transferencia") return "Transferencia Bancaria";
  if (venta.tipo_pago === "tarjeta") return "Tarjeta de Credito/Debito";
  return pagoLabel;
};

export const buildFacturaPrintBody = ({ venta, comercio, afipConfig, qrDataUrl = "" }: FacturaPrintOptions) => {
  const hasCae = Boolean(venta.cae?.trim());
  const numComprobante = formatNumeroComprobante(venta, afipConfig);
  const fechaVenta = formatDate(venta.fecha_venta);
  const comercioDireccion = [
    comercio?.calle,
    comercio?.numero,
    comercio?.localidad,
    comercio?.provincia,
  ]
    .filter(Boolean)
    .join(" ");
  const logoUrl = getLogoUrl(comercio);

  const rows = venta.venta_items?.length
    ? venta.venta_items
        .map((item) => {
          const descripcion = item.producto?.descripcion || item.descripcion_manual || "Item manual";
          const recargo = Number(item.monto_recargo || 0) > 0
            ? ` (Recargo: $ ${formatMoney(item.monto_recargo)})`
            : "";

          return `
            <tr>
              <td>${escapeHtml(item.producto?.cod_producto || item.codigo_manual || "-")}</td>
              <td>${escapeHtml(`${descripcion}${recargo}`)}</td>
              <td class="text-right">${escapeHtml(formatMoney(item.cantidad))}</td>
              <td class="text-center">unidades</td>
              <td class="text-right">${escapeHtml(formatMoney(item.precio_unitario))}</td>
              <td class="text-right">${escapeHtml(formatMoney(item.porcentaje_descuento || 0))}</td>
              <td class="text-right">${escapeHtml(formatMoney(item.monto_descuento || 0))}</td>
              <td class="text-right">${escapeHtml(formatMoney(item.subtotal))}</td>
            </tr>
          `;
        })
        .join("")
    : "";

  return `
    <div class="factura-container ${hasCae ? "con-cae" : "sin-cae"}">
      <div class="copy-indicator">ORIGINAL</div>

      <div class="header">
        <div class="header-left">
          ${
            logoUrl
              ? `<img class="comercio-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(comercio?.nombre_comercio || "Logo del comercio")}" />`
              : `<div class="comercio-nombre">${escapeHtml(comercio?.nombre_comercio || "COMERCIO")}</div>`
          }
          <div class="comercio-datos">
            <div class="info-line">${escapeHtml(comercio?.nombre_comercio || "N/A")}</div>
            <div class="info-line">${escapeHtml(comercioDireccion || "N/A")}</div>
            <div class="info-line">Responsable Inscripto</div>
          </div>
        </div>

        <div class="header-center">
          <div class="tipo-letra">${escapeHtml(getTipoComprobanteLetra(venta.tipo_comprobante))}</div>
          <div class="tipo-codigo">COD. ${escapeHtml(CODIGOS_COMPROBANTE[venta.tipo_comprobante] || "000")}</div>
        </div>

        <div class="header-right">
          <div class="factura-titulo">${escapeHtml(getTipoComprobanteNombre(venta.tipo_comprobante))}</div>
          <div class="factura-info">
            <div class="numero-line"><strong><span>${escapeHtml(numComprobante.puntoVenta)} - ${escapeHtml(numComprobante.numero)}</span></strong></div>
            <div><strong>Fecha de Emision:</strong> ${escapeHtml(fechaVenta)}</div>
            <div><strong>CUIT:</strong> ${escapeHtml(comercio?.cuit || "N/A")}</div>
            <div><strong>Ingresos Brutos:</strong> ${escapeHtml(comercio?.ingresos_brutos || "N/A")}</div>
            <div><strong>Inicio de Actividades:</strong> ${escapeHtml(formatDate(comercio?.fecha_inicio_actividad))}</div>
          </div>
        </div>
      </div>

      <div class="periodo-section">
        <div class="periodo-item"><strong>Periodo Facturado Desde:</strong> ${escapeHtml(fechaVenta)} <strong>Hasta:</strong> ${escapeHtml(fechaVenta)}</div>
        <div class="periodo-item"><strong>Fecha de Vto. para el pago:</strong> ${escapeHtml(fechaVenta)}</div>
      </div>

      <div class="cliente-section">
        <div class="cliente-row">
          <div><strong>CUIT:</strong> N/A</div>
          <div><strong>Apellido y Nombre / Razon Social:</strong> ${escapeHtml(venta.cliente_nombre || "Consumidor Final")}</div>
        </div>
        <div class="cliente-row full">
          <div><strong>Domicilio:</strong> N/A</div>
        </div>
        <div class="cliente-row">
          <div><strong>Condicion frente al IVA:</strong> Consumidor Final</div>
          <div><strong>Condicion de venta:</strong> ${escapeHtml(getTipoPagoLabel(venta))}</div>
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 14%">Codigo</th>
            <th style="width: 30%">Producto / Servicio</th>
            <th style="width: 9%">Cantidad</th>
            <th style="width: 11%">U. Medida</th>
            <th style="width: 12%">Precio Unit.</th>
            <th style="width: 8%">% Bonif</th>
            <th style="width: 8%">Imp. Bonif.</th>
            <th style="width: 8%">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="empty-rows"><td colspan="8"></td></tr>
        </tbody>
      </table>

      <div class="totales-section">
        <div class="totales-grid">
          <div class="totales-row">
            <div class="text-right">Subtotal:</div>
            <div class="text-right">$ ${escapeHtml(formatMoney(venta.subtotal))}</div>
          </div>
          ${
            Number(venta.monto_descuento || 0) > 0 || Number(venta.porcentaje_descuento || 0) > 0
              ? `
                <div class="totales-row">
                  <div class="text-right">Descuento:</div>
                  <div class="text-right">${escapeHtml(formatMoney(venta.porcentaje_descuento || 0))}% + $ ${escapeHtml(formatMoney(venta.monto_descuento || 0))}</div>
                </div>
              `
              : ""
          }
          ${
            Number(venta.monto_recargo || 0) > 0 || Number(venta.porcentaje_recargo || 0) > 0
              ? `
                <div class="totales-row">
                  <div class="text-right">Recargo:</div>
                  <div class="text-right">${escapeHtml(formatMoney(venta.porcentaje_recargo || 0))}% + $ ${escapeHtml(formatMoney(venta.monto_recargo || 0))}</div>
                </div>
              `
              : ""
          }
          <div class="totales-row">
            <div class="text-right">Importe Otros Tributos:</div>
            <div class="text-right">$ 0,00</div>
          </div>
          <div class="totales-row">
            <div class="text-right">IVA:</div>
            <div class="text-right">$ ${escapeHtml(formatMoney(venta.total_iva))}</div>
          </div>
          <div class="totales-row total-final">
            <div class="text-right">Importe Total:</div>
            <div class="text-right">$ ${escapeHtml(formatMoney(venta.total))}</div>
          </div>
        </div>
      </div>

      ${
        hasCae
          ? `
            <div class="footer-section">
              <div>
                <div class="qr-container">
                  ${qrDataUrl ? `<img src="${escapeHtml(qrDataUrl)}" alt="QR ARCA" />` : "<span>QR ARCA</span>"}
                </div>
              </div>
              <div class="footer-center">
                <div class="arca-logo">ARCA</div>
                <div class="arca-caption">Comprobante autorizado. Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operacion.</div>
              </div>
              <div class="cae-info">
                <div><strong>CAE Nro:</strong> ${escapeHtml(venta.cae)}</div>
                <div><strong>Fecha de Vto. de CAE:</strong> ${escapeHtml(formatDate(venta.cae_vencimiento))}</div>
              </div>
            </div>
          `
          : `
            <div class="disclaimer-full">
              Comprobante sin CAE informado. La seccion de autorizacion ARCA se omite hasta obtener CAE.
            </div>
          `
      }
      <div class="page-number">Pag. 1/1</div>
    </div>
  `;
};

export const buildFacturaPrintHtml = (options: FacturaPrintOptions) => `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Comprobante ${escapeHtml(options.venta.numero_comprobante)}</title>
      <style>${getFacturaPrintStyles()}</style>
    </head>
    <body>
      ${buildFacturaPrintBody(options)}
    </body>
  </html>
`;

export const buildFacturaHtmlFile = (options: FacturaPrintOptions) => {
  const html = buildFacturaPrintHtml(options);
  const filename = `comprobante-${sanitizeFilename(options.venta.numero_comprobante || "venta")}.html`;

  return new File([html], filename, { type: "text/html" });
};
