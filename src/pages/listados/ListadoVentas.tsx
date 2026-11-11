import { mostrarEnMayusculas } from "@/utils/textoPresentacion";
import { useState, useMemo } from 'react';
import { useVentas } from '@/hooks/useVentas';
import { useClientes } from '@/hooks/useClientes';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ReportPrintHeader } from '@/components/ReportPrintHeader';
import { Printer, TrendingUp, FileText, Users, DollarSign } from 'lucide-react';
import { TIPOS_COMPROBANTE, discriminaIvaEnComprobante, formatNumeroComprobante, getVentaTipoPagoLabel, getVentaImporteContable } from '@/types/venta';
import { useComercio } from '@/hooks/useComercio';
import { useAfipConfig } from '@/hooks/useAfipConfig';
import { useToast } from '@/hooks/use-toast';
import { buildListadoVentasPdfFile } from '@/utils/listadoVentasPdf';

const parseLocalDateInput = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const ListadoVentas = () => {
  const { ventas, isLoading } = useVentas();
  const { data: clientes } = useClientes();
  const { comercio } = useComercio();
  const { data: afipConfig } = useAfipConfig();
  const { toast } = useToast();
  
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [clienteFilter, setClienteFilter] = useState('todos');
  const [tiposComprobante, setTiposComprobante] = useState<string[] | null>(null);
  const tiposDisponibles = useMemo(() => TIPOS_COMPROBANTE.filter(t => ventas?.some(v => v.tipo_comprobante === t.value)), [ventas]);
  const tiposSeleccionados = tiposDisponibles.filter(t => tiposComprobante === null || tiposComprobante.includes(t.value)).map(t => t.value);
  const [incluirResumenComprobantes, setIncluirResumenComprobantes] = useState(true);
  const [incluirRankingClientes, setIncluirRankingClientes] = useState(true);

  const ventasFiltradas = useMemo(() => {
    if (!ventas) return [];
    
    return ventas.filter(venta => {
      if (tiposComprobante && !tiposComprobante.includes(venta.tipo_comprobante)) return false;
      // Filtro por fecha
      if (fechaDesde || fechaHasta) {
        const fechaVenta = /^\d{4}-\d{2}-\d{2}$/.test(venta.fecha_venta) ? parseLocalDateInput(venta.fecha_venta) : new Date(venta.fecha_venta);
        // El input date no incluye zona horaria. new Date("AAAA-MM-DD") se
        // interpreta como UTC y en Argentina desplaza el rango al dia anterior.
        const desde = fechaDesde ? startOfDay(parseLocalDateInput(fechaDesde)) : new Date(0);
        const hasta = fechaHasta ? endOfDay(parseLocalDateInput(fechaHasta)) : new Date();
        
        if (!isWithinInterval(fechaVenta, { start: desde, end: hasta })) {
          return false;
        }
      }
      
      // Filtro por cliente
      if (clienteFilter !== 'todos' && venta.cliente_id !== clienteFilter) {
        return false;
      }
      
      return true;
    }).sort((a, b) => {
      const dateDifference = new Date(b.fecha_venta).getTime() - new Date(a.fecha_venta).getTime();
      if (dateDifference !== 0) return dateDifference;
      return Number(b.numero_comprobante) - Number(a.numero_comprobante);
    });
  }, [ventas, fechaDesde, fechaHasta, clienteFilter, tiposComprobante]);

  // Resumen general
  const resumenGeneral = useMemo(() => {
    const totalVentas = ventasFiltradas.reduce((sum, v) => sum + getVentaImporteContable(v), 0);
    const cantidadVentas = ventasFiltradas.length;
    const ticketPromedio = cantidadVentas > 0 ? totalVentas / cantidadVentas : 0;
    
    const totalNeto = ventasFiltradas.reduce((sum, v) => sum + (discriminaIvaEnComprobante(v.tipo_comprobante) ? Number(v.subtotal) : 0), 0);
    const totalIva = ventasFiltradas.reduce((sum, v) => sum + (discriminaIvaEnComprobante(v.tipo_comprobante) ? Number(v.total_iva) : 0), 0);
    return { totalVentas, cantidadVentas, ticketPromedio, totalNeto, totalIva };
  }, [ventasFiltradas]);

  // Ranking por clientes
  const rankingClientes = useMemo(() => {
    const clientesMap = new Map<string, { nombre: string; total: number; cantidad: number }>();
    
    ventasFiltradas.forEach(venta => {
      const clienteId = venta.cliente_id || 'sin-cliente';
      const clienteNombre = venta.cliente 
        ? `${venta.cliente.nombre} ${venta.cliente.apellido}`
        : venta.cliente_nombre || 'Consumidor Final';
      
      if (clientesMap.has(clienteId)) {
        const cliente = clientesMap.get(clienteId)!;
        cliente.total += getVentaImporteContable(venta);
        cliente.cantidad += 1;
      } else {
        clientesMap.set(clienteId, {
          nombre: clienteNombre,
          total: getVentaImporteContable(venta),
          cantidad: 1
        });
      }
    });
    
    return Array.from(clientesMap.values())
      .sort((a, b) => b.total - a.total);
  }, [ventasFiltradas]);

  // Ventas por tipo de comprobante
  const ventasPorComprobante = useMemo(() => {
    const comprobantesMap = new Map<string, { label: string; total: number; cantidad: number }>();
    
    ventasFiltradas.forEach(venta => {
      const tipo = venta.tipo_comprobante;
      const tipoLabel = TIPOS_COMPROBANTE.find(t => t.value === tipo)?.label || tipo;
      
      if (comprobantesMap.has(tipo)) {
        const comp = comprobantesMap.get(tipo)!;
        comp.total += getVentaImporteContable(venta);
        comp.cantidad += 1;
      } else {
        comprobantesMap.set(tipo, {
          label: tipoLabel,
          total: getVentaImporteContable(venta),
          cantidad: 1
        });
      }
    });
    
    return Array.from(comprobantesMap.entries())
      .map(([tipo, data]) => ({ tipo, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [ventasFiltradas]);

  const getRangoLabel = () => {
    if (fechaDesde && fechaHasta) {
      return `${format(new Date(`${fechaDesde}T00:00:00`), 'dd/MM/yyyy')} al ${format(new Date(`${fechaHasta}T00:00:00`), 'dd/MM/yyyy')}`;
    }
    if (fechaDesde) return `Desde ${format(new Date(`${fechaDesde}T00:00:00`), 'dd/MM/yyyy')}`;
    if (fechaHasta) return `Hasta ${format(new Date(`${fechaHasta}T00:00:00`), 'dd/MM/yyyy')}`;
    return 'Todos los periodos';
  };

  const handlePrint = async () => {
    const file = await buildListadoVentasPdfFile(ventasFiltradas, {
      comercio,
      rango: getRangoLabel(),
      incluirResumenComprobantes,
      incluirRankingClientes,
    });
    const url = URL.createObjectURL(file);
    const pdfWindow = window.open(url, '_blank');

    if (!pdfWindow) {
      URL.revokeObjectURL(url);
      toast({
        title: 'No se pudo abrir el PDF',
        description: 'Revise si el navegador bloqueo la ventana emergente.',
        variant: 'destructive',
      });
      return;
    }

    pdfWindow.opener = null;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <p className="text-muted-foreground">Cargando reporte de ventas...</p>
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
            .print-break { page-break-after: always; }
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          }
        `}
      </style>
      
      <div className="max-w-7xl mx-auto">
        <ReportPrintHeader />
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Reporte de Ventas</h1>
            <p className="text-muted-foreground">
              Análisis completo de ventas por fecha, cliente y tipo de comprobante
            </p>
          </div>
          <Button variant="print" onClick={handlePrint} className="no-print">
            <Printer className="mr-2 h-4 w-4" />
            Imprimir Reporte
          </Button>
        </div>

        {/* Filtros */}
        <Card className="mb-6 no-print">
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="fechaDesde">Fecha Desde</Label>
                <Input
                  id="fechaDesde"
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="fechaHasta">Fecha Hasta</Label>
                <Input
                  id="fechaHasta"
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="cliente">Cliente</Label>
                <Select value={clienteFilter} onValueChange={setClienteFilter}>
                  <SelectTrigger id="cliente">
                    <SelectValue placeholder="Todos los clientes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los clientes</SelectItem>
                    {clientes?.map((cliente) => (
                      <SelectItem key={cliente.id} value={cliente.id!}>
                        {mostrarEnMayusculas(cliente.nombre)} {mostrarEnMayusculas(cliente.apellido)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4 grid items-end gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="tipos-comprobante">Tipos de comprobante</Label>
                <Popover><PopoverTrigger asChild><Button id="tipos-comprobante" disabled={!tiposDisponibles.length} variant="outline" className="w-full justify-start">{!tiposDisponibles.length ? 'Sin comprobantes emitidos' : tiposSeleccionados.length === tiposDisponibles.length ? 'Todos los comprobantes' : tiposSeleccionados.length === 0 ? 'Ningún comprobante seleccionado' : tiposSeleccionados.length + ' tipos seleccionados'}</Button></PopoverTrigger>
                  <PopoverContent className="w-80 space-y-3" align="start" side="bottom" avoidCollisions={false}><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setTiposComprobante(null)}>Todos</Button><Button size="sm" variant="outline" onClick={() => setTiposComprobante([])}>Ninguno</Button></div><div className="max-h-72 space-y-3 overflow-y-auto" role="group" aria-label="Tipos de comprobante">{tiposDisponibles.map(t => <label key={t.value} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={tiposSeleccionados.includes(t.value)} onCheckedChange={checked => setTiposComprobante(actual => checked === true ? [...(actual ?? tiposDisponibles.map(tipo => tipo.value)), t.value] : (actual ?? tiposDisponibles.map(tipo => tipo.value)).filter(tipo => tipo !== t.value))} />{t.label}</label>)}</div></PopoverContent>
                </Popover>
              </div>
              <fieldset className="min-w-0"><legend className="mb-2 text-sm font-medium">Secciones del reporte</legend><div className="flex h-10 items-center gap-6 overflow-x-auto"><label className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-sm"><Checkbox checked={incluirResumenComprobantes} onCheckedChange={value => setIncluirResumenComprobantes(value === true)} />Resumen por comprobante</label><label className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-sm"><Checkbox checked={incluirRankingClientes} onCheckedChange={value => setIncluirRankingClientes(value === true)} />Ranking de clientes</label></div></fieldset>
            </div>
          </CardContent>
        </Card>

        {/* Resumen General */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="border-emerald-200 bg-emerald-50 text-emerald-950 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-emerald-800">Total Ventas</CardTitle>
              <DollarSign className="h-4 w-4 text-emerald-700" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${resumenGeneral.totalVentas.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-blue-200 bg-blue-50 text-blue-950 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-800">Cantidad de Ventas</CardTitle>
              <FileText className="h-4 w-4 text-blue-700" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{resumenGeneral.cantidadVentas}</div>
            </CardContent>
          </Card>
          
          <Card className="border-amber-200 bg-amber-50 text-amber-950 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-amber-800">Ticket Promedio</CardTitle>
              <TrendingUp className="h-4 w-4 text-amber-700" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${resumenGeneral.ticketPromedio.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Ranking de Clientes */}
        {incluirRankingClientes && <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Ranking de Ventas por Cliente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right whitespace-nowrap tabular-nums">Cantidad</TableHead>
                  <TableHead className="text-right whitespace-nowrap tabular-nums">Total</TableHead>
                  <TableHead className="text-right whitespace-nowrap tabular-nums">Promedio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankingClientes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No hay datos para mostrar
                    </TableCell>
                  </TableRow>
                ) : (
                  rankingClientes.map((cliente, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell>{mostrarEnMayusculas(cliente.nombre)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">{cliente.cantidad}</TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        ${cliente.total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        ${(cliente.total / cliente.cantidad).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>}

        {/* Ventas por Tipo de Comprobante */}
        {incluirResumenComprobantes && <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Ventas por Tipo de Comprobante
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo de Comprobante</TableHead>
                  <TableHead className="text-right whitespace-nowrap tabular-nums">Cantidad</TableHead>
                  <TableHead className="text-right whitespace-nowrap tabular-nums">Total</TableHead>
                  <TableHead className="text-right whitespace-nowrap tabular-nums">Promedio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventasPorComprobante.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No hay datos para mostrar
                    </TableCell>
                  </TableRow>
                ) : (
                  ventasPorComprobante.map((comp) => (
                    <TableRow key={comp.tipo}>
                      <TableCell className="font-medium">{comp.label}</TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">{comp.cantidad}</TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        ${comp.total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        ${(comp.total / comp.cantidad).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>}

        {/* Detalle de Ventas */}
        <Card className="print-break">
          <CardHeader>
            <CardTitle>Detalle de Ventas</CardTitle>
            <p className="text-sm text-muted-foreground">
              Mostrando {ventasFiltradas.length} venta{ventasFiltradas.length !== 1 ? 's' : ''}
            </p>
          </CardHeader>
          <CardContent>
            <Table aria-label="Detalle de ventas">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-px whitespace-nowrap">Fecha</TableHead>
                  <TableHead className="w-px whitespace-nowrap">N° Comprobante</TableHead>
                  <TableHead className="w-px whitespace-nowrap">Tipo</TableHead>
                  <TableHead className="w-[180px] max-w-[180px]">Cliente</TableHead>
                  <TableHead className="whitespace-nowrap">Forma de Pago</TableHead>
                  <TableHead className="text-right whitespace-nowrap tabular-nums">Subtotal neto</TableHead>
                  <TableHead className="text-right whitespace-nowrap tabular-nums">IVA</TableHead>
                  <TableHead className="text-right whitespace-nowrap tabular-nums">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventasFiltradas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No hay ventas para mostrar con los filtros seleccionados
                    </TableCell>
                  </TableRow>
                ) : (
                  ventasFiltradas.map((venta) => (
                    <TableRow key={venta.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(/^\d{4}-\d{2}-\d{2}$/.test(venta.fecha_venta) ? parseLocalDateInput(venta.fecha_venta) : new Date(venta.fecha_venta), 'dd/MM/yyyy', { locale: es })}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium">
                        {formatNumeroComprobante(venta.numero_comprobante, afipConfig?.punto_venta, venta.tipo_comprobante)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {TIPOS_COMPROBANTE.find(t => t.value === venta.tipo_comprobante)?.label || venta.tipo_comprobante}
                      </TableCell>
                      <TableCell className="w-[180px] max-w-[180px]">
                        <div
                          className="truncate"
                          title={venta.cliente
                            ? `${mostrarEnMayusculas(venta.cliente.nombre)} ${mostrarEnMayusculas(venta.cliente.apellido)}`
                            : mostrarEnMayusculas(venta.cliente_nombre) || 'Consumidor Final'}
                        >
                          {venta.cliente
                            ? `${mostrarEnMayusculas(venta.cliente.nombre)} ${mostrarEnMayusculas(venta.cliente.apellido)}`
                            : mostrarEnMayusculas(venta.cliente_nombre) || 'Consumidor Final'}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{getVentaTipoPagoLabel(venta)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {discriminaIvaEnComprobante(venta.tipo_comprobante)
                          ? `$${Number(venta.subtotal).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {discriminaIvaEnComprobante(venta.tipo_comprobante)
                          ? `$${Number(venta.total_iva).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums font-medium">
                        ${getVentaImporteContable(venta).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
                <TableRow className="bg-muted/50 font-semibold"><TableCell colSpan={5}>Totales</TableCell><TableCell className="whitespace-nowrap text-right tabular-nums">{resumenGeneral.totalNeto.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</TableCell><TableCell className="whitespace-nowrap text-right tabular-nums">{resumenGeneral.totalIva.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</TableCell><TableCell className="whitespace-nowrap text-right tabular-nums">{resumenGeneral.totalVentas.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</TableCell></TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ListadoVentas;
