import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { format } from 'date-fns';

const chequeSchema = z.object({
  numero_cheque: z.string().min(1, 'Número de cheque requerido'),
  banco_emisor: z.string().min(1, 'Banco emisor requerido'),
  monto: z.number().min(0.01, 'El monto debe ser mayor a 0'),
  fecha_emision: z.string().min(1, 'Fecha de emisión requerida'),
  fecha_vencimiento: z.string().min(1, 'Fecha de vencimiento requerida'),
  emisor_nombre: z.string().min(1, 'Nombre del emisor requerido'),
  emisor_cuit: z.string().optional(),
  observaciones: z.string().optional(),
});

type ChequeFormData = z.infer<typeof chequeSchema>;

interface ChequeDialogFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ChequeFormData) => void;
  monto: number;
  clienteId?: string;
}

export const ChequeDialogForm = ({ open, onOpenChange, onSubmit, monto, clienteId }: ChequeDialogFormProps) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ChequeFormData>({
    resolver: zodResolver(chequeSchema),
    defaultValues: {
      monto,
      fecha_emision: format(new Date(), 'yyyy-MM-dd'),
      fecha_vencimiento: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  const handleFormSubmit = (data: ChequeFormData) => {
    onSubmit(data);
    reset();
  };

  const handleCancel = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Datos del Cheque</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
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
          </div>

          <div>
            <Label htmlFor="observaciones">Observaciones</Label>
            <Textarea
              id="observaciones"
              {...register('observaciones')}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="cancel" onClick={handleCancel}>
              Cancelar
            </Button>
            <Button type="submit" variant="success">
              Registrar Cheque y Continuar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
