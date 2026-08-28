import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plus, Search, Eye, Edit, Trash2, FileCheck, MessageCircle, BellPlus } from "lucide-react";
import { useVentas, useObtenerCAE } from "@/hooks/useVentas";
import { Venta, TIPOS_COMPROBANTE, discriminaIvaEnComprobante, getPagoMontoBase, getTipoPagoLabel, getTotalRecargoPagos, getVentaItemCodigo, getVentaTipoPagoLabel, getVentaTotalFinal } from "@/types/venta";
import { format } from "date-fns";
import { FacturaImpresion } from "./FacturaImpresion";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import { useAfipConfig } from "@/hooks/useAfipConfig";
import { generarQRAfip } from "@/utils/afipQr";
import { buildFacturaWhatsAppPdfFile } from "@/utils/facturaWhatsAppPdf";
import { useAdminComercios, useIsAppAdmin } from "@/hooks/useAdminComercios";
import { useAdminNotificaciones } from "@/hooks/useNotificaciones";
import { useMercadoPago } from "@/hooks/useMercadoPago";
import QRCode from "qrcode";

export const VentasList = () => {
  const { ventas, isLoading, deleteVenta } = useVentas();
  const [searchParams, setSearchParams] = useSearchParams();
  const { mutate: obtenerCAE, isPending: isObteniendoCAE } = useObtenerCAE();
  const { comercio } = useComercio();
  const { data: afipConfig } = useAfipConfig();
  const hasAfipCertificates = Boolean(
    afipConfig?.certificado_crt?.trim() && afipConfig?.certificado_key?.trim()
  );
  const { toast } = useToast();
  const { status: mercadoPagoStatus, run: runMercadoPago, isWorking: mercadoPagoWorking } = useMercadoPago();
  const { data: isAppAdmin = false } = useIsAppAdmin();
  const { comerciosQuery } = useAdminComercios(isAppAdmin);
  const { crearNotificacion } = useAdminNotificaciones(isAppAdmin);
  const [selectedVenta, setSelectedVenta] = useState<Venta | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showNotificationDialog, setShowNotificationDialog] = useState(false);
  const [notificationComercioIds, setNotificationComercioIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [qrPreview, setQrPreview] = useState("");
  const [showCancelMercadoPagoDialog, setShowCancelMercadoPagoDialog] = useState(false);
  const operacionMercadoPago = selectedVenta?.id
    ? (mercadoPagoStatus.data?.operaciones || []).find((operacion: any) => operacion.venta_id === selectedVenta.id)
    : null;
  const cobroMercadoPagoPendiente = operacionMercadoPago && ["pendiente", "procesando"].includes(operacionMercadoPago.estado);

  const mostrarQrMercadoPago = async () => {
    if (!operacionMercadoPago?.qr_data) return;
    const qrData = String(operacionMercadoPago.qr_data);
    setQrPreview(/^https?:\/\//i.test(qrData) ? qrData : await QRCode.toDataURL(qrData, { width: 360, margin: 2 }));
  };

  const cancelarCobroMercadoPago = async () => {
    if (!operacionMercadoPago) return;
    await runMercadoPago({ action: "cancel_qr", operacionId: operacionMercadoPago.id });
    setShowCancelMercadoPagoDialog(false);
    await mercadoPagoStatus.refetch();
  };

  useEffect(() => {
    const ventaId = searchParams.get("detalle");
    if (!ventaId || isLoading) return;

    const venta = ventas.find((item) => item.id === ventaId);
    if (venta) {
      setSelectedVenta(venta);
      setShowDetails(true);
    }
  }, [isLoading, searchParams, ventas]);

  const handleDetailsOpenChange = (open: boolean) => {
    setShowDetails(open);
    if (!open && searchParams.has("detalle")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("detalle");
      setSearchParams(nextParams, { replace: true });
    }
  };

  const handleObtenerCAE = (venta: Venta) => {
    if (!venta.id) return;

    obtenerCAE(venta.id, {
      onSuccess: (data) => {
        setSelectedVenta((current) => {
          if (!current || current.id !== venta.id) return current;

          return {
            ...current,
            cae: data.cae,
            cae_vencimiento: data.cae_vencimiento,
            numero_comprobante: data.numero_comprobante || current.numero_comprobante,
            cae_error: undefined,
          };
        });
      },
    });
  };

  const toggleNotificationComercio = (comercioId: string, checked: boolean) => {
    setNotificationComercioIds((current) =>
      checked
        ? Array.from(new Set([...current, comercioId]))
        : current.filter((id) => id !== comercioId),
    );
  };

  const handleSendNotification = () => {
    if (!selectedVenta || notificationComercioIds.length === 0) return;

    const tipoComprobante =
      TIPOS_COMPROBANTE.find((tipo) => tipo.value === selectedVenta.tipo_comprobante)?.label ||
      "Comprobante";

    crearNotificacion.mutate(
      {
        titulo: `${tipoComprobante} ${selectedVenta.numero_comprobante}`,
        mensaje: `Se emitio un comprobante de venta para ${selectedVenta.cliente_nombre}.`,
        categoria: "comprobante",
        prioridad: "normal",
        comercioIds: notificationComercioIds,
        comprobante_numero: selectedVenta.numero_comprobante,
        comprobante_fecha: format(new Date(selectedVenta.fecha_venta), "yyyy-MM-dd"),
        comprobante_monto: getVentaTotalFinal(selectedVenta),
        metadata: {
          venta_id: selectedVenta.id || null,
          comercio_emisor_id: selectedVenta.comercio_id || comercio?.id || null,
          tipo_comprobante: selectedVenta.tipo_comprobante,
          cliente_nombre: selectedVenta.cliente_nombre,
        },
      },
      {
        onSuccess: () => {
          setShowNotificationDialog(false);
          setNotificationComercioIds([]);
        },
      },
    );
  };

  const filteredVentas = ventas
    .filter(venta =>
      venta.numero_comprobante.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (venta.cliente_nombre || "").toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const dateDifference = new Date(b.fecha_venta).getTime() - new Date(a.fecha_venta).getTime();
      if (dateDifference !== 0) return dateDifference;
      return Number(b.numero_comprobante) - Number(a.numero_comprobante);
    });

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
    const discriminaIva = discriminaIvaEnComprobante(venta.tipo_comprobante);
    const totalFinal = getVentaTotalFinal(venta);
    const recargoPagos = getTotalRecargoPagos(venta.pagos_venta || []);
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
      : `- ${tipoPago}: ${formatCurrency(totalFinal)}`;

    return [
      `${tipoComprobante} ${venta.numero_comprobante}`,
      `Fecha: ${format(new Date(venta.fecha_venta), "dd/MM/yyyy HH:mm")}`,
      `Cliente: ${venta.cliente_nombre}`,
      "",
      "Detalle:",
      items,
      "",
      ...(discriminaIva ? [`Subtotal neto: ${formatCurrency(venta.subtotal)}`] : []),
      ...(Number(venta.monto_descuento || 0) > 0 || Number(venta.porcentaje_descuento || 0) > 0
        ? [`Descuento venta: ${venta.porcentaje_descuento || 0}% + ${formatCurrency(Number(venta.monto_descuento || 0))}`]
        : []),
      ...(Number(venta.monto_recargo || 0) > 0 || Number(venta.porcentaje_recargo || 0) > 0
        ? [`Recargo venta: ${venta.porcentaje_recargo || 0}% + ${formatCurrency(Number(venta.monto_recargo || 0))}`]
        : []),
      ...(recargoPagos > 0 ? [`Recargo medio de pago: ${formatCurrency(recargoPagos)}`] : []),
      ...(discriminaIva ? [`IVA: ${formatCurrency(venta.total_iva)}`] : []),
      `Total: ${formatCurrency(totalFinal)}`,
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
          importe: getVentaTotalFinal(venta),
          cae: venta.cae,
        });
      } catch (error) {
        console.error("Error generando QR ARCA para WhatsApp:", error);
      }
    }

    let comprobanteFile: File;

    try {
      comprobanteFile = await buildFacturaWhatsAppPdfFile({ venta, comercio, afipConfig, qrDataUrl });
    } catch (error) {
      console.error("No se pudo generar el comprobante ARCA PDF para WhatsApp:", error);
      toast({
        title: "No se pudo generar el PDF",
        description: "No se pudo preparar el comprobante ARCA para compartir.",
        variant: "destructive",
      });
      return;
    }

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
      description: "WhatsApp Web no permite adjuntar archivos automaticamente. Se descargo el comprobante ARCA en PDF para adjuntarlo al chat.",
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
                      {format(new Date(venta.fecha_venta), "dd/MM/yyyy")}
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
                      ${getVentaTotalFinal(venta).toFixed(2)}
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
                        {venta.cae?.trim() ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled
                            title="La venta tiene CAE y no puede editarse"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button asChild variant="outline" size="sm">
                            <Link to={`/ventas/${venta.id}/editar`}>
                              <Edit className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={Boolean(venta.cae?.trim())}
                          title={venta.cae?.trim() ? "La venta tiene CAE y no puede eliminarse" : undefined}
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

      <Dialog open={showDetails} onOpenChange={handleDetailsOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Detalle de Venta</DialogTitle>
          </DialogHeader>
          {selectedVenta && (
            <div className="space-y-4">
              <div className="mb-4 space-y-3">
                <div className="grid grid-cols-1 gap-x-10 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <p className="whitespace-nowrap"><strong>Fecha:</strong> {format(new Date(selectedVenta.fecha_venta), "dd/MM/yyyy HH:mm")}</p>
                  <p className="whitespace-nowrap"><strong>Comprobante:</strong> {TIPOS_COMPROBANTE.find(t => t.value === selectedVenta.tipo_comprobante)?.label}</p>
                  <p className="whitespace-nowrap"><strong>N° Comprobante:</strong> {selectedVenta.numero_comprobante}</p>
                  <p className="whitespace-nowrap"><strong>Tipo Pago:</strong> {getVentaTipoPagoLabel(selectedVenta)}</p>
                </div>
                <p><strong>Cliente:</strong> {selectedVenta.cliente_nombre}</p>
                <div className="flex justify-end gap-2">
                  {!selectedVenta.cae && !['ticket_fiscal', 'recibo_x'].includes(selectedVenta.tipo_comprobante) && hasAfipCertificates && (
                    <Button
                      onClick={() => handleObtenerCAE(selectedVenta)}
                      disabled={isObteniendoCAE}
                      variant="outline"
                      size="sm"
                    >
                      <FileCheck className="h-4 w-4 mr-2" />
                      {isObteniendoCAE ? 'Obteniendo...' : 'Obtener CAE'}
                    </Button>
                  )}
                  <FacturaImpresion venta={selectedVenta} />
                  {isAppAdmin && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowNotificationDialog(true)}
                    >
                      <BellPlus className="mr-2 h-4 w-4" />
                      Enviar a notificaciones
                    </Button>
                  )}
                  <Button
                    onClick={() => handleSendWhatsApp(selectedVenta)}
                    size="sm"
                    className="bg-[#25D366] text-white hover:bg-[#1DA851]"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    WhatsApp
                  </Button>
                </div>
              </div>

              {operacionMercadoPago && (
                <div className={`rounded-md border p-4 ${cobroMercadoPagoPendiente ? "border-amber-300 bg-amber-50" : operacionMercadoPago.estado === "aprobado" ? "border-green-300 bg-green-50" : "bg-muted"}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="font-semibold">Mercado Pago</p><p className="text-sm">Estado: <strong>{operacionMercadoPago.estado}</strong> · Importe: ${Number(operacionMercadoPago.importe).toFixed(2)}</p></div>
                    {cobroMercadoPagoPendiente && <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={mostrarQrMercadoPago}>Volver a mostrar QR</Button><Button type="button" variant="destructive" size="sm" disabled={mercadoPagoWorking} onClick={() => setShowCancelMercadoPagoDialog(true)}>Cancelar cobro</Button></div>}
                  </div>
                </div>
              )}

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
                        {discriminaIvaEnComprobante(selectedVenta.tipo_comprobante) && <TableHead>Subtotal neto</TableHead>}
                        {discriminaIvaEnComprobante(selectedVenta.tipo_comprobante) && <TableHead>IVA</TableHead>}
                        <TableHead>Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedVenta.venta_items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{getVentaItemCodigo(item) || "-"}</TableCell>
                          <TableCell>{item.producto?.descripcion || item.descripcion_manual || "Item manual"}</TableCell>
                          <TableCell>{item.cantidad}</TableCell>
                          <TableCell>${item.precio_unitario.toFixed(2)}</TableCell>
                          <TableCell>${Number(item.monto_descuento || 0).toFixed(2)}</TableCell>
                          <TableCell>${Number(item.monto_recargo || 0).toFixed(2)}</TableCell>
                          {discriminaIvaEnComprobante(selectedVenta.tipo_comprobante) && <TableCell>${item.subtotal.toFixed(2)}</TableCell>}
                          {discriminaIvaEnComprobante(selectedVenta.tipo_comprobante) && <TableCell>${item.monto_iva.toFixed(2)}</TableCell>}
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
                        <TableHead>Monto base</TableHead>
                        <TableHead>Recargo</TableHead>
                        <TableHead>Descuento</TableHead>
                        <TableHead>Total pago</TableHead>
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
                          <TableCell>${getPagoMontoBase(pago).toFixed(2)}</TableCell>
                          <TableCell>${Number(pago.recargo_cuotas || 0).toFixed(2)}</TableCell>
                          <TableCell>$0.00</TableCell>
                          <TableCell className="font-semibold">${Number(pago.monto || 0).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="border-t pt-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="text-left">
                    {selectedVenta.cae && (
                      <>
                        <p><strong>CAE:</strong> {selectedVenta.cae}</p>
                        <p><strong>Vto. CAE:</strong> {selectedVenta.cae_vencimiento ? format(new Date(selectedVenta.cae_vencimiento), "dd/MM/yyyy") : 'N/A'}</p>
                      </>
                    )}
                  </div>
                  <div className="grid gap-4 text-right sm:grid-cols-3">
                    <div>
                      {discriminaIvaEnComprobante(selectedVenta.tipo_comprobante) && <p><strong>Subtotal neto:</strong> ${selectedVenta.subtotal.toFixed(2)}</p>}
                      {(Number(selectedVenta.monto_descuento || 0) > 0 || Number(selectedVenta.porcentaje_descuento || 0) > 0) && (
                        <p><strong>Desc. venta:</strong> {selectedVenta.porcentaje_descuento || 0}% + ${Number(selectedVenta.monto_descuento || 0).toFixed(2)}</p>
                      )}
                    </div>
                    <div>
                      {discriminaIvaEnComprobante(selectedVenta.tipo_comprobante) && <p><strong>IVA:</strong> ${selectedVenta.total_iva.toFixed(2)}</p>}
                      {(Number(selectedVenta.monto_recargo || 0) > 0 || Number(selectedVenta.porcentaje_recargo || 0) > 0) && (
                        <p><strong>Recargo venta:</strong> {selectedVenta.porcentaje_recargo || 0}% + ${Number(selectedVenta.monto_recargo || 0).toFixed(2)}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-lg"><strong>Total:</strong> ${getVentaTotalFinal(selectedVenta).toFixed(2)}</p>
                    </div>
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

      <Dialog open={Boolean(qrPreview)} onOpenChange={(open) => { if (!open) setQrPreview(""); }}>
        <DialogContent className="max-w-md text-center">
          <DialogHeader><DialogTitle>QR Mercado Pago</DialogTitle></DialogHeader>
          {qrPreview && <><img className="mx-auto w-full max-w-[360px]" src={qrPreview} alt="QR Mercado Pago"/><p className="text-sm text-muted-foreground">El cobro permanece pendiente hasta recibir la confirmacion de Mercado Pago.</p></>}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showCancelMercadoPagoDialog} onOpenChange={setShowCancelMercadoPagoDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar cobro de Mercado Pago</AlertDialogTitle>
            <AlertDialogDescription>
              Se cancelará el cobro pendiente. La venta permanecerá registrada sin ese pago.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mercadoPagoWorking}>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={mercadoPagoWorking}
              onClick={(event) => {
                event.preventDefault();
                void cancelarCobroMercadoPago();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {mercadoPagoWorking ? "Cancelando..." : "Sí, cancelar cobro"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showNotificationDialog} onOpenChange={setShowNotificationDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar comprobante a notificaciones</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Seleccione los comercios que recibiran el comprobante
              {selectedVenta ? ` ${selectedVenta.numero_comprobante}` : ""}.
            </p>
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-3">
              {comerciosQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Cargando comercios...</p>
              ) : (comerciosQuery.data || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay comercios disponibles.</p>
              ) : (
                (comerciosQuery.data || []).map((destinatario) => (
                  <div key={destinatario.id} className="flex items-center gap-3">
                    <Checkbox
                      id={`notificacion-comercio-${destinatario.id}`}
                      checked={notificationComercioIds.includes(destinatario.id)}
                      onCheckedChange={(checked) =>
                        toggleNotificationComercio(destinatario.id, checked === true)
                      }
                    />
                    <Label
                      htmlFor={`notificacion-comercio-${destinatario.id}`}
                      className="font-normal"
                    >
                      {destinatario.nombre_comercio}
                      {destinatario.usuario?.email ? ` (${destinatario.usuario.email})` : ""}
                    </Label>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowNotificationDialog(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="success"
              disabled={notificationComercioIds.length === 0 || crearNotificacion.isPending}
              onClick={handleSendNotification}
            >
              <BellPlus className="mr-2 h-4 w-4" />
              {crearNotificacion.isPending ? "Enviando..." : "Enviar comprobante"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
