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
import { Printer, TrendingUp, FileText, Users, DollarSign } from 'lucide-react';
import { TIPOS_COMPROBANTE, getVentaTipoPagoLabel } from '@/types/venta';

const ListadoVentas = () => {
  const { ventas, isLoading } = useVentas();
  const { data: clientes } = useClientes();
  
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [clienteFilter, setClienteFilter] = useState('todos');

  const ventasFiltradas = useMemo(() => {
    if (!ventas) return [];
    
    return ventas.filter(venta => {
      // Filtro por fecha
      if (fechaDesde || fechaHasta) {
        const fechaVenta = new Date(venta.fecha_venta);
        const desde = fechaDesde ? startOfDay(new Date(fechaDesde)) : new Date(0);
        const hasta = fechaHasta ? endOfDay(new Date(fechaHasta)) : new Date();
        
        if (!isWithinInterval(fechaVenta, { start: desde, end: hasta })) {
          return false;
        }
      }
      
      // Filtro por cliente
      if (clienteFilter !== 'todos' && venta.cliente_id !== clienteFilter) {
        return false;
      }
      
      return true;
    });
  }, [ventas, fechaDesde, fechaHasta, clienteFilter]);

  // Resumen general
  const resumenGeneral = useMemo(() => {
    const totalVentas = ventasFiltradas.reduce((sum, v) => sum + Number(v.total), 0);
    const cantidadVentas = ventasFiltradas.length;
    const ticketPromedio = cantidadVentas > 0 ? totalVentas / cantidadVentas : 0;
    
    return { totalVentas, cantidadVentas, ticketPromedio };
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
        cliente.total += Number(venta.total);
        cliente.cantidad += 1;
      } else {
        clientesMap.set(clienteId, {
          nombre: clienteNombre,
          total: Number(venta.total),
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
        comp.total += Number(venta.total);
        comp.cantidad += 1;
      } else {
        comprobantesMap.set(tipo, {
          label: tipoLabel,
          total: Number(venta.total),
          cantidad: 1
        });
      }
    });
    
    return Array.from(comprobantesMap.entries())
      .map(([tipo, data]) => ({ tipo, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [ventasFiltradas]);

  const handlePrint = () => {
    window.print();
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
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Reporte de Ventas</h1>
            <p className="text-muted-foreground">
              Análisis completo de ventas por fecha, cliente y tipo de comprobante
            </p>
          </div>
          <Button onClick={handlePrint} className="no-print">
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
                        {cliente.nombre} {cliente.apellido}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resumen General */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Ventas</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${resumenGeneral.totalVentas.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cantidad de Ventas</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{resumenGeneral.cantidadVentas}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ticket Promedio</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${resumenGeneral.ticketPromedio.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Ranking de Clientes */}
        <Card className="mb-6">
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
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Promedio</TableHead>
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
                      <TableCell>{cliente.nombre}</TableCell>
                      <TableCell className="text-right">{cliente.cantidad}</TableCell>
                      <TableCell className="text-right">
                        ${cliente.total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        ${(cliente.total / cliente.cantidad).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Ventas por Tipo de Comprobante */}
        <Card className="mb-6">
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
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Promedio</TableHead>
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
                      <TableCell className="text-right">{comp.cantidad}</TableCell>
                      <TableCell className="text-right">
                        ${comp.total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        ${(comp.total / comp.cantidad).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Detalle de Ventas */}
        <Card className="print-break">
          <CardHeader>
            <CardTitle>Detalle de Ventas</CardTitle>
            <p className="text-sm text-muted-foreground">
              Mostrando {ventasFiltradas.length} venta{ventasFiltradas.length !== 1 ? 's' : ''}
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>N° Comprobante</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Forma de Pago</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Total</TableHead>
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
                      <TableCell>
                        {format(new Date(venta.fecha_venta), 'dd/MM/yyyy HH:mm', { locale: es })}
                      </TableCell>
                      <TableCell className="font-medium">{venta.numero_comprobante}</TableCell>
                      <TableCell>
                        {TIPOS_COMPROBANTE.find(t => t.value === venta.tipo_comprobante)?.label || venta.tipo_comprobante}
                      </TableCell>
                      <TableCell>
                        {venta.cliente 
                          ? `${venta.cliente.nombre} ${venta.cliente.apellido}`
                          : venta.cliente_nombre || 'Consumidor Final'}
                      </TableCell>
                      <TableCell>{getVentaTipoPagoLabel(venta)}</TableCell>
                      <TableCell className="text-right">
                        ${Number(venta.subtotal).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        ${Number(venta.total_iva).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${Number(venta.total).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ListadoVentas;
