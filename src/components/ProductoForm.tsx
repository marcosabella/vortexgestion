import { ChangeEvent, useState, useEffect } from "react";
import { ImagePlus, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProductos } from "@/hooks/useProductos";
import { useProveedores } from "@/hooks/useProveedores";
import { useMarcas } from "@/hooks/useMarcas";
import { useRubros } from "@/hooks/useRubros";
import { useSubRubros } from "@/hooks/useSubRubros";
import { useComercioParametrizacion } from "@/hooks/useComercioParametrizacion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Producto } from "@/types/producto";
import { ProductDescriptionEditor } from "@/components/ProductDescriptionEditor";
import { sanitizeProductDescription } from "@/utils/productDescription";

const EMPTY_SELECT_VALUE = "__none__";
const PRODUCT_IMAGE_BUCKET = "producto-imagenes";
const MAX_PRODUCT_IMAGES = 5;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

type ProductoImagen = { id: string; storage_path: string; orden: number; publicUrl: string };
type ImagenPendiente = { file: File; previewUrl: string };

interface ProductoFormProps {
  producto?: Producto;
  onClose?: () => void;
  showTitle?: boolean;
}

type ProductoFormData = Producto & {
  proveedor?: unknown;
  marca?: unknown;
  rubro?: unknown;
  subrubro?: unknown;
};

export const ProductoForm = ({ producto, onClose, showTitle = true }: ProductoFormProps) => {
  const { createProducto, updateProducto, isCreating, isUpdating } = useProductos();
  const { data: proveedores = [] } = useProveedores();
  const { marcas } = useMarcas();
  const { rubros } = useRubros();
  const { subrubros } = useSubRubros();
  const { data: parametrizacion } = useComercioParametrizacion();
  const { toast } = useToast();
  
  const [filteredSubRubros, setFilteredSubRubros] = useState(subrubros);
  const [imagenes, setImagenes] = useState<ProductoImagen[]>([]);
  const [imagenesPendientes, setImagenesPendientes] = useState<ImagenPendiente[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const imagenesHabilitadas = parametrizacion?.funciones.imagenes_productos ?? false;
  const publicacionTiendaHabilitada = parametrizacion?.funciones.publicacion_tienda_online ?? false;
  const descripcionTiendaHabilitada = parametrizacion?.funciones.descripcion_enriquecida_productos ?? false;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<Producto>({
    defaultValues: producto || {
      cod_producto: "",
      cod_barras: "",
      descripcion: "",
      proveedor_id: "",
      marca_id: "",
      rubro_id: "",
      subrubro_id: "",
      precio_costo: 0,
      porcentaje_iva: 21,
      porcentaje_utilidad: 0,
      porcentaje_descuento: 0,
      stock: 0,
      tipo_moneda: "ARS",
      visible_en_tienda: false,
      destacado_en_tienda: false,
      observaciones: "",
      descripcion_tienda_html: "",
    },
  });

  const setSelectValue = (
    field: "proveedor_id" | "marca_id" | "rubro_id" | "subrubro_id",
    value: string
  ) => {
    setValue(field, value === EMPTY_SELECT_VALUE ? "" : value, { shouldDirty: true, shouldValidate: true });
  };

  // Watch rubro changes to filter subrubros
  const rubroId = watch("rubro_id");
  
  // Watch para calcular precio de venta
  const precioCosto = watch("precio_costo");
  const porcentajeIva = watch("porcentaje_iva");
  const porcentajeUtilidad = watch("porcentaje_utilidad");
  const porcentajeDescuento = watch("porcentaje_descuento");
  
  // Calcular precio de venta automáticamente
  useEffect(() => {
    const costo = Number(precioCosto) || 0;
    const iva = Number(porcentajeIva) || 0;
    const utilidad = Number(porcentajeUtilidad) || 0;
    const descuento = Number(porcentajeDescuento) || 0;
    
    const precioVenta = costo * (1 + iva / 100) * (1 + utilidad / 100) * (1 - descuento / 100);
    
    setValue("precio_venta", Number(precioVenta.toFixed(2)));
  }, [precioCosto, porcentajeIva, porcentajeUtilidad, porcentajeDescuento, setValue]);

  useEffect(() => {
    if (rubroId) {
      setFilteredSubRubros(subrubros.filter(sr => sr.rubro_id === rubroId));
    } else {
      setFilteredSubRubros([]);
    }
  }, [rubroId, subrubros]);

  // Cargar valores iniciales cuando se edita un producto
  useEffect(() => {
    if (producto) {
      setValue("proveedor_id", producto.proveedor_id ?? "");
      setValue("marca_id", producto.marca_id ?? "");
      setValue("rubro_id", producto.rubro_id ?? "");
      setValue("subrubro_id", producto.subrubro_id ?? "");
      setValue("tipo_moneda", producto.tipo_moneda);
    }
  }, [producto, setValue]);

  useEffect(() => {
    if (!producto?.id || !imagenesHabilitadas) {
      setImagenes([]);
      return;
    }

    const loadImages = async () => {
      const { data, error } = await (supabase as any)
        .from("producto_imagenes")
        .select("id, storage_path, orden")
        .eq("producto_id", producto.id)
        .order("orden");

      if (error) {
        toast({ variant: "destructive", title: "No se pudieron cargar las imagenes", description: error.message });
        return;
      }

      setImagenes((data || []).map((image: Omit<ProductoImagen, "publicUrl">) => ({
        ...image,
        publicUrl: supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(image.storage_path).data.publicUrl,
      })));
    };

    void loadImages();
  }, [producto?.id, imagenesHabilitadas, toast]);

  const selectImages = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const availableSlots = MAX_PRODUCT_IMAGES - imagenes.length - imagenesPendientes.length;

    if (!files.length || availableSlots <= 0) {
      toast({ variant: "destructive", title: "Limite alcanzado", description: "Cada producto admite hasta cinco imagenes." });
      return;
    }

    const validFiles = files.slice(0, availableSlots).filter((file) => {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        toast({ variant: "destructive", title: "Formato no admitido", description: "Use archivos PNG, JPG o WEBP." });
        return false;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        toast({ variant: "destructive", title: "Archivo demasiado grande", description: "Cada imagen puede pesar hasta 5 MB." });
        return false;
      }
      return true;
    });

    if (files.length > availableSlots) {
      toast({ title: "Se alcanzó el limite", description: `Solo se agregaron ${availableSlots} imagenes.` });
    }
    setImagenesPendientes((current) => [...current, ...validFiles.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  };

  const removePendingImage = (index: number) => {
    setImagenesPendientes((current) => {
      URL.revokeObjectURL(current[index].previewUrl);
      return current.filter((_, currentIndex) => currentIndex !== index);
    });
  };

  const removeStoredImage = async (image: ProductoImagen) => {
    const { error: storageError } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([image.storage_path]);
    if (storageError) {
      toast({ variant: "destructive", title: "No se pudo eliminar la imagen", description: storageError.message });
      return;
    }
    const { error } = await (supabase as any).from("producto_imagenes").delete().eq("id", image.id);
    if (error) {
      toast({ variant: "destructive", title: "No se pudo eliminar la imagen", description: error.message });
      return;
    }
    setImagenes((current) => current.filter((item) => item.id !== image.id));
  };

  const uploadPendingImages = async (savedProducto: Producto) => {
    if (!imagenesPendientes.length) return;
    const comercioId = savedProducto.comercio_id || localStorage.getItem("selectedComercioId");
    if (!comercioId) throw new Error("No se identificó el comercio del producto.");

    setIsUploadingImages(true);
    try {
      const newImages: ProductoImagen[] = [];
      const usedOrders = new Set(imagenes.map((image) => image.orden));
      for (const pendingImage of imagenesPendientes) {
        const extension = pendingImage.file.name.split(".").pop() || "jpg";
        const storagePath = `${comercioId}/${savedProducto.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(storagePath, pendingImage.file, {
          cacheControl: "3600",
          contentType: pendingImage.file.type,
        });
        if (uploadError) throw uploadError;

        const orden = [1, 2, 3, 4, 5].find((position) => !usedOrders.has(position));
        if (!orden) throw new Error("Cada producto admite hasta cinco imagenes.");
        usedOrders.add(orden);
        const { data, error } = await (supabase as any)
          .from("producto_imagenes")
          .insert({ producto_id: savedProducto.id, comercio_id: comercioId, storage_path: storagePath, orden })
          .select("id, storage_path, orden")
          .single();
        if (error) {
          await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([storagePath]);
          throw error;
        }
        newImages.push({ ...data, publicUrl: supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(storagePath).data.publicUrl });
      }
      imagenesPendientes.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      setImagenes((current) => [...current, ...newImages]);
      setImagenesPendientes([]);
    } finally {
      setIsUploadingImages(false);
    }
  };

  const onSubmit = (data: Producto) => {
    // Limpiar datos relacionados antes de enviar
    const {
      proveedor: _proveedor,
      marca: _marca,
      rubro: _rubro,
      subrubro: _subrubro,
      ...cleanData
    } = data as ProductoFormData;
    cleanData.descripcion_tienda_html = sanitizeProductDescription(cleanData.descripcion_tienda_html);
    
    const afterSuccess = () => {
      if (!producto) {
        reset();
      }
      onClose?.();
    };

    if (producto) {
      updateProducto({ ...cleanData, id: producto.id }, { onSuccess: async (savedProducto) => {
        try {
          await uploadPendingImages(savedProducto as Producto);
          afterSuccess();
        } catch (error) {
          toast({ variant: "destructive", title: "Producto actualizado", description: `No se pudieron cargar las imagenes: ${error instanceof Error ? error.message : "intente nuevamente"}` });
        }
      } });
    } else {
      createProducto(cleanData, { onSuccess: async (savedProducto) => {
        try {
          await uploadPendingImages(savedProducto as Producto);
          afterSuccess();
        } catch (error) {
          toast({ variant: "destructive", title: "Producto creado", description: `No se pudieron cargar las imagenes: ${error instanceof Error ? error.message : "intente nuevamente"}` });
        }
      } });
    }
  };

  return (
    <Card>
      {showTitle && (
        <CardHeader>
          <CardTitle>{producto ? "Editar Producto" : "Nuevo Producto"}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={showTitle ? undefined : "pt-6"}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cod_producto">Código Producto *</Label>
              <Input
                id="cod_producto"
                {...register("cod_producto", { required: "El código es requerido" })}
                placeholder="Código del producto"
              />
              {errors.cod_producto && (
                <p className="text-sm text-destructive">{errors.cod_producto.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cod_barras">Código de Barras</Label>
              <Input
                id="cod_barras"
                {...register("cod_barras")}
                placeholder="Código de barras"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="descripcion">Descripción *</Label>
              <Input
                id="descripcion"
                {...register("descripcion", { required: "La descripción es requerida" })}
                placeholder="Descripción del producto"
              />
              {errors.descripcion && (
                <p className="text-sm text-destructive">{errors.descripcion.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="proveedor_id">Proveedor</Label>
              <input type="hidden" {...register("proveedor_id")} />
              <Select 
                value={watch("proveedor_id") || EMPTY_SELECT_VALUE} 
                onValueChange={(value) => setSelectValue("proveedor_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar proveedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_SELECT_VALUE}>Sin proveedor</SelectItem>
                  {proveedores.map((proveedor) => (
                    <SelectItem key={proveedor.id} value={proveedor.id}>
                      {proveedor.razon_social || `${proveedor.nombre} ${proveedor.apellido || ''}`.trim()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="marca_id">Marca</Label>
              <input type="hidden" {...register("marca_id")} />
              <Select 
                value={watch("marca_id") || EMPTY_SELECT_VALUE} 
                onValueChange={(value) => setSelectValue("marca_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar marca" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_SELECT_VALUE}>Sin marca</SelectItem>
                  {marcas.map((marca) => (
                    <SelectItem key={marca.id} value={marca.id}>
                      {marca.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rubro_id">Rubro</Label>
              <input type="hidden" {...register("rubro_id")} />
              <Select 
                value={watch("rubro_id") || EMPTY_SELECT_VALUE} 
                onValueChange={(value) => {
                  setSelectValue("rubro_id", value);
                  setSelectValue("subrubro_id", "");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar rubro" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_SELECT_VALUE}>Sin rubro</SelectItem>
                  {rubros.map((rubro) => (
                    <SelectItem key={rubro.id} value={rubro.id}>
                      {rubro.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subrubro_id">SubRubro</Label>
              <input type="hidden" {...register("subrubro_id")} />
              <Select 
                value={watch("subrubro_id") || EMPTY_SELECT_VALUE} 
                onValueChange={(value) => setSelectValue("subrubro_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar subrubro" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_SELECT_VALUE}>Sin subrubro</SelectItem>
                  {filteredSubRubros.map((subrubro) => (
                    <SelectItem key={subrubro.id} value={subrubro.id}>
                      {subrubro.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="precio_costo">Precio Costo *</Label>
              <Input
                id="precio_costo"
                type="number"
                step="0.01"
                {...register("precio_costo", { 
                  required: "El precio costo es requerido",
                  valueAsNumber: true,
                  min: { value: 0, message: "El precio debe ser mayor a 0" }
                })}
                placeholder="0.00"
              />
              {errors.precio_costo && (
                <p className="text-sm text-destructive">{errors.precio_costo.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="porcentaje_iva">% IVA</Label>
              <Input
                id="porcentaje_iva"
                type="number"
                step="0.01"
                {...register("porcentaje_iva", { 
                  valueAsNumber: true,
                  min: { value: 0, message: "El porcentaje debe ser mayor a 0" }
                })}
                placeholder="21.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="porcentaje_utilidad">% Utilidad</Label>
              <Input
                id="porcentaje_utilidad"
                type="number"
                step="0.01"
                {...register("porcentaje_utilidad", { 
                  valueAsNumber: true,
                  min: { value: 0, message: "El porcentaje debe ser mayor a 0" }
                })}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="porcentaje_descuento">% Descuento</Label>
              <Input
                id="porcentaje_descuento"
                type="number"
                step="0.01"
                {...register("porcentaje_descuento", { 
                  valueAsNumber: true,
                  min: { value: 0, message: "El porcentaje debe ser mayor a 0" }
                })}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="precio_venta">Precio de Venta</Label>
              <Input
                id="precio_venta"
                type="number"
                step="0.01"
                {...register("precio_venta", { valueAsNumber: true })}
                placeholder="0.00"
                readOnly
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="stock">Stock *</Label>
              <Input
                id="stock"
                type="number"
                {...register("stock", { 
                  required: "El stock es requerido",
                  valueAsNumber: true,
                  min: { value: 0, message: "El stock debe ser mayor o igual a 0" }
                })}
                placeholder="0"
              />
              {errors.stock && (
                <p className="text-sm text-destructive">{errors.stock.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo_moneda">Tipo de Moneda</Label>
              <Select 
                value={watch("tipo_moneda")} 
                onValueChange={(value) => setValue("tipo_moneda", value as "ARS" | "USD" | "USD_BLUE", { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar moneda" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ARS">ARS ($)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="USD_BLUE">USD Blue ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="observaciones">Observaciones internas</Label>
              <Textarea
                id="observaciones"
                {...register("observaciones")}
                placeholder="Notas internas que no se mostrarán en la tienda"
                rows={3}
              />
            </div>

            {descripcionTiendaHabilitada && <div className="space-y-2 md:col-span-2">
              <Label>Descripción para tienda online</Label>
              <p className="text-sm text-muted-foreground">Este contenido aparecerá en la solapa Descripción de la ficha pública del producto.</p>
              <ProductDescriptionEditor
                value={watch("descripcion_tienda_html") || ""}
                onChange={(value) => setValue("descripcion_tienda_html", value, { shouldDirty: true })}
              />
            </div>}

            {publicacionTiendaHabilitada && (
              <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-4">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    {...register("visible_en_tienda")}
                  />
                  <span>
                    <span className="block font-medium">Mostrar en tienda online</span>
                    <span className="text-sm text-muted-foreground">Se publicará cuando tenga stock.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-4">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    {...register("destacado_en_tienda")}
                  />
                  <span>
                    <span className="block font-medium">Producto destacado</span>
                    <span className="text-sm text-muted-foreground">Aparecerá debajo del carrusel usando su primera imagen.</span>
                  </span>
                </label>
              </div>
            )}

            {imagenesHabilitadas && (
              <div className="space-y-3 md:col-span-2">
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <Label>Imagenes del producto</Label>
                    <p className="text-sm text-muted-foreground">Hasta 5 imagenes PNG, JPG o WEBP de 5 MB cada una.</p>
                  </div>
                  <span className="text-sm text-muted-foreground">{imagenes.length + imagenesPendientes.length}/{MAX_PRODUCT_IMAGES}</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {imagenes.map((image) => (
                    <div key={image.id} className="relative h-24 w-24 overflow-hidden rounded-md border bg-muted">
                      <img src={image.publicUrl} alt="Imagen del producto" className="h-full w-full object-cover" />
                      <Button type="button" variant="destructive" size="icon" className="absolute right-1 top-1 h-6 w-6" onClick={() => void removeStoredImage(image)} aria-label="Eliminar imagen">
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  {imagenesPendientes.map((image, index) => (
                    <div key={image.previewUrl} className="relative h-24 w-24 overflow-hidden rounded-md border bg-muted">
                      <img src={image.previewUrl} alt="Vista previa de imagen" className="h-full w-full object-cover" />
                      <Button type="button" variant="destructive" size="icon" className="absolute right-1 top-1 h-6 w-6" onClick={() => removePendingImage(index)} aria-label="Quitar imagen">
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  {imagenes.length + imagenesPendientes.length < MAX_PRODUCT_IMAGES && (
                    <Label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:bg-muted" htmlFor="producto-imagenes">
                      <ImagePlus className="h-5 w-5" />
                      <span className="text-xs">Agregar</span>
                      <Input id="producto-imagenes" type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={selectImages} />
                    </Label>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-4">
            <Button 
              type="submit" 
              variant="success"
              disabled={isCreating || isUpdating || isUploadingImages}
            >
              {isUploadingImages ? "Cargando imagenes..." : `${producto ? "Actualizar" : "Crear"} Producto`}
            </Button>
            {onClose && (
              <Button type="button" variant="cancel" onClick={onClose}>
                Cancelar
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
