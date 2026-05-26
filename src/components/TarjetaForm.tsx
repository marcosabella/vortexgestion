import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useTarjetas } from "@/hooks/useTarjetas";
import { TarjetaCredito } from "@/types/tarjeta";

const tarjetaSchema = z.object({
  nombre: z.string().min(1, "El nombre de la tarjeta es obligatorio"),
  activa: z.boolean(),
  observaciones: z.string().optional().transform(val => val || undefined),
});

type TarjetaFormData = z.infer<typeof tarjetaSchema>;

interface TarjetaFormProps {
  tarjeta?: TarjetaCredito;
  onSuccess?: () => void;
}

export const TarjetaForm = ({ tarjeta, onSuccess }: TarjetaFormProps) => {
  const { createTarjeta, updateTarjeta, isCreating, isUpdating } = useTarjetas();

  const form = useForm<TarjetaFormData>({
    resolver: zodResolver(tarjetaSchema),
    defaultValues: tarjeta ? {
      nombre: tarjeta.nombre,
      activa: tarjeta.activa,
      observaciones: tarjeta.observaciones || "",
    } : {
      nombre: "",
      activa: true,
      observaciones: "",
    },
  });

  const onSubmit = (data: TarjetaFormData) => {
    const tarjetaData = data as Omit<TarjetaCredito, "id" | "created_at" | "updated_at">;
    
    if (tarjeta) {
      updateTarjeta({ id: tarjeta.id, tarjeta: tarjetaData }, { onSuccess });
    } else {
      createTarjeta(tarjetaData, { onSuccess });
    }
  };

  const isLoading = isCreating || isUpdating;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="nombre"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre de la Tarjeta</FormLabel>
              <FormControl>
                <Input placeholder="Ej: Visa, Mastercard, American Express" {...field} />
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
                <FormLabel className="text-base">Tarjeta Activa</FormLabel>
                <div className="text-sm text-muted-foreground">
                  Permite usar esta tarjeta en ventas
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

        <FormField
          control={form.control}
          name="observaciones"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Observaciones</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Información adicional sobre la tarjeta..."
                  className="resize-none"
                  rows={3}
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-4">
          <Button type="submit" variant="success" disabled={isLoading} className="flex-1">
            {isLoading ? "Guardando..." : tarjeta ? "Actualizar Tarjeta" : "Registrar Tarjeta"}
          </Button>
        </div>
      </form>
    </Form>
  );
};
