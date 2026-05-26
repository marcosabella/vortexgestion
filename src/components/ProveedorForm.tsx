import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useCreateProveedor, useUpdateProveedor, type Proveedor } from '@/hooks/useProveedores';
import { useConsultarArca } from '@/hooks/useConsultarArca';
import { SITUACIONES_AFIP, PROVINCIAS_ARGENTINA } from '@/types/cliente';
import { validateCUIT, esDNI, formatCUIT } from '@/utils/validations';
import { Search, Loader2 } from 'lucide-react';

const proveedorSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  apellido: z.string().optional(),
  razon_social: z.string().optional(),
  cuit: z.string().refine((val) => {
    const limpio = val.replace(/[-\s]/g, '');
    // Aceptar DNI (7-8 dígitos) o CUIT (11 dígitos válido)
    if (limpio.length >= 7 && limpio.length <= 8) return true;
    if (limpio.length === 11) return validateCUIT(val);
    return false;
  }, 'Ingrese un DNI (7-8 dígitos) o CUIT válido (11 dígitos)'),
  calle: z.string().min(1, 'La calle es requerida'),
  numero: z.string().min(1, 'El número es requerido'),
  codigo_postal: z.string().min(1, 'El código postal es requerido'),
  localidad: z.string().min(1, 'La localidad es requerida'),
  provincia: z.string().min(1, 'La provincia es requerida'),
  telefono: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  situacion_afip: z.string().min(1, 'La situación AFIP es requerida'),
  ingresos_brutos: z.string().optional(),
  tipo_persona: z.enum(['fisica', 'juridica'], { required_error: 'El tipo de persona es requerido' }),
});

type ProveedorFormData = z.infer<typeof proveedorSchema>;

interface ProveedorFormProps {
  proveedor?: Proveedor;
  onSuccess?: () => void;
}

export function ProveedorForm({ proveedor, onSuccess }: ProveedorFormProps) {
  const createProveedor = useCreateProveedor();
  const updateProveedor = useUpdateProveedor();
  const { consultarCuit, isLoading: isLoadingArca } = useConsultarArca();

  const form = useForm<ProveedorFormData>({
    resolver: zodResolver(proveedorSchema),
    defaultValues: {
      nombre: proveedor?.nombre || '',
      apellido: proveedor?.apellido || '',
      razon_social: proveedor?.razon_social || '',
      cuit: proveedor?.cuit || '',
      calle: proveedor?.calle || '',
      numero: proveedor?.numero || '',
      codigo_postal: proveedor?.codigo_postal || '',
      localidad: proveedor?.localidad || '',
      provincia: proveedor?.provincia || '',
      telefono: proveedor?.telefono || '',
      email: proveedor?.email || '',
      situacion_afip: proveedor?.situacion_afip || '',
      ingresos_brutos: proveedor?.ingresos_brutos || '',
      tipo_persona: proveedor?.tipo_persona || 'fisica',
    },
  });

  const handleConsultarArca = async () => {
    const valor = form.getValues('cuit');
    const datos = await consultarCuit(valor);
    
    if (datos) {
      form.setValue('tipo_persona', datos.tipoPersona);
      
      if (datos.tipoPersona === 'juridica') {
        // Para persona jurídica, usar razón social
        if (datos.razonSocial) {
          form.setValue('razon_social', datos.razonSocial);
          form.setValue('nombre', datos.razonSocial);
        } else if (datos.nombre) {
          form.setValue('razon_social', datos.nombre);
          form.setValue('nombre', datos.nombre);
        }
      } else {
        // Para persona física
        if (datos.nombre) form.setValue('nombre', datos.nombre);
        if (datos.apellido) form.setValue('apellido', datos.apellido);
      }
      
      if (datos.situacionAfip) form.setValue('situacion_afip', datos.situacionAfip);
      
      // Si se encontró el CUIT desde un DNI, actualizar el campo
      if (datos.cuitEncontrado) {
        form.setValue('cuit', formatCUIT(datos.cuitEncontrado));
      }
      
      if (datos.domicilioFiscal) {
        if (datos.domicilioFiscal.calle) form.setValue('calle', datos.domicilioFiscal.calle);
        if (datos.domicilioFiscal.numero) form.setValue('numero', datos.domicilioFiscal.numero);
        if (datos.domicilioFiscal.localidad) form.setValue('localidad', datos.domicilioFiscal.localidad);
        if (datos.domicilioFiscal.provincia) form.setValue('provincia', datos.domicilioFiscal.provincia);
        if (datos.domicilioFiscal.codigoPostal) form.setValue('codigo_postal', datos.domicilioFiscal.codigoPostal);
      }
    }
  };

  const onSubmit = async (data: ProveedorFormData) => {
    const proveedorData: Proveedor = {
      ...data,
      nombre: data.nombre,
      apellido: data.apellido || undefined,
      razon_social: data.razon_social || undefined,
      cuit: data.cuit,
      calle: data.calle,
      numero: data.numero,
      codigo_postal: data.codigo_postal,
      localidad: data.localidad,
      provincia: data.provincia,
      telefono: data.telefono || undefined,
      email: data.email || undefined,
      situacion_afip: data.situacion_afip,
      ingresos_brutos: data.ingresos_brutos || undefined,
      tipo_persona: data.tipo_persona,
    };

    try {
      if (proveedor) {
        await updateProveedor.mutateAsync({ ...proveedorData, id: proveedor.id! } as Proveedor);
      } else {
        await createProveedor.mutateAsync(proveedorData as Omit<Proveedor, 'id'>);
      }

      form.reset();
      onSuccess?.();
    } catch (error) {
      console.error('Error al guardar proveedor:', error);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* CUIT/DNI - Primer campo con búsqueda ARCA */}
        <div className="space-y-2">
          <Label htmlFor="cuit">CUIT o DNI</Label>
          <div className="flex gap-2">
            <FormField
              control={form.control}
              name="cuit"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormControl>
                    <Input 
                      placeholder="DNI: 12345678 o CUIT: 20-12345678-9" 
                      maxLength={13}
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!proveedor && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleConsultarArca}
                disabled={isLoadingArca}
              >
                {isLoadingArca ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="ml-2">Buscar</span>
              </Button>
            )}
          </div>
          {!proveedor && (
            <p className="text-sm text-muted-foreground">
              Ingrese <strong>DNI</strong> (7-8 dígitos) o <strong>CUIT</strong> (11 dígitos) y presione Buscar
            </p>
          )}
        </div>

        {/* Tipo de Persona */}
        <FormField
          control={form.control}
          name="tipo_persona"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de Persona</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="fisica">Persona Física</SelectItem>
                  <SelectItem value="juridica">Persona Jurídica</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Datos según tipo de persona */}
        {form.watch('tipo_persona') === 'juridica' ? (
          <FormField
            control={form.control}
            name="razon_social"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Razón Social</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="apellido"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Apellido</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {/* Situación AFIP */}
        <FormField
          control={form.control}
          name="situacion_afip"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Situación AFIP</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar situación" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SITUACIONES_AFIP.map((situacion) => (
                    <SelectItem key={situacion} value={situacion}>
                      {situacion}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Dirección */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="calle"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Calle</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="numero"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="codigo_postal"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Código Postal</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="localidad"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Localidad</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="provincia"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Provincia</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar provincia" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PROVINCIAS_ARGENTINA.map((provincia) => (
                      <SelectItem key={provincia} value={provincia}>
                        {provincia}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Contacto */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="telefono"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Teléfono</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Ingresos Brutos */}
        <FormField
          control={form.control}
          name="ingresos_brutos"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ingresos Brutos</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-2 pt-4">
          <Button type="submit" variant="success" disabled={createProveedor.isPending || updateProveedor.isPending}>
            {proveedor ? 'Actualizar' : 'Crear'} Proveedor
          </Button>
        </div>
      </form>
    </Form>
  );
}
