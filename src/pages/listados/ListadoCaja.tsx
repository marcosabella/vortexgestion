import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Calculator, Eye, Pencil, Printer, Search, Trash2, Unlock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ReportPrintHeader } from "@/components/ReportPrintHeader";
import { useActualizarCierreCaja, useCajasDiarias, useEliminarCaja, useReabrirCaja } from "@/hooks/useCaja";
import { CajaDiaria, esMovimientoManual, getCajaMovimientoLabel } from "@/types/caja";
import { getTipoPagoLabel, getVentaTipoPagoLabel, PagoVenta, Venta } from "@/types/venta";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(amount || 0);

const getPagosVenta = (venta: Venta): PagoVenta[] => {
  if (venta.pagos_venta?.length) return venta.pagos_venta;

  return [
    {
      tipo_pago: venta.tipo_pago,
      monto: venta.total,
      banco_id: venta.banco_id,
      tarjeta_id: venta.tarjeta_id,
      cuotas: venta.cuotas,
      recargo_cuotas: venta.recargo_cuotas || 0,
    },
  ];
};

const formatPagoDetalle = (pago: PagoVenta) => {
  const partes = [getTipoPagoLabel(pago.tipo_pago), formatCurrency(Number(pago.monto || 0))];

  if (pago.banco?.nombre_banco) partes.push(pago.banco.nombre_banco);
  if (pago.tarjeta?.nombre) partes.push(pago.tarjeta.nombre);
  if (pago.cuotas && pago.cuotas > 1) partes.push(`${pago.cuotas} cuotas`);
  if (pago.cheque?.numero_cheque) partes.push(`Cheque ${pago.cheque.numero_cheque}`);

  return partes.join(" - ");
};

const ListadoCaja = () => {
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCaja, setSelectedCaja] = useState<CajaDiaria | null>(null);
  const [editingCaja, setEditingCaja] = useState<CajaDiaria | null>(null);
  const [deletingCaja, setDeletingCaja] = useState<CajaDiaria | null>(null);
  const [montoCierreEditado, setMontoCierreEditado] = useState(0);
  const [observacionesCierreEditadas, setObservacionesCierreEditadas] = useState("");
  const { data: cajas = [], isLoading } = useCajasDiarias(fechaDesde, fechaHasta);
  const actualizarCierreCaja = useActualizarCierreCaja();
  const eliminarCaja = useEliminarCaja();
  const reabrirCaja = useReabrirCaja();

  const cajasFiltradas = useMemo(() => {
    return cajas.filter((caja) => {
      const term = searchTerm.toLowerCase();
      if (!term) return true;

      return (
        caja.estado.toLowerCase().includes(term) ||
        caja.observaciones_apertura?.toLowerCase().includes(term) ||
        caja.observaciones_cierre?.toLowerCase().includes(term)
      );
    });
  }, [cajas, searchTerm]);

  const resumen = useMemo(() => {
    return cajasFiltradas.reduce(
      (acc, caja) => {
        acc.totalCajas += 1;
        acc.abiertas += caja.estado === "abierta" ? 1 : 0;
        acc.cerradas += caja.estado === "cerrada" ? 1 : 0;
        acc.diferencia += Number(caja.diferencia || 0);
        acc.totalSistema += Number(caja.monto_cierre_sistema || 0);
        acc.totalReal += Number(caja.monto_cierre_real || 0);
        return acc;
      },
      { totalCajas: 0, abiertas: 0, cerradas: 0, diferencia: 0, totalSistema: 0, totalReal: 0 },
    );
  }, [cajasFiltradas]);

  const balanceCaja = useMemo(() => {
    const pagosPorTipo = new Map<string, { concepto: string; monto: number }>();
    const egresosPorConcepto = new Map<string, number>();
    const acumularPago = (tipo: string, monto: number) => {
      const actual = pagosPorTipo.get(tipo) || { concepto: `Ventas ${getTipoPagoLabel(tipo)}`, monto: 0 };
      actual.monto += monto;
      pagosPorTipo.set(tipo, actual);
    };
    const acumularEgresoManual = (concepto: string, monto: number) => {
      const conceptoLimpio = concepto.trim() || "Sin concepto";
      egresosPorConcepto.set(conceptoLimpio, (egresosPorConcepto.get(conceptoLimpio) || 0) + monto);
    };

    const datos = cajasFiltradas.reduce(
      (acc, caja) => {
        const movimientos = (caja.caja_movimientos || []).filter(esMovimientoManual);
        const ventas = caja.ventas || [];

        acc.aperturas += Number(caja.monto_apertura || 0);
        acc.ingresosManuales += movimientos
          .filter((movimiento) => movimiento.tipo === "ingreso")
          .reduce((sum, movimiento) => sum + Number(movimiento.monto || 0), 0);
        acc.egresosManuales += movimientos
          .filter((movimiento) => movimiento.tipo === "egreso")
          .reduce((sum, movimiento) => sum + Number(movimiento.monto || 0), 0);
        acc.cierreSistema += Number(caja.monto_cierre_sistema || 0);
        acc.cierreReal += Number(caja.monto_cierre_real || 0);
        acc.diferencia += Number(caja.diferencia || 0);
        acc.totalVentas += ventas.reduce((sum, venta) => sum + Number(venta.total || 0), 0);

        ventas.forEach((venta) => {
          getPagosVenta(venta).forEach((pago) => {
            acumularPago(pago.tipo_pago, Number(pago.monto || 0));
          });
        });

        movimientos
          .filter((movimiento) => movimiento.tipo === "egreso")
          .forEach((movimiento) => {
            acumularEgresoManual(movimiento.concepto, Number(movimiento.monto || 0));
          });

        return acc;
      },
      {
        aperturas: 0,
        ingresosManuales: 0,
        egresosManuales: 0,
        cierreSistema: 0,
        cierreReal: 0,
        diferencia: 0,
        totalVentas: 0,
      },
    );

    const filasBase = [
      { id: "aperturas", cuenta: "Saldo inicial / aperturas", debe: datos.aperturas, haber: 0 },
      ...Array.from(pagosPorTipo.values()).map((pago) => ({
        id: `venta-${pago.concepto}`,
        cuenta: pago.concepto,
        debe: pago.monto,
        haber: 0,
      })),
      { id: "ingresos-manuales", cuenta: "Ingresos manuales", debe: datos.ingresosManuales, haber: 0 },
      ...Array.from(egresosPorConcepto.entries()).map(([concepto, monto]) => ({
        id: `egreso-${concepto}`,
        cuenta: `Egresos manuales - "${concepto}"`,
        debe: 0,
        haber: monto,
      })),
    ].filter((fila) => fila.debe !== 0 || fila.haber !== 0);

    const filas = filasBase;
    const totalDebe = filas.reduce((sum, fila) => sum + fila.debe, 0);
    const totalHaber = filas.reduce((sum, fila) => sum + fila.haber, 0);

    return {
      ...datos,
      filas,
      totalDebe,
      totalHaber,
      saldoPeriodo: totalDebe - totalHaber,
    };
  }, [cajasFiltradas]);

  const rangoBalance =
    fechaDesde || fechaHasta
      ? `${fechaDesde ? format(new Date(`${fechaDesde}T00:00:00`), "dd/MM/yyyy") : "inicio"} al ${
          fechaHasta ? format(new Date(`${fechaHasta}T00:00:00`), "dd/MM/yyyy") : "hoy"
        }`
      : "Todas las fechas";

  const clearFilters = () => {
    setFechaDesde("");
    setFechaHasta("");
    setSearchTerm("");
  };

  const handleAbrirEdicion = (caja: CajaDiaria) => {
    setEditingCaja(caja);
    setMontoCierreEditado(Number(caja.monto_cierre_real || 0));
    setObservacionesCierreEditadas(caja.observaciones_cierre || "");
  };

  const handleActualizarCierre = () => {
    if (!editingCaja?.id) return;

    actualizarCierreCaja.mutate(
      {
        caja_id: editingCaja.id,
        monto_cierre_sistema: Number(editingCaja.monto_cierre_sistema || 0),
        monto_cierre_real: montoCierreEditado,
        observaciones_cierre: observacionesCierreEditadas,
      },
      {
        onSuccess: (cajaActualizada) => {
          setEditingCaja(null);
          if (selectedCaja?.id === cajaActualizada.id) setSelectedCaja({ ...selectedCaja, ...cajaActualizada });
        },
      },
    );
  };

  const handleEliminarCaja = () => {
    if (!deletingCaja?.id) return;

    eliminarCaja.mutate(deletingCaja.id, {
      onSuccess: () => {
        if (selectedCaja?.id === deletingCaja.id) setSelectedCaja(null);
        if (editingCaja?.id === deletingCaja.id) setEditingCaja(null);
        setDeletingCaja(null);
      },
    });
  };

  const handleReabrirCaja = (caja: CajaDiaria) => {
    if (!caja.id) return;

    reabrirCaja.mutate(caja.id, {
      onSuccess: (cajaActualizada) => {
        if (selectedCaja?.id === cajaActualizada.id) setSelectedCaja({ ...selectedCaja, ...cajaActualizada });
      },
    });
  };

  const sistemaCierreEditado = Number(editingCaja?.monto_cierre_sistema || 0);
  const diferenciaEditada = montoCierreEditado - sistemaCierreEditado;

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-7xl">
          <p className="text-muted-foreground">Cargando cajas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <style>
        {`
          @media print {
            .no-print { display: none !important; }
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          }
        `}
      </style>

      <div className="mx-auto max-w-7xl space-y-6">
        <ReportPrintHeader />
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-foreground">Listado de Caja</h1>
            <p className="text-muted-foreground">Consulta historica de aperturas, cierres y arqueos</p>
          </div>
          <Button type="button" variant="outline" onClick={() => window.print()} className="no-print">
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Cajas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{resumen.totalCajas}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Abiertas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{resumen.abiertas}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Cerradas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{resumen.cerradas}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Diferencia Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={resumen.diferencia !== 0 ? "text-2xl font-bold text-destructive" : "text-2xl font-bold"}>
                {formatCurrency(resumen.diferencia)}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="no-print">
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Estado u observacion..."
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Fecha desde</Label>
                <Input type="date" value={fechaDesde} onChange={(event) => setFechaDesde(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Fecha hasta</Label>
                <Input type="date" value={fechaHasta} onChange={(event) => setFechaHasta(event.target.value)} />
              </div>
              <div className="flex items-end">
                <Button type="button" variant="outline" className="w-full" onClick={clearFilters}>
                  Limpiar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Resumen de caja por rango
            </CardTitle>
            <p className="text-sm text-muted-foreground">Balance contable del periodo: {rangoBalance}</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-md border p-4">
                <p className="text-sm text-muted-foreground">Ventas del periodo</p>
                <p className="text-xl font-semibold">{formatCurrency(balanceCaja.totalVentas)}</p>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-sm text-muted-foreground">Cierre sistema</p>
                <p className="text-xl font-semibold">{formatCurrency(balanceCaja.cierreSistema)}</p>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-sm text-muted-foreground">Cierre real</p>
                <p className="text-xl font-semibold">{formatCurrency(balanceCaja.cierreReal)}</p>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-sm text-muted-foreground">Diferencia</p>
                <p className={balanceCaja.diferencia !== 0 ? "text-xl font-semibold text-destructive" : "text-xl font-semibold"}>
                  {formatCurrency(balanceCaja.diferencia)}
                </p>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="text-right">Debe</TableHead>
                  <TableHead className="text-right">Haber</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balanceCaja.filas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No hay movimientos para el rango seleccionado
                    </TableCell>
                  </TableRow>
                ) : (
                  balanceCaja.filas.map((fila) => (
                    <TableRow key={fila.cuenta}>
                      <TableCell className="font-medium">{fila.cuenta}</TableCell>
                      <TableCell className="text-right">{fila.debe ? formatCurrency(fila.debe) : "-"}</TableCell>
                      <TableCell className="text-right">{fila.haber ? formatCurrency(fila.haber) : "-"}</TableCell>
                    </TableRow>
                  ))
                )}
                <TableRow className="font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{formatCurrency(balanceCaja.totalDebe)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(balanceCaja.totalHaber)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold">Saldo del periodo</TableCell>
                  <TableCell colSpan={2} className="text-right font-semibold">
                    {formatCurrency(balanceCaja.saldoPeriodo)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cajas registradas</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Apertura</TableHead>
                  <TableHead className="text-right">Sistema</TableHead>
                  <TableHead className="text-right">Real</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                  <TableHead>Cierre</TableHead>
                  <TableHead className="w-[178px] no-print">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cajasFiltradas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No hay cajas para mostrar
                    </TableCell>
                  </TableRow>
                ) : (
                  cajasFiltradas.map((caja) => (
                    <TableRow key={caja.id}>
                      <TableCell>
                        <div className="font-medium">{format(new Date(`${caja.fecha}T00:00:00`), "dd/MM/yyyy")}</div>
                        <div className="text-xs text-muted-foreground">
                          {caja.abierto_at ? format(new Date(caja.abierto_at), "HH:mm") : "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={caja.estado === "abierta" ? "default" : "secondary"}>
                          {caja.estado === "abierta" ? "Abierta" : "Cerrada"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(caja.monto_apertura)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(caja.monto_cierre_sistema || 0))}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(caja.monto_cierre_real || 0))}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(Number(caja.diferencia || 0))}</TableCell>
                      <TableCell>{caja.cerrado_at ? format(new Date(caja.cerrado_at), "dd/MM/yyyy HH:mm") : "-"}</TableCell>
                      <TableCell className="no-print">
                        <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setSelectedCaja(caja)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                          {caja.estado === "cerrada" && (
                            <>
                              <Button type="button" variant="outline" size="sm" onClick={() => handleAbrirEdicion(caja)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleReabrirCaja(caja)}
                                disabled={reabrirCaja.isPending}
                              >
                                <Unlock className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button type="button" variant="destructive" size="sm" onClick={() => setDeletingCaja(caja)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(selectedCaja)} onOpenChange={(open) => !open && setSelectedCaja(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Detalle de caja</DialogTitle>
          </DialogHeader>
          {selectedCaja && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <p className="text-sm text-muted-foreground">Fecha</p>
                  <p className="font-semibold">{format(new Date(`${selectedCaja.fecha}T00:00:00`), "dd/MM/yyyy")}</p>
                  <p className="text-sm text-muted-foreground">
                    Apertura {selectedCaja.abierto_at ? format(new Date(selectedCaja.abierto_at), "HH:mm") : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Apertura</p>
                  <p className="font-semibold">{formatCurrency(selectedCaja.monto_apertura)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Real</p>
                  <p className="font-semibold">{formatCurrency(Number(selectedCaja.monto_cierre_real || 0))}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Diferencia</p>
                  <p className="font-semibold">{formatCurrency(Number(selectedCaja.diferencia || 0))}</p>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Ingresos por ventas</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hora</TableHead>
                      <TableHead>Comprobante</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Forma de pago</TableHead>
                      <TableHead>Detalle</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(selectedCaja.ventas || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          Sin ventas registradas para esta fecha
                        </TableCell>
                      </TableRow>
                    ) : (
                      (selectedCaja.ventas || []).map((venta) => (
                        <TableRow key={venta.id}>
                          <TableCell>{format(new Date(venta.fecha_venta), "HH:mm")}</TableCell>
                          <TableCell className="font-medium">{venta.numero_comprobante}</TableCell>
                          <TableCell>{venta.cliente_nombre || "Consumidor Final"}</TableCell>
                          <TableCell>{getVentaTipoPagoLabel(venta)}</TableCell>
                          <TableCell className="max-w-[280px]">
                            <div className="space-y-1">
                              {getPagosVenta(venta).map((pago, index) => (
                                <div key={pago.id || `${venta.id}-${index}`} className="text-sm text-muted-foreground">
                                  {formatPagoDetalle(pago)}
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(Number(venta.total || 0))}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Movimientos manuales</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Descripcion</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(selectedCaja.caja_movimientos || []).filter(esMovimientoManual).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Sin movimientos manuales
                      </TableCell>
                    </TableRow>
                  ) : (
                    (selectedCaja.caja_movimientos || []).filter(esMovimientoManual).map((movimiento) => (
                      <TableRow key={movimiento.id}>
                        <TableCell>{format(new Date(movimiento.fecha_movimiento || movimiento.created_at || selectedCaja.fecha), "dd/MM/yyyy HH:mm")}</TableCell>
                        <TableCell>{getCajaMovimientoLabel(movimiento.tipo)}</TableCell>
                        <TableCell>{movimiento.concepto}</TableCell>
                        <TableCell>{movimiento.descripcion || "-"}</TableCell>
                        <TableCell className="text-right">{formatCurrency(movimiento.monto)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingCaja)} onOpenChange={(open) => !open && setEditingCaja(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar cierre de caja</DialogTitle>
          </DialogHeader>
          {editingCaja && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Total sistema</Label>
                  <Input value={sistemaCierreEditado.toFixed(2)} readOnly />
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
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingCaja(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleActualizarCierre} disabled={actualizarCierreCaja.isPending}>
              {actualizarCierreCaja.isPending ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deletingCaja)} onOpenChange={(open) => !open && setDeletingCaja(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar caja</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion elimina la caja del {deletingCaja ? format(new Date(`${deletingCaja.fecha}T00:00:00`), "dd/MM/yyyy") : ""} y sus movimientos manuales. Las ventas no se eliminan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleEliminarCaja}
              disabled={eliminarCaja.isPending}
            >
              {eliminarCaja.isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ListadoCaja;
