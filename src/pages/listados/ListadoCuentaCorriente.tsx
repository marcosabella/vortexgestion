import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { FileText, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useComercio } from '@/hooks/useComercio';
import { useCuentaCorriente } from '@/hooks/useCuentaCorriente';
import { useToast } from '@/hooks/use-toast';
import { buildCuentaCorrientePdfFile } from '@/utils/cuentaCorrientePdf';

const ListadoCuentaCorriente = () => {
  const { getResumenCuentaCorreinte, movimientos, isLoading: isLoadingMovimientos } = useCuentaCorriente();
  const { data: resumen = [], isLoading } = getResumenCuentaCorreinte();
  const { comercio } = useComercio();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const clientesConSaldo = useMemo(() => {
    return resumen.filter((cliente) => cliente.saldo_actual !== 0);
  }, [resumen]);

  const filteredClientes = useMemo(() => {
    return clientesConSaldo.filter((cliente) => {
      const search = searchTerm.toLowerCase();
      const matchesSearch =
        cliente.cliente_nombre.toLowerCase().includes(search) ||
        cliente.cliente_apellido.toLowerCase().includes(search) ||
        cliente.cliente_cuit.includes(searchTerm);

      const matchesFecha = (() => {
        if (!cliente.ultimo_movimiento) return true;
        const fechaMov = new Date(cliente.ultimo_movimiento);
        if (fechaDesde && fechaMov < new Date(fechaDesde)) return false;
        if (fechaHasta && fechaMov > new Date(fechaHasta)) return false;
        return true;
      })();

      return matchesSearch && matchesFecha;
    });
  }, [clientesConSaldo, searchTerm, fechaDesde, fechaHasta]);

  const stats = useMemo(() => {
    const totalDeudores = filteredClientes.filter((cliente) => cliente.saldo_actual > 0).length;
    const totalAcreedores = filteredClientes.filter((cliente) => cliente.saldo_actual < 0).length;
    const totalSaldoDeudor = filteredClientes
      .filter((cliente) => cliente.saldo_actual > 0)
      .reduce((sum, cliente) => sum + cliente.saldo_actual, 0);
    const totalSaldoAcreedor = filteredClientes
      .filter((cliente) => cliente.saldo_actual < 0)
      .reduce((sum, cliente) => sum + Math.abs(cliente.saldo_actual), 0);

    return {
      totalDeudores,
      totalAcreedores,
      totalSaldoDeudor,
      totalSaldoAcreedor,
    };
  }, [filteredClientes]);

  const handlePrintReport = async (clienteId: string) => {
    const cliente = filteredClientes.find((item) => item.cliente_id === clienteId);
    if (!cliente) return;

    const file = await buildCuentaCorrientePdfFile(
      cliente,
      movimientos.filter((movimiento) => movimiento.cliente_id === clienteId),
      { comercio }
    );
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

  const clearFilters = () => {
    setSearchTerm('');
    setFechaDesde('');
    setFechaHasta('');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(amount);
  };

  if (isLoading || isLoadingMovimientos) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">Listado de Cuenta Corriente</h1>
          <p className="text-muted-foreground">Reporte de clientes con saldo pendiente</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Clientes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredClientes.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Deudores</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.totalDeudores}</div>
              <p className="text-xs text-muted-foreground mt-1">{formatCurrency(stats.totalSaldoDeudor)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Acreedores</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.totalAcreedores}</div>
              <p className="text-xs text-muted-foreground mt-1">{formatCurrency(stats.totalSaldoAcreedor)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Saldo Neto</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(stats.totalSaldoDeudor - stats.totalSaldoAcreedor)}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>Filtre los clientes por nombre, CUIT o fecha</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="search">Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Nombre, apellido o CUIT..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fechaDesde">Fecha Desde</Label>
                <Input
                  id="fechaDesde"
                  type="date"
                  value={fechaDesde}
                  onChange={(event) => setFechaDesde(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fechaHasta">Fecha Hasta</Label>
                <Input
                  id="fechaHasta"
                  type="date"
                  value={fechaHasta}
                  onChange={(event) => setFechaHasta(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>&nbsp;</Label>
                <Button onClick={clearFilters} variant="outline" className="w-full">
                  Limpiar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clientes con Saldo</CardTitle>
            <CardDescription>
              Mostrando {filteredClientes.length} de {clientesConSaldo.length} clientes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>CUIT</TableHead>
                    <TableHead className="text-right">Debitos</TableHead>
                    <TableHead className="text-right">Creditos</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Ult. Movimiento</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClientes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No hay clientes con saldo
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredClientes.map((cliente) => (
                      <TableRow key={cliente.cliente_id}>
                        <TableCell className="font-medium">
                          {cliente.cliente_nombre} {cliente.cliente_apellido}
                        </TableCell>
                        <TableCell>{cliente.cliente_cuit}</TableCell>
                        <TableCell className="text-right">{formatCurrency(cliente.total_debitos)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(cliente.total_creditos)}</TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={cliente.saldo_actual > 0 ? 'destructive' : 'default'}
                            className={cliente.saldo_actual < 0 ? 'bg-green-600' : ''}
                          >
                            {formatCurrency(Math.abs(cliente.saldo_actual))}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {cliente.ultimo_movimiento
                            ? format(new Date(cliente.ultimo_movimiento), 'dd/MM/yyyy')
                            : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" variant="outline" onClick={() => handlePrintReport(cliente.cliente_id)}>
                            <FileText className="h-4 w-4 mr-1" />
                            Reporte
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ListadoCuentaCorriente;
