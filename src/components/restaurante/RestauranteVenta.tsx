import { VentasList } from "@/components/VentasList";

export function RestauranteVenta({ ventaId, close }: { ventaId: string; close: () => void }) {
  return <VentasList detalleId={ventaId} onCerrarDetalle={close} />;
}
