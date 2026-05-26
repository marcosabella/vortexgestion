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
import { useClientes, useDeleteCliente } from '@/hooks/useClientes';
import { ClienteForm } from './ClienteForm';
import { Cliente } from '@/types/cliente';

export function ClientesList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const { data: clientes = [], isLoading } = useClientes();
  const deleteCliente = useDeleteCliente();

  const filteredClientes = clientes.filter((cliente) =>
    `${cliente.nombre} ${cliente.apellido} ${cliente.cuit}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  const handleEdit = (cliente: Cliente) => {
    setSelectedCliente(cliente);
    setIsEditDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    await deleteCliente.mutateAsync(id);
  };

  const handleEditSuccess = () => {
    setIsEditDialogOpen(false);
    setSelectedCliente(null);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-muted-foreground">Cargando clientes...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4 items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Buscar clientes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Button asChild variant="new" className="flex items-center gap-2">
          <Link to="/clientes/nuevo">
            <Plus className="h-4 w-4" />
            Nuevo Cliente
          </Link>
        </Button>
      </div>

      {filteredClientes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">
                {searchTerm ? 'No se encontraron clientes' : 'No hay clientes registrados'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm 
                  ? 'Intenta con otros términos de búsqueda'
                  : 'Comienza agregando tu primer cliente'
                }
              </p>
              {!searchTerm && (
                <Button asChild variant="new">
                  <Link to="/clientes/nuevo">
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Cliente
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
                  <TableHead>Nombre</TableHead>
                  <TableHead>CUIT</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Situación AFIP</TableHead>
                  <TableHead>Localidad</TableHead>
                  <TableHead>Teléfono</TableHead>
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
                      <Badge variant="secondary" className="whitespace-nowrap">
                        {cliente.tipo_persona === 'fisica' ? 'Física' : 'Jurídica'}
                      </Badge>
                    </TableCell>
                    <TableCell>{cliente.situacion_afip}</TableCell>
                    <TableCell>{cliente.localidad}</TableCell>
                    <TableCell>{cliente.telefono || '-'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Dialog open={isEditDialogOpen && selectedCliente?.id === cliente.id} onOpenChange={(open) => {
                          setIsEditDialogOpen(open);
                          if (!open) setSelectedCliente(null);
                        }}>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(cliente)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Editar Cliente</DialogTitle>
                            </DialogHeader>
                            {selectedCliente && (
                              <ClienteForm 
                                cliente={selectedCliente} 
                                onSuccess={handleEditSuccess} 
                                showTitle={false}
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
                              <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción no se puede deshacer. Se eliminará permanentemente
                                la información de {cliente.nombre} {cliente.apellido}.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => cliente.id && handleDelete(cliente.id)}
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
