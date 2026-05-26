import { useState } from "react";
import { Edit, Trash2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { useMarcas } from "@/hooks/useMarcas";
import { Marca } from "@/types/producto";

export const MarcasManager = () => {
  const { marcas, isLoading, createMarca, updateMarca, deleteMarca } = useMarcas();
  const [editingMarca, setEditingMarca] = useState<Marca | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<Marca>();

  const closeForm = () => {
    reset();
    setIsFormOpen(false);
    setEditingMarca(null);
  };

  const onSubmit = (data: Marca) => {
    if (editingMarca) {
      updateMarca({ ...data, id: editingMarca.id });
    } else {
      createMarca(data);
    }
    closeForm();
  };

  const handleEdit = (marca: Marca) => {
    setEditingMarca(marca);
    reset(marca);
    setIsFormOpen(true);
  };

  const handleAdd = () => {
    setEditingMarca(null);
    reset({ nombre: "", descripcion: "" });
    setIsFormOpen(true);
  };

  if (isLoading) {
    return <div className="text-center p-4">Cargando marcas...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Gestion de Marcas</CardTitle>
          <Button onClick={handleAdd} variant="new">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Marca
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isFormOpen && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{editingMarca ? "Editar Marca" : "Nueva Marca"}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre *</Label>
                  <Input id="nombre" {...register("nombre", { required: "El nombre es requerido" })} placeholder="Nombre de la marca" />
                  {errors.nombre && <p className="text-sm text-destructive">{errors.nombre.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="descripcion">Descripcion</Label>
                  <Textarea id="descripcion" {...register("descripcion")} placeholder="Descripcion de la marca" rows={3} />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="submit" variant="success">{editingMarca ? "Actualizar" : "Crear"} Marca</Button>
                  <Button type="button" variant="cancel" onClick={closeForm}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Descripcion</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {marcas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-4">
                  No hay marcas registradas
                </TableCell>
              </TableRow>
            ) : (
              marcas.map((marca) => (
                <TableRow key={marca.id}>
                  <TableCell className="font-medium">{marca.nombre}</TableCell>
                  <TableCell>{marca.descripcion || "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(marca)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminar marca</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta accion no se puede deshacer. Se eliminara permanentemente la marca "{marca.nombre}".
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMarca(marca.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
