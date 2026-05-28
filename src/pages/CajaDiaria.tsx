import { useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, Banknote, Lock, Pencil, Plus, Printer, Trash2, Unlock, WalletCards } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ReportPrintHeader } from "@/components/ReportPrintHeader";
import { useComercio } from "@/hooks/useComercio";
import { useCajaDiaria } from "@/hooks/useCaja";
import { useToast } from "@/hooks/use-toast";
import { buildCajaResumen, CajaMovimiento, CajaMovimientoTipo, esMovimientoManual, getCajaMovimientoLabel, MOVIMIENTOS_CAJA } from "@/types/caja";
import { getTipoPagoLabel, getVentaTipoPagoLabel } from "@/types/venta";
import { buildCajaDiariaPdfFile } from "@/utils/cajaPdf";

const today = () => format(new Date(), "yyyy-MM-dd");

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(amount || 0);

const CajaDiaria = () => {
  const [fecha, setFecha] = useState(today());
  const [montoApertura, setMontoApertura] = useState(0);
  const [observacionesApertura, setObservacionesApertura] = useState("");
  const [tipoMovimiento, setTipoMovimiento] = useState<CajaMovimientoTipo>("ingreso");
  const [concepto, setConcepto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [montoMovimiento, setMontoMovimiento] = useState(0);
  const [montoCierreReal, setMontoCierreReal] = useState(0);
  const [observacionesCierre, setObservacionesCierre] = useState("");
  const [editarCierreOpen, setEditarCierreOpen] = useState(false);
  const [montoCierreEditado, setMontoCierreEditado] = useState(0);
  const [observacionesCierreEditadas, setObservacionesCierreEditadas] = useState("");
  const [movimientoEditando, setMovimientoEditando] = useState<CajaMovimiento | null>(null);
  const [tipoMovimientoEditado, setTipoMovimientoEditado] = useState<CajaMovimientoTipo>("ingreso");
  const [conceptoEditado, setConceptoEditado] = useState("");
  const [descripcionEditada, setDescripcionEditada] = useState("");
  const [montoMovimientoEditado, setMontoMovimientoEditado] = useState(0);
  const { comercio } = useComercio();
  const { toast } = useToast();

  const {
    caja,
    ventas,
    ventasPreviasPendientes,
    isLoading,
    abrirCaja,
    agregarMovimiento,
    registrarVentasPrevias,
    actualizarMovimiento,
    eliminarMovimiento,
    eliminarCaja,
    reabrirCaja,
    cerrarCaja,
    actualizarCierreCaja,
    isAbriendo,
    isAgregandoMovimiento,
    isRegistrandoVentasPrevias,
    isActualizandoMovimiento,
    isEliminandoCaja,
    isReabriendoCaja,
    isCerrando,
    isActualizandoCierre,
  } = useCajaDiaria(fecha);

  const resumen = useMemo(() => buildCajaResumen(caja, ventas), [caja, ventas]);
  const movimientosManuales = useMemo(
    () => (caja?.caja_movimientos || []).filter(esMovimientoManual),
    [caja?.caja_movimientos],
  );
  const cajaAbierta = caja?.estado === "abierta";
  const totalVentasPreviasPendientes = useMemo(
    () => ventasPreviasPendientes.reduce((sum, venta) => sum + Number(venta.total || 0), 0),
    [ventasPreviasPendientes],
  );

  const handleAbrirCaja = () => {
    abrirCaja({
      monto_apertura: montoApertura,
      observaciones_apertura: observacionesApertura,
    });
  };

  const handleAgregarMovimiento = () => {
    if (!caja?.id) return;
    if (!concepto.trim() || montoMovimiento <= 0) return;

    agregarMovimiento({
      caja_id: caja.id,
      tipo: tipoMovimiento,
      concepto: concepto.trim(),
      descripcion: descripcion.trim(),
      monto: montoMovimiento,
    });

    setConcepto("");
    setDescripcion("");
    setMontoMovimiento(0);
  };

  const handleCerrarCaja = () => {
    if (!caja?.id) return;

    cerrarCaja({
      caja_id: caja.id,
      monto_cierre_sistema: resumen.totalSistema,
      monto_cierre_real: montoCierreReal,
      observaciones_cierre: observacionesCierre,
    });
  };

  const handleEliminarCaja = () => {
    if (!caja?.id) return;
    eliminarCaja(caja.id);
  };

  const handleReabrirCaja = () => {
    if (!caja?.id) return;
    reabrirCaja(caja.id);
  };

  const handleAbrirEdicionMovimiento = (movimiento: CajaMovimiento) => {
    setMovimientoEditando(movimiento);
    setTipoMovimientoEditado(movimiento.tipo);
    setConceptoEditado(movimiento.concepto);
    setDescripcionEditada(movimiento.descripcion || "");
    setMontoMovimientoEditado(Number(movimiento.monto || 0));
  };

  const handleActualizarMovimiento = () => {
    if (!movimientoEditando?.id || !conceptoEditado.trim() || montoMovimientoEditado <= 0) return;

    actualizarMovimiento(
      {
        movimiento_id: movimientoEditando.id,
        tipo: tipoMovimientoEditado,
        concepto: conceptoEditado.trim(),
        descripcion: descripcionEditada.trim(),
        monto: montoMovimientoEditado,
      },
      {
        onSuccess: () => setMovimientoEditando(null),
      },
    );
  };

  const handleAbrirEdicionCierre = () => {
    if (!caja) return;
    setMontoCierreEditado(Number(caja.monto_cierre_real || 0));
    setObservacionesCierreEditadas(caja.observaciones_cierre || "");
    setEditarCierreOpen(true);
  };

  const handleActualizarCierre = () => {
    if (!caja?.id) return;

    actualizarCierreCaja(
      {
        caja_id: caja.id,
        monto_cierre_sistema: Number(caja.monto_cierre_sistema || resumen.totalSistema),
        monto_cierre_real: montoCierreEditado,
        observaciones_cierre: observacionesCierreEditadas,
      },
      {
        onSuccess: () => setEditarCierreOpen(false),
      },
    );
  };

  const handlePrintReport = async () => {
    if (!caja) {
      toast({
        title: "No hay caja para imprimir",
        description: "Abra o seleccione una caja para generar el reporte.",
        variant: "destructive",
      });
      return;
    }

    const fechaReporte = format(new Date(`${caja.fecha}T00:00:00`), "dd/MM/yyyy");
    const file = await buildCajaDiariaPdfFile(
      { ...caja, ventas },
      {
        comercio,
        rango: fechaReporte,
      },
    );
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

  const diferenciaPrevia = montoCierreReal - resumen.totalSistema;
  const sistemaCierreRegistrado = Number(caja?.monto_cierre_sistema || resumen.totalSistema);
  const diferenciaEditada = montoCierreEditado - sistemaCierreRegistrado;

  return (
    <div className="p-6">
      <style>
        {`
          @media print {
            .no-print { display: none !important; }
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            table, thead, tbody, tfoot, tr, th, td { border: 0 !important; }
          }
        `}
      </style>

      <div className="mx-auto max-w-7xl space-y-6">
        <ReportPrintHeader />
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-foreground">Caja Diaria</h1>
            <p className="text-muted-foreground">
              Apertura, arqueo, movimientos y cierre por fecha
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3 no-print">
            <div className="space-y-2">
              <Label htmlFor="fecha">Fecha</Label>
              <Input id="fecha" type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} />
            </div>
            <Button type="button" variant="print" onClick={handlePrintReport}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
            {caja && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive" disabled={isEliminandoCaja}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isEliminandoCaja ? "Eliminando..." : "Eliminar caja"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Eliminar caja</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta accion elimina la caja del {format(new Date(`${caja.fecha}T00:00:00`), "dd/MM/yyyy")} y sus movimientos manuales. Las ventas no se eliminan.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={handleEliminarCaja}
                    >
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-8 text-muted-foreground">Cargando caja...</CardContent>
          </Card>
        ) : (
          <>
            {!cajaAbierta && (
              <Card className="no-print">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Banknote className="h-5 w-5" />
                    {caja ? "Abrir nueva caja del dia" : "Abrir caja del dia"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="montoApertura">Monto inicial</Label>
                      <Input
                        id="montoApertura"
                        type="number"
                        step="0.01"
                        value={montoApertura}
                        onChange={(event) => setMontoApertura(Number(event.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="observacionesApertura">Observaciones</Label>
                      <Input
                        id="observacionesApertura"
                        value={observacionesApertura}
                        onChange={(event) => setObservacionesApertura(event.target.value)}
                        placeholder={caja ? "Ej: turno tarde" : "Detalle opcional"}
                      />
                    </div>
                  </div>
                  <Button type="button" variant="new" onClick={handleAbrirCaja} disabled={isAbriendo}>
                    <Plus className="mr-2 h-4 w-4" />
                    {isAbriendo ? "Abriendo..." : "Abrir Caja"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {caja && (
              <>
                {cajaAbierta && ventasPreviasPendientes.length > 0 && (
                  <Card className="no-print border-amber-300 bg-amber-50 text-amber-950">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <AlertTriangle className="h-5 w-5" />
                        Hay ventas anteriores a la apertura
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1">
                        <p>
                          Se encontraron {ventasPreviasPendientes.length} comprobante{ventasPreviasPendientes.length === 1 ? "" : "s"} del dia que no estan incluidos en ninguna caja.
                        </p>
                        <p className="text-sm">
                          Total a registrar como venta: <strong>{formatCurrency(totalVentasPreviasPendientes)}</strong>
                        </p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" disabled={isRegistrandoVentasPrevias}>
                            {isRegistrandoVentasPrevias ? "Registrando..." : "Registrar en caja"}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Registrar ventas previas en caja</AlertDialogTitle>
                            <AlertDialogDescription>
                              Se agregaran {ventasPreviasPendientes.length} comprobante{ventasPreviasPendientes.length === 1 ? "" : "s"} como venta de la caja abierta, respetando su forma de pago. Esta accion evita duplicados por comprobante.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => registrarVentasPrevias()}>
                              Confirmar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </CardContent>
                  </Card>
                )}

                <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Estado</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant={caja.estado === "abierta" ? "success" : "secondary"}>
                    {caja.estado === "abierta" ? "Abierta" : "Cerrada"}
                  </Badge>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {format(new Date(caja.abierto_at || caja.created_at || fecha), "dd/MM/yyyy HH:mm")}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Apertura</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(caja.monto_apertura)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Efectivo Sistema</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(resumen.totalSistema)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Diferencia</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={caja.estado === "cerrada" && Number(caja.diferencia || 0) !== 0 ? "text-2xl font-bold text-destructive" : "text-2xl font-bold"}>
                    {caja.estado === "cerrada" ? formatCurrency(Number(caja.diferencia || 0)) : "-"}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <WalletCards className="h-5 w-5" />
                    Arqueo por forma de pago
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Forma</TableHead>
                        <TableHead className="text-right">Operaciones</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resumen.pagosPorTipo.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground">
                            No hay pagos registrados para la fecha
                          </TableCell>
                        </TableRow>
                      ) : (
                        resumen.pagosPorTipo.map((pago) => (
                          <TableRow key={pago.tipo}>
                            <TableCell>{getTipoPagoLabel(pago.tipo)}</TableCell>
                            <TableCell className="text-right">{pago.cantidad}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(pago.monto)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Resumen de efectivo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span>Apertura</span>
                    <strong>{formatCurrency(caja.monto_apertura)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Ventas contado</span>
                    <strong>{formatCurrency(resumen.totalContado)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Ingresos manuales</span>
                    <strong>{formatCurrency(resumen.ingresosManuales)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Egresos manuales</span>
                    <strong>{formatCurrency(resumen.egresosManuales)}</strong>
                  </div>
                  <div className="border-t pt-3">
                    <div className="flex justify-between text-base">
                      <span>Total esperado</span>
                      <strong>{formatCurrency(resumen.totalSistema)}</strong>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {cajaAbierta && (
              <Card className="no-print">
                <CardHeader>
                  <CardTitle>Movimiento manual</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select value={tipoMovimiento} onValueChange={(value: CajaMovimientoTipo) => setTipoMovimiento(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MOVIMIENTOS_CAJA.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Concepto</Label>
                      <Input value={concepto} onChange={(event) => setConcepto(event.target.value)} placeholder="Retiro, cambio, gasto..." />
                    </div>
                    <div className="space-y-2">
                      <Label>Monto</Label>
                      <Input type="number" step="0.01" value={montoMovimiento} onChange={(event) => setMontoMovimiento(Number(event.target.value))} />
                    </div>
                    <div className="flex items-end">
                      <Button type="button" className="w-full" onClick={handleAgregarMovimiento} disabled={isAgregandoMovimiento || !concepto.trim() || montoMovimiento <= 0}>
                        <Plus className="mr-2 h-4 w-4" />
                        Agregar
                      </Button>
                    </div>
                  </div>
                  <Textarea value={descripcion} onChange={(event) => setDescripcion(event.target.value)} placeholder="Descripcion opcional" />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Movimientos manuales</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Concepto</TableHead>
                      <TableHead>Descripcion</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      {cajaAbierta && <TableHead className="w-[112px] no-print">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimientosManuales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={cajaAbierta ? 6 : 5} className="text-center text-muted-foreground">
                          No hay movimientos manuales
                        </TableCell>
                      </TableRow>
                    ) : (
                      movimientosManuales.map((movimiento) => (
                        <TableRow key={movimiento.id}>
                          <TableCell>{format(new Date(movimiento.fecha_movimiento || movimiento.created_at || fecha), "dd/MM/yyyy HH:mm")}</TableCell>
                          <TableCell>
                            <Badge variant={movimiento.tipo === "ingreso" ? "default" : "destructive"}>
                              {getCajaMovimientoLabel(movimiento.tipo)}
                            </Badge>
                          </TableCell>
                          <TableCell>{movimiento.concepto}</TableCell>
                          <TableCell>{movimiento.descripcion || "-"}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(movimiento.monto)}</TableCell>
                          {cajaAbierta && (
                            <TableCell className="no-print">
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleAbrirEdicionMovimiento(movimiento)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => movimiento.id && eliminarMovimiento(movimiento.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ventas de la caja</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hora</TableHead>
                      <TableHead>Comprobante</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Pago</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ventas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No hay ventas para esta caja
                        </TableCell>
                      </TableRow>
                    ) : (
                      ventas.map((venta) => (
                        <TableRow key={venta.id}>
                          <TableCell>{format(new Date(venta.fecha_venta), "HH:mm")}</TableCell>
                          <TableCell className="font-medium">{venta.numero_comprobante}</TableCell>
                          <TableCell>{venta.cliente_nombre || "Consumidor Final"}</TableCell>
                          <TableCell>{getVentaTipoPagoLabel(venta)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(venta.total)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {cajaAbierta ? (
              <Card className="no-print">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="h-5 w-5" />
                    Cierre de caja
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Total sistema</Label>
                      <Input value={resumen.totalSistema.toFixed(2)} readOnly />
                    </div>
                    <div className="space-y-2">
                      <Label>Dinero contado</Label>
                      <Input type="number" step="0.01" value={montoCierreReal} onChange={(event) => setMontoCierreReal(Number(event.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Diferencia</Label>
                      <Input value={diferenciaPrevia.toFixed(2)} readOnly className={diferenciaPrevia !== 0 ? "text-destructive" : ""} />
                    </div>
                  </div>
                  <Textarea value={observacionesCierre} onChange={(event) => setObservacionesCierre(event.target.value)} placeholder="Observaciones del cierre" />
                  <Button type="button" onClick={handleCerrarCaja} disabled={isCerrando}>
                    <Lock className="mr-2 h-4 w-4" />
                    {isCerrando ? "Cerrando..." : "Cerrar Caja"}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Cierre registrado</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-5">
                  <div>
                    <p className="text-sm text-muted-foreground">Sistema</p>
                    <p className="text-lg font-semibold">{formatCurrency(Number(caja.monto_cierre_sistema || 0))}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Contado</p>
                    <p className="text-lg font-semibold">{formatCurrency(Number(caja.monto_cierre_real || 0))}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Diferencia</p>
                    <p className="text-lg font-semibold">{formatCurrency(Number(caja.diferencia || 0))}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cerrado</p>
                    <p className="text-lg font-semibold">{caja.cerrado_at ? format(new Date(caja.cerrado_at), "dd/MM/yyyy HH:mm") : "-"}</p>
                  </div>
                  <div className="flex items-end no-print">
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={handleAbrirEdicionCierre}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar cierre
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" variant="outline" disabled={isReabriendoCaja}>
                            <Unlock className="mr-2 h-4 w-4" />
                            {isReabriendoCaja ? "Reabriendo..." : "Reabrir caja"}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Reabrir caja cerrada</AlertDialogTitle>
                            <AlertDialogDescription>
                              La caja volvera a estado abierta para corregir movimientos manuales. Despues deberas cerrarla nuevamente.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleReabrirCaja}>Reabrir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Dialog open={editarCierreOpen} onOpenChange={setEditarCierreOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Editar cierre de caja</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Total sistema</Label>
                      <Input value={sistemaCierreRegistrado.toFixed(2)} readOnly />
                    </div>
                    <div className="space-y-2">
                      <Label>Dinero contado</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={montoCierreEditado}
                        onChange={(event) => setMontoCierreEditado(Number(event.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Diferencia</Label>
                      <Input value={diferenciaEditada.toFixed(2)} readOnly className={diferenciaEditada !== 0 ? "text-destructive" : ""} />
                    </div>
                  </div>
                  <Textarea
                    value={observacionesCierreEditadas}
                    onChange={(event) => setObservacionesCierreEditadas(event.target.value)}
                    placeholder="Observaciones del cierre"
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditarCierreOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="button" onClick={handleActualizarCierre} disabled={isActualizandoCierre}>
                    {isActualizandoCierre ? "Guardando..." : "Guardar cambios"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={Boolean(movimientoEditando)} onOpenChange={(open) => !open && setMovimientoEditando(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Editar movimiento</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select value={tipoMovimientoEditado} onValueChange={(value: CajaMovimientoTipo) => setTipoMovimientoEditado(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MOVIMIENTOS_CAJA.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Concepto</Label>
                      <Input value={conceptoEditado} onChange={(event) => setConceptoEditado(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Monto</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={montoMovimientoEditado}
                        onChange={(event) => setMontoMovimientoEditado(Number(event.target.value))}
                      />
                    </div>
                  </div>
                  <Textarea value={descripcionEditada} onChange={(event) => setDescripcionEditada(event.target.value)} placeholder="Descripcion opcional" />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setMovimientoEditando(null)}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    onClick={handleActualizarMovimiento}
                    disabled={isActualizandoMovimiento || !conceptoEditado.trim() || montoMovimientoEditado <= 0}
                  >
                    {isActualizandoMovimiento ? "Guardando..." : "Guardar cambios"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CajaDiaria;
