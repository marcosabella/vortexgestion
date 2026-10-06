import type { Comercio } from "@/types/comercio";
import type {
  RemitoDistribucion,
  RemitoItemDistribucion,
} from "@/types/distribucion";
import { getFacturaPrintStyles } from "@/utils/facturaPrint";
const html = (value: string | number | null | undefined) =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(
    />/g,
    "&gt;",
  ).replace(/"/g, "&quot;").replace(/'/g, "&#039;");

// El original impreso conserva las cantidades despachadas aunque la recepción sea parcial.
export function buildRemitosDistribucionPrintHtml(
  remitos: RemitoDistribucion[],
  items: RemitoItemDistribucion[],
  comercio: Comercio,
) {
  const domicilio = [
    comercio.calle,
    comercio.numero,
    comercio.localidad,
    comercio.provincia,
  ].filter(Boolean).join(" ");
  return `<!doctype html><html><head><meta charset="utf-8" /><title>Remitos del reparto</title><style>${
    getFacturaPrintStyles("a4")
  }
    .remito.sin-cae { padding-bottom: 0; min-height: calc(297mm - 16mm); display:flex; flex-direction:column; break-after:page; }
    .remito:last-child { break-after:auto; } .remito > * { flex-shrink:0; }
    .remito .items-table { border-collapse:collapse; table-layout:fixed; } .remito .items-table tr { break-inside:avoid; }
    .remito .items-table td { border-bottom:1px solid #ddd; overflow-wrap:anywhere; }
    .remito .firma { margin-top:auto; padding:24px 10px; break-inside:avoid; }
    .remito .firma p { margin-bottom:12px; } .remito .pie { border-top:1px solid #000; padding:8px 10px; }
    @media print { * { print-color-adjust:exact; -webkit-print-color-adjust:exact; } }
    </style></head><body>${
    remitos.flatMap((m) =>
      ["CLIENTE", "REPARTIDOR"].map((copia) =>
        `<div class="factura-container sin-cae remito">
      <div class="copy-indicator">EJEMPLAR ${copia}</div><div class="header">
      <div class="header-left">${
          comercio.logo_url?.trim()
            ? `<img class="comercio-logo" src="${
              html(comercio.logo_url)
            }" alt="${html(comercio.nombre_comercio)}" />`
            : `<div class="comercio-nombre">${
              html(comercio.nombre_comercio)
            }</div>`
        }<div class="comercio-datos"><div class="info-line">${
          html(domicilio)
        }</div><div class="info-line">${
          html(comercio.situacion_afip)
        }</div></div></div>
      <div class="header-center"><div class="tipo-letra">${
          m.cai ? "R" : "RE"
        }</div><div class="tipo-codigo">${
          m.cai ? "REMITO" : "NO FISCAL"
        }</div></div>
      <div class="header-right"><div class="factura-titulo">REMITO DE ENTREGA</div><div class="factura-info"><div class="numero-line"><strong>Nº ${
          m.numero_autorizado
            ? `${String(m.punto_venta).padStart(4, "0")} - ${
              String(m.numero_autorizado).padStart(8, "0")
            }`
            : String(m.numero).padStart(8, "0")
        }</strong></div><div><strong>Fecha:</strong> ${
          html(m.fecha.split("-").reverse().join("/"))
        }</div><div><strong>CUIT:</strong> ${
          html(comercio.cuit)
        }</div></div></div></div>
      <div class="cliente-section"><div class="cliente-row full"><div><strong>Cliente:</strong> ${
          html(m.cliente_nombre)
        }</div></div><div class="cliente-row full"><div><strong>Domicilio:</strong> ${
          html(m.direccion)
        }</div></div><div><strong>CUIT:</strong> ${
          html(m.cliente_cuit || "—")
        }</div><div><strong>Teléfono:</strong> ${
          html(m.telefono || "—")
        }</div></div>
      <table class="items-table"><thead><tr><th style="width:12%">Código</th><th style="width:48%">Producto</th><th>Previsto</th><th>Recibido</th><th>Rechazado / faltante</th></tr></thead><tbody>${
          items.filter((i) => i.remito_id === m.id).map((i) =>
            `<tr><td>${html(i.codigo)}</td><td>${
              html(i.descripcion)
            }</td><td class="text-right">${i.cantidad}</td><td>________</td><td>________</td></tr>`
          ).join("")
        }</tbody></table>
      <div class="firma"><p>Observaciones / motivo de faltantes: __________________________________________________</p><p>___________________________________________________________________________________</p><p>Recibió (nombre y documento): ________________________________________________________</p><p>Firma de conformidad: __________________________ Fecha / hora: ________________________</p></div>
      <div class="pie">DOCUMENTO NO VÁLIDO COMO FACTURA.${
          m.cai
            ? `<br />CAI: ${html(m.cai)} · Vencimiento: ${
              html(m.cai_vencimiento)
            }`
            : " Constancia interna no fiscal; no sustituye el remito de traslado autorizado cuando corresponda."
        }</div></div>`
      )
    ).join("")
  }</body></html>`;
}
