import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCreateCliente, useUpdateCliente } from '@/hooks/useClientes';
import { useConsultarArca } from '@/hooks/useConsultarArca';
import { Cliente, SITUACIONES_AFIP, PROVINCIAS_ARGENTINA } from '@/types/cliente';
import { validateCUIT, validateEmail, validatePhone, esDNI, formatCUIT } from '@/utils/validations';
import { Search, Loader2 } from 'lucide-react';

const clienteSchema = z.object({
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  apellido: z.string().min(2, 'El apellido debe tener al menos 2 caracteres'),
  cuit: z.string().refine((val) => {
    const limpio = val.replace(/[-\s]/g, '');
    // Aceptar DNI (7-8 dígitos) o CUIT (11 dígitos válido)
    if (limpio.length >= 7 && limpio.length <= 8) return true;
    if (limpio.length === 11) return validateCUIT(val);
    return false;
  }, 'Ingrese un DNI (7-8 dígitos) o CUIT válido (11 dígitos)'),
  calle: z.string().min(3, 'La calle debe tener al menos 3 caracteres'),
  numero: z.string().min(1, 'El número es requerido'),
  codigo_postal: z.string().min(4, 'Código postal inválido'),
  localidad: z.string().min(2, 'La localidad debe tener al menos 2 caracteres'),
  provincia: z.string().min(1, 'Seleccione una provincia'),
  telefono: z.string().optional().refine((val) => !val || validatePhone(val), 'Teléfono inválido'),
  email: z.string().optional().refine((val) => !val || validateEmail(val), 'Email inválido'),
  situacion_afip: z.string().min(1, 'Seleccione una situación AFIP'),
  ingresos_brutos: z.string().optional(),
  tipo_persona: z.enum(['fisica', 'juridica']),
});

type ClienteFormData = z.infer<typeof clienteSchema>;

interface ClienteFormProps {
  cliente?: Cliente;
  onSuccess?: () => void;
  showTitle?: boolean;
}

export function ClienteForm({ cliente, onSuccess, showTitle = true }: ClienteFormProps) {
  const createCliente = useCreateCliente();
  const updateCliente = useUpdateCliente();
  const { consultarCuit, isLoading: isLoadingArca } = useConsultarArca();
  
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<ClienteFormData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: cliente ? {
      nombre: cliente.nombre,
      apellido: cliente.apellido,
      cuit: cliente.cuit,
      calle: cliente.calle,
      numero: cliente.numero,
      codigo_postal: cliente.codigo_postal,
      localidad: cliente.localidad,
      provincia: cliente.provincia,
      telefono: cliente.telefono || '',
      email: cliente.email || '',
      situacion_afip: cliente.situacion_afip,
      ingresos_brutos: cliente.ingresos_brutos || '',
      tipo_persona: cliente.tipo_persona,
    } : {
      tipo_persona: 'fisica',
    },
  });

  const watchedTipoPersona = watch('tipo_persona');

  const handleConsultarArca = async () => {
    const valor = getValues('cuit');
    const datos = await consultarCuit(valor);
    
    if (datos) {
      setValue('tipo_persona', datos.tipoPersona);
      if (datos.nombre) setValue('nombre', datos.nombre);
      if (datos.apellido) setValue('apellido', datos.apellido);
      if (datos.situacionAfip) setValue('situacion_afip', datos.situacionAfip);
      
      // Si se encontró el CUIT desde un DNI, actualizar el campo
      if (datos.cuitEncontrado) {
        setValue('cuit', formatCUIT(datos.cuitEncontrado));
      }
      
      if (datos.domicilioFiscal) {
        if (datos.domicilioFiscal.calle) setValue('calle', datos.domicilioFiscal.calle);
        if (datos.domicilioFiscal.numero) setValue('numero', datos.domicilioFiscal.numero);
        if (datos.domicilioFiscal.localidad) setValue('localidad', datos.domicilioFiscal.localidad);
        if (datos.domicilioFiscal.provincia) setValue('provincia', datos.domicilioFiscal.provincia);
        if (datos.domicilioFiscal.codigoPostal) setValue('codigo_postal', datos.domicilioFiscal.codigoPostal);
      }
    }
  };

  const onSubmit = async (data: ClienteFormData) => {
    try {
      const clienteData: Omit<Cliente, 'id' | 'created_at' | 'updated_at'> = {
        nombre: data.nombre,
        apellido: data.apellido,
        cuit: data.cuit,
        calle: data.calle,
        numero: data.numero,
        codigo_postal: data.codigo_postal,
        localidad: data.localidad,
        provincia: data.provincia,
        situacion_afip: data.situacion_afip,
        tipo_persona: data.tipo_persona,
        telefono: data.telefono || null,
        email: data.email || null,
        ingresos_brutos: data.ingresos_brutos || null,
      };

      if (cliente?.id) {
        await updateCliente.mutateAsync({ id: cliente.id, ...clienteData });
      } else {
        await createCliente.mutateAsync(clienteData);
      }
      onSuccess?.();
    } catch (error) {
      console.error('Error al guardar cliente:', error);
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      {showTitle && (
        <CardHeader>
          <CardTitle>
            {cliente ? 'Editar Cliente' : 'Nuevo Cliente'}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className={showTitle ? undefined : "pt-6"}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* CUIT/DNI - Primer campo */}
          <div className="space-y-2">
            <Label htmlFor="cuit">CUIT o DNI</Label>
            <div className="flex gap-2">
              <Input
                id="cuit"
                {...register('cuit')}
                placeholder="DNI: 12345678 o CUIT: 20-12345678-9"
                maxLength={13}
                className="flex-1"
              />
              {!cliente && (
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
            {errors.cuit && (
              <p className="text-sm text-destructive">{String(errors.cuit.message)}</p>
            )}
            {!cliente && (
              <div className="text-sm text-muted-foreground">
                <p>Ingrese <strong>DNI</strong> (7-8 dígitos) o <strong>CUIT</strong> (11 dígitos) y presione Buscar</p>
              </div>
            )}
          </div>

          {/* Tipo de Persona */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Tipo de Persona</Label>
            <RadioGroup 
              value={watchedTipoPersona} 
              onValueChange={(value) => setValue('tipo_persona', value as 'fisica' | 'juridica')}
              className="flex space-x-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="fisica" id="fisica" />
                <Label htmlFor="fisica">Persona Física</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="juridica" id="juridica" />
                <Label htmlFor="juridica">Persona Jurídica</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Datos Personales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">
                {watchedTipoPersona === 'juridica' ? 'Razón Social' : 'Nombre'}
              </Label>
              <Input
                id="nombre"
                {...register('nombre')}
                placeholder={watchedTipoPersona === 'juridica' ? 'Ingrese la razón social' : 'Ingrese el nombre'}
              />
              {errors.nombre && (
                <p className="text-sm text-destructive">{String(errors.nombre.message)}</p>
              )}
            </div>

            {watchedTipoPersona === 'fisica' && (
              <div className="space-y-2">
                <Label htmlFor="apellido">Apellido</Label>
                <Input
                  id="apellido"
                  {...register('apellido')}
                  placeholder="Ingrese el apellido"
                />
                {errors.apellido && (
                  <p className="text-sm text-destructive">{String(errors.apellido.message)}</p>
                )}
              </div>
            )}
          </div>

          {/* Situación AFIP - Movido arriba */}
          <div className="space-y-2">
            <Label htmlFor="situacion_afip">Situación AFIP</Label>
            <Select 
              defaultValue={cliente?.situacion_afip}
              value={watch('situacion_afip')}
              onValueChange={(value) => setValue('situacion_afip', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar situación" />
              </SelectTrigger>
              <SelectContent>
                {SITUACIONES_AFIP.map((situacion) => (
                  <SelectItem key={situacion} value={situacion}>
                    {situacion}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.situacion_afip && (
              <p className="text-sm text-destructive">{String(errors.situacion_afip.message)}</p>
            )}
          </div>

          {/* Dirección */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Dirección</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="calle">Calle</Label>
                <Input
                  id="calle"
                  {...register('calle')}
                  placeholder="Nombre de la calle"
                />
                {errors.calle && (
                  <p className="text-sm text-destructive">{String(errors.calle.message)}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="numero">Número</Label>
                <Input
                  id="numero"
                  {...register('numero')}
                  placeholder="1234"
                />
                {errors.numero && (
                  <p className="text-sm text-destructive">{String(errors.numero.message)}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="codigo_postal">Código Postal</Label>
                <Input
                  id="codigo_postal"
                  {...register('codigo_postal')}
                  placeholder="1234"
                />
                {errors.codigo_postal && (
                  <p className="text-sm text-destructive">{String(errors.codigo_postal.message)}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="localidad">Localidad</Label>
                <Input
                  id="localidad"
                  {...register('localidad')}
                  placeholder="Ciudad"
                />
                {errors.localidad && (
                  <p className="text-sm text-destructive">{String(errors.localidad.message)}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="provincia">Provincia</Label>
                <Select 
                  defaultValue={cliente?.provincia}
                  value={watch('provincia')}
                  onValueChange={(value) => setValue('provincia', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar provincia" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVINCIAS_ARGENTINA.map((provincia) => (
                      <SelectItem key={provincia} value={provincia}>
                        {provincia}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.provincia && (
                  <p className="text-sm text-destructive">{String(errors.provincia.message)}</p>
                )}
              </div>
            </div>
          </div>

          {/* Contacto */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input
                id="telefono"
                {...register('telefono')}
                placeholder="+54 11 4567-8900"
              />
              {errors.telefono && (
                <p className="text-sm text-destructive">{String(errors.telefono.message)}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                {...register('email')}
                placeholder="cliente@email.com"
              />
              {errors.email && (
                <p className="text-sm text-destructive">{String(errors.email.message)}</p>
              )}
            </div>
          </div>

          {/* Ingresos Brutos */}
          <div className="space-y-2">
            <Label htmlFor="ingresos_brutos">Ingresos Brutos</Label>
            <Input
              id="ingresos_brutos"
              {...register('ingresos_brutos')}
              placeholder="Número de inscripción"
            />
            {errors.ingresos_brutos && (
              <p className="text-sm text-destructive">{String(errors.ingresos_brutos.message)}</p>
            )}
          </div>

          {/* Botones */}
          <div className="flex justify-end space-x-4 pt-6">
            <Button
              type="submit"
              variant="success"
              disabled={createCliente.isPending || updateCliente.isPending}
            >
              {createCliente.isPending || updateCliente.isPending
                ? 'Guardando...'
                : cliente
                ? 'Actualizar Cliente'
                : 'Crear Cliente'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
