import type { AccessRow, PreviewRow } from "@/utils/accessMigrationPreview";

const field = (row: AccessRow, name: string) => Object.entries(row).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
const text = (value: unknown) => value == null ? "" : String(value).trim();
const numeric = (value: unknown) => {
  const result = Number(text(value).replace(",", "."));
  return Number.isFinite(result) ? result : 0;
};
const source = (row: AccessRow, name: string) => text(field(row, name));
const date = (value: unknown) => {
  if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 3)).toISOString();
  const raw = text(value);
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (match) return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 3)).toISOString();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const paymentType = (condition: unknown) => ({ "1": "contado", "2": "cta_cte", "3": "tarjeta", "4": "cheque" }[text(condition)] || "contado");
const receiptType = (code: unknown) => ({
  "1": "factura_a", "5": "factura_a", "6": "factura_b", "9": "recibo_b",
  "11": "factura_c", "64": "factura_b", "82": "factura_b", "121": "recibo_c",
}[text(code)] || "ticket_fiscal");

export type OperationalPayload = Record<"ventas" | "items" | "pagos" | "cheques", PreviewRow[]> & { presupuestosOmitidos: number };

export function buildOperationalPayload(tables: Record<string, AccessRow[]>): OperationalPayload {
  const allSales = tables.Ventas || [];
  const details = tables.Detalle_Venta || [];
  const products = new Map((tables.Articulos || []).map((row) => [source(row, "idArticulo"), row]));
  const detailBySale = new Map<string, AccessRow[]>();
  for (const row of details) {
    const key = source(row, "idVenta");
    detailBySale.set(key, [...(detailBySale.get(key) || []), row]);
  }
  const budgetIds = new Set(allSales.filter((row) => source(row, "idComprobante") === "333").map((row) => source(row, "idVenta")));
  const sales = allSales.filter((row) => !budgetIds.has(source(row, "idVenta")));

  const ventas = sales.map((row) => {
    const sourceId = source(row, "idVenta");
    const lineTotal = (detailBySale.get(sourceId) || []).reduce((sum, item) => sum + numeric(field(item, "cantidad")) * numeric(field(item, "precioUnitario")), 0);
    const total = numeric(field(row, "monto"));
    const difference = total - lineTotal;
    const warnings: string[] = [];
    if (!date(field(row, "fecha_venta"))) warnings.push("Fecha de venta invalida");
    if (Math.abs(difference) > 0.01) warnings.push(`Ajuste historico cabecera/detalle: ${difference.toFixed(2)}`);
    return { sourceId, warnings, data: {
      fecha: date(field(row, "fecha_venta")), cliente_source_id: source(row, "idCliente") || null,
      tipo_pago: paymentType(field(row, "idCondicion_venta")), tipo_comprobante: receiptType(field(row, "idComprobante")),
      comprobante_origen: source(row, "idComprobante"), subtotal: lineTotal, total, ajuste: difference,
      porcentaje_descuento: numeric(field(row, "descuento_venta")), porcentaje_recargo: numeric(field(row, "recargo_venta")),
      observaciones: text(field(row, "observaciones")) || null,
    } };
  });

  const items = details.filter((row) => !budgetIds.has(source(row, "idVenta"))).map((row) => {
    const sourceId = source(row, "IdDetalle_venta");
    const productId = source(row, "idArticulo");
    const product = products.get(productId);
    const cantidad = numeric(field(row, "cantidad"));
    const precio = numeric(field(row, "precioUnitario"));
    return { sourceId, warnings: [], data: {
      venta_source_id: source(row, "idVenta"), producto_source_id: productId,
      cantidad, precio_unitario: precio, porcentaje_iva: numeric(product && field(product, "iva")), total: cantidad * precio,
    } };
  });

  const pagos = (tables.Pagos || []).map((row) => ({ sourceId: source(row, "idPago"), warnings: [], data: {
    cliente_source_id: source(row, "idCliente"), fecha: date(field(row, "fecha_pago")), monto: numeric(field(row, "importe")),
    tipo_pago: paymentType(field(row, "idCondicion_venta")), observaciones: text(field(row, "observaciones")) || null,
  } }));

  const banks = new Map((tables.Banco || []).map((row) => [source(row, "Id"), text(field(row, "nombre"))]));
  const cheques = (tables.Cheques || []).map((row) => ({ sourceId: source(row, "Id"), warnings: [], data: {
    numero: source(row, "nroCheque"), banco: banks.get(source(row, "idBanco")) || "BANCO NO INFORMADO",
    emisor: text(field(row, "emisor")) || "EMISOR NO INFORMADO", monto: numeric(field(row, "monto")),
    fecha: date(field(row, "fecha")), vencimiento: date(field(row, "vencimiento")),
    estado: field(row, "enCartera") === false ? "depositado" : "en_cartera",
  } }));

  return { ventas, items, pagos, cheques, presupuestosOmitidos: budgetIds.size };
}
