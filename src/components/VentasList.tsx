import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Eye, Edit, Trash2, FileCheck, MessageCircle } from "lucide-react";
import { useVentas, useObtenerCAE } from "@/hooks/useVentas";
import VentaForm from "./VentaForm"
import { Venta, TIPOS_COMPROBANTE, getPagoMontoBase, getTipoPagoLabel, getVentaTipoPagoLabel } from "@/types/venta";
import { format } from "date-fns";
import { FacturaImpresion } from "./FacturaImpresion";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import { useAfipConfig } from "@/hooks/useAfipConfig";
import { generarQRAfip } from "@/utils/afipQr";
import { buildFacturaHtmlFile } from "@/utils/facturaPrint";

export const VentasList = () => {
  const { ventas, isLoading, deleteVenta } = useVentas();
  const { mutate: obtenerCAE, isPending: isObteniendoCAE } = useObtenerCAE();
  const { comercio } = useComercio();
  const { data: afipConfig } = useAfipConfig();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingVenta, setEditingVenta] = useState<Venta | null>(null);
  const [selectedVenta, setSelectedVenta] = useState<Venta | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredVentas = ventas.filter(venta =>
    venta.numero_comprobante.toLowerCase().includes(searchTerm.toLowerCase()) ||
    venta.cliente_nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTipoComprobanteBadgeVariant = (tipo: string) => {
    if (tipo.includes('factura')) return 'default';
    if (tipo.includes('nota')) return 'secondary';
    if (tipo.includes('recibo')) return 'outline';
    return 'default';
  };

  const getTipoPagoBadgeVariant = (tipo: string) => {
    if (tipo === "mixto") return "outline";

    switch (tipo) {
      case 'contado': return 'default';
      case 'tarjeta': return 'secondary';
      case 'transferencia': return 'outline';
      default: return 'destructive';
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(value);

  const getWhatsAppPhone = (phone?: string) => {
    if (!phone) return "";

    const trimmedPhone = phone.trim();
    const hasInternationalPrefix = trimmedPhone.startsWith("+");
    const digits = trimmedPhone.replace(/\D/g, "");

    if (!digits) return "";
    if (hasInternationalPrefix) return digits;
    if (digits.startsWith("54")) return digits;

    return `54${digits}`;
  };

  const buildWhatsAppMessage = (venta: Venta) => {
    const tipoComprobante =
      TIPOS_COMPROBANTE.find(t => t.value === venta.tipo_comprobante)?.label ||
      "Comprobante";
    const tipoPago =
      getVentaTipoPagoLabel(venta);
    const items = venta.venta_items?.length
      ? venta.venta_items
          .map((item) => {
            const descripcion = item.producto?.descripcion || item.producto?.cod_producto || "Producto";
            const itemDescripcion = item.descripcion_manual || descripcion;
            const ajustes = [
              Number(item.monto_descuento || 0) > 0 ? `desc. ${formatCurrency(Number(item.monto_descuento))}` : "",
              Number(item.monto_recargo || 0) > 0 ? `recargo ${formatCurrency(Number(item.monto_recargo))}` : "",
            ].filter(Boolean).join(", ");
            return `- ${itemDescripcion} x ${item.cantidad}: ${formatCurrency(item.total)}${ajustes ? ` (${ajustes})` : ""}`;
          })
          .join("\n")
      : "- Sin detalle de items";
    const pagos = venta.pagos_venta?.length
      ? venta.pagos_venta
          .map((pago) => {
            const metodo = getTipoPagoLabel(pago.tipo_pago);
            const recargo = pago.recargo_cuotas && pago.recargo_cuotas > 0
              ? ` (recargo ${formatCurrency(pago.recargo_cuotas)})`
              : "";
            return `- ${metodo}: ${formatCurrency(getPagoMontoBase(pago))}${recargo}`;
          })
          .join("\n")
      : `- ${tipoPago}: ${formatCurrency(venta.total)}`;

    return [
      `${tipoComprobante} ${venta.numero_comprobante}`,
      `Fecha: ${format(new Date(venta.fecha_venta), "dd/MM/yyyy HH:mm")}`,
      `Cliente: ${venta.cliente_nombre}`,
      "",
      "Detalle:",
      items,
      "",
      `Subtotal: ${formatCurrency(venta.subtotal)}`,
      ...(Number(venta.monto_descuento || 0) > 0 || Number(venta.porcentaje_descuento || 0) > 0
        ? [`Descuento venta: ${venta.porcentaje_descuento || 0}% + ${formatCurrency(Number(venta.monto_descuento || 0))}`]
        : []),
      ...(Number(venta.monto_recargo || 0) > 0 || Number(venta.porcentaje_recargo || 0) > 0
        ? [`Recargo venta: ${venta.porcentaje_recargo || 0}% + ${formatCurrency(Number(venta.monto_recargo || 0))}`]
        : []),
      `IVA: ${formatCurrency(venta.total_iva)}`,
      `Total: ${formatCurrency(venta.total)}`,
      "",
      "Pago:",
      pagos,
      ...(venta.cae ? ["", `CAE: ${venta.cae}`] : []),
      ...(venta.cae_vencimiento
        ? [`Vto. CAE: ${format(new Date(venta.cae_vencimiento), "dd/MM/yyyy")}`]
        : []),
      ...(venta.observaciones ? ["", `Observaciones: ${venta.observaciones}`] : []),
    ].join("\n");
  };

  const downloadFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const openWhatsAppText = (venta: Venta) => {
    const phone = getWhatsAppPhone(venta.cliente?.telefono);
    const text = encodeURIComponent(buildWhatsAppMessage(venta));
    const url = phone
      ? `https://wa.me/${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;

    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleSendWhatsApp = async (venta: Venta) => {
    const message = buildWhatsAppMessage(venta);
    let qrDataUrl = "";

    if (venta.cae?.trim() && comercio && afipConfig) {
      try {
        qrDataUrl = await generarQRAfip({
          fecha: venta.fecha_venta,
          cuit: comercio.cuit,
          puntoVenta: afipConfig.punto_venta,
          tipoComprobante: venta.tipo_comprobante,
          numeroComprobante: venta.numero_comprobante,
          importe: venta.total,
          cae: venta.cae,
        });
      } catch (error) {
        console.error("Error generando QR ARCA para WhatsApp:", error);
      }
    }

    const comprobanteFile = buildFacturaHtmlFile({ venta, comercio, afipConfig, qrDataUrl });
    const shareData: ShareData = {
      title: `Comprobante ${venta.numero_comprobante}`,
      text: message,
      files: [comprobanteFile],
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("No se pudo compartir el comprobante por WhatsApp:", error);
    }

    downloadFile(comprobanteFile);
    openWhatsAppText(venta);
    toast({
      title: "Comprobante generado",
      description: "WhatsApp Web no permite adjuntar archivos automaticamente. Se descargo el mismo comprobante que se imprime para adjuntarlo al chat.",
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <p>Cargando ventas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Lista de Ventas</CardTitle>
            <Button asChild variant="new">
              <Link to="/ventas/nueva">
                <Plus className="mr-2 h-4 w-4" />
                Nueva Venta
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por número de comprobante o cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>N° Comprobante</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo Pago</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVentas.map((venta) => (
                  <TableRow key={venta.id}>
                    <TableCell>
                      {format(new Date(venta.fecha_venta), "dd/MM/yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="font-medium">
                      {venta.numero_comprobante}
                    </TableCell>
                    <TableCell>{venta.cliente_nombre}</TableCell>
                    <TableCell>
                      <Badge variant={getTipoPagoBadgeVariant((venta.pagos_venta?.length || 0) > 1 ? "mixto" : venta.tipo_pago)}>
                        {getVentaTipoPagoLabel(venta)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getTipoComprobanteBadgeVariant(venta.tipo_comprobante)}>
                        {TIPOS_COMPROBANTE.find(t => t.value === venta.tipo_comprobante)?.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold">
                      ${venta.total.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedVenta(venta);
                            setShowDetails(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingVenta(venta);
                            setShowForm(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteVenta(venta.id!)}
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

          {filteredVentas.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No se encontraron ventas</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={(open) => {
        setShowForm(open);
        if (!open) setEditingVenta(null);
      }}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVenta ? "Editar Venta" : "Nueva Venta"}</DialogTitle>
          </DialogHeader>
          <VentaForm 
            venta={editingVenta} 
            onSuccess={() => {
              setShowForm(false);
              setEditingVenta(null);
            }} 
            showTitle={false}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Detalle de Venta</DialogTitle>
          </DialogHeader>
          {selectedVenta && (
            <div className="space-y-4">
              <div className="flex justify-between items-start mb-4">
                <div className="grid grid-cols-2 gap-4 flex-1">
                  <div>
                    <p><strong>N° Comprobante:</strong> {selectedVenta.numero_comprobante}</p>
                    <p><strong>Fecha:</strong> {format(new Date(selectedVenta.fecha_venta), "dd/MM/yyyy HH:mm")}</p>
                    <p><strong>Cliente:</strong> {selectedVenta.cliente_nombre}</p>
                    {selectedVenta.cae && (
                      <>
                        <p><strong>CAE:</strong> {selectedVenta.cae}</p>
                        <p><strong>Vto. CAE:</strong> {selectedVenta.cae_vencimiento ? format(new Date(selectedVenta.cae_vencimiento), "dd/MM/yyyy") : 'N/A'}</p>
                      </>
                    )}
                    {selectedVenta.cae_error && (
                      <p className="text-destructive text-sm"><strong>Error CAE:</strong> {selectedVenta.cae_error}</p>
                    )}
                  </div>
                  <div>
                    <p><strong>Tipo Pago:</strong> {getVentaTipoPagoLabel(selectedVenta)}</p>
                    <p><strong>Comprobante:</strong> {TIPOS_COMPROBANTE.find(t => t.value === selectedVenta.tipo_comprobante)?.label}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {!selectedVenta.cae && selectedVenta.tipo_comprobante !== 'ticket_fiscal' && (
                    <Button
                      onClick={() => obtenerCAE(selectedVenta.id)}
                      disabled={isObteniendoCAE}
                      variant="outline"
                      size="sm"
                    >
                      <FileCheck className="h-4 w-4 mr-2" />
                      {isObteniendoCAE ? 'Obteniendo...' : 'Obtener CAE'}
                    </Button>
                  )}
                  <FacturaImpresion venta={selectedVenta} />
                  <Button
                    onClick={() => handleSendWhatsApp(selectedVenta)}
                    variant="outline"
                    size="sm"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    WhatsApp
                  </Button>
                </div>
              </div>

              {selectedVenta.venta_items && selectedVenta.venta_items.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Items</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead>Cantidad</TableHead>
                        <TableHead>P.U.</TableHead>
                        <TableHead>Desc.</TableHead>
                        <TableHead>Recargo</TableHead>
                        <TableHead>Subtotal</TableHead>
                        <TableHead>IVA</TableHead>
                        <TableHead>Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedVenta.venta_items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.producto?.cod_producto || item.codigo_manual || "-"}</TableCell>
                          <TableCell>{item.producto?.descripcion || item.descripcion_manual || "Item manual"}</TableCell>
                          <TableCell>{item.cantidad}</TableCell>
                          <TableCell>${item.precio_unitario.toFixed(2)}</TableCell>
                          <TableCell>${Number(item.monto_descuento || 0).toFixed(2)}</TableCell>
                          <TableCell>${Number(item.monto_recargo || 0).toFixed(2)}</TableCell>
                          <TableCell>${item.subtotal.toFixed(2)}</TableCell>
                          <TableCell>${item.monto_iva.toFixed(2)}</TableCell>
                          <TableCell>${item.total.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {selectedVenta.pagos_venta && selectedVenta.pagos_venta.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Métodos de Pago</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Método</TableHead>
                        <TableHead>Detalle</TableHead>
                        <TableHead>Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedVenta.pagos_venta.map((pago, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Badge>
                              {getTipoPagoLabel(pago.tipo_pago)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {pago.tipo_pago === 'tarjeta' && pago.tarjeta && (
                              <span>{pago.tarjeta.nombre} - {pago.cuotas} cuota{pago.cuotas > 1 ? 's' : ''}</span>
                            )}
                            {pago.tipo_pago === 'transferencia' && pago.banco && (
                              <span>{pago.banco.nombre_banco}</span>
                            )}
                            {pago.tipo_pago === 'cheque' && pago.cheque && (
                              <span>N° {pago.cheque.numero_cheque} - {pago.cheque.banco_emisor}</span>
                            )}
                          </TableCell>
                          <TableCell className="font-semibold">
                            ${getPagoMontoBase(pago).toFixed(2)}
                            {pago.recargo_cuotas && pago.recargo_cuotas > 0 && (
                              <span className="text-xs text-muted-foreground"> + recargo ${pago.recargo_cuotas.toFixed(2)}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="border-t pt-4">
                <div className="grid grid-cols-3 gap-4 text-right">
                  <div>
                    <p><strong>Subtotal:</strong> ${selectedVenta.subtotal.toFixed(2)}</p>
                    {(Number(selectedVenta.monto_descuento || 0) > 0 || Number(selectedVenta.porcentaje_descuento || 0) > 0) && (
                      <p><strong>Desc. venta:</strong> {selectedVenta.porcentaje_descuento || 0}% + ${Number(selectedVenta.monto_descuento || 0).toFixed(2)}</p>
                    )}
                  </div>
                  <div>
                    <p><strong>IVA:</strong> ${selectedVenta.total_iva.toFixed(2)}</p>
                    {(Number(selectedVenta.monto_recargo || 0) > 0 || Number(selectedVenta.porcentaje_recargo || 0) > 0) && (
                      <p><strong>Recargo venta:</strong> {selectedVenta.porcentaje_recargo || 0}% + ${Number(selectedVenta.monto_recargo || 0).toFixed(2)}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-lg"><strong>Total:</strong> ${selectedVenta.total.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {selectedVenta.observaciones && (
                <div>
                  <p><strong>Observaciones:</strong> {selectedVenta.observaciones}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
