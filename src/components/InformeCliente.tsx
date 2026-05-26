import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, TrendingUp, ShoppingCart, DollarSign, CircleAlert as AlertCircle, Printer, Loader2 } from "lucide-react";
import { Cliente } from "@/types/cliente";
import { format, subMonths, subYears, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface InformeClienteProps {
  cliente: Cliente;
}

type PeriodoType = "mes_actual" | "mes_anterior" | "ultimos_3_meses" | "ultimos_6_meses" | "anio_actual" | "historico";

export function InformeCliente({ cliente }: InformeClienteProps) {
  const [periodo, setPeriodo] = useState<PeriodoType>("historico");

  const getFechaRango = () => {
    const hoy = new Date();
    switch (periodo) {
      case "mes_actual":
        return { desde: startOfMonth(hoy), hasta: endOfMonth(hoy) };
      case "mes_anterior":
        const mesAnterior = subMonths(hoy, 1);
        return { desde: startOfMonth(mesAnterior), hasta: endOfMonth(mesAnterior) };
      case "ultimos_3_meses":
        return { desde: subMonths(hoy, 3), hasta: hoy };
      case "ultimos_6_meses":
        return { desde: subMonths(hoy, 6), hasta: hoy };
      case "anio_actual":
        return { desde: new Date(hoy.getFullYear(), 0, 1), hasta: hoy };
      case "historico":
        return { desde: new Date(2000, 0, 1), hasta: hoy };
      default:
        return { desde: startOfMonth(hoy), hasta: endOfMonth(hoy) };
    }
  };

  const rango = getFechaRango();

  // Fetch movimientos de cuenta corriente
  const { data: movimientos = [], isLoading: loadingMovimientos } = useQuery({
    queryKey: ['cuenta-corriente-cliente', cliente.id, periodo],
    queryFn: async () => {
      if (!cliente.id) return [];
      
      const { data, error } = await supabase
        .from('cuenta_corriente')
        .select('*')
        .eq('cliente_id', cliente.id)
        .gte('fecha_movimiento', rango.desde.toISOString())
        .lte('fecha_movimiento', rango.hasta.toISOString())
        .order('fecha_movimiento', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!cliente.id,
  });

  // Fetch ventas del cliente
  const { data: ventas = [], isLoading: loadingVentas } = useQuery({
    queryKey: ['ventas-cliente', cliente.id, periodo],
    queryFn: async () => {
      if (!cliente.id) return [];
      
      const { data, error } = await supabase
        .from('ventas')
        .select(`
          *,
          venta_items (
            *,
            producto:productos (descripcion)
          )
        `)
        .eq('cliente_id', cliente.id)
        .gte('fecha_venta', rango.desde.toISOString())
        .lte('fecha_venta', rango.hasta.toISOString())
        .order('fecha_venta', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!cliente.id,
  });

  // Fetch saldo actual (todos los movimientos para calcular saldo)
  const { data: todosMovimientos = [] } = useQuery({
    queryKey: ['cuenta-corriente-cliente-total', cliente.id],
    queryFn: async () => {
      if (!cliente.id) return [];
      
      const { data, error } = await supabase
        .from('cuenta_corriente')
        .select('*')
        .eq('cliente_id', cliente.id)
        .order('fecha_movimiento', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!cliente.id,
  });

  // Fetch total de clientes para ranking
  const { data: totalClientes = 0 } = useQuery({
    queryKey: ['total-clientes'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('clientes')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      return count || 0;
    },
  });

  // Calcular estadísticas reales
  const estadisticas = useMemo(() => {
    // Calcular saldo cuenta corriente
    let saldoCuentaCorriente = 0;
    todosMovimientos.forEach(mov => {
      if (mov.tipo_movimiento === 'debito' || mov.tipo_movimiento === 'venta') {
        saldoCuentaCorriente += Number(mov.monto);
      } else if (mov.tipo_movimiento === 'credito' || mov.tipo_movimiento === 'pago') {
        saldoCuentaCorriente -= Number(mov.monto);
      }
    });

    // Total ventas y monto
    const totalVentas = ventas.length;
    const totalComprado = ventas.reduce((acc, v) => acc + Number(v.total), 0);

    // Productos más comprados
    const productosCount: Record<string, { nombre: string; cantidad: number }> = {};
    ventas.forEach(venta => {
      venta.venta_items?.forEach((item: any) => {
        const nombre = item.producto?.descripcion || item.descripcion_manual || 'Item manual';
        if (!productosCount[nombre]) {
          productosCount[nombre] = { nombre, cantidad: 0 };
        }
        productosCount[nombre].cantidad += item.cantidad;
      });
    });
    
    const productosOrdenados = Object.values(productosCount).sort((a, b) => b.cantidad - a.cantidad);
    const productoMasComprado = productosOrdenados[0]?.nombre || 'Sin compras';
    const cantidadProductoMasComprado = productosOrdenados[0]?.cantidad || 0;

    // Días de atraso (simplificado - si tiene saldo pendiente mayor a 30 días)
    let diasAtraso = 0;
    if (saldoCuentaCorriente > 0 && todosMovimientos.length > 0) {
      const ultimoMovimiento = todosMovimientos[todosMovimientos.length - 1];
      const fechaUltimo = new Date(ultimoMovimiento.fecha_movimiento);
      const hoy = new Date();
      const diffTime = Math.abs(hoy.getTime() - fechaUltimo.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 30) {
        diasAtraso = diffDays - 30;
      }
    }

    return {
      saldoCuentaCorriente,
      totalVentas,
      totalComprado,
      productoMasComprado,
      cantidadProductoMasComprado,
      diasAtraso,
      ranking: 0, // Se calcularía con un query más complejo
      totalClientes,
      productosOrdenados,
    };
  }, [ventas, todosMovimientos, totalClientes]);

  // Preparar movimientos con saldo acumulado
  const movimientosConSaldo = useMemo(() => {
    let saldoAcumulado = 0;
    
    // Ordenar por fecha ascendente para calcular saldo
    const movOrdenados = [...movimientos].sort((a, b) => 
      new Date(a.fecha_movimiento).getTime() - new Date(b.fecha_movimiento).getTime()
    );
    
    const conSaldo = movOrdenados.map(mov => {
      const monto = Number(mov.monto);
      if (mov.tipo_movimiento === 'debito' || mov.tipo_movimiento === 'venta') {
        saldoAcumulado += monto;
      } else {
        saldoAcumulado -= monto;
      }
      return {
        ...mov,
        saldoAcumulado,
        montoDisplay: mov.tipo_movimiento === 'debito' || mov.tipo_movimiento === 'venta' ? monto : -monto,
      };
    });
    
    // Devolver en orden descendente (más reciente primero)
    return conSaldo.reverse();
  }, [movimientos]);

  const handlePrint = () => {
    window.print();
  };

  const isLoading = loadingMovimientos || loadingVentas;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Cargando datos...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <div className="space-y-1">
            <Label>Período de Análisis</Label>
            <Select value={periodo} onValueChange={(val) => setPeriodo(val as PeriodoType)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mes_actual">Mes Actual</SelectItem>
                <SelectItem value="mes_anterior">Mes Anterior</SelectItem>
                <SelectItem value="ultimos_3_meses">Últimos 3 Meses</SelectItem>
                <SelectItem value="ultimos_6_meses">Últimos 6 Meses</SelectItem>
                <SelectItem value="anio_actual">Año Actual</SelectItem>
                <SelectItem value="historico">Histórico Completo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button variant="outline" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" />
          Imprimir
        </Button>
      </div>

      <div className="text-sm text-muted-foreground">
        Período: {format(rango.desde, "dd/MM/yyyy", { locale: es })} - {format(rango.hasta, "dd/MM/yyyy", { locale: es })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Cuenta Corriente</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${estadisticas.saldoCuentaCorriente > 0 ? 'text-red-600' : estadisticas.saldoCuentaCorriente < 0 ? 'text-green-600' : ''}`}>
              ${estadisticas.saldoCuentaCorriente.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {estadisticas.saldoCuentaCorriente > 0 ? 'Deuda pendiente' : estadisticas.saldoCuentaCorriente < 0 ? 'Saldo a favor' : 'Sin saldo'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Ventas</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{estadisticas.totalVentas}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total: ${estadisticas.totalComprado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Producto Más Comprado</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold truncate" title={estadisticas.productoMasComprado}>
              {estadisticas.productoMasComprado}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {estadisticas.cantidadProductoMasComprado} unidades
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Estado de Cuenta</CardTitle>
            <AlertCircle className={`h-4 w-4 ${estadisticas.diasAtraso > 0 ? 'text-red-500' : 'text-green-500'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${estadisticas.diasAtraso > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {estadisticas.diasAtraso > 0 ? `${estadisticas.diasAtraso} días` : 'Al día'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {estadisticas.diasAtraso > 0 ? 'de atraso' : 'Sin atrasos'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="movimientos" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="productos">Productos Comprados</TabsTrigger>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
        </TabsList>

        <TabsContent value="movimientos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Historial de Movimientos</CardTitle>
            </CardHeader>
            <CardContent>
              {movimientosConSaldo.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay movimientos en el período seleccionado
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Concepto</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimientosConSaldo.map((mov) => (
                      <TableRow key={mov.id}>
                        <TableCell>{format(new Date(mov.fecha_movimiento), "dd/MM/yyyy", { locale: es })}</TableCell>
                        <TableCell>
                          <Badge variant={mov.tipo_movimiento === 'debito' || mov.tipo_movimiento === 'venta' ? "destructive" : "default"}>
                            {mov.tipo_movimiento === 'debito' || mov.tipo_movimiento === 'venta' ? "Débito" : "Crédito"}
                          </Badge>
                        </TableCell>
                        <TableCell>{mov.concepto}</TableCell>
                        <TableCell className={`text-right ${mov.montoDisplay > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {mov.montoDisplay > 0 ? '+' : ''}{mov.montoDisplay.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ${mov.saldoAcumulado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="productos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Productos Más Comprados</CardTitle>
            </CardHeader>
            <CardContent>
              {estadisticas.productosOrdenados.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay compras en el período seleccionado
                </p>
              ) : (
                <div className="space-y-3">
                  {estadisticas.productosOrdenados.slice(0, 10).map((producto, index) => (
                    <div key={producto.nombre} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-muted-foreground">#{index + 1}</span>
                        <div>
                          <p className="font-medium">{producto.nombre}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold">{producto.cantidad}</p>
                        <p className="text-sm text-muted-foreground">unidades</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resumen" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Resumen del Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Saldo Pendiente</p>
                  <p className={`text-lg font-semibold ${estadisticas.saldoCuentaCorriente > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    ${estadisticas.saldoCuentaCorriente.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Comprado</p>
                  <p className="text-lg font-semibold">${estadisticas.totalComprado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Cantidad de Ventas</p>
                  <p className="text-lg font-semibold">{estadisticas.totalVentas}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Promedio por Venta</p>
                  <p className="text-lg font-semibold">
                    ${estadisticas.totalVentas > 0 
                      ? (estadisticas.totalComprado / estadisticas.totalVentas).toLocaleString('es-AR', { minimumFractionDigits: 2 })
                      : '0,00'
                    }
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-2">Estado de Cuenta</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <Badge variant={estadisticas.saldoCuentaCorriente <= 0 ? "default" : "destructive"}>
                      {estadisticas.saldoCuentaCorriente <= 0 ? "Sin deuda" : "Con deuda"}
                    </Badge>
                    <span>
                      {estadisticas.saldoCuentaCorriente <= 0
                        ? "El cliente no tiene saldo pendiente"
                        : `Saldo pendiente: $${estadisticas.saldoCuentaCorriente.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Badge variant={estadisticas.diasAtraso === 0 ? "default" : "destructive"}>
                      {estadisticas.diasAtraso === 0 ? "Al día" : "Atrasado"}
                    </Badge>
                    <span>
                      {estadisticas.diasAtraso === 0
                        ? "No presenta atrasos en pagos"
                        : `Presenta ${estadisticas.diasAtraso} días de atraso`}
                    </span>
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
