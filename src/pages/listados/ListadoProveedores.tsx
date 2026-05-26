import { useState, useMemo } from "react";
import { useProveedores } from "@/hooks/useProveedores";
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
import { FileDown, Search, Truck, Building2, UserCheck, Filter, Printer } from "lucide-react";

const PROVINCIAS_ARGENTINA = [
  "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba",
  "Corrientes", "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja",
  "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan",
  "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero",
  "Tierra del Fuego", "Tucumán"
];

const ListadoProveedores = () => {
  const { data: proveedores, isLoading } = useProveedores();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterProvincia, setFilterProvincia] = useState<string>("todas");
  const [filterSituacionAfip, setFilterSituacionAfip] = useState<string>("todas");
  const [filterTipoPersona, setFilterTipoPersona] = useState<string>("todas");

  const filteredProveedores = useMemo(() => {
    if (!proveedores) return [];

    return proveedores.filter((proveedor) => {
      const matchSearch =
        proveedor.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (proveedor.apellido?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
        (proveedor.razon_social?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
        proveedor.cuit.includes(searchTerm) ||
        proveedor.localidad.toLowerCase().includes(searchTerm.toLowerCase());

      const matchProvincia = filterProvincia === "todas" || proveedor.provincia === filterProvincia;
      const matchSituacion = filterSituacionAfip === "todas" || proveedor.situacion_afip === filterSituacionAfip;
      const matchTipo = filterTipoPersona === "todas" || proveedor.tipo_persona === filterTipoPersona;

      return matchSearch && matchProvincia && matchSituacion && matchTipo;
    });
  }, [proveedores, searchTerm, filterProvincia, filterSituacionAfip, filterTipoPersona]);

  const stats = useMemo(() => {
    if (!proveedores) return { total: 0, fisicas: 0, juridicas: 0 };

    return {
      total: proveedores.length,
      fisicas: proveedores.filter(p => p.tipo_persona === 'fisica').length,
      juridicas: proveedores.filter(p => p.tipo_persona === 'juridica').length,
    };
  }, [proveedores]);

  const exportToCSV = () => {
    if (!filteredProveedores || filteredProveedores.length === 0) return;

    const headers = ["Nombre", "Apellido", "Razón Social", "CUIT", "Dirección", "Localidad", "Provincia", "CP", "Teléfono", "Email", "Situación AFIP", "Tipo Persona"];
    const csvData = filteredProveedores.map(proveedor => [
      proveedor.nombre,
      proveedor.apellido || "",
      proveedor.razon_social || "",
      proveedor.cuit,
      `${proveedor.calle} ${proveedor.numero}`,
      proveedor.localidad,
      proveedor.provincia,
      proveedor.codigo_postal,
      proveedor.telefono || "",
      proveedor.email || "",
      proveedor.situacion_afip,
      proveedor.tipo_persona === 'fisica' ? 'Física' : 'Jurídica'
    ]);

    const csv = [headers, ...csvData].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proveedores_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilterProvincia("todas");
    setFilterSituacionAfip("todas");
    setFilterTipoPersona("todas");
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-foreground mb-2">Listado de Proveedores</h1>
            <p className="text-muted-foreground">
              Reporte completo de todos los proveedores registrados
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
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Reporte de Proveedores</h1>
            <p className="text-muted-foreground">
              Análisis completo y exportación de datos de proveedores
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button
              variant="outline"
              onClick={handlePrint}
              disabled={!filteredProveedores || filteredProveedores.length === 0}
            >
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
            <Button
              onClick={exportToCSV}
              disabled={!filteredProveedores || filteredProveedores.length === 0}
            >
              <FileDown className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Proveedores</CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                Proveedores registrados
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
                    <SelectItem value="responsable_inscripto">Responsable Inscripto</SelectItem>
                    <SelectItem value="monotributo">Monotributo</SelectItem>
                    <SelectItem value="exento">Exento</SelectItem>
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

        <Card>
          <CardHeader>
            <CardTitle>
              Resultados: {filteredProveedores.length} proveedor{filteredProveedores.length !== 1 ? 'es' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!proveedores || proveedores.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No hay proveedores registrados
              </p>
            ) : filteredProveedores.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No se encontraron proveedores con los filtros aplicados
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre/Razón Social</TableHead>
                      <TableHead>CUIT</TableHead>
                      <TableHead>Dirección</TableHead>
                      <TableHead>Contacto</TableHead>
                      <TableHead>Situación AFIP</TableHead>
                      <TableHead>Tipo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProveedores.map((proveedor) => (
                      <TableRow key={proveedor.id}>
                        <TableCell className="font-medium">
                          {proveedor.tipo_persona === 'juridica'
                            ? proveedor.razon_social
                            : `${proveedor.nombre} ${proveedor.apellido || ''}`.trim()
                          }
                        </TableCell>
                        <TableCell>{proveedor.cuit}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{proveedor.calle} {proveedor.numero}</div>
                            <div className="text-muted-foreground">
                              {proveedor.localidad}, {proveedor.provincia} ({proveedor.codigo_postal})
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {proveedor.telefono && <div>Tel: {proveedor.telefono}</div>}
                            {proveedor.email && <div className="truncate max-w-[200px]">{proveedor.email}</div>}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{proveedor.situacion_afip}</TableCell>
                        <TableCell>
                          <Badge variant={proveedor.tipo_persona === 'fisica' ? 'default' : 'secondary'}>
                            {proveedor.tipo_persona === 'fisica' ? 'Física' : 'Jurídica'}
                          </Badge>
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

export default ListadoProveedores;
