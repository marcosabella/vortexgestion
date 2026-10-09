import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Eye, Edit, Trash2, FileCheck, MessageCircle, BellPlus, CreditCard, ChevronLeft, ChevronRight } from "lucide-react";
import { useVentas, useObtenerCAE } from "@/hooks/useVentas";
import { Venta, TIPOS_COMPROBANTE, discriminaIvaEnComprobante, formatNumeroComprobante, getPagoMontoBase, getTipoPagoLabel, getTotalRecargoPagos, getVentaItemCodigo, getVentaTipoPagoLabel, getVentaTotalFinal } from "@/types/venta";
import { format } from "date-fns";
import { FacturaImpresion } from "./FacturaImpresion";
import { useComercio } from "@/hooks/useComercio";
import { useToast } from "@/hooks/use-toast";
import { useAfipConfig } from "@/hooks/useAfipConfig";
import { generarQRAfip } from "@/utils/afipQr";
import { buildFacturaWhatsAppPdfFile } from "@/utils/facturaWhatsAppPdf";
import { enviarComprobantePorWhatsApp, useWhatsAppConexion } from "@/hooks/useWhatsAppComprobante";
import { useComercioParametrizacion } from "@/hooks/useComercioParametrizacion";
import { compartirPdfWhatsApp } from "@/utils/compartirWhatsApp";
import { ToastAction } from "@/components/ui/toast";
import { useAdminComercios, useIsAppAdmin } from "@/hooks/useAdminComercios";
import { useAdminNotificaciones } from "@/hooks/useNotificaciones";
import { useMercadoPago } from "@/hooks/useMercadoPago";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";

const automaticWhatsAppEnabled = import.meta.env.VITE_WHATSAPP_API_ENABLED === "true";
const ventasPageSizes = [12, 24, 48, 96];
const ventasPageSizeStorageKey = "ventas-registros-por-pagina";

interface OperacionMercadoPagoVenta {
  id: string;
  venta_id: string | null;
  estado: string;
  importe: number;
  qr_data: string | null;
}

interface VentasListProps {
  detalleId?: string;
  onCerrarDetalle?: () => void;
}

export const VentasList = ({ detalleId, onCerrarDetalle }: VentasListProps = {}) => {
  const { ventas, isLoading, deleteVenta } = useVentas();
  const [searchParams, setSearchParams] = useSearchParams();
  const { mutate: obtenerCAE, isPending: isObteniendoCAE } = useObtenerCAE();
  const { comercio, isLoading: comercioLoading } = useComercio();
  const { data: afipConfig, isLoading: afipLoading } = useAfipConfig();
  const { data: parametrizacion } = useComercioParametrizacion();
  const apiHabilitada = automaticWhatsAppEnabled && parametrizacion.modulos.whatsapp;
  const { data: whatsappConexion } = useWhatsAppConexion(comercio?.id, apiHabilitada);
  const hasAfipCertificates = Boolean(
    afipConfig?.certificado_crt?.trim() && afipConfig?.certificado_key?.trim()
  );
  const { toast } = useToast();
  const { status: mercadoPagoStatus, run: runMercadoPago, isWorking: mercadoPagoWorking } = useMercadoPago();
  const { data: isAppAdmin = false } = useIsAppAdmin();
  const { comerciosQuery } = useAdminComercios(isAppAdmin);
  const { crearNotificacion } = useAdminNotificaciones(isAppAdmin);
  const [selectedVenta, setSelectedVenta] = useState<Venta | null>(null);
  const [showDetails, setShowDetails] = useState(Boolean(detalleId));
  const [showNotificationDialog, setShowNotificationDialog] = useState(false);
  const [notificationComercioIds, setNotificationComercioIds] = useState<string[]>([]);
  const [habilitarPagoMembresia, setHabilitarPagoMembresia] = useState(false);
  const [cuentaCobroId, setCuentaCobroId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(ventasPageSizeStorageKey));
      return ventasPageSizes.includes(saved) ? saved : 12;
    } catch {
      return 12;
    }
  });
  const [qrPreview, setQrPreview] = useState("");
  const [showCancelMercadoPagoDialog, setShowCancelMercadoPagoDialog] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const mostrarNumeroComprobante = (venta: Pick<Venta, "numero_comprobante" | "tipo_comprobante">) =>
    formatNumeroComprobante(venta.numero_comprobante, afipConfig?.punto_venta, venta.tipo_comprobante);
  const { data: whatsappEnvios = [] } = useQuery({
    queryKey: ["whatsapp-envios", selectedVenta?.id],
    enabled: Boolean(selectedVenta?.id),
    refetchInterval: showDetails ? 5_000 : false,
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_envios").select("*").eq("venta_id", selectedVenta!.id).order("enviado_at", { ascending: false });
      if (error) throw error;
      return data as Array<{ id: string; estado: "enviado" | "entregado" | "leido" | "fallido"; enviado_at: string; error_detalle?: string | null }>;
    },
  });
  const { data: cuentasMercadoPago = [] } = useQuery({
    queryKey: ["admin-cuentas-mercadopago"],
    enabled: isAppAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mercadopago_configuraciones")
        .select("comercio_id,cuenta_email,ambiente")
        .eq("connected", true)
        .order("cuenta_email");
      if (error) throw error;
      return data || [];
    },
  });
  const operacionesMercadoPago = (mercadoPagoStatus.data?.operaciones || []) as OperacionMercadoPagoVenta[];
  const operacionMercadoPago = selectedVenta?.id
    ? operacionesMercadoPago.find((operacion) => operacion.venta_id === selectedVenta.id)
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
    setCurrentPage(1);
  }, [searchTerm, pageSize, comercio?.id]);

  useEffect(() => {
    const ventaId = detalleId || searchParams.get("detalle");
    if (!ventaId || isLoading) return;

    const venta = ventas.find((item) => item.id === ventaId);
    if (venta) {
      setSelectedVenta(venta);
      setShowDetails(true);
    } else if (detalleId) {
      setSelectedVenta(null);
    }
  }, [detalleId, isLoading, searchParams, ventas]);

  const handleDetailsOpenChange = (open: boolean) => {
    setShowDetails(open);
    if (!open && detalleId) {
      onCerrarDetalle?.();
      return;
    }
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

    const receptorComercioId = cuentaCobroId
      || cuentasMercadoPago.find(({ comercio_id }) => comercio_id === selectedVenta.comercio_id)?.comercio_id
      || (cuentasMercadoPago.length === 1 ? cuentasMercadoPago[0].comercio_id : "");
    if (habilitarPagoMembresia && !receptorComercioId) {
      toast({
        title: "Seleccione la cuenta de cobro",
        description: "Debe elegir la cuenta Mercado Pago que recibira el pago de la membresia.",
        variant: "destructive",
      });
      return;
    }

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
          ...(habilitarPagoMembresia ? {
            tipo: "membresia_pago",
            mercadopago_habilitado: true,
            receptor_comercio_id: receptorComercioId,
          } : {}),
        },
      },
      {
        onSuccess: () => {
          setShowNotificationDialog(false);
          setNotificationComercioIds([]);
          setHabilitarPagoMembresia(false);
          setCuentaCobroId("");
        },
      },
    );
  };

  const filteredVentas = ventas
    .filter(venta =>
      (venta.numero_comprobante.toLowerCase().includes(searchTerm.toLowerCase()) ||
        mostrarNumeroComprobante(venta).toLowerCase().includes(searchTerm.toLowerCase())) ||
      (venta.cliente_nombre || "").toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const dateDifference = new Date(b.fecha_venta).getTime() - new Date(a.fecha_venta).getTime();
      if (dateDifference !== 0) return dateDifference;
      return Number(b.numero_comprobante) - Number(a.numero_comprobante);
    });

  const totalPages = Math.max(1, Math.ceil(filteredVentas.length / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const firstIndex = (activePage - 1) * pageSize;
  const paginatedVentas = filteredVentas.slice(firstIndex, firstIndex + pageSize);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const changePageSize = (value: string) => {
    const size = Number(value);
    if (!ventasPageSizes.includes(size)) return;
    setPageSize(size);
    try {
      localStorage.setItem(ventasPageSizeStorageKey, value);
    } catch {
      // La seleccion sigue funcionando si el navegador no permite guardarla.
    }
  };

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
    if (digits.startsWith("549")) return digits;
    if (digits.startsWith("54")) return `549${digits.slice(2)}`;

    return `549${digits}`;
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

  const { data: comprobanteFile, isFetching: preparandoPdf, refetch: prepararPdf } = useQuery({
    queryKey: ["venta-whatsapp-pdf", selectedVenta, comercio, afipConfig],
    enabled: showDetails && Boolean(selectedVenta) && !comercioLoading && !afipLoading,
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const venta = selectedVenta!;
      let qrDataUrl = "";
      if (venta.cae?.trim() && comercio && afipConfig) {
        qrDataUrl = await generarQRAfip({
          fecha: venta.fecha_venta,
          cuit: comercio.cuit,
          puntoVenta: afipConfig.punto_venta,
          tipoComprobante: venta.tipo_comprobante,
          numeroComprobante: venta.numero_comprobante,
          importe: getVentaTotalFinal(venta),
          cae: venta.cae,
          cuitReceptor: venta.cliente?.cuit,
        });
      }
      return buildFacturaWhatsAppPdfFile({ venta, comercio, afipConfig, qrDataUrl });
    },
  });

  const compartirManualmente = async (venta: Venta, file: File, soloChat = false) => {
    const phone = getWhatsAppPhone(venta.cliente?.telefono);
    const text = buildWhatsAppMessage(venta);
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    try {
      const resultado = await compartirPdfWhatsApp({
        title: `Comprobante ${venta.numero_comprobante}`, text, files: [file],
      }, url, soloChat);
      if (resultado === "descargado") {
        toast({ title: "Comprobante descargado", description: "Adjuntá el PDF descargado al chat de WhatsApp." });
      }
    } catch (error) {
      console.error("No se pudo compartir el comprobante:", error);
      toast({
        title: "No se pudo abrir el selector de compartir",
        description: "Podés abrir WhatsApp y adjuntar el PDF descargado.",
        action: <ToastAction altText="Descargar el PDF y abrir WhatsApp" onClick={() => compartirManualmente(venta, file, true)}>Abrir WhatsApp</ToastAction>,
      });
    }
  };

  const handleSendWhatsApp = async (venta: Venta) => {
    if (!comprobanteFile) {
      const resultado = await prepararPdf();
      toast(resultado.data
        ? { title: "PDF preparado", description: "Presioná WhatsApp nuevamente para compartirlo." }
        : { title: "No se pudo generar el PDF", description: "Reintentá preparar el comprobante.", variant: "destructive" });
      return;
    }
    if (!apiHabilitada || whatsappConexion?.estado !== "conectado" || !venta.id || !comercio?.id) {
      return compartirManualmente(venta, comprobanteFile);
    }
    setIsSendingWhatsApp(true);
    try {
      await enviarComprobantePorWhatsApp({
        ventaId: venta.id,
        comercioId: comercio.id,
        file: comprobanteFile,
        caption: `${TIPOS_COMPROBANTE.find((tipo) => tipo.value === venta.tipo_comprobante)?.label || "Comprobante"} ${venta.numero_comprobante}`,
      });
      toast({ title: "Comprobante enviado", description: "La factura fue enviada por WhatsApp correctamente." });
    } catch (error) {
      console.error("No se pudo enviar el comprobante por WhatsApp Cloud API:", error);
      toast({
        title: "No se pudo enviar desde VORTEX",
        description: error instanceof Error ? error.message : "Podés compartir el comprobante manualmente.",
        variant: "destructive",
        action: <ToastAction altText="Compartir el comprobante manualmente" onClick={() => compartirManualmente(venta, comprobanteFile)}>Compartir</ToastAction>,
      });
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  if (isLoading && !detalleId) {
    return (
      <div className="flex justify-center items-center h-48">
        <p>Cargando ventas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!detalleId && <Card>
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
                  <TableHead className="w-px whitespace-nowrap">Fecha</TableHead>
                  <TableHead className="w-px whitespace-nowrap px-2" title="Número de comprobante">N° Comp.</TableHead>
                  <TableHead className="w-full min-w-[220px]">Cliente</TableHead>
                  <TableHead className="w-px whitespace-nowrap px-2">Tipo Pago</TableHead>
                  <TableHead className="w-px whitespace-nowrap px-2">Comprobante</TableHead>
                  <TableHead className="w-px whitespace-nowrap px-2">Total</TableHead>
                  <TableHead className="w-px whitespace-nowrap px-2">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedVentas.map((venta) => (
                  <TableRow key={venta.id}>
                    <TableCell className="w-px whitespace-nowrap">
                      {format(new Date(venta.fecha_venta), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="w-px whitespace-nowrap px-2 font-medium">
                      {mostrarNumeroComprobante(venta)}
                    </TableCell>
                    <TableCell className="w-full min-w-[220px] max-w-0">
                      <div className="truncate" title={venta.cliente_nombre || "Consumidor Final"}>
                        {venta.cliente_nombre || "Consumidor Final"}
                      </div>
                    </TableCell>
                    <TableCell className="w-px whitespace-nowrap px-2">
                      <Badge className="whitespace-nowrap" variant={getTipoPagoBadgeVariant((venta.pagos_venta?.length || 0) > 1 ? "mixto" : venta.tipo_pago)}>
                        {getVentaTipoPagoLabel(venta)}
                      </Badge>
                    </TableCell>
                    <TableCell className="w-px whitespace-nowrap px-2">
                      <Badge className="whitespace-nowrap" variant={getTipoComprobanteBadgeVariant(venta.tipo_comprobante)}>
                        {TIPOS_COMPROBANTE.find(t => t.value === venta.tipo_comprobante)?.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="w-px whitespace-nowrap px-2 font-semibold">
                      ${getVentaTotalFinal(venta).toFixed(2)}
                    </TableCell>
                    <TableCell className="w-px whitespace-nowrap px-2">
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
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Label htmlFor="ventas-page-size" className="whitespace-nowrap">Registros por página</Label>
              <Select value={String(pageSize)} onValueChange={changePageSize}>
                <SelectTrigger id="ventas-page-size" className="h-9 w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ventasPageSizes.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                {filteredVentas.length === 0 ? "0 ventas" : `Mostrando ${firstIndex + 1}–${firstIndex + paginatedVentas.length} de ${filteredVentas.length} ventas`}
              </p>
            </div>
            <nav aria-label="Paginación de ventas" className="flex items-center justify-between gap-3 sm:justify-end">
              <Button type="button" variant="outline" size="sm" disabled={activePage === 1} onClick={() => setCurrentPage(activePage - 1)}>
                <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />Anterior
              </Button>
              <span className="whitespace-nowrap text-sm">Página {activePage} de {totalPages}</span>
              <Button type="button" variant="outline" size="sm" disabled={activePage === totalPages} onClick={() => setCurrentPage(activePage + 1)}>
                Siguiente<ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Button>
            </nav>
          </div>
        </CardContent>
      </Card>}

      <Dialog open={showDetails} onOpenChange={handleDetailsOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Detalle de Venta</DialogTitle>
            <DialogDescription className="sr-only">Consulta del comprobante, productos y medios de pago.</DialogDescription>
          </DialogHeader>
          {detalleId && !selectedVenta && <p role="status">{isLoading ? "Cargando venta…" : "La venta no está disponible para tu usuario en este comercio."}</p>}
          {selectedVenta && (
            <div className="space-y-4">
              <div className="mb-4 space-y-3">
                <div className="grid grid-cols-1 gap-x-10 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <p className="whitespace-nowrap"><strong>Fecha:</strong> {format(new Date(selectedVenta.fecha_venta), "dd/MM/yyyy HH:mm")}</p>
                  <p className="whitespace-nowrap"><strong>Comprobante:</strong> {TIPOS_COMPROBANTE.find(t => t.value === selectedVenta.tipo_comprobante)?.label}</p>
                  <p className="whitespace-nowrap"><strong>N° Comprobante:</strong> {mostrarNumeroComprobante(selectedVenta)}</p>
                  <p className="whitespace-nowrap"><strong>Tipo Pago:</strong> {getVentaTipoPagoLabel(selectedVenta)}</p>
                </div>
                <p><strong>Cliente:</strong> {selectedVenta.cliente_nombre}</p>
                {whatsappEnvios[0] && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Último envío WhatsApp:</span>
                    <Badge variant={whatsappEnvios[0].estado === "fallido" ? "destructive" : "secondary"}>{whatsappEnvios[0].estado}</Badge>
                    <span>{format(new Date(whatsappEnvios[0].enviado_at), "dd/MM/yyyy HH:mm")}</span>
                    {whatsappEnvios[0].error_detalle && <span className="text-destructive">{whatsappEnvios[0].error_detalle}</span>}
                  </div>
                )}
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
                    disabled={isSendingWhatsApp || preparandoPdf || comercioLoading || afipLoading}
                    className="bg-[#25D366] text-white hover:bg-[#1DA851]"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    {isSendingWhatsApp ? "Enviando..." : preparandoPdf ? "Preparando PDF..." : comprobanteFile ? "WhatsApp" : "Reintentar PDF"}
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

            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="habilitar-pago-membresia"
                  checked={habilitarPagoMembresia}
                  disabled={cuentasMercadoPago.length === 0}
                  onCheckedChange={(checked) => setHabilitarPagoMembresia(checked === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="habilitar-pago-membresia" className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Permitir pagar este comprobante con Mercado Pago
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    El importe se cobrara en la cuenta Mercado Pago del administrador.
                  </p>
                </div>
              </div>

              {cuentasMercadoPago.length === 0 && (
                <p className="text-xs text-destructive">No hay una cuenta Mercado Pago conectada disponible.</p>
              )}

              {habilitarPagoMembresia && cuentasMercadoPago.length > 1 && (
                <div className="space-y-2">
                  <Label htmlFor="cuenta-cobro-membresia">Cuenta que recibira el pago</Label>
                  <select
                    id="cuenta-cobro-membresia"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={cuentaCobroId}
                    onChange={(event) => setCuentaCobroId(event.target.value)}
                    required
                  >
                    <option value="">Seleccionar cuenta</option>
                    {cuentasMercadoPago.map((cuenta) => (
                      <option key={cuenta.comercio_id} value={cuenta.comercio_id}>
                        {cuenta.cuenta_email || cuenta.comercio_id} ({cuenta.ambiente === "production" ? "Produccion" : "Prueba"})
                      </option>
                    ))}
                  </select>
                </div>
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
              disabled={
                notificationComercioIds.length === 0
                || crearNotificacion.isPending
                || (habilitarPagoMembresia && cuentasMercadoPago.length > 1 && !cuentaCobroId)
              }
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
