import type { CompraNuevaItem } from "@/hooks/useCompras";

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

// El costo se ingresa sin IVA. Los ajustes del renglón se aplican al neto.
export function compraItemTotal(item: CompraNuevaItem): number {
  const base = roundMoney(
    Number(item.cantidad_solicitada || 0) * Number(item.costo_unitario || 0),
  );
  const discount = Math.min(
    base,
    roundMoney(base * Number(item.porcentaje_descuento || 0) / 100 +
      Number(item.monto_descuento || 0)),
  );
  const surcharge = roundMoney(
    base * Number(item.porcentaje_recargo || 0) / 100 +
      Number(item.monto_recargo || 0),
  );
  const net = Math.max(base - discount + surcharge, 0);
  return roundMoney(net * (1 + Number(item.porcentaje_iva || 0) / 100));
}
