import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCheques } from '@/hooks/useCheques';
import { Cheque, ESTADOS_CHEQUE } from '@/types/cheque';
import { ChequeForm } from './ChequeForm';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export const ChequesList = () => {
  const { cheques, isLoading, createCheque, updateCheque, deleteCheque } = useCheques();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCheque, setSelectedCheque] = useState<Cheque | undefined>();
  const [chequeToDelete, setChequeToDelete] = useState<string | null>(null);

  const handleSubmit = (data: any) => {
    if (selectedCheque) {
      updateCheque({ ...data, id: selectedCheque.id });
    } else {
      createCheque(data);
    }
    setIsDialogOpen(false);
    setSelectedCheque(undefined);
  };

  const handleEdit = (cheque: Cheque) => {
    setSelectedCheque(cheque);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    deleteCheque(id);
    setChequeToDelete(null);
  };

  const getEstadoBadgeVariant = (estado: string) => {
    switch (estado) {
      case 'en_cartera': return 'success';
      case 'depositado': return 'success';
      case 'rechazado': return 'destructive';
      case 'endosado': return 'secondary';
      default: return 'success';
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(value);
  };

  if (isLoading) {
    return <div className="text-center py-8">Cargando cheques...</div>;
  }

  return (
    <>
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Cartera de Cheques</h2>
          <Button asChild variant="new">
            <Link to="/cheques/nuevo">
              <Plus className="mr-2 h-4 w-4" />
              Registrar Cheque
            </Link>
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° Cheque</TableHead>
                <TableHead>Banco</TableHead>
                <TableHead>Emisor</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>F. Emisión</TableHead>
                <TableHead>F. Vencimiento</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cheques && cheques.length > 0 ? (
                cheques.map((cheque) => (
                  <TableRow key={cheque.id}>
                    <TableCell className="font-medium">{cheque.numero_cheque}</TableCell>
                    <TableCell>{cheque.banco_emisor}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{cheque.emisor_nombre}</div>
                        {cheque.emisor_cuit && (
                          <div className="text-muted-foreground">{cheque.emisor_cuit}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {cheque.cliente ? (
                        <div className="text-sm">
                          {cheque.cliente.nombre} {cheque.cliente.apellido}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(cheque.monto)}
                    </TableCell>
                    <TableCell>
                      {format(new Date(cheque.fecha_emision), 'dd/MM/yyyy', { locale: es })}
                    </TableCell>
                    <TableCell>
                      {format(new Date(cheque.fecha_vencimiento), 'dd/MM/yyyy', { locale: es })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getEstadoBadgeVariant(cheque.estado)}>
                        {ESTADOS_CHEQUE.find(e => e.value === cheque.estado)?.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(cheque)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => setChequeToDelete(cheque.id!)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    No hay cheques registrados
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCheque ? 'Editar Cheque' : 'Registrar Nuevo Cheque'}
            </DialogTitle>
          </DialogHeader>
          <ChequeForm
            cheque={selectedCheque}
            onSubmit={handleSubmit}
            onCancel={() => {
              setIsDialogOpen(false);
              setSelectedCheque(undefined);
            }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!chequeToDelete} onOpenChange={() => setChequeToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el cheque de forma permanente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => chequeToDelete && handleDelete(chequeToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
