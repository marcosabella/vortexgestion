import { useState, useMemo } from "react";
import { useClientes } from "@/hooks/useClientes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileDown, Search, Users, Building2, UserCheck, Filter, Printer, FileText } from "lucide-react";
import { PROVINCIAS_ARGENTINA, SITUACIONES_AFIP } from "@/types/cliente";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Cliente } from "@/types/cliente";
import { InformeCliente } from "@/components/InformeCliente";

const ListadoClientes = () => {
  const { data: clientes, isLoading } = useClientes();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterProvincia, setFilterProvincia] = useState<string>("todas");
  const [filterSituacionAfip, setFilterSituacionAfip] = useState<string>("todas");
  const [filterTipoPersona, setFilterTipoPersona] = useState<string>("todas");
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);

  const handleOpenReport = (cliente: Cliente) => {
    setSelectedCliente(cliente);
    setIsReportOpen(true);
  };

  // Filtrar y buscar clientes
  const filteredClientes = useMemo(() => {
    if (!clientes) return [];
    
    return clientes.filter((cliente) => {
      const matchSearch = 
        cliente.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cliente.apellido.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cliente.cuit.includes(searchTerm) ||
        cliente.localidad.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchProvincia = filterProvincia === "todas" || cliente.provincia === filterProvincia;
      const matchSituacion = filterSituacionAfip === "todas" || cliente.situacion_afip === filterSituacionAfip;
      const matchTipo = filterTipoPersona === "todas" || cliente.tipo_persona === filterTipoPersona;
      
      return matchSearch && matchProvincia && matchSituacion && matchTipo;
    });
  }, [clientes, searchTerm, filterProvincia, filterSituacionAfip, filterTipoPersona]);

  // Estadísticas
  const stats = useMemo(() => {
    if (!clientes) return { total: 0, fisicas: 0, juridicas: 0 };
    
    return {
      total: clientes.length,
      fisicas: clientes.filter(c => c.tipo_persona === 'fisica').length,
      juridicas: clientes.filter(c => c.tipo_persona === 'juridica').length,
    };
  }, [clientes]);

  // Función de exportación a CSV
  const exportToCSV = () => {
    if (!filteredClientes || filteredClientes.length === 0) return;

    const headers = ["Nombre", "Apellido", "CUIT", "Dirección", "Localidad", "Provincia", "CP", "Teléfono", "Email", "Situación AFIP", "Tipo Persona"];
    const csvData = filteredClientes.map(cliente => [
      cliente.nombre,
      cliente.apellido,
      cliente.cuit,
      `${cliente.calle} ${cliente.numero}`,
      cliente.localidad,
      cliente.provincia,
      cliente.codigo_postal,
      cliente.telefono || "",
      cliente.email || "",
      cliente.situacion_afip,
      cliente.tipo_persona === 'fisica' ? 'Física' : 'Jurídica'
    ]);

    const csv = [headers, ...csvData].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilterProvincia("todas");
    setFilterSituacionAfip("todas");
    setFilterTipoPersona("todas");
  };

  // Función de impresión
  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-foreground mb-2">Listado de Clientes</h1>
            <p className="text-muted-foreground">
              Reporte completo de todos los clientes registrados
            </p>
          </div>
          <Card>
            <CardContent className="p-6">
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Reporte de Clientes</h1>
            <p className="text-muted-foreground">
              Análisis completo y exportación de datos de clientes
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button 
              variant="outline" 
              onClick={handlePrint} 
              disabled={!filteredClientes || filteredClientes.length === 0}
            >
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
            <Button 
              onClick={exportToCSV} 
              disabled={!filteredClientes || filteredClientes.length === 0}
            >
              <FileDown className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Clientes</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                Clientes registrados
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Personas Físicas</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.fisicas}</div>
              <p className="text-xs text-muted-foreground">
                {stats.total > 0 ? `${((stats.fisicas / stats.total) * 100).toFixed(1)}% del total` : '0%'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Personas Jurídicas</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.juridicas}</div>
              <p className="text-xs text-muted-foreground">
                {stats.total > 0 ? `${((stats.juridicas / stats.total) * 100).toFixed(1)}% del total` : '0%'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros de Búsqueda
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="search">Búsqueda</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Nombre, CUIT, Localidad..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="provincia">Provincia</Label>
                <Select value={filterProvincia} onValueChange={setFilterProvincia}>
                  <SelectTrigger id="provincia">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas las provincias</SelectItem>
                    {PROVINCIAS_ARGENTINA.map((prov) => (
                      <SelectItem key={prov} value={prov}>
                        {prov}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="situacion">Situación AFIP</Label>
                <Select value={filterSituacionAfip} onValueChange={setFilterSituacionAfip}>
                  <SelectTrigger id="situacion">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas las situaciones</SelectItem>
                    {SITUACIONES_AFIP.map((sit) => (
                      <SelectItem key={sit} value={sit}>
                        {sit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo de Persona</Label>
                <Select value={filterTipoPersona} onValueChange={setFilterTipoPersona}>
                  <SelectTrigger id="tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    <SelectItem value="fisica">Persona Física</SelectItem>
                    <SelectItem value="juridica">Persona Jurídica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={clearFilters}>
                Limpiar Filtros
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabla de Resultados */}
        <Card>
          <CardHeader>
            <CardTitle>
              Resultados: {filteredClientes.length} cliente{filteredClientes.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!clientes || clientes.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No hay clientes registrados
              </p>
            ) : filteredClientes.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No se encontraron clientes con los filtros aplicados
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre Completo</TableHead>
                      <TableHead>CUIT</TableHead>
                      <TableHead>Dirección</TableHead>
                      <TableHead>Contacto</TableHead>
                      <TableHead>Situación AFIP</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClientes.map((cliente) => (
                      <TableRow key={cliente.id}>
                        <TableCell className="font-medium">
                          {cliente.nombre} {cliente.apellido}
                        </TableCell>
                        <TableCell>{cliente.cuit}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{cliente.calle} {cliente.numero}</div>
                            <div className="text-muted-foreground">
                              {cliente.localidad}, {cliente.provincia} ({cliente.codigo_postal})
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {cliente.telefono && <div>Tel: {cliente.telefono}</div>}
                            {cliente.email && <div className="truncate max-w-[200px]">{cliente.email}</div>}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{cliente.situacion_afip}</TableCell>
                        <TableCell>
                          <Badge variant={cliente.tipo_persona === 'fisica' ? 'default' : 'secondary'}>
                            {cliente.tipo_persona === 'fisica' ? 'Física' : 'Jurídica'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenReport(cliente)}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            Ver Informe
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
          <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Informe Detallado - {selectedCliente?.nombre} {selectedCliente?.apellido}
              </DialogTitle>
            </DialogHeader>
            {selectedCliente && <InformeCliente cliente={selectedCliente} />}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ListadoClientes;
