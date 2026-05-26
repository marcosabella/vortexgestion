import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, CreditCard as Edit, Trash2 } from "lucide-react";
import { useTarjetas } from "@/hooks/useTarjetas";
import { useTarjetaCuotas } from "@/hooks/useTarjetaCuotas";
import { TarjetaCuota, CUOTAS_PREDEFINIDAS } from "@/types/tarjeta";

const cuotaSchema = z.object({
  tarjeta_id: z.string().min(1, "Seleccione una tarjeta"),
  cantidad_cuotas: z.number().min(1, "Mínimo 1 cuota").max(60, "Máximo 60 cuotas"),
  porcentaje_recargo: z.number().min(0, "El recargo no puede ser negativo"),
  activa: z.boolean(),
});

type CuotaFormData = z.infer<typeof cuotaSchema>;

interface TarjetaCuotasFormProps {
  cuota?: TarjetaCuota;
  onSuccess?: () => void;
  showFormTitle?: boolean;
}

export const TarjetaCuotasForm = ({ cuota, onSuccess, showFormTitle = true }: TarjetaCuotasFormProps) => {
  const { tarjetas } = useTarjetas();
  const [selectedTarjetaId, setSelectedTarjetaId] = useState<string>("all");

  // Get cuotas based on selected tarjeta (empty or "all" = todas las cuotas)
  const { tarjetaCuotas, createTarjetaCuota, updateTarjetaCuota, deleteTarjetaCuota, loading } = useTarjetaCuotas(selectedTarjetaId);

  const [editingCuota, setEditingCuota] = useState<TarjetaCuota | null>(null);

  const form = useForm<CuotaFormData>({
    resolver: zodResolver(cuotaSchema),
    defaultValues: cuota ? {
      tarjeta_id: cuota.tarjeta_id,
      cantidad_cuotas: cuota.cantidad_cuotas,
      porcentaje_recargo: cuota.porcentaje_recargo,
      activa: cuota.activa,
    } : {
      tarjeta_id: "",
      cantidad_cuotas: 1,
      porcentaje_recargo: 0,
      activa: true,
    },
  });

  const onSubmit = (data: CuotaFormData) => {
    const cuotaData = data as Omit<TarjetaCuota, "id" | "created_at" | "updated_at">;
    
    if (editingCuota) {
      updateTarjetaCuota(editingCuota.id, cuotaData);
      setEditingCuota(null);
    } else {
      createTarjetaCuota(cuotaData);
    }
    
    form.reset();
    if (onSuccess) {
      onSuccess();
    }
  };

  const handleEdit = (cuota: TarjetaCuota) => {
    setEditingCuota(cuota);
    form.reset({
      tarjeta_id: cuota.tarjeta_id,
      cantidad_cuotas: cuota.cantidad_cuotas,
      porcentaje_recargo: cuota.porcentaje_recargo,
      activa: cuota.activa,
    });
  };

  const handleCancelEdit = () => {
    setEditingCuota(null);
    form.reset({
      tarjeta_id: "",
      cantidad_cuotas: 1,
      porcentaje_recargo: 0,
      activa: true,
    });
  };

  const isLoading = loading;

  return (
    <div className="space-y-6">
      <Card>
        {showFormTitle && (
          <CardHeader>
          <CardTitle>
            {editingCuota ? "Editar Configuración de Cuotas" : "Nueva Configuración de Cuotas"}
          </CardTitle>
          </CardHeader>
        )}
        <CardContent className={showFormTitle ? undefined : "pt-6"}>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tarjeta_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tarjeta de Crédito</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar tarjeta" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {tarjetas.filter(t => t.activa).map((tarjeta) => (
                            <SelectItem key={tarjeta.id} value={tarjeta.id}>
                              {tarjeta.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cantidad_cuotas"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cantidad de Cuotas</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))} 
                        defaultValue={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar cuotas" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CUOTAS_PREDEFINIDAS.map((cuota) => (
                            <SelectItem key={cuota.cuotas} value={cuota.cuotas.toString()}>
                              {cuota.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="porcentaje_recargo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Porcentaje de Recargo (%)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01"
                          placeholder="0.00"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="activa"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Activa</FormLabel>
                        <div className="text-sm text-muted-foreground">
                          Disponible para usar en ventas
                        </div>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex gap-4">
                <Button type="submit" variant="success" disabled={isLoading}>
                  {isLoading ? "Guardando..." : editingCuota ? "Actualizar Cuotas" : "Agregar Cuotas"}
                </Button>
                {editingCuota && (
                  <Button type="button" variant="cancel" onClick={handleCancelEdit}>
                    Cancelar
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuraciones de Cuotas Existentes</CardTitle>
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <label className="text-sm font-medium">Filtrar por Tarjeta</label>
              <Select value={selectedTarjetaId} onValueChange={setSelectedTarjetaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas las tarjetas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las tarjetas</SelectItem>
                  {tarjetas.map((tarjeta) => (
                    <SelectItem key={tarjeta.id} value={tarjeta.id}>
                      {tarjeta.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarjeta</TableHead>
                  <TableHead>Cuotas</TableHead>
                  <TableHead>Recargo (%)</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tarjetaCuotas || []).map((cuota) => (
                  <TableRow key={cuota.id}>
                    <TableCell className="font-medium">
                      {cuota.tarjeta?.nombre}
                    </TableCell>
                    <TableCell>
                      {cuota.cantidad_cuotas} {cuota.cantidad_cuotas === 1 ? 'cuota' : 'cuotas'}
                    </TableCell>
                    <TableCell>
                      {cuota.porcentaje_recargo}%
                    </TableCell>
                    <TableCell>
                      <Badge variant={cuota.activa ? "default" : "secondary"}>
                        {cuota.activa ? "Activa" : "Inactiva"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(cuota)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (confirm("¿Estás seguro de eliminar esta configuración de cuotas?")) {
                              deleteTarjetaCuota(cuota.id);
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

          {(!tarjetaCuotas || tarjetaCuotas.length === 0) && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {selectedTarjetaId && selectedTarjetaId !== "all"
                  ? "No hay configuraciones de cuotas para esta tarjeta"
                  : "No hay configuraciones de cuotas registradas"
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
