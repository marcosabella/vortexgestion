import type { Comercio } from "@/types/comercio";
import type { FormatoComprobante } from "@/config/parametrizacion";
import type {
  RepartoDistribucion,
  ResumenDistribucion,
} from "@/types/distribucion";
import { getFacturaPrintStyles } from "@/utils/facturaPrint";
import {
  cobroVigente,
  distribucionMoney as money,
  resumenParada,
} from "@/utils/distribucion";

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const fecha = (value: string) => value.split("-").reverse().join("/");

export function buildHojaRepartoPrintHtml(
  data: ResumenDistribucion,
  reparto: RepartoDistribucion,
  comercio: Comercio,
  formato: FormatoComprobante = "a4",
) {
  const direccion = [
    comercio.calle,
    comercio.numero,
    comercio.localidad,
    comercio.provincia,
  ].filter(Boolean).join(" ");
  const paradas = data.paradas.filter((p) => p.reparto_id === reparto.id).sort((
    a,
    b,
  ) => a.orden - b.orden);
  const resumenes = paradas.map((p) => resumenParada(data, p.id));
  const cobros = data.eventos.filter((e) =>
    e.reparto_id === reparto.id && cobroVigente(data, e.id)
  );
  const totalMedio = (medio: string) =>
    cobros.filter((e) => e.datos.medio === medio).reduce(
      (sum, e) => sum + Number(e.datos.monto || 0),
      0,
    );
  const estados: Record<string, string> = {
    planificado: "Planificado",
    en_reparto: "En reparto",
    pendiente_rendicion: "Por rendir",
    rendido: "Rendido",
    cancelado: "Cancelado",
  };
  const totales: [string, string][] = [
    ["Entrega neta", money(resumenes.reduce((sum, r) => sum + r.total, 0))],
    [
      "Cobrado en reparto",
      money(resumenes.reduce((sum, r) => sum + r.cobrado, 0)),
    ],
    ["Efectivo esperado", money(totalMedio("contado"))],
    ["Transferencias", money(totalMedio("transferencia"))],
  ];
  if (reparto.estado === "rendido") {
    totales.push(
      ["Efectivo rendido", money(Number(reparto.efectivo_rendido))],
      ["Diferencia", money(Number(reparto.diferencia))],
    );
  }
  return `<!doctype html><html><head><meta charset="utf-8" />
    <title>Hoja de reparto - ${escapeHtml(reparto.nombre)} - ${
    escapeHtml(reparto.fecha)
  }</title>
    <style>${getFacturaPrintStyles(formato)}
      .hoja-reparto.sin-cae { padding-bottom: 0; }
      .hoja-reparto .totales-section { position: static; border-right: 0; border-top: 1px solid #000; }
      .hoja-reparto .items-table { border-collapse: collapse; table-layout: fixed; }
      .hoja-reparto .items-table td { border-bottom: 1px solid #ddd; overflow-wrap: anywhere; }
      .hoja-reparto .items-table th { overflow-wrap: anywhere; }
      .hoja-reparto .items-table thead { display: table-header-group; }
      .hoja-reparto .items-table tr, .hoja-reparto .firma, .hoja-reparto .totales-section { break-inside: avoid; }
      .hoja-reparto .cliente-section { break-after: avoid; }
      .hoja-reparto .observaciones { white-space: pre-wrap; overflow-wrap: anywhere; }
      .hoja-reparto .firma { padding: 16px 10px; border-bottom: 1px solid #000; }
      .hoja-reparto .pie { padding: 10px; border-top: 1px solid #000; }
      @media print { * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
      ${
    formato === "58mm"
      ? ".hoja-reparto .totales-grid { width: 100%; margin: 0; } .hoja-reparto .items-table th, .hoja-reparto .items-table td { font-size: 7px; padding: 3px 1px; }"
      : ""
  }
    </style></head><body><div class="factura-container sin-cae hoja-reparto">
      <div class="copy-indicator">ORIGINAL</div>
      <div class="header">
        <div class="header-left">
          ${
    comercio.logo_url?.trim()
      ? `<img class="comercio-logo" src="${
        escapeHtml(comercio.logo_url)
      }" alt="${escapeHtml(comercio.nombre_comercio)}" />`
      : `<div class="comercio-nombre">${
        escapeHtml(comercio.nombre_comercio)
      }</div>`
  }
          <div class="comercio-datos">${
    direccion ? `<div class="info-line">${escapeHtml(direccion)}</div>` : ""
  }<div class="info-line">${escapeHtml(comercio.situacion_afip)}</div></div>
        </div>
        <div class="header-center"><div class="tipo-letra">HR</div><div class="tipo-codigo">NO FISCAL</div></div>
        <div class="header-right"><div class="factura-titulo">HOJA DE REPARTO</div><div class="factura-info">
          <div class="numero-line"><strong>${
    escapeHtml(reparto.nombre)
  }</strong></div>
          <div><strong>Fecha:</strong> ${escapeHtml(fecha(reparto.fecha))}</div>
          <div><strong>CUIT:</strong> ${
    escapeHtml(comercio.cuit || "N/A")
  }</div>
          <div><strong>Ingresos Brutos:</strong> ${
    escapeHtml(comercio.ingresos_brutos || "N/A")
  }</div>
          <div><strong>Inicio de Actividades:</strong> ${
    escapeHtml(
      comercio.fecha_inicio_actividad
        ? fecha(comercio.fecha_inicio_actividad.slice(0, 10))
        : "N/A",
    )
  }</div>
        </div></div>
      </div>
      <div class="cliente-section"><div class="cliente-row full"><div><strong>Repartidor:</strong> ${
    escapeHtml(
      data.usuarios.find((u) => u.id === reparto.repartidor_id)?.nombre ||
        "Usuario asignado",
    )
  }</div></div>
        <div class="cliente-row"><div><strong>Vehículo:</strong> ${
    escapeHtml(reparto.vehiculo || "Sin vehículo")
  }</div><div><strong>Estado:</strong> ${
    escapeHtml(estados[reparto.estado])
  } · <strong>Pedidos:</strong> ${paradas.length}</div></div>
      </div>
      ${
    paradas.map((parada, index) => {
      const pedido = data.pedidos.find((p) => p.id === parada.pedido_id);
      const resumen = resumenes[index];
      return `<div class="cliente-section"><div class="cliente-row full"><div><strong>${parada.orden}. Pedido #${
        escapeHtml(pedido?.numero)
      } · ${escapeHtml(pedido?.cliente_nombre)}</strong></div></div>
          <div class="cliente-row full"><div><strong>Domicilio:</strong> ${
        escapeHtml(pedido?.direccion)
      }</div></div>
          <div class="cliente-row full"><div><strong>Teléfono:</strong> ${
        escapeHtml(pedido?.telefono || "—")
      }</div></div>
          ${
        pedido?.observaciones
          ? `<div class="observaciones"><strong>Observaciones:</strong> ${
            escapeHtml(pedido.observaciones)
          }</div>`
          : ""
      }</div>
          <table class="items-table"><thead><tr><th style="width:40%">Producto</th><th>Cargado</th><th>Entregado</th><th>Devuelto</th><th>Sin entregar</th></tr></thead><tbody>
            ${
        resumen.cargas.map((c) =>
          `<tr><td>${
            escapeHtml(data.items.find((i) => i.id === c.item_id)?.descripcion)
          }</td><td class="text-right">${c.cargada}</td><td class="text-right">${c.entregada}</td><td class="text-right">${c.devuelta}</td><td class="text-right">${
            c.cargada - c.entregada
          }</td></tr>`
        ).join("")
      }
          </tbody></table>
          <div class="cliente-section"><div class="cliente-row full"><div><strong>Entrega neta:</strong> ${
        escapeHtml(money(resumen.total))
      } · <strong>Cobrado:</strong> ${
        escapeHtml(money(resumen.cobrado))
      }</div></div></div>
          <div class="firma">Recibió: ____________________ &nbsp; Firma: ____________________</div>`;
    }).join("")
  }
      ${
    paradas.length === 0
      ? '<div class="cliente-section">Sin pedidos asignados.</div>'
      : ""
  }
      <div class="totales-section"><div class="totales-grid">${
    totales.map(([label, value]) =>
      `<div class="totales-row"><div class="text-right">${
        escapeHtml(label)
      }:</div><div class="text-right">${escapeHtml(value)}</div></div>`
    ).join("")
  }</div></div>
      ${
    reparto.observaciones
      ? `<div class="cliente-section observaciones"><strong>Observaciones de rendición:</strong> ${
        escapeHtml(reparto.observaciones)
      }</div>`
      : ""
  }
      <div class="pie">Documento operativo no fiscal. Firma del repartidor: ____________________</div>
    </div></body></html>`;
}
