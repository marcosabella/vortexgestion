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
import { useRubros } from "@/hooks/useRubros";
import { Rubro } from "@/types/producto";

export const RubrosManager = () => {
  const { rubros, isLoading, createRubro, updateRubro, deleteRubro } = useRubros();
  const [editingRubro, setEditingRubro] = useState<Rubro | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<Rubro>();

  const closeForm = () => {
    reset();
    setIsFormOpen(false);
    setEditingRubro(null);
  };

  const onSubmit = (data: Rubro) => {
    if (editingRubro) {
      updateRubro({ ...data, id: editingRubro.id });
    } else {
      createRubro(data);
    }
    closeForm();
  };

  const handleEdit = (rubro: Rubro) => {
    setEditingRubro(rubro);
    reset(rubro);
    setIsFormOpen(true);
  };

  const handleAdd = () => {
    setEditingRubro(null);
    reset({ nombre: "", descripcion: "" });
    setIsFormOpen(true);
  };

  if (isLoading) {
    return <div className="text-center p-4">Cargando rubros...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Gestion de Rubros</CardTitle>
          <Button onClick={handleAdd} variant="new">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Rubro
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isFormOpen && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{editingRubro ? "Editar Rubro" : "Nuevo Rubro"}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre *</Label>
                  <Input id="nombre" {...register("nombre", { required: "El nombre es requerido" })} placeholder="Nombre del rubro" />
                  {errors.nombre && <p className="text-sm text-destructive">{errors.nombre.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="descripcion">Descripcion</Label>
                  <Textarea id="descripcion" {...register("descripcion")} placeholder="Descripcion del rubro" rows={3} />
                </div>
                <div className="flex gap-2 pt-4">
                  <Button type="submit" variant="success">{editingRubro ? "Actualizar" : "Crear"} Rubro</Button>
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
            {rubros.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-4">
                  No hay rubros registrados
                </TableCell>
              </TableRow>
            ) : (
              rubros.map((rubro) => (
                <TableRow key={rubro.id}>
                  <TableCell className="font-medium">{rubro.nombre}</TableCell>
                  <TableCell>{rubro.descripcion || "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(rubro)}>
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
                            <AlertDialogTitle>Eliminar rubro</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta accion no se puede deshacer. Se eliminara permanentemente el rubro "{rubro.nombre}".
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteRubro(rubro.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
