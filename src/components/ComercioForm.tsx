import { ChangeEvent, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ImagePlus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
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
  comercioId?: string;
  onSubmit: (data: ComercioFormData) => void;
  isLoading?: boolean;
}

const LOGO_BUCKET = "comercio-logos";
const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

export const ComercioForm = ({ initialData, comercioId, onSubmit, isLoading }: ComercioFormProps) => {
  const { toast } = useToast();
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
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
  const logoUrl = watch("logo_url");

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !comercioId) return;

    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Formato no admitido",
        description: "Seleccione un logo PNG, JPG o WEBP.",
      });
      return;
    }

    if (file.size > MAX_LOGO_SIZE) {
      toast({
        variant: "destructive",
        title: "Archivo demasiado grande",
        description: "El logo debe pesar hasta 2 MB.",
      });
      return;
    }

    setIsUploadingLogo(true);
    try {
      const logoPath = `${comercioId}/logo`;
      const { error } = await supabase.storage.from(LOGO_BUCKET).upload(logoPath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: true,
      });
      if (error) throw error;

      const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(logoPath);
      const publicUrl = `${data.publicUrl}?v=${Date.now()}`;
      setValue("logo_url", publicUrl, { shouldDirty: true, shouldValidate: true });
      toast({
        title: "Logo cargado",
        description: "Guarde los datos para aplicarlo en comprobantes y reportes.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "No se pudo cargar el logo",
        description: error instanceof Error ? error.message : "Intente nuevamente.",
      });
    } finally {
      setIsUploadingLogo(false);
    }
  };

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

            <div className="space-y-3 md:col-span-2">
              <Label>Logo del comercio</Label>
              <div className="flex flex-col gap-4 rounded-md border p-4 sm:flex-row sm:items-center">
                <div className="flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/20">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo del comercio" className="max-h-full max-w-full object-contain p-2" />
                  ) : (
                    <ImagePlus className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" disabled={isUploadingLogo || !comercioId} asChild>
                    <label htmlFor="logo_file" className="cursor-pointer">
                      <Upload className="mr-2 h-4 w-4" />
                      {isUploadingLogo ? "Subiendo..." : "Subir logo"}
                    </label>
                  </Button>
                  {logoUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isUploadingLogo}
                      onClick={() => setValue("logo_url", "", { shouldDirty: true })}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Quitar
                    </Button>
                  )}
                  <Input
                    id="logo_file"
                    className="sr-only"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleLogoUpload}
                    disabled={!comercioId || isUploadingLogo}
                  />
                  <input type="hidden" {...register("logo_url")} />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">PNG, JPG o WEBP. Maximo 2 MB.</p>
            </div>
          </div>

          <Button type="submit" variant="success" disabled={isLoading || isUploadingLogo}>
            {isLoading ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
