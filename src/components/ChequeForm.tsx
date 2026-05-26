import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Cheque, ESTADOS_CHEQUE } from '@/types/cheque';
import { useClientes } from '@/hooks/useClientes';
import { format } from 'date-fns';

const chequeSchema = z.object({
  numero_cheque: z.string().min(1, 'Número de cheque requerido'),
  banco_emisor: z.string().min(1, 'Banco emisor requerido'),
  monto: z.number().min(0, 'El monto debe ser mayor a 0'),
  fecha_emision: z.string().min(1, 'Fecha de emisión requerida'),
  fecha_vencimiento: z.string().min(1, 'Fecha de vencimiento requerida'),
  emisor_nombre: z.string().min(1, 'Nombre del emisor requerido'),
  emisor_cuit: z.string().optional(),
  cliente_id: z.string().optional(),
  estado: z.enum(['en_cartera', 'depositado', 'rechazado', 'endosado']),
  observaciones: z.string().optional(),
});

type ChequeFormData = z.infer<typeof chequeSchema>;

interface ChequeFormProps {
  cheque?: Cheque;
  onSubmit: (data: ChequeFormData) => void;
  onCancel: () => void;
}

export const ChequeForm = ({ cheque, onSubmit, onCancel }: ChequeFormProps) => {
  const { data: clientes } = useClientes();
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<ChequeFormData>({
    resolver: zodResolver(chequeSchema),
    defaultValues: cheque ? {
      ...cheque,
      fecha_emision: format(new Date(cheque.fecha_emision), 'yyyy-MM-dd'),
      fecha_vencimiento: format(new Date(cheque.fecha_vencimiento), 'yyyy-MM-dd'),
    } : {
      estado: 'en_cartera',
      fecha_emision: format(new Date(), 'yyyy-MM-dd'),
      fecha_vencimiento: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  const estado = watch('estado');
  const clienteId = watch('cliente_id');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="numero_cheque">Número de Cheque *</Label>
          <Input
            id="numero_cheque"
            {...register('numero_cheque')}
            className={errors.numero_cheque ? 'border-destructive' : ''}
          />
          {errors.numero_cheque && (
            <p className="text-sm text-destructive mt-1">{errors.numero_cheque.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="banco_emisor">Banco Emisor *</Label>
          <Input
            id="banco_emisor"
            {...register('banco_emisor')}
            className={errors.banco_emisor ? 'border-destructive' : ''}
          />
          {errors.banco_emisor && (
            <p className="text-sm text-destructive mt-1">{errors.banco_emisor.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="monto">Monto *</Label>
          <Input
            id="monto"
            type="number"
            step="0.01"
            {...register('monto', { valueAsNumber: true })}
            className={errors.monto ? 'border-destructive' : ''}
          />
          {errors.monto && (
            <p className="text-sm text-destructive mt-1">{errors.monto.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="estado">Estado *</Label>
          <Select value={estado} onValueChange={(value) => setValue('estado', value as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTADOS_CHEQUE.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="fecha_emision">Fecha de Emisión *</Label>
          <Input
            id="fecha_emision"
            type="date"
            {...register('fecha_emision')}
            className={errors.fecha_emision ? 'border-destructive' : ''}
          />
          {errors.fecha_emision && (
            <p className="text-sm text-destructive mt-1">{errors.fecha_emision.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="fecha_vencimiento">Fecha de Vencimiento *</Label>
          <Input
            id="fecha_vencimiento"
            type="date"
            {...register('fecha_vencimiento')}
            className={errors.fecha_vencimiento ? 'border-destructive' : ''}
          />
          {errors.fecha_vencimiento && (
            <p className="text-sm text-destructive mt-1">{errors.fecha_vencimiento.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="emisor_nombre">Nombre del Emisor *</Label>
          <Input
            id="emisor_nombre"
            {...register('emisor_nombre')}
            className={errors.emisor_nombre ? 'border-destructive' : ''}
          />
          {errors.emisor_nombre && (
            <p className="text-sm text-destructive mt-1">{errors.emisor_nombre.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="emisor_cuit">CUIT del Emisor</Label>
          <Input
            id="emisor_cuit"
            {...register('emisor_cuit')}
          />
        </div>

        <div>
          <Label htmlFor="cliente_id">Cliente que Paga (Opcional)</Label>
          <Select value={clienteId || undefined} onValueChange={(value) => setValue('cliente_id', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Sin cliente asignado" />
            </SelectTrigger>
            <SelectContent>
              {clientes?.map((cliente) => (
                <SelectItem key={cliente.id} value={cliente.id}>
                  {cliente.nombre} {cliente.apellido} - {cliente.cuit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="observaciones">Observaciones</Label>
        <Textarea
          id="observaciones"
          {...register('observaciones')}
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="cancel" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="success">
          {cheque ? 'Actualizar' : 'Registrar'} Cheque
        </Button>
      </div>
    </form>
  );
};
