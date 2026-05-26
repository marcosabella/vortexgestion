import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Edit, Trash2, CreditCard, Settings } from "lucide-react";
import { useTarjetas } from "@/hooks/useTarjetas";
import { TarjetaForm } from "./TarjetaForm";
import { TarjetaCuotasForm } from "./TarjetaCuotasForm";
import { TarjetaCredito } from "@/types/tarjeta";

export const TarjetasList = () => {
  const { tarjetas, isLoading, deleteTarjeta } = useTarjetas();
  const [showForm, setShowForm] = useState(false);
  const [showCuotasForm, setShowCuotasForm] = useState(false);
  const [editingTarjeta, setEditingTarjeta] = useState<TarjetaCredito | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredTarjetas = tarjetas.filter(tarjeta =>
    tarjeta.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (tarjeta: TarjetaCredito) => {
    setEditingTarjeta(tarjeta);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingTarjeta(null);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <p>Cargando tarjetas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Gestión de Tarjetas de Crédito</CardTitle>
            <div className="flex gap-2">
              <Button onClick={() => setShowCuotasForm(true)} variant="outline">
                <Settings className="mr-2 h-4 w-4" />
                Configurar Cuotas
              </Button>
              <Button asChild variant="new">
                <Link to="/tarjetas/nueva">
                  <Plus className="mr-2 h-4 w-4" />
                  Nueva Tarjeta
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="tarjetas" className="w-full">
            <TabsList>
              <TabsTrigger value="tarjetas">Tarjetas</TabsTrigger>
              <TabsTrigger value="cuotas">Configuración de Cuotas</TabsTrigger>
            </TabsList>
            
            <TabsContent value="tarjetas" className="space-y-4">
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar tarjetas..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Cuotas Configuradas</TableHead>
                      <TableHead>Observaciones</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTarjetas.map((tarjeta) => (
                      <TableRow key={tarjeta.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            {tarjeta.nombre}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={tarjeta.activa ? "default" : "secondary"}>
                            {tarjeta.activa ? "Activa" : "Inactiva"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {tarjeta.tarjeta_cuotas?.length || 0} configuraciones
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {tarjeta.observaciones || "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(tarjeta)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                if (confirm("¿Estás seguro de eliminar esta tarjeta?")) {
                                  deleteTarjeta(tarjeta.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {filteredTarjetas.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    {searchTerm ? "No se encontraron tarjetas que coincidan con la búsqueda" : "No hay tarjetas registradas"}
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="cuotas">
              <TarjetaCuotasForm />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={handleCloseForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTarjeta ? "Editar Tarjeta" : "Nueva Tarjeta"}
            </DialogTitle>
          </DialogHeader>
          <TarjetaForm tarjeta={editingTarjeta || undefined} onSuccess={handleCloseForm} />
        </DialogContent>
      </Dialog>

      <Dialog open={showCuotasForm} onOpenChange={setShowCuotasForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configuración de Cuotas</DialogTitle>
          </DialogHeader>
          <TarjetaCuotasForm onSuccess={() => setShowCuotasForm(false)} showFormTitle={false} />
        </DialogContent>
      </Dialog>
    </div>
  );
};
