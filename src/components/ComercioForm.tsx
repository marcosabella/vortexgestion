import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComercioFormData } from "@/types/comercio";

const formSchema = z.object({
  nombre_comercio: z.string().min(1, "El nombre del comercio es requerido"),
  calle: z.string().min(1, "La calle es requerida"),
  numero: z.string().min(1, "El número es requerido"),
  codigo_postal: z.string().min(1, "El código postal es requerido"),
  localidad: z.string().min(1, "La localidad es requerida"),
  provincia: z.string().min(1, "La provincia es requerida"),
  telefono: z.string().optional(),
  cuit: z.string().min(11, "El CUIT debe tener al menos 11 caracteres"),
  ingresos_brutos: z.string().optional(),
  fecha_inicio_actividad: z.string().min(1, "La fecha de inicio es requerida"),
  logo_url: z.string().optional(),
});

interface ComercioFormProps {
  initialData?: ComercioFormData;
  onSubmit: (data: ComercioFormData) => void;
  isLoading?: boolean;
}

export const ComercioForm = ({ initialData, onSubmit, isLoading }: ComercioFormProps) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ComercioFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      nombre_comercio: "",
      calle: "",
      numero: "",
      codigo_postal: "",
      localidad: "",
      provincia: "",
      telefono: "",
      cuit: "",
      ingresos_brutos: "",
      fecha_inicio_actividad: "",
      logo_url: "",
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos del Comercio</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="nombre_comercio">Nombre del Comercio *</Label>
              <Input id="nombre_comercio" {...register("nombre_comercio")} />
              {errors.nombre_comercio && (
                <p className="text-sm text-destructive">{errors.nombre_comercio.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="cuit">CUIT *</Label>
              <Input id="cuit" {...register("cuit")} />
              {errors.cuit && (
                <p className="text-sm text-destructive">{errors.cuit.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="calle">Calle *</Label>
              <Input id="calle" {...register("calle")} />
              {errors.calle && (
                <p className="text-sm text-destructive">{errors.calle.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="numero">Número *</Label>
              <Input id="numero" {...register("numero")} />
              {errors.numero && (
                <p className="text-sm text-destructive">{errors.numero.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="codigo_postal">Código Postal *</Label>
              <Input id="codigo_postal" {...register("codigo_postal")} />
              {errors.codigo_postal && (
                <p className="text-sm text-destructive">{errors.codigo_postal.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="localidad">Localidad *</Label>
              <Input id="localidad" {...register("localidad")} />
              {errors.localidad && (
                <p className="text-sm text-destructive">{errors.localidad.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="provincia">Provincia *</Label>
              <Input id="provincia" {...register("provincia")} />
              {errors.provincia && (
                <p className="text-sm text-destructive">{errors.provincia.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="telefono">Teléfono</Label>
              <Input id="telefono" {...register("telefono")} />
            </div>

            <div>
              <Label htmlFor="ingresos_brutos">Ingresos Brutos</Label>
              <Input id="ingresos_brutos" {...register("ingresos_brutos")} />
            </div>

            <div>
              <Label htmlFor="fecha_inicio_actividad">Fecha Inicio de Actividad *</Label>
              <Input id="fecha_inicio_actividad" type="date" {...register("fecha_inicio_actividad")} />
              {errors.fecha_inicio_actividad && (
                <p className="text-sm text-destructive">{errors.fecha_inicio_actividad.message}</p>
              )}
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="logo_url">URL del Logo</Label>
              <Input id="logo_url" {...register("logo_url")} placeholder="https://..." />
            </div>
          </div>

          <Button type="submit" variant="success" disabled={isLoading}>
            {isLoading ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
