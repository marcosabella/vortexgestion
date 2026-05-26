import { useState, useMemo } from "react";
import { useProductosReport } from "@/hooks/useProductosReport";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Search, Package, AlertCircle, TrendingUp, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const ListadoProductos = () => {
  const { productos, estadisticas, isLoading } = useProductosReport();
  const [searchTerm, setSearchTerm] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "in-stock" | "out-of-stock">("all");
  const [sortBy, setSortBy] = useState<"descripcion" | "mas-vendido" | "valor-stock-costo" | "valor-stock-venta">("descripcion");

  const productosFiltrados = useMemo(() => {
    let filtered = [...productos];

    // Filtro de búsqueda
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.descripcion.toLowerCase().includes(search) ||
          p.cod_producto.toLowerCase().includes(search) ||
          p.marca?.nombre.toLowerCase().includes(search)
      );
    }

    // Filtro de stock
    if (stockFilter === "in-stock") {
      filtered = filtered.filter((p) => p.stock > 0);
    } else if (stockFilter === "out-of-stock") {
      filtered = filtered.filter((p) => p.stock === 0);
    }

    // Ordenamiento
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "mas-vendido":
          return b.unidades_vendidas - a.unidades_vendidas;
        case "valor-stock-costo":
          return b.valor_stock_costo - a.valor_stock_costo;
        case "valor-stock-venta":
          return b.valor_stock_venta - a.valor_stock_venta;
        case "descripcion":
        default:
          return a.descripcion.localeCompare(b.descripcion);
      }
    });

    return filtered;
  }, [productos, searchTerm, stockFilter, sortBy]);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <style>
        {`
          @media print {
            body * {
              visibility: hidden;
            }
            .print-area, .print-area * {
              visibility: visible;
            }
            .print-area {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
            }
            .no-print {
              display: none !important;
            }
            .print-title {
              margin-bottom: 20px;
            }
            table {
              font-size: 10px;
            }
            th, td {
              padding: 4px !important;
            }
          }
        `}
      </style>

      {/* Header */}
      <div className="flex justify-between items-start no-print">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Reporte de Productos</h1>
          <p className="text-muted-foreground">
            Análisis completo del inventario y ventas
          </p>
        </div>
        <Button onClick={handlePrint} className="gap-2">
          <Printer className="h-4 w-4" />
          Imprimir Reporte
        </Button>
      </div>

      <div className="print-area">
        <h1 className="print-title text-2xl font-bold hidden print:block mb-6">Reporte de Productos</h1>

        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Productos</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{estadisticas?.totalProductos || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sin Stock</CardTitle>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {estadisticas?.productosSinStock || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Más Vendido</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm font-bold truncate">
                {estadisticas?.productoMasVendido.descripcion}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {estadisticas?.productoMasVendido.unidades} unidades
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Valor Total Stock</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm font-bold">
                Costo: ${estadisticas?.valorTotalStockCosto.toFixed(2)}
              </div>
              <div className="text-sm font-bold text-primary mt-1">
                Venta: ${estadisticas?.valorTotalStockVenta.toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card className="mb-6 no-print">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="search">Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Descripción, código o marca..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="stock-filter">Stock</Label>
                <Select value={stockFilter} onValueChange={(value: any) => setStockFilter(value)}>
                  <SelectTrigger id="stock-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los productos</SelectItem>
                    <SelectItem value="in-stock">Con stock</SelectItem>
                    <SelectItem value="out-of-stock">Sin stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sort-by">Ordenar por</Label>
                <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                  <SelectTrigger id="sort-by">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="descripcion">Descripción</SelectItem>
                    <SelectItem value="mas-vendido">Más vendido</SelectItem>
                    <SelectItem value="valor-stock-costo">Valor stock (costo)</SelectItem>
                    <SelectItem value="valor-stock-venta">Valor stock (venta)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 text-sm text-muted-foreground">
              Mostrando {productosFiltrados.length} de {productos.length} productos
            </div>
          </CardContent>
        </Card>

        {/* Tabla de productos */}
        <Card>
          <CardHeader>
            <CardTitle>Detalle de Productos</CardTitle>
          </CardHeader>
          <CardContent>
            {productosFiltrados.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No se encontraron productos que coincidan con los filtros
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Rubro</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">P. Costo</TableHead>
                      <TableHead className="text-right">P. Venta</TableHead>
                      <TableHead className="text-right">Valor Stock (Costo)</TableHead>
                      <TableHead className="text-right">Valor Stock (Venta)</TableHead>
                      <TableHead className="text-right">Unid. Vendidas</TableHead>
                      <TableHead>Última Venta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productosFiltrados.map((producto) => (
                      <TableRow key={producto.id}>
                        <TableCell className="font-mono text-xs">{producto.cod_producto}</TableCell>
                        <TableCell className="font-medium">{producto.descripcion}</TableCell>
                        <TableCell>{producto.marca?.nombre}</TableCell>
                        <TableCell>{producto.rubro?.nombre}</TableCell>
                        <TableCell className={`text-right font-medium ${producto.stock === 0 ? 'text-destructive' : ''}`}>
                          {producto.stock}
                          {producto.stock === 0 && (
                            <span className="ml-1 text-xs">(Sin stock)</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">${producto.precio_costo.toFixed(2)}</TableCell>
                        <TableCell className="text-right">${producto.precio_venta.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium">
                          ${producto.valor_stock_costo.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-primary">
                          ${producto.valor_stock_venta.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">{producto.unidades_vendidas}</TableCell>
                        <TableCell>
                          {producto.ultima_venta
                            ? format(new Date(producto.ultima_venta), "dd/MM/yyyy", { locale: es })
                            : "Nunca"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ListadoProductos;
