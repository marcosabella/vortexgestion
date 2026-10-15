import type { ReciboPagoCliente } from "@/types/recibo-pago-cliente";
import { getFacturaPrintStyles } from "@/utils/facturaPrint";
import { identidadComercioHtml, telefonoComercioHtml } from "@/utils/comercioEncabezado";

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export const numeroRecibo = (r: ReciboPagoCliente) => r.historico ? `H-${r.historico.movimiento_id}` : `R-${String(r.numero).padStart(8, "0")}`;
export const dineroRecibo = (r: ReciboPagoCliente, value: number) => Number(value).toLocaleString("es-AR", {
  style: "currency", currency: r.moneda, currencyDisplay: "symbol", minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const fecha = (value: string) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("es-AR") : "";
const medios = { contado: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", cheque: "Cheque" };

export function buildReciboPagoHtml(r: ReciboPagoCliente) {
  const c = r.comercio_snapshot;
  const direccion = [c.calle, c.numero, c.localidad, c.provincia].filter((s) => s && !/^[.\s]+$/.test(s)).join(" ");
  const saldo = Number(r.saldo_posterior);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Recibo ${escape(numeroRecibo(r))}</title>
  <style>${getFacturaPrintStyles()}
    .recibo.factura-container { min-height: 1040px; padding-bottom: 0; }
    .recibo .header { grid-template-columns: minmax(0,1fr) 72px minmax(0,1fr); }
    .recibo .factura-titulo { font-size: 20px; }
    .recibo-cuerpo { padding: 22px 18px; font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
    .recibo table { width: 100%; border-collapse: collapse; margin: 12px 0 24px; font-size: 12px; }
    .recibo th,.recibo td { padding: 7px; border: 1px solid #000; text-align: left; }
    .recibo th { background: #eee; } .recibo td:last-child { text-align: right; }
    .recibo h2 { font-size: 15px; margin: 24px 0 8px; }
    .recibo-saldo { border: 1px solid #000; padding: 14px; margin-top: 24px; }
    .recibo-saldo div { display:flex; justify-content:space-between; gap:16px; }
    .recibo-nota { font-size: 11px; margin-top: 24px; }
    .recibo-anulado { border: 2px solid #000; padding: 10px; font-weight:bold; text-align:center; }
    .recibo-firma { margin-top:70px; text-align:right; font-size:12px; }
    @media print { .recibo.factura-container { min-height: 0; } .recibo-saldo,tr { break-inside:avoid; } }
  </style></head><body><div class="factura-container sin-cae recibo">
    <div class="copy-indicator">${r.historico ? "COMPROBANTE DE PAGO HISTÓRICO" : "COMPROBANTE DE PAGO"}</div>
    <div class="header"><div class="header-left">${identidadComercioHtml(c)}<div class="comercio-datos">
      ${direccion ? `<div class="info-line">${escape(direccion)}</div>` : ""}${telefonoComercioHtml(c)}
      <div class="info-line">${escape(c.situacion_afip)}</div></div></div>
      <div class="header-center"><div class="tipo-letra">R</div><div class="tipo-codigo">NO FISCAL</div></div>
      <div class="header-right"><div class="factura-titulo">RECIBO DE PAGO</div><div class="factura-info">
        <div class="numero-line"><strong>${escape(numeroRecibo(r))}</strong></div>
        <div><strong>Fecha de pago:</strong> ${fecha(r.fecha)}</div>
        <div><strong>CUIT:</strong> ${escape(c.cuit || "N/A")}</div>
        <div><strong>Ingresos Brutos:</strong> ${escape(c.ingresos_brutos || "N/A")}</div>
        <div><strong>Inicio de Actividades:</strong> ${fecha(c.fecha_inicio_actividad)}</div>
      </div></div></div>
    <div class="recibo-cuerpo">
      ${r.anulado_en ? '<div class="recibo-anulado">RECIBO ANULADO - COBRO REVERTIDO O MODIFICADO</div>' : ""}
      <p><strong>Recibido del cliente:</strong> ${escape(r.cliente_snapshot.nombre)}<br>
      <strong>CUIT / DNI:</strong> ${escape(r.cliente_snapshot.cuit || "N/A")}</p>
      <p>La suma de <strong>${escape(dineroRecibo(r, r.importe))}</strong>, en concepto de pago de su cuenta corriente.</p>
      <h2>Medios de pago</h2><table><thead><tr><th>Medio / detalle</th><th>Importe</th></tr></thead><tbody>${r.pagos.length ? r.pagos.map((p) => `<tr><td>${medios[p.tipo]}${p.cheque ? ` - N° ${escape(p.cheque.numero_cheque)} - ${escape(p.cheque.banco_emisor)}` : ""}${p.observaciones ? ` - ${escape(p.observaciones)}` : ""}</td><td>${escape(dineroRecibo(r, p.monto))}</td></tr>`).join("") : `<tr><td>Medio no informado en el movimiento</td><td>${escape(dineroRecibo(r, r.importe))}</td></tr>`}</tbody></table>
      ${r.documentos.length ? `<h2>Comprobantes abonados</h2><table><thead><tr><th>Comprobante</th><th>Importe aplicado</th></tr></thead><tbody>${r.documentos.map((d) => `<tr><td>${escape(d.numero)}</td><td>${escape(dineroRecibo(r, d.importe))}</td></tr>`).join("")}</tbody></table>` : ""}
      <div class="recibo-saldo"><strong>${r.historico ? `Saldo al cierre del ${fecha(r.historico.saldo_a_fecha)} (reconstruido)` : "Estado de la cuenta al registrar este pago"}</strong>
        ${!r.historico ? `<div><span>Saldo anterior</span><span>${escape(dineroRecibo(r, r.saldo_anterior))}</span></div>` : ""}
        <div><span>Importe recibido</span><span>${escape(dineroRecibo(r, r.importe))}</span></div>
        <div><strong>${saldo > 0 ? "Saldo pendiente" : saldo < 0 ? "Saldo a favor" : "Cuenta saldada"}</strong><strong>${escape(dineroRecibo(r, Math.abs(saldo)))}</strong></div>
      </div>
      ${r.observaciones ? `<p><strong>Observaciones:</strong> ${escape(r.observaciones)}</p>` : ""}
      ${!r.historico ? `<p class="recibo-nota">Emitido el ${escape(new Date(r.creado_en).toLocaleString("es-AR"))}. El saldo corresponde al momento de registrar el cobro y no incluye movimientos posteriores.${r.pagos.some((p) => p.tipo === "cheque") ? " Los cheques se reciben sujetos a su acreditación." : ""}</p>` : r.pagos.some((p) => p.tipo === "cheque") ? '<p class="recibo-nota">Los cheques se reciben sujetos a su acreditación.</p>' : ""}
      <div class="recibo-firma">________________________________<br>Firma / aclaración de quien recibe</div>
    </div></div></body></html>`;
}

export async function buildReciboPagoPdf(r: ReciboPagoCliente) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    if (!doc) throw new Error("No se pudo preparar el recibo");
    doc.open(); doc.write(buildReciboPagoHtml(r)); doc.close();
    await Promise.all(Array.from(doc.images).map((img) => img.complete ? Promise.resolve() : new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 8000);
      const finish = () => { window.clearTimeout(timer); resolve(); };
      img.addEventListener("load", finish, { once: true }); img.addEventListener("error", finish, { once: true });
    })));
    await doc.fonts.ready;
    const element = doc.querySelector<HTMLElement>(".recibo");
    if (!element) throw new Error("No se encontró el recibo");
    const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: "#fff", logging: false });
    const pdf = new jsPDF({ format: "a4", unit: "mm" });
    const width = 194;
    const pagePixels = Math.floor(281 * canvas.width / width);
    const origin = element.getBoundingClientRect();
    const scale = canvas.width / origin.width;
    const protectedBlocks = Array.from(element.querySelectorAll("tr,.recibo-saldo,.recibo-firma")).map((node) => {
      const rect = node.getBoundingClientRect();
      return { top: Math.floor((rect.top - origin.top) * scale), bottom: Math.ceil((rect.bottom - origin.top) * scale) };
    });
    for (let y = 0; y < canvas.height;) {
      if (y) pdf.addPage();
      let end = Math.min(y + pagePixels, canvas.height);
      const crossing = protectedBlocks.find((block) => block.top > y && block.top < end && block.bottom > end);
      if (crossing) end = crossing.top;
      const part = document.createElement("canvas");
      part.width = canvas.width; part.height = end - y;
      part.getContext("2d")!.drawImage(canvas, 0, y, part.width, part.height, 0, 0, part.width, part.height);
      pdf.addImage(part, "PNG", 8, 8, width, part.height * width / part.width, undefined, "FAST");
      y = end;
    }
    return new File([pdf.output("blob")], `recibo-${numeroRecibo(r)}.pdf`, { type: "application/pdf" });
  } finally { frame.remove(); }
}
