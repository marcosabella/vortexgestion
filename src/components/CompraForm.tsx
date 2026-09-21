import { useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { ProductoForm } from "@/components/ProductoForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type CompraNuevaItem, useCompras } from "@/hooks/useCompras";
import { useProductos } from "@/hooks/useProductos";
import { useProveedores } from "@/hooks/useProveedores";
import type { Compra } from "@/types/compra";
import type { Producto } from "@/types/producto";

const today = () =>
  new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
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
const comprobantePattern = /^\d{4}-\d{8}$/;
const formatComprobante = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 12);
  return digits.length > 4
    ? `${digits.slice(0, 4)}-${digits.slice(4)}`
    : digits;
};
const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
const itemTotal = (item: CompraNuevaItem) => {
  const raw = Number(item.cantidad_solicitada || 0) *
    Number(item.costo_unitario || 0);
  const discount = Math.min(
    raw,
    raw * Number(item.porcentaje_descuento || 0) / 100 +
      Number(item.monto_descuento || 0),
  );
  const surcharge = raw * Number(item.porcentaje_recargo || 0) / 100 +
    Number(item.monto_recargo || 0);
  return roundMoney(Math.max(raw - discount + surcharge, 0));
};

type CompraFormProps = {
  compra?: Compra;
  onSuccess: () => void;
  onCancel: () => void;
};

export default function CompraForm(
  { compra, onSuccess, onCancel }: CompraFormProps,
) {
  const api = useCompras();
  const { productos } = useProductos();
  const { data: proveedores = [] } = useProveedores();
  const [searchType, setSearchType] = useState<"proveedor" | "producto" | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [productForm, setProductForm] = useState(false);
  const [proveedorId, setProveedorId] = useState(compra?.proveedor_id || "");
  const [fecha, setFecha] = useState(compra?.fecha || today());
  const [factura, setFactura] = useState(compra?.factura_numero || "");
  const [vencimiento, setVencimiento] = useState(
    compra?.fecha_vencimiento || "",
  );
  const [pago, setPago] = useState(compra?.modalidad_pago || "cta_cte");
  const [observaciones, setObservaciones] = useState(
    compra?.observaciones || "",
  );
  const [descuentoPct, setDescuentoPct] = useState(
    Number(compra?.porcentaje_descuento || 0),
  );
  const [descuento, setDescuento] = useState(
    Number(compra?.monto_descuento || 0),
  );
  const [recargoPct, setRecargoPct] = useState(
    Number(compra?.porcentaje_recargo || 0),
  );
  const [recargo, setRecargo] = useState(Number(compra?.monto_recargo || 0));
  const [items, setItems] = useState<CompraNuevaItem[]>(() =>
    compra?.compra_items.map((item) => ({
      producto_id: item.producto_id,
      cantidad_solicitada: Number(item.cantidad_recibida),
      costo_unitario: Number(item.costo_unitario),
      porcentaje_iva: Number(item.porcentaje_iva),
      porcentaje_descuento: Number(item.porcentaje_descuento || 0),
      monto_descuento: Number(item.monto_descuento || 0),
      porcentaje_recargo: Number(item.porcentaje_recargo || 0),
      monto_recargo: Number(item.monto_recargo || 0),
      actualizar_costo: item.actualizar_costo,
    })) || []
  );

  const addProduct = (product: Producto) => {
    if (!items.some((item) => item.producto_id === product.id)) {
      setItems((current) => [...current, {
        producto_id: product.id,
        cantidad_solicitada: 1,
        costo_unitario: Number(product.precio_costo),
        porcentaje_iva: Number(product.porcentaje_iva),
        porcentaje_descuento: 0,
        monto_descuento: 0,
        porcentaje_recargo: 0,
        monto_recargo: 0,
        actualizar_costo: true,
      }]);
    }
    setSearchType(null);
    setProductForm(false);
  };
  const updateItem = (productId: string, values: Partial<CompraNuevaItem>) =>
    setItems((current) =>
      current.map((item) =>
        item.producto_id === productId ? { ...item, ...values } : item
      )
    );
  const base = useMemo(
    () => items.reduce((sum, item) => sum + itemTotal(item), 0),
    [items],
  );
  const totalDiscount = Math.min(base, descuento + base * descuentoPct / 100);
  const total = Math.max(
    base - totalDiscount + recargo + base * recargoPct / 100,
    0,
  );
  const comprobanteValido = comprobantePattern.test(factura);
  const pending = api.confirmarCompra.isPending || api.editarCompra.isPending;
  const submit = () => {
    const payload = {
      proveedorId,
      fecha,
      facturaNumero: factura,
      vencimiento,
      modalidadPago: pago,
      porcentajeDescuento: descuentoPct,
      descuento,
      porcentajeRecargo: recargoPct,
      recargo,
      observaciones,
      items,
    };
    if (compra) {
      api.editarCompra.mutate({ compraId: compra.id, ...payload }, {
        onSuccess,
      });
    } else api.confirmarCompra.mutate(payload, { onSuccess });
  };

  return (
    <>
      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label>Proveedor</Label>
              <Button
                type="button"
                variant="outline"
                className="mt-1 w-full justify-between"
                onClick={() => {
                  setSearch("");
                  setSearchType("proveedor");
                }}
              >
                {proveedorId
                  ? providerName(
                    proveedores.find((item) => item.id === proveedorId),
                  )
                  : "Buscar proveedor"}
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <div>
              <Label>Fecha</Label>
              <Input
                className="mt-1"
                type="date"
                value={fecha}
                onChange={(event) => setFecha(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="compra-comprobante">Número de comprobante</Label>
              <Input
                id="compra-comprobante"
                className="mt-1"
                inputMode="numeric"
                maxLength={13}
                placeholder="0000-00000000"
                value={factura}
                onChange={(event) =>
                  setFactura(formatComprobante(event.target.value))}
              />
              {factura.length > 0 && !comprobanteValido && (
                <p className="mt-1 text-sm text-destructive">
                  Usá el formato 0000-00000000.
                </p>
              )}
            </div>
            <div>
              <Label>Vencimiento</Label>
              <Input
                className="mt-1"
                type="date"
                value={vencimiento}
                onChange={(event) => setVencimiento(event.target.value)}
              />
            </div>
            <div>
              <Label>Modalidad de pago</Label>
              <Select value={pago} onValueChange={setPago}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(paymentLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Observaciones</Label>
              <Input
                className="mt-1"
                value={observaciones}
                onChange={(event) => setObservaciones(event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearch("");
                setSearchType("producto");
              }}
            >
              <Search className="h-4 w-4" />Agregar producto
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setProductForm(true)}
            >
              <Plus className="h-4 w-4" />Crear producto
            </Button>
          </div>
          <div className="hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Costo unitario</TableHead>
                  <TableHead>Desc. %</TableHead>
                  <TableHead>Desc. $</TableHead>
                  <TableHead>Rec. %</TableHead>
                  <TableHead>Rec. $</TableHead>
                  <TableHead>IVA %</TableHead>
                  <TableHead>Actualizar costo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const product = productos.find((candidate) =>
                    candidate.id === item.producto_id
                  );
                  return (
                    <TableRow key={item.producto_id}>
                      <TableCell className="min-w-48">
                        {product?.cod_producto} · {product?.descripcion}
                      </TableCell>
                      <TableCell>{product?.stock}</TableCell>
                      <TableCell>
                        <Input
                          className="w-20"
                          type="number"
                          min="1"
                          step="1"
                          value={item.cantidad_solicitada}
                          onChange={(event) =>
                            updateItem(item.producto_id, {
                              cantidad_solicitada: Number(event.target.value),
                            })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-28"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.costo_unitario}
                          onChange={(event) =>
                            updateItem(item.producto_id, {
                              costo_unitario: Number(event.target.value),
                            })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-20"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.porcentaje_descuento}
                          onChange={(event) =>
                            updateItem(item.producto_id, {
                              porcentaje_descuento: Number(event.target.value),
                            })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-24"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.monto_descuento}
                          onChange={(event) =>
                            updateItem(item.producto_id, {
                              monto_descuento: Number(event.target.value),
                            })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-20"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.porcentaje_recargo}
                          onChange={(event) =>
                            updateItem(item.producto_id, {
                              porcentaje_recargo: Number(event.target.value),
                            })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-24"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.monto_recargo}
                          onChange={(event) =>
                            updateItem(item.producto_id, {
                              monto_recargo: Number(event.target.value),
                            })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-20"
                          type="number"
                          min="0"
                          value={item.porcentaje_iva}
                          onChange={(event) =>
                            updateItem(item.producto_id, {
                              porcentaje_iva: Number(event.target.value),
                            })}
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={item.actualizar_costo}
                          onCheckedChange={(value) =>
                            updateItem(item.producto_id, {
                              actualizar_costo: value,
                            })}
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {money(itemTotal(item))}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="destructive"
                          aria-label="Quitar producto"
                          onClick={() =>
                            setItems((current) =>
                              current.filter((candidate) =>
                                candidate.producto_id !== item.producto_id
                              )
                            )}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-3">
            {items.map((item) => {
              const product = productos.find((candidate) =>
                candidate.id === item.producto_id
              );
              return (
                <div
                  key={item.producto_id}
                  className="rounded-md border bg-background p-4"
                >
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-[minmax(16rem,1fr)_4.5rem_9rem_repeat(5,4rem)_8.5rem] xl:items-start">
                    <div className="col-span-2 md:col-span-4 xl:col-span-1">
                      <Label>Producto</Label>
                      <p className="mt-2 truncate font-medium">
                        {product?.cod_producto} · {product?.descripcion}
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Stock: {product?.stock}</span>
                        <Switch
                          checked={item.actualizar_costo}
                          onCheckedChange={(value) =>
                            updateItem(item.producto_id, {
                              actualizar_costo: value,
                            })}
                        />
                        <span>Actualizar costo</span>
                      </div>
                    </div>
                    <div>
                      <Label>Cant.</Label>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={item.cantidad_solicitada}
                        onChange={(event) =>
                          updateItem(item.producto_id, {
                            cantidad_solicitada: Number(event.target.value),
                          })}
                      />
                    </div>
                    <div>
                      <Label>Costo unit.</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.costo_unitario}
                        onChange={(event) =>
                          updateItem(item.producto_id, {
                            costo_unitario: Number(event.target.value),
                          })}
                      />
                    </div>
                    <div>
                      <Label>IVA %</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.porcentaje_iva}
                        onChange={(event) =>
                          updateItem(item.producto_id, {
                            porcentaje_iva: Number(event.target.value),
                          })}
                      />
                    </div>
                    <div>
                      <Label>Desc. %</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.porcentaje_descuento}
                        onChange={(event) =>
                          updateItem(item.producto_id, {
                            porcentaje_descuento: Number(event.target.value),
                          })}
                      />
                    </div>
                    <div>
                      <Label>Desc. $</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.monto_descuento}
                        onChange={(event) =>
                          updateItem(item.producto_id, {
                            monto_descuento: Number(event.target.value),
                          })}
                      />
                    </div>
                    <div>
                      <Label>Rec. %</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.porcentaje_recargo}
                        onChange={(event) =>
                          updateItem(item.producto_id, {
                            porcentaje_recargo: Number(event.target.value),
                          })}
                      />
                    </div>
                    <div>
                      <Label>Rec. $</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.monto_recargo}
                        onChange={(event) =>
                          updateItem(item.producto_id, {
                            monto_recargo: Number(event.target.value),
                          })}
                      />
                    </div>
                    <div className="col-span-2 flex items-end justify-between gap-2 md:col-span-1 xl:pt-5">
                      <span className="font-semibold">
                        {money(itemTotal(item))}
                      </span>
                      <Button
                        size="sm"
                        variant="destructive"
                        aria-label="Quitar producto"
                        title="Quitar producto"
                        onClick={() =>
                          setItems((current) =>
                            current.filter((candidate) =>
                              candidate.producto_id !== item.producto_id
                            )
                          )}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid gap-4 rounded-md bg-muted/40 p-4 md:grid-cols-6">
            <div>
              <Label>Descuento %</Label>
              <Input
                type="number"
                min="0"
                value={descuentoPct}
                onChange={(event) =>
                  setDescuentoPct(Number(event.target.value))}
              />
            </div>
            <div>
              <Label>Descuento $</Label>
              <Input
                type="number"
                min="0"
                value={descuento}
                onChange={(event) => setDescuento(Number(event.target.value))}
              />
            </div>
            <div>
              <Label>Recargo %</Label>
              <Input
                type="number"
                min="0"
                value={recargoPct}
                onChange={(event) => setRecargoPct(Number(event.target.value))}
              />
            </div>
            <div>
              <Label>Recargo $</Label>
              <Input
                type="number"
                min="0"
                value={recargo}
                onChange={(event) => setRecargo(Number(event.target.value))}
              />
            </div>
            <div>
              <Label>Subtotal</Label>
              <p className="pt-2 font-semibold">{money(base)}</p>
            </div>
            <div>
              <Label>Total</Label>
              <p className="pt-2 text-xl font-bold">{money(total)}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>Cancelar</Button>
            <Button
              disabled={!proveedorId || !comprobanteValido || !items.length ||
                total <= 0 || pending}
              onClick={submit}
            >
              {pending
                ? "Guardando…"
                : compra
                ? "Guardar cambios"
                : "Confirmar compra"}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Dialog
        open={!!searchType}
        onOpenChange={(open) => {
          if (!open) setSearchType(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Buscar {searchType === "proveedor" ? "proveedor" : "producto"}
            </DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Escribí para buscar"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {searchType === "proveedor"
              ? proveedores.filter((provider) =>
                `${providerName(provider)} ${provider.cuit}`.toLowerCase()
                  .includes(search.toLowerCase())
              ).map((provider) => (
                <Button
                  key={provider.id}
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    setProveedorId(provider.id || "");
                    setSearchType(null);
                  }}
                >
                  {providerName(provider)} · {provider.cuit}
                </Button>
              ))
              : productos.filter((product) =>
                `${product.cod_producto} ${
                  product.cod_barras || ""
                } ${product.descripcion}`.toLowerCase().includes(
                  search.toLowerCase(),
                )
              ).map((product) => (
                <Button
                  key={product.id}
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => addProduct(product)}
                >
                  {product.cod_producto} · {product.descripcion}
                </Button>
              ))}
          </div>
          {searchType === "producto" && (
            <Button
              variant="outline"
              onClick={() => {
                setSearchType(null);
                setProductForm(true);
              }}
            >
              <Plus className="h-4 w-4" />Crear con formulario completo
            </Button>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={productForm} onOpenChange={setProductForm}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo producto</DialogTitle>
          </DialogHeader>
          <ProductoForm
            showTitle={false}
            onClose={() => setProductForm(false)}
            onSaved={addProduct}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
