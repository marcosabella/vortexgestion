import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useProveedores, useDeleteProveedor, type Proveedor } from '@/hooks/useProveedores';
import { ProveedorForm } from './ProveedorForm';

export function ProveedoresList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProveedor, setSelectedProveedor] = useState<Proveedor | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const { data: proveedores = [], isLoading } = useProveedores();
  const deleteProveedor = useDeleteProveedor();

  const filteredProveedores = proveedores.filter(proveedor =>
    proveedor.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    proveedor.apellido?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    proveedor.razon_social?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    proveedor.cuit.includes(searchTerm)
  );

  const handleEdit = (proveedor: Proveedor) => {
    setSelectedProveedor(proveedor);
    setIsEditDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    await deleteProveedor.mutateAsync(id);
  };

  const handleEditSuccess = () => {
    setIsEditDialogOpen(false);
    setSelectedProveedor(null);
  };

  const getProveedorNombre = (proveedor: Proveedor) => {
    return proveedor.tipo_persona === 'juridica'
      ? proveedor.razon_social
      : `${proveedor.nombre} ${proveedor.apellido || ''}`.trim();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-muted-foreground">Cargando proveedores...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4 items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Buscar proveedores..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Button asChild variant="new" className="flex items-center gap-2">
          <Link to="/proveedores/nuevo">
            <Plus className="h-4 w-4" />
            Nuevo Proveedor
          </Link>
        </Button>
      </div>

      {filteredProveedores.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">
                {searchTerm ? 'No se encontraron proveedores' : 'No hay proveedores registrados'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm
                  ? 'Intenta con otros términos de búsqueda'
                  : 'Comienza agregando tu primer proveedor'
                }
              </p>
              {!searchTerm && (
                <Button asChild variant="new">
                  <Link to="/proveedores/nuevo">
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Proveedor
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre / Razón Social</TableHead>
                  <TableHead>CUIT</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Situación AFIP</TableHead>
                  <TableHead>Localidad</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProveedores.map((proveedor) => (
                  <TableRow key={proveedor.id}>
                    <TableCell className="font-medium">
                      {getProveedorNombre(proveedor)}
                    </TableCell>
                    <TableCell>{proveedor.cuit}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="whitespace-nowrap">
                        {proveedor.tipo_persona === 'fisica' ? 'Física' : 'Jurídica'}
                      </Badge>
                    </TableCell>
                    <TableCell>{proveedor.situacion_afip}</TableCell>
                    <TableCell>{proveedor.localidad}</TableCell>
                    <TableCell>{proveedor.telefono || '-'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Dialog open={isEditDialogOpen && selectedProveedor?.id === proveedor.id} onOpenChange={(open) => {
                          setIsEditDialogOpen(open);
                          if (!open) setSelectedProveedor(null);
                        }}>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(proveedor)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Editar Proveedor</DialogTitle>
                            </DialogHeader>
                            {selectedProveedor && (
                              <ProveedorForm
                                proveedor={selectedProveedor}
                                onSuccess={handleEditSuccess}
                              />
                            )}
                          </DialogContent>
                        </Dialog>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar proveedor?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción no se puede deshacer. Se eliminará permanentemente
                                la información de {getProveedorNombre(proveedor)}.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => proveedor.id && handleDelete(proveedor.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
