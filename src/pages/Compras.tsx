import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { useCompras } from "@/hooks/useCompras";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Compra } from "@/types/compra";

const money = (value: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    value,
  );
const providerName = (provider: Compra["proveedor"] | undefined) =>
  provider?.razon_social ||
  [provider?.nombre, provider?.apellido].filter(Boolean).join(" ") ||
  "Proveedor";
const paymentLabels: Record<string, string> = {
  contado: "Contado",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  cheque: "Cheque",
  cta_cte: "Cuenta corriente",
};
const itemAdjustment = (
  item: Compra["compra_items"][number],
  kind: "descuento" | "recargo",
) => {
  const base = Number(item.costo_unitario) * Number(item.cantidad_recibida);
  const percentage = Number(
    kind === "descuento" ? item.porcentaje_descuento : item.porcentaje_recargo,
  ) || 0;
  const amount =
    Number(kind === "descuento" ? item.monto_descuento : item.monto_recargo) ||
    0;
  const adjustment = base * percentage / 100 + amount;
  return kind === "descuento" ? Math.min(base, adjustment) : adjustment;
};

export default function Compras() {
  const api = useCompras();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<Compra | null>(null);
  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Compras</h1>
          <p className="text-muted-foreground">
            Registrá compras, actualizá stock y administrá la cuenta del
            proveedor.
          </p>
        </div>
        <Button variant="new" onClick={() => navigate("/compras/nueva")}>
          <Plus className="h-4 w-4" />Nueva compra
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Compras registradas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Forma de pago</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {api.compras.map((compra) => (
                  <TableRow key={compra.id}>
                    <TableCell>
                      {new Date(`${compra.fecha}T00:00:00`).toLocaleDateString(
                        "es-AR",
                      )}
                    </TableCell>
                    <TableCell>
                      {compra.factura_numero || compra.numero}
                    </TableCell>
                    <TableCell>{providerName(compra.proveedor)}</TableCell>
                    <TableCell>
                      {paymentLabels[compra.modalidad_pago || ""] ||
                        compra.modalidad_pago || "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {money(Number(compra.total || 0))}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          title="Ver detalle"
                          onClick={() => setDetail(compra)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          title="Modificar"
                          onClick={() =>
                            navigate(`/compras/${compra.id}/editar`)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="destructive"
                          title="Eliminar"
                          disabled={api.eliminarCompra.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `¿Eliminar ${
                                  compra.factura_numero || compra.numero
                                }? Se revertirá el stock y la cuenta del proveedor.`,
                              )
                            ) api.eliminarCompra.mutate(compra.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Detalle de compra {detail?.factura_numero || detail?.numero}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-x-10 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <p>
                  <strong>Fecha:</strong>{" "}
                  {new Date(`${detail.fecha}T00:00:00`).toLocaleDateString(
                    "es-AR",
                  )}
                </p>
                <p>
                  <strong>Comprobante:</strong>{" "}
                  {detail.factura_numero || detail.numero}
                </p>
                <p>
                  <strong>Proveedor:</strong> {providerName(detail.proveedor)}
                </p>
                <p>
                  <strong>Tipo de pago:</strong>{" "}
                  {paymentLabels[detail.modalidad_pago || ""] ||
                    detail.modalidad_pago}
                </p>
              </div>
              <div>
                <h4 className="mb-2 font-semibold">Ítems</h4>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">
                          Costo unitario
                        </TableHead>
                        <TableHead className="text-right">Descuento</TableHead>
                        <TableHead className="text-right">Recargo</TableHead>
                        <TableHead className="text-right">IVA</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.compra_items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            {item.producto?.cod_producto || "—"}
                          </TableCell>
                          <TableCell>
                            {item.producto?.descripcion || item.descripcion}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.cantidad_recibida}
                          </TableCell>
                          <TableCell className="text-right">
                            {money(Number(item.costo_unitario))}
                          </TableCell>
                          <TableCell className="text-right">
                            {money(itemAdjustment(item, "descuento"))}
                          </TableCell>
                          <TableCell className="text-right">
                            {money(itemAdjustment(item, "recargo"))}
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(item.porcentaje_iva)}%
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {money(Number(item.total || 0))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <div className="flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
                <p className="text-sm">
                  <strong>Observaciones:</strong> {detail.observaciones || "—"}
                </p>
                <p className="text-right text-lg">
                  <strong>Total:</strong> {money(Number(detail.total || 0))}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
