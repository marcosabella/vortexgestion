import type { FormatoComprobante } from "@/config/parametrizacion";
import type { Comercio } from "@/types/comercio";
import type { ComandaRestaurante, ItemRestaurante, PedidoRestaurante, ResumenRestaurante } from "@/types/restaurante";
import { getFacturaPrintStyles } from "@/utils/facturaPrint";
import { restauranteMesas, restauranteMoney as money, restauranteSaldo } from "./restaurante";

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]!);
const fecha = (value?: string | null) => {
  const d = value ? new Date(value) : null;
  return d && Number.isFinite(d.getTime()) ? d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "—";
};
const modalidad = (p: PedidoRestaurante) => p.modalidad === "mesa" ? "Salón / mesa" : p.modalidad === "retiro" ? "Retiro" : "Delivery";
const detalle = (i: ItemRestaurante) => `${escape(i.descripcion)}${i.adicionales.length ? `<small>${escape(i.adicionales.map(a => a.nombre).join(", "))}</small>` : ""}${i.observaciones ? `<small>${escape(i.observaciones)}</small>` : ""}`;

function documento({ comercio, formato, titulo, numero, letra, creado, copia, contenido, pie }: {
  comercio?: Comercio | null; formato: FormatoComprobante; titulo: string; numero: string; letra: string;
  creado: string; copia: string; contenido: string; pie: string;
}) {
  const domicilio = [comercio?.calle, comercio?.numero, comercio?.localidad, comercio?.provincia].filter(v => v?.trim() && !/^[.\s]+$/.test(v)).join(" ");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escape(titulo)} ${escape(numero)}</title>
    <style>${getFacturaPrintStyles(formato)}
      .restaurante-documento.sin-cae { padding-bottom:0; display:flex; flex-direction:column; }
      .restaurante-documento > * { flex-shrink:0; }
      .restaurante-documento .header { break-inside:avoid; }
      .restaurante-documento .cliente-section { break-after:avoid; }
      .restaurante-documento .items-table { border-collapse:collapse; table-layout:fixed; }
      .restaurante-documento .items-table thead { display:table-header-group; }
      .restaurante-documento .items-table tr { break-inside:avoid; }
      .restaurante-documento .items-table td { border-bottom:1px solid #ddd; }
      .restaurante-documento .items-table td, .restaurante-documento .items-table th,
      .restaurante-documento .cliente-section, .restaurante-documento .factura-info { overflow-wrap:anywhere; }
      .restaurante-documento small { display:block; margin-top:3px; }
      .restaurante-documento .cancelado { text-decoration:line-through; }
      .restaurante-documento .totales-section { position:static; border-right:0; border-top:1px solid #000; }
      .restaurante-documento .observaciones { white-space:pre-wrap; }
      .restaurante-documento .documento-pie { margin-top:auto; border-top:1px solid #000; padding:8px 10px; break-inside:avoid; }
      ${formato === "58mm" ? `.restaurante-documento .totales-section, .restaurante-documento .documento-pie { border-top:1px dashed #000; padding:2mm 0; }
      .restaurante-documento .documento-pie { margin-top:2mm; text-align:center; }
      .restaurante-documento .totales-grid { margin:0; width:100%; }` : ""}
      @media print { * { print-color-adjust:exact; -webkit-print-color-adjust:exact; } }
    </style></head><body><div class="factura-container sin-cae restaurante-documento">
      <div class="copy-indicator">${escape(copia)}</div>
      <div class="header"><div class="header-left">
        ${comercio?.logo_url?.trim() ? `<img class="comercio-logo" src="${escape(comercio.logo_url)}" alt="${escape(comercio.nombre_comercio)}">` : `<div class="comercio-nombre">${escape(comercio?.nombre_comercio || "Restaurante")}</div>`}
        <div class="comercio-datos">${domicilio ? `<div class="info-line">${escape(domicilio)}</div>` : ""}${comercio?.situacion_afip ? `<div class="info-line">${escape(comercio.situacion_afip)}</div>` : ""}${comercio?.telefono ? `<div class="info-line">Teléfono: ${escape(comercio.telefono)}</div>` : ""}</div>
      </div><div class="header-center"><div class="tipo-letra">${escape(letra)}</div><div class="tipo-codigo">NO FISCAL</div></div>
      <div class="header-right"><div class="factura-titulo">${escape(titulo)}</div><div class="factura-info">
        <div class="numero-line"><strong><span class="presupuesto-numero">${escape(numero)}</span></strong></div>
        <div><strong>Fecha:</strong> ${escape(fecha(creado))}</div>
        <div><strong>CUIT:</strong> ${escape(comercio?.cuit || "—")}</div>
        ${comercio?.ingresos_brutos ? `<div><strong>Ingresos Brutos:</strong> ${escape(comercio.ingresos_brutos)}</div>` : ""}
        ${comercio?.fecha_inicio_actividad ? `<div><strong>Inicio de Actividades:</strong> ${escape(new Date(comercio.fecha_inicio_actividad).toLocaleDateString("es-AR"))}</div>` : ""}
      </div></div></div>
      ${contenido}<div class="documento-pie">${escape(pie)}</div>
    </div></body></html>`;
}

export function restauranteCuentaHtml(data: ResumenRestaurante, p: PedidoRestaurante, comercio?: Comercio | null, formato: FormatoComprobante = data.config.impresion) {
  const items = data.items.filter(i => i.pedido_id === p.id && i.estado !== "cancelada");
  const { cobrado, saldo } = restauranteSaldo(data, p);
  const mesas = data.cuenta_mesas.filter(m => m.pedido_id === p.id).map(m => data.mesas.find(x => x.id === m.mesa_id)?.nombre).filter(Boolean).join(" + ");
  const filas = items.map(i => `<tr><td>${detalle(i)}</td><td class="text-right">${escape(i.cantidad)}</td><td class="text-right">${escape(money(Number(i.precio)))}</td><td class="text-right">${escape(money(Math.round(i.cantidad * Number(i.precio) * 100) / 100))}</td></tr>`);
  if (p.costo_envio > 0) filas.push(`<tr><td>Servicio de delivery</td><td class="text-right">1</td><td class="text-right">${escape(money(p.costo_envio))}</td><td class="text-right">${escape(money(p.costo_envio))}</td></tr>`);
  return documento({ comercio, formato, titulo: "DETALLE DE CUENTA", numero: `Pedido #${p.numero}`, letra: "CC", creado: p.created_at, copia: "DETALLE DE CUENTA", pie: "DETALLE DE CUENTA · NO VÁLIDO COMO FACTURA", contenido: `
    <div class="cliente-section"><div class="cliente-row full"><div><strong>Cliente:</strong> ${escape(p.cliente_nombre || "Consumidor final")}</div></div>
    <div class="cliente-row"><div><strong>Modalidad:</strong> ${escape(modalidad(p))}</div><div><strong>Mesa:</strong> ${escape(mesas || "—")} · ${escape(p.comensales)} comensales</div></div>
    ${p.telefono ? `<div class="cliente-row full"><div><strong>Teléfono:</strong> ${escape(p.telefono)}</div></div>` : ""}
    ${p.direccion ? `<div class="cliente-row full"><div><strong>Domicilio:</strong> ${escape(p.direccion)}</div></div>` : ""}</div>
    <table class="items-table"><thead><tr><th style="width:44%">Producto / adicionales</th><th style="width:12%">Cant.</th><th style="width:22%">Precio unitario</th><th style="width:22%">Importe</th></tr></thead><tbody>${filas.join("") || '<tr><td colspan="4">Sin productos</td></tr>'}</tbody></table>
    <div class="totales-section"><div class="totales-grid">${[["Total", p.total], ["Cobrado", cobrado], ["Saldo", saldo]].map(([label, monto]) => `<div class="totales-row ${label === "Total" ? "total-final" : ""}"><div>${escape(label)}:</div><div class="text-right">${escape(money(Number(monto)))}</div></div>`).join("")}</div></div>` });
}

export function restauranteComandaHtml(data: ResumenRestaurante, c: ComandaRestaurante, comercio?: Comercio | null, formato?: FormatoComprobante) {
  const p = data.pedidos.find(p => p.id === c.pedido_id);
  if (!p) throw new Error("El pedido de la comanda no está disponible.");
  const sector = data.sectores.find(s => s.id === c.sector_id);
  const items = data.items.filter(i => i.comanda_id === c.id);
  return documento({ comercio, formato: formato || sector?.impresion || data.config.impresion, titulo: "COMANDA", numero: `Comanda #${c.numero}`, letra: "CO", creado: c.created_at, copia: c.impresiones > 1 ? "REIMPRESIÓN · COMANDA" : "COMANDA DE PREPARACIÓN", pie: "COMANDA DE PREPARACIÓN · NO FISCAL", contenido: `
    <div class="cliente-section"><div class="cliente-row"><div><strong>Sector:</strong> ${escape(sector?.nombre || "—")}</div><div><strong>Pedido:</strong> #${escape(p.numero)}</div></div>
    <div class="cliente-row"><div><strong>Modalidad:</strong> ${escape(modalidad(p))}</div><div><strong>Mesa:</strong> ${escape(restauranteMesas(data, p.id) || "—")} · ${escape(p.comensales)} comensales</div></div>
    ${p.prioridad ? '<div class="cliente-row full"><div><strong>PRIORIDAD</strong></div></div>' : ""}
    ${p.prometido_at ? `<div class="cliente-row full"><div><strong>Prometido:</strong> ${escape(fecha(p.prometido_at))}</div></div>` : ""}
    ${p.observaciones ? `<div class="cliente-row full"><div class="observaciones"><strong>Observaciones:</strong> ${escape(p.observaciones)}</div></div>` : ""}
    ${c.aviso_cancelacion ? '<div class="cliente-row full"><div><strong>AVISO DE CANCELACIÓN PENDIENTE</strong></div></div>' : ""}</div>
    <table class="items-table"><thead><tr><th style="width:14%">Cant.</th><th style="width:64%">Producto / preparación</th><th style="width:22%">Estado</th></tr></thead><tbody>${items.map(i => `<tr class="${i.estado === "cancelada" ? "cancelado" : ""}"><td class="text-right">${escape(i.cantidad)}</td><td>${detalle(i)}</td><td>${i.estado === "cancelada" ? "CANCELADO" : escape(i.estado)}</td></tr>`).join("") || '<tr><td colspan="3">Sin productos</td></tr>'}</tbody></table>` });
}
