import { useState } from "react";
import { Edit, Trash2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { useSubRubros } from "@/hooks/useSubRubros";
import { useRubros } from "@/hooks/useRubros";
import { SubRubro } from "@/types/producto";

export const SubRubrosManager = () => {
  const { subrubros, isLoading, createSubRubro, updateSubRubro, deleteSubRubro } = useSubRubros();
  const { rubros } = useRubros();
  const [editingSubRubro, setEditingSubRubro] = useState<SubRubro | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<SubRubro>();

  const closeForm = () => {
    reset();
    setIsFormOpen(false);
    setEditingSubRubro(null);
  };

  const onSubmit = (data: SubRubro) => {
    if (editingSubRubro) {
      updateSubRubro({ ...data, id: editingSubRubro.id });
    } else {
      createSubRubro(data);
    }
    closeForm();
  };

  const handleEdit = (subrubro: SubRubro) => {
    setEditingSubRubro(subrubro);
    reset(subrubro);
    setIsFormOpen(true);
  };

  const handleAdd = () => {
    setEditingSubRubro(null);
    reset({ nombre: "", descripcion: "", rubro_id: "" });
    setIsFormOpen(true);
  };

  if (isLoading) {
    return <div className="text-center p-4">Cargando subrubros...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Gestion de SubRubros</CardTitle>
          <Button onClick={handleAdd} variant="new">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo SubRubro
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isFormOpen && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{editingSubRubro ? "Editar SubRubro" : "Nuevo SubRubro"}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rubro_id">Rubro *</Label>
                  <Select value={watch("rubro_id") || ""} onValueChange={(value) => setValue("rubro_id", value, { shouldValidate: true })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar rubro" />
                    </SelectTrigger>
                    <SelectContent>
                      {rubros.map((rubro) => (
                        <SelectItem key={rubro.id} value={rubro.id}>
                          {rubro.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre *</Label>
                  <Input id="nombre" {...register("nombre", { required: "El nombre es requerido" })} placeholder="Nombre del subrubro" />
                  {errors.nombre && <p className="text-sm text-destructive">{errors.nombre.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="descripcion">Descripcion</Label>
                  <Textarea id="descripcion" {...register("descripcion")} placeholder="Descripcion del subrubro" rows={3} />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="submit" variant="success">{editingSubRubro ? "Actualizar" : "Crear"} SubRubro</Button>
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
              <TableHead>Rubro</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Descripcion</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subrubros.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-4">
                  No hay subrubros registrados
                </TableCell>
              </TableRow>
            ) : (
              subrubros.map((subrubro) => (
                <TableRow key={subrubro.id}>
                  <TableCell className="font-medium">{subrubro.rubro?.nombre}</TableCell>
                  <TableCell>{subrubro.nombre}</TableCell>
                  <TableCell>{subrubro.descripcion || "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(subrubro)}>
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
                            <AlertDialogTitle>Eliminar subrubro</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta accion no se puede deshacer. Se eliminara permanentemente el subrubro "{subrubro.nombre}".
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteSubRubro(subrubro.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
