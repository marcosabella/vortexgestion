import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search } from "lucide-react";
import { useCuentaCorriente } from "@/hooks/useCuentaCorriente";
import { useClientes } from "@/hooks/useClientes";
import { useTarjetas } from "@/hooks/useTarjetas";
import { useTarjetaCuotas } from "@/hooks/useTarjetaCuotas";
import { CONCEPTOS_MOVIMIENTO } from "@/types/cuenta-corriente";
import { format } from "date-fns";
import { ChequeDialogForm } from "@/components/ChequeDialogForm";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";

const movimientoSchema = z.object({
  cliente_id: z.string().min(1, "Cliente es requerido"),
  tipo_movimiento: z.enum(['debito', 'credito']),
  monto: z.number().min(0.01, "El monto debe ser mayor a 0"),
  concepto: z.string().min(1, "Concepto es requerido"),
  fecha_movimiento: z.string(),
  observaciones: z.string().optional(),
  tarjeta_id: z.string().optional(),
  cuotas: z.number().optional(),
});

interface CuentaCorrienteFormProps {
  onSuccess: () => void;
  showTitle?: boolean;
}

export const CuentaCorrienteForm = ({ onSuccess, showTitle = true }: CuentaCorrienteFormProps) => {
  const { createMovimiento, isCreating } = useCuentaCorriente();
  const clientesQuery = useClientes();
  
  const clientes = clientesQuery.data || [];
  
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<{ id: string; nombre: string; apellido: string } | null>(null);
  const [selectedTarjetaId, setSelectedTarjetaId] = useState<string>("");
  const [chequeDialogOpen, setChequeDialogOpen] = useState(false);
  const [pendingMovimientoData, setPendingMovimientoData] = useState<z.infer<typeof movimientoSchema> | null>(null);
  
  const { tarjetas } = useTarjetas();
  const { tarjetaCuotas } = useTarjetaCuotas(selectedTarjetaId);
  const tarjetasActivas = tarjetas.filter(t => t.activa);
  const cuotasDisponibles = tarjetaCuotas.filter(c => c.activa);

  const filteredClientes = clientes.filter(cliente =>
    cliente.nombre.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
    cliente.apellido.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
    cliente.cuit.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
    `${cliente.nombre} ${cliente.apellido}`.toLowerCase().includes(clientSearchTerm.toLowerCase())
  );

  const form = useForm<z.infer<typeof movimientoSchema>>({
    resolver: zodResolver(movimientoSchema),
    defaultValues: {
      tipo_movimiento: "credito",
      monto: 0,
      concepto: "",
      fecha_movimiento: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      observaciones: "",
      tarjeta_id: "",
      cuotas: 1,
    },
  });

  const onSubmit = (values: z.infer<typeof movimientoSchema>) => {
    // Si el concepto es pago con cheque, mostrar diálogo de cheque primero
    if (values.concepto === 'pago_cheque') {
      setPendingMovimientoData(values);
      setChequeDialogOpen(true);
      return;
    }

    procesarMovimiento(values);
  };

  const handleChequeSubmit = async (chequeData: any) => {
    if (!pendingMovimientoData) return;

    try {
      // Crear el cheque primero
      const chequeCompleto = {
        ...chequeData,
        cliente_id: pendingMovimientoData.cliente_id,
        estado: 'en_cartera' as const,
      };

      const { data: chequeCreado, error: chequeError } = await supabase
        .from('cheques')
        .insert([chequeCompleto])
        .select()
        .single();

      if (chequeError) throw chequeError;

      setChequeDialogOpen(false);
      
      // Procesar el movimiento con referencia al cheque
      await procesarMovimiento(pendingMovimientoData, chequeCreado.id);
      
      setPendingMovimientoData(null);
    } catch (error) {
      sonnerToast.error("Error al registrar el cheque");
    }
  };

  const procesarMovimiento = async (values: z.infer<typeof movimientoSchema>, chequeId?: string) => {
    const movimientoData: any = {
      cliente_id: values.cliente_id,
      tipo_movimiento: values.tipo_movimiento,
      monto: values.monto,
      concepto: values.concepto,
      fecha_movimiento: new Date(values.fecha_movimiento).toISOString(),
      observaciones: values.observaciones,
    };
    
    // Add card-specific fields if payment is with card
    if (values.concepto === "pago_tarjeta" && values.tarjeta_id) {
      movimientoData.tarjeta_id = values.tarjeta_id;
      movimientoData.cuotas = values.cuotas || 1;
    }

    // Si hay cheque, agregar referencia
    if (chequeId) {
      const { data: movCreado, error } = await supabase
        .from('cuenta_corriente')
        .insert([movimientoData])
        .select()
        .single();

      if (error) throw error;

      // Actualizar el cheque con el cuenta_corriente_id
      await supabase
        .from('cheques')
        .update({ cuenta_corriente_id: movCreado.id })
        .eq('id', chequeId);

      sonnerToast.success("Movimiento y cheque registrados exitosamente");
      onSuccess();
    } else {
      createMovimiento(movimientoData, { onSuccess });
    }
  };

  return (
    <Card>
      {showTitle && (
        <CardHeader>
          <CardTitle>Nuevo Movimiento de Cuenta Corriente</CardTitle>
        </CardHeader>
      )}
      <CardContent className={showTitle ? undefined : "pt-6"}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cliente_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input 
                          value={selectedClient ? `${selectedClient.nombre} ${selectedClient.apellido}` : ""}
                          readOnly 
                          placeholder="Seleccionar cliente..."
                        />
                      </FormControl>
                      <Dialog open={clientSearchOpen} onOpenChange={setClientSearchOpen}>
                        <DialogTrigger asChild>
                          <Button type="button" variant="outline" size="icon">
                            <Search className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Seleccionar Cliente</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="relative">
                              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Buscar por nombre, apellido o CUIT..."
                                value={clientSearchTerm}
                                onChange={(e) => setClientSearchTerm(e.target.value)}
                                className="pl-8"
                              />
                            </div>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                              {filteredClientes.map((cliente) => (
                                <Button
                                  key={cliente.id}
                                  type="button"
                                  variant="outline"
                                  className="w-full justify-start"
                                  onClick={() => {
                                    if (cliente.id) {
                                      setSelectedClient({
                                        id: cliente.id,
                                        nombre: cliente.nombre,
                                        apellido: cliente.apellido
                                      });
                                      form.setValue("cliente_id", cliente.id);
                                      setClientSearchOpen(false);
                                      setClientSearchTerm("");
                                    }
                                  }}
                                >
                                  <div className="text-left">
                                    <div className="font-medium">{cliente.nombre} {cliente.apellido}</div>
                                    <div className="text-sm text-muted-foreground">CUIT: {cliente.cuit}</div>
                                  </div>
                                </Button>
                              ))}
                              {filteredClientes.length === 0 && clientSearchTerm && (
                                <p className="text-center text-muted-foreground py-4">
                                  No se encontraron clientes que coincidan con la búsqueda
                                </p>
                              )}
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fecha_movimiento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha del Movimiento</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="tipo_movimiento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Movimiento</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="debito">Débito (Cargo)</SelectItem>
                        <SelectItem value="credito">Crédito (Pago)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="monto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01"
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
                name="concepto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Concepto</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar concepto" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CONCEPTOS_MOVIMIENTO.map((concepto) => (
                          <SelectItem key={concepto.value} value={concepto.value}>
                            {concepto.label}
                          </SelectItem>
                        ))}
                        <SelectItem value="pago_tarjeta">Pago con Tarjeta</SelectItem>
                        <SelectItem value="pago_cheque">Pago con Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {form.watch("concepto") === "pago_tarjeta" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tarjeta_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tarjeta de Crédito</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          field.onChange(value);
                          setSelectedTarjetaId(value);
                          form.setValue("cuotas", 1);
                        }} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar tarjeta" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {tarjetasActivas.map((tarjeta) => (
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

                {selectedTarjetaId && cuotasDisponibles.length > 0 && (
                  <FormField
                    control={form.control}
                    name="cuotas"
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
                            {cuotasDisponibles.map((cuota) => (
                              <SelectItem key={cuota.id} value={cuota.cantidad_cuotas.toString()}>
                                <div className="flex flex-col">
                                  <span>
                                    {cuota.cantidad_cuotas} {cuota.cantidad_cuotas === 1 ? 'cuota' : 'cuotas'}
                                  </span>
                                  {cuota.porcentaje_recargo > 0 && (
                                    <span className="text-sm text-muted-foreground">
                                      +{cuota.porcentaje_recargo}% recargo
                                    </span>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            )}

            <FormField
              control={form.control}
              name="observaciones"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observaciones</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" variant="success" disabled={isCreating}>
              {isCreating ? "Guardando..." : "Guardar Movimiento"}
            </Button>
          </form>
        </Form>

        <ChequeDialogForm
          open={chequeDialogOpen}
          onOpenChange={setChequeDialogOpen}
          onSubmit={handleChequeSubmit}
          monto={form.watch('monto')}
          clienteId={form.watch('cliente_id')}
        />
      </CardContent>
    </Card>
  );
};
