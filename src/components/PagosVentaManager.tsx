import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { Trash2, Plus } from "lucide-react"
import { PagoVenta, TipoPago, TIPOS_PAGO, getPagoMontoBase, getTipoPagoLabel } from "@/types/venta"
import { useTarjetas } from "@/hooks/useTarjetas"
import { useTarjetaCuotas } from "@/hooks/useTarjetaCuotas"
import { useBancos } from "@/hooks/useBancos"
import { useToast } from "@/hooks/use-toast"
import { ChequeDialogForm } from "@/components/ChequeDialogForm"
import { supabase } from "@/integrations/supabase/client"

type PagosVentaManagerProps = {
  totalVenta: number
  clienteId?: string
  pagos: Omit<PagoVenta, "id" | "venta_id" | "created_at" | "updated_at">[]
  onChange: (pagos: Omit<PagoVenta, "id" | "venta_id" | "created_at" | "updated_at">[]) => void
}

export const PagosVentaManager: React.FC<PagosVentaManagerProps> = ({
  totalVenta,
  clienteId,
  pagos,
  onChange
}) => {
  const { toast } = useToast()
  const { tarjetas } = useTarjetas()
  const { bancos } = useBancos()
  
  const [tipoPago, setTipoPago] = useState<TipoPago>("contado")
  const [monto, setMonto] = useState<number>(0)
  const [bancoId, setBancoId] = useState<string>("")
  const [tarjetaId, setTarjetaId] = useState<string>("")
  const [cuotas, setCuotas] = useState<number>(1)
  const [recargoMonetario, setRecargoMonetario] = useState<number>(0)
  const [chequeDialogOpen, setChequeDialogOpen] = useState(false)
  const [pendingPago, setPendingPago] = useState<any>(null)

  const { tarjetaCuotas } = useTarjetaCuotas(tarjetaId)

  const totalPagado = pagos.reduce((sum, p) => sum + getPagoMontoBase(p), 0)
  const saldoPendiente = totalVenta - totalPagado

  useEffect(() => {
    if (saldoPendiente > 0) {
      setMonto(saldoPendiente)
    }
  }, [saldoPendiente])

  // Calcular recargo cuando cambian las cuotas
  useEffect(() => {
    if (tarjetaId && cuotas > 1 && tarjetaCuotas.length > 0) {
      const cuotaConfig = tarjetaCuotas.find(c => c.cantidad_cuotas === cuotas)
      if (cuotaConfig && monto > 0) {
        const recargo = (monto * cuotaConfig.porcentaje_recargo) / 100
        setRecargoMonetario(recargo)
      }
    } else {
      setRecargoMonetario(0)
    }
  }, [tarjetaId, cuotas, tarjetaCuotas, monto])

  const agregarPago = async () => {
    if (monto <= 0) {
      toast({
        title: "Error",
        description: "El monto debe ser mayor a 0",
        variant: "destructive",
      })
      return
    }

    if (monto > saldoPendiente) {
      toast({
        title: "Error",
        description: "El monto no puede ser mayor al saldo pendiente",
        variant: "destructive",
      })
      return
    }

    if (tipoPago === "transferencia" && !bancoId) {
      toast({
        title: "Error",
        description: "Debe seleccionar un banco",
        variant: "destructive",
      })
      return
    }

    if (tipoPago === "tarjeta" && !tarjetaId) {
      toast({
        title: "Error",
        description: "Debe seleccionar una tarjeta",
        variant: "destructive",
      })
      return
    }

    if (tipoPago === "cta_cte" && !clienteId) {
      toast({
        title: "Error",
        description: "Debe seleccionar un cliente para cargar saldo en cuenta corriente",
        variant: "destructive",
      })
      return
    }

    // Si es cheque, abrir diálogo primero
    if (tipoPago === "cheque") {
      setPendingPago({
        tipo_pago: tipoPago,
        monto: monto + recargoMonetario,
        banco_id: bancoId || undefined,
        tarjeta_id: tarjetaId || undefined,
        cuotas: cuotas || 1,
        recargo_cuotas: recargoMonetario,
      })
      setChequeDialogOpen(true)
      return
    }

    const nuevoPago: Omit<PagoVenta, "id" | "venta_id" | "created_at" | "updated_at"> = {
      tipo_pago: tipoPago,
      monto: monto + recargoMonetario,
      banco_id: bancoId || undefined,
      tarjeta_id: tarjetaId || undefined,
      cuotas: cuotas || 1,
      recargo_cuotas: recargoMonetario,
    }

    onChange([...pagos, nuevoPago])
    resetForm()
  }

  const handleChequeSubmit = async (chequeData: any) => {
    if (!pendingPago) return

    try {
      const chequeCompleto = {
        ...chequeData,
        cliente_id: clienteId,
        estado: 'en_cartera' as const,
      }

      const { data: chequeCreado, error: chequeError } = await supabase
        .from('cheques')
        .insert([chequeCompleto])
        .select()
        .single()

      if (chequeError) throw chequeError

      const nuevoPago: Omit<PagoVenta, "id" | "venta_id" | "created_at" | "updated_at"> = {
        ...pendingPago,
        cheque_id: chequeCreado.id,
      }

      onChange([...pagos, nuevoPago])
      setChequeDialogOpen(false)
      setPendingPago(null)
      resetForm()
      
      toast({
        title: "Éxito",
        description: "Cheque registrado correctamente",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al registrar el cheque",
        variant: "destructive",
      })
    }
  }

  const eliminarPago = (index: number) => {
    const nuevosPagos = pagos.filter((_, i) => i !== index)
    onChange(nuevosPagos)
  }

  const resetForm = () => {
    setTipoPago("contado")
    setMonto(saldoPendiente > 0 ? saldoPendiente : 0)
    setBancoId("")
    setTarjetaId("")
    setCuotas(1)
    setRecargoMonetario(0)
  }

  const obtenerNombreTipoPago = (tipo: TipoPago) => getTipoPagoLabel(tipo)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Métodos de Pago</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Resumen */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
          <div>
            <p className="text-sm text-muted-foreground">Total Venta</p>
            <p className="text-lg font-bold">${totalVenta.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Pagado</p>
            <p className="text-lg font-bold text-green-600">${totalPagado.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Saldo Pendiente</p>
            <p className="text-lg font-bold text-orange-600">${saldoPendiente.toFixed(2)}</p>
          </div>
        </div>

        {/* Formulario para agregar pago */}
        {saldoPendiente > 0 && (
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo de Pago</Label>
                <Select value={tipoPago} onValueChange={(value: TipoPago) => setTipoPago(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_PAGO.map(tipo => (
                      <SelectItem key={tipo.value} value={tipo.value}>
                        {tipo.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Monto</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={monto}
                  onChange={(e) => setMonto(Number(e.target.value))}
                />
              </div>
            </div>

            {tipoPago === "transferencia" && (
              <div>
                <Label>Banco</Label>
                <Select value={bancoId} onValueChange={setBancoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar banco" />
                  </SelectTrigger>
                  <SelectContent>
                    {bancos.map(banco => (
                      <SelectItem key={banco.id} value={banco.id}>
                        {banco.nombre_banco} - {banco.numero_cuenta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {tipoPago === "tarjeta" && (
              <>
                <div>
                  <Label>Tarjeta</Label>
                  <Select value={tarjetaId} onValueChange={setTarjetaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tarjeta" />
                    </SelectTrigger>
                    <SelectContent>
                      {tarjetas.map(tarjeta => (
                        <SelectItem key={tarjeta.id} value={tarjeta.id}>
                          {tarjeta.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {tarjetaId && tarjetaCuotas.length > 0 && (
                  <div>
                    <Label>Cuotas</Label>
                    <Select value={cuotas.toString()} onValueChange={(val) => setCuotas(Number(val))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {tarjetaCuotas.map(cuota => (
                          <SelectItem key={cuota.cantidad_cuotas} value={cuota.cantidad_cuotas.toString()}>
                            {cuota.cantidad_cuotas} cuota{cuota.cantidad_cuotas > 1 ? 's' : ''} 
                            {cuota.porcentaje_recargo > 0 && ` (+${cuota.porcentaje_recargo}%)`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {recargoMonetario > 0 && (
                  <div className="text-sm text-muted-foreground">
                    Recargo por cuotas: ${recargoMonetario.toFixed(2)}
                  </div>
                )}
              </>
            )}

            <Button type="button" variant="new" onClick={agregarPago} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Agregar Pago
            </Button>
          </div>
        )}

        {/* Lista de pagos */}
        {pagos.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Monto venta</TableHead>
                <TableHead>Recargo</TableHead>
                <TableHead>Detalles</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagos.map((pago, index) => (
                <TableRow key={index}>
                  <TableCell>{obtenerNombreTipoPago(pago.tipo_pago)}</TableCell>
                  <TableCell>${getPagoMontoBase(pago).toFixed(2)}</TableCell>
                  <TableCell>
                    {pago.recargo_cuotas && pago.recargo_cuotas > 0
                      ? `$${pago.recargo_cuotas.toFixed(2)}`
                      : "-"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {pago.tipo_pago === "tarjeta" && pago.cuotas && pago.cuotas > 1 && (
                      <>
                        {pago.cuotas} cuotas
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => eliminarPago(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ChequeDialogForm
          open={chequeDialogOpen}
          onOpenChange={setChequeDialogOpen}
          onSubmit={handleChequeSubmit}
          monto={pendingPago?.monto || monto}
          clienteId={clienteId}
        />
      </CardContent>
    </Card>
  )
}
