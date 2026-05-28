import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileDown, MessageCircle, Plus, Printer, Search, Trash2, Eye } from "lucide-react";
import { useCuentaCorriente } from "@/hooks/useCuentaCorriente";
import { CuentaCorrienteForm } from "./CuentaCorrienteForm";
import { CONCEPTOS_MOVIMIENTO } from "@/types/cuenta-corriente";
import { buildCuentaCorrientePdfFile, buildCuentaCorrienteWhatsAppMessage } from "@/utils/cuentaCorrientePdf";
import { useToast } from "@/hooks/use-toast";
import { useComercio } from "@/hooks/useComercio";
import { format } from "date-fns";

export const CuentaCorrienteList = () => {
  const { toast } = useToast();
  const { comercio } = useComercio();
  const { 
    movimientos, 
    isLoading, 
    deleteMovimiento, 
    deleteVentaFromCuenta,
    getResumenCuentaCorreinte,
    useMovimientosByCliente 
  } = useCuentaCorriente();
  
  const { data: resumen = [], isLoading: isLoadingResumen } = getResumenCuentaCorreinte();
  
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [showClientDetail, setShowClientDetail] = useState(false);

  // Get movements for selected client - always call the hook
  const { data: clientMovimientos = [], isLoading: isLoadingClientMovimientos } = 
    useMovimientosByCliente(selectedClientId);

  const selectedClientData = selectedClientId ? 
    resumen.find(r => r.cliente_id === selectedClientId) : null;

  const filteredMovimientos = movimientos.filter(mov =>
    mov.cliente?.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    mov.cliente?.apellido.toLowerCase().includes(searchTerm.toLowerCase()) ||
    mov.cliente?.cuit.toLowerCase().includes(searchTerm.toLowerCase()) ||
    mov.concepto.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredResumen = resumen.filter(res =>
    res.cliente_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    res.cliente_apellido.toLowerCase().includes(searchTerm.toLowerCase()) ||
    res.cliente_cuit.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getConceptoLabel = (concepto: string) => {
    return CONCEPTOS_MOVIMIENTO.find(c => c.value === concepto)?.label || concepto;
  };

  const getTipoMovimientoBadgeVariant = (tipo: string) => {
    return tipo === 'debito' ? 'destructive' : 'default';
  };

  const getSaldoBadgeVariant = (saldo: number) => {
    if (saldo > 0) return 'destructive';
    if (saldo < 0) return 'default';
    return 'secondary';
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

  const openResumenPdf = async () => {
    if (!selectedClientData) return;

    const file = await buildCuentaCorrientePdfFile(selectedClientData, clientMovimientos, { comercio });
    const url = URL.createObjectURL(file);
    const pdfWindow = window.open(url, "_blank");

    if (!pdfWindow) {
      URL.revokeObjectURL(url);
      toast({
        title: "No se pudo abrir el PDF",
        description: "Revise si el navegador bloqueo la ventana emergente.",
        variant: "destructive",
      });
      return;
    }

    pdfWindow.opener = null;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const exportResumenPdf = async () => {
    if (!selectedClientData) return;

    downloadFile(await buildCuentaCorrientePdfFile(selectedClientData, clientMovimientos, { comercio }));
  };

  const sendResumenWhatsApp = async () => {
    if (!selectedClientData) return;

    const file = await buildCuentaCorrientePdfFile(selectedClientData, clientMovimientos, { comercio });
    const message = buildCuentaCorrienteWhatsAppMessage(selectedClientData, clientMovimientos);
    const shareData: ShareData = {
      title: `Resumen cuenta corriente ${selectedClientData.cliente_nombre} ${selectedClientData.cliente_apellido}`,
      text: message,
      files: [file],
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("No se pudo compartir el resumen de cuenta corriente:", error);
    }

    downloadFile(file);

    const phone = getWhatsAppPhone(selectedClientData.cliente_telefono);
    const text = encodeURIComponent(message);
    const url = phone
      ? `https://wa.me/${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;

    window.open(url, "_blank", "noopener,noreferrer");
    toast({
      title: "Resumen generado",
      description: "WhatsApp Web no permite adjuntar archivos automaticamente. Se descargo el PDF para adjuntarlo al chat.",
    });
  };

  if (isLoading || isLoadingResumen) {
    return (
      <div className="flex justify-center items-center h-48">
        <p>Cargando cuenta corriente...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Gestión de Cuenta Corriente</CardTitle>
            <Button asChild variant="new">
              <Link to="/cuenta-corriente/nuevo">
                <Plus className="mr-2 h-4 w-4" />
                Nuevo Movimiento
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente, CUIT o concepto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <Tabs defaultValue="resumen" className="w-full">
            <TabsList>
              <TabsTrigger value="resumen">Resumen por Cliente</TabsTrigger>
              <TabsTrigger value="movimientos">Todos los Movimientos</TabsTrigger>
            </TabsList>
            
            <TabsContent value="resumen">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>CUIT</TableHead>
                      <TableHead>Total Débitos</TableHead>
                      <TableHead>Total Créditos</TableHead>
                      <TableHead>Saldo Actual</TableHead>
                      <TableHead>Último Movimiento</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResumen.map((res) => (
                      <TableRow key={res.cliente_id}>
                        <TableCell className="font-medium">
                          {res.cliente_nombre} {res.cliente_apellido}
                        </TableCell>
                        <TableCell>{res.cliente_cuit}</TableCell>
                        <TableCell className="text-red-600">
                          ${res.total_debitos.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-green-600">
                          ${res.total_creditos.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getSaldoBadgeVariant(res.saldo_actual)}>
                            ${Math.abs(res.saldo_actual).toFixed(2)} {res.saldo_actual > 0 ? '(Debe)' : res.saldo_actual < 0 ? '(Favor)' : ''}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {res.ultimo_movimiento && format(new Date(res.ultimo_movimiento), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedClientId(res.cliente_id);
                              setShowClientDetail(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="movimientos">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Concepto</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead>Observaciones</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMovimientos.map((movimiento) => (
                      <TableRow key={movimiento.id}>
                        <TableCell>
                          {format(new Date(movimiento.fecha_movimiento), "dd/MM/yyyy HH:mm")}
                        </TableCell>
                        <TableCell>
                          {movimiento.cliente?.nombre} {movimiento.cliente?.apellido}
                          <div className="text-sm text-muted-foreground">
                            CUIT: {movimiento.cliente?.cuit}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getTipoMovimientoBadgeVariant(movimiento.tipo_movimiento)}>
                            {movimiento.tipo_movimiento === 'debito' ? 'Débito' : 'Crédito'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            {getConceptoLabel(movimiento.concepto)}
                            {movimiento.venta_id && (
                              <div className="text-xs text-muted-foreground">
                                Venta: {movimiento.venta?.numero_comprobante}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className={`font-semibold ${
                          movimiento.tipo_movimiento === 'debito' ? 'text-red-600' : 'text-green-600'
                        }`}>
                          ${movimiento.monto.toFixed(2)}
                        </TableCell>
                        <TableCell>{movimiento.observaciones}</TableCell>
                        <TableCell>
                          {movimiento.venta_id ? (
                            <div className="flex gap-2">
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  if (confirm("¿Eliminar toda la venta? Esto eliminará la venta y todos sus movimientos asociados.")) {
                                    deleteVentaFromCuenta(movimiento.venta_id);
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                                Venta
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                if (confirm("¿Eliminar este movimiento?")) {
                                  deleteMovimiento(movimiento.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>

          {filteredMovimientos.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No se encontraron movimientos</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Movimiento</DialogTitle>
          </DialogHeader>
          <CuentaCorrienteForm onSuccess={() => setShowForm(false)} showTitle={false} />
        </DialogContent>
      </Dialog>

      {/* Client Detail Dialog */}
      <Dialog open={showClientDetail} onOpenChange={setShowClientDetail}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pr-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <DialogTitle>
                Detalle de Cuenta Corriente - {selectedClientData?.cliente_nombre} {selectedClientData?.cliente_apellido}
              </DialogTitle>
              {selectedClientData && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="bg-sky-600 text-white hover:bg-sky-700"
                    onClick={openResumenPdf}
                    disabled={isLoadingClientMovimientos}
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    Imprimir
                  </Button>
                  <Button
                    size="sm"
                    className="bg-red-600 text-white hover:bg-red-700"
                    onClick={exportResumenPdf}
                    disabled={isLoadingClientMovimientos}
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    PDF
                  </Button>
                  <Button
                    size="sm"
                    className="bg-[#25D366] text-white hover:bg-[#1DA851]"
                    onClick={sendResumenWhatsApp}
                    disabled={isLoadingClientMovimientos}
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    WhatsApp
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>
          
          {selectedClientData && (
            <div className="space-y-4">
              {/* Client Summary */}
              <div className="grid grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm font-medium">CUIT</p>
                  <p className="text-lg">{selectedClientData.cliente_cuit}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Total Débitos</p>
                  <p className="text-lg text-red-600">${selectedClientData.total_debitos.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Total Créditos</p>
                  <p className="text-lg text-green-600">${selectedClientData.total_creditos.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Saldo Actual</p>
                  <Badge variant={getSaldoBadgeVariant(selectedClientData.saldo_actual)} className="text-base">
                    ${Math.abs(selectedClientData.saldo_actual).toFixed(2)} 
                    {selectedClientData.saldo_actual > 0 ? ' (Debe)' : selectedClientData.saldo_actual < 0 ? ' (Favor)' : ''}
                  </Badge>
                </div>
              </div>

              {/* Client Movements */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Movimientos</h3>
                {isLoadingClientMovimientos ? (
                  <div className="text-center py-4">
                    <p>Cargando movimientos...</p>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Concepto</TableHead>
                          <TableHead>Monto</TableHead>
                          <TableHead>Observaciones</TableHead>
                          <TableHead>Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientMovimientos.map((movimiento) => (
                          <TableRow key={movimiento.id}>
                            <TableCell>
                              {format(new Date(movimiento.fecha_movimiento), "dd/MM/yyyy HH:mm")}
                            </TableCell>
                            <TableCell>
                              <Badge variant={getTipoMovimientoBadgeVariant(movimiento.tipo_movimiento)}>
                                {movimiento.tipo_movimiento === 'debito' ? 'Débito' : 'Crédito'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div>
                                {getConceptoLabel(movimiento.concepto)}
                                {movimiento.venta_id && (
                                  <div className="text-xs text-muted-foreground">
                                    Venta: {movimiento.venta?.numero_comprobante}
                                  </div>
                                )}
                                {movimiento.tarjeta_id && movimiento.tarjeta && (
                                  <div className="text-xs text-muted-foreground">
                                    Tarjeta - {movimiento.cuotas} cuotas
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className={`font-semibold ${
                              movimiento.tipo_movimiento === 'debito' ? 'text-red-600' : 'text-green-600'
                            }`}>
                              ${movimiento.monto.toFixed(2)}
                            </TableCell>
                            <TableCell>{movimiento.observaciones}</TableCell>
                            <TableCell>
                              {movimiento.venta_id ? (
                                <div className="flex gap-2">
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => {
                                      if (confirm("¿Eliminar toda la venta? Esto eliminará la venta y todos sus movimientos asociados.")) {
                                        deleteVentaFromCuenta(movimiento.venta_id);
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Venta
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => {
                                    if (confirm("¿Eliminar este movimiento?")) {
                                      deleteMovimiento(movimiento.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                
                {clientMovimientos.length === 0 && !isLoadingClientMovimientos && (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No hay movimientos para este cliente</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
