import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useBancos } from "@/hooks/useBancos";
import { Banco, TIPOS_CUENTA_BANCARIA } from "@/types/banco";

const bancoSchema = z.object({
  nombre_banco: z.string().min(1, "El nombre del banco es obligatorio"),
  sucursal: z.string().min(1, "La sucursal es obligatoria"),
  numero_cuenta: z.string().min(1, "El número de cuenta es obligatorio"),
  cbu: z.string()
    .length(22, "El CBU debe tener exactamente 22 dígitos")
    .regex(/^\d+$/, "El CBU debe contener solo números"),
  tipo_cuenta: z.enum(['CA_PESOS', 'CA_USD', 'CC_PESOS', 'CC_USD', 'CAJA_AHORRO', 'CUENTA_SUELDO']),
  observaciones: z.string().optional().transform(val => val || undefined),
  activo: z.boolean(),
});

type BancoFormData = z.infer<typeof bancoSchema>;

interface BancoFormProps {
  banco?: Banco;
  onSuccess?: () => void;
}

export const BancoForm = ({ banco, onSuccess }: BancoFormProps) => {
  const { createBanco, updateBanco, isCreating, isUpdating } = useBancos();

  const form = useForm<BancoFormData>({
    resolver: zodResolver(bancoSchema),
    defaultValues: banco ? {
      nombre_banco: banco.nombre_banco,
      sucursal: banco.sucursal,
      numero_cuenta: banco.numero_cuenta,
      cbu: banco.cbu,
      tipo_cuenta: banco.tipo_cuenta,
      observaciones: banco.observaciones || "",
      activo: banco.activo,
    } : {
      nombre_banco: "",
      sucursal: "",
      numero_cuenta: "",
      cbu: "",
      tipo_cuenta: 'CA_PESOS',
      observaciones: "",
      activo: true,
    },
  });

  const onSubmit = (data: BancoFormData) => {
    const bancoData = data as Omit<Banco, "id" | "created_at" | "updated_at">;
    
    if (banco) {
      updateBanco({ id: banco.id, banco: bancoData }, { onSuccess });
    } else {
      createBanco(bancoData, { onSuccess });
    }
  };

  const isLoading = isCreating || isUpdating;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="nombre_banco"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre del Banco</FormLabel>
                <FormControl>
                  <Input placeholder="Ej: Banco Nación" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="sucursal"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sucursal</FormLabel>
                <FormControl>
                  <Input placeholder="Ej: Centro" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="numero_cuenta"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número de Cuenta</FormLabel>
                <FormControl>
                  <Input placeholder="Ej: 1234567890123456789" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cbu"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CBU</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="1234567890123456789012" 
                    maxLength={22}
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="tipo_cuenta"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Cuenta</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo de cuenta" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TIPOS_CUENTA_BANCARIA.map((tipo) => (
                      <SelectItem key={tipo.value} value={tipo.value}>
                        {tipo.label}
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
            name="activo"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Activo</FormLabel>
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

        <FormField
          control={form.control}
          name="observaciones"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Observaciones</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Información adicional sobre la cuenta bancaria..."
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
            {isLoading ? "Guardando..." : banco ? "Actualizar Banco" : "Registrar Banco"}
          </Button>
        </div>
      </form>
    </Form>
  );
};
