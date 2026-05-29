import React, { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format } from "date-fns"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { supabase } from "@/integrations/supabase/client"
import { useVentas } from "@/hooks/useVentas"
import { useClientes } from "@/hooks/useClientes"
import { useProductos } from "@/hooks/useProductos"
import { useComercioParametrizacion } from "@/hooks/useComercioParametrizacion"
import { Venta, VentaItem, PagoVenta, TIPOS_COMPROBANTE, discriminaIvaEnComprobante, getTotalPagosBase } from "@/types/venta"
import { useToast } from "@/hooks/use-toast"
import { Trash2, Plus, Search } from "lucide-react"
import { PagosVentaManager } from "@/components/PagosVentaManager"

const ventaSchema = z.object({
  numero_comprobante: z.string().min(1, "Número de comprobante requerido"),
  fecha_venta: z.string().min(1, "Fecha requerida"),
  tipo_comprobante: z.enum([
    "factura_a", "factura_b", "factura_c", "nota_credito_a", "nota_credito_b", 
    "nota_credito_c", "nota_debito_a", "nota_debito_b", "nota_debito_c", 
    "recibo_a", "recibo_b", "recibo_c", "ticket_fiscal", "factura_exportacion"
  ]),
  cliente_id: z.string().optional(),
  cliente_nombre: z.string().min(1, "Nombre del cliente requerido"),
  porcentaje_descuento: z.number().min(0, "El descuento no puede ser negativo").default(0),
  monto_descuento: z.number().min(0, "El descuento no puede ser negativo").default(0),
  porcentaje_recargo: z.number().min(0, "El recargo no puede ser negativo").default(0),
  monto_recargo: z.number().min(0, "El recargo no puede ser negativo").default(0),
  subtotal: z.number().min(0, "Subtotal debe ser mayor a 0"),
  total_iva: z.number().min(0, "IVA debe ser mayor o igual a 0"),
  total: z.number().min(0, "Total debe ser mayor a 0"),
  observaciones: z.string().optional(),
});

type VentaFormData = z.infer<typeof ventaSchema>;

type VentaFormProps = {
  venta?: Venta | null
  onSuccess: () => void
  showTitle?: boolean
}

type VentaItemDraft = Omit<VentaItem, "id" | "venta_id" | "created_at" | "updated_at">;

const formatDateTimeLocalInput = (value?: string | null) => {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ""

  return format(date, "yyyy-MM-dd'T'HH:mm")
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const calcularMontoAjuste = (base: number, porcentaje?: number, monto?: number) =>
  roundMoney((base * Number(porcentaje || 0)) / 100 + Number(monto || 0))

const calcularItemVenta = (
  item: Pick<VentaItemDraft, "cantidad" | "precio_unitario" | "porcentaje_iva" | "porcentaje_descuento" | "monto_descuento" | "porcentaje_recargo" | "monto_recargo">
) => {
  const totalConIva = Number(item.precio_unitario || 0) * Number(item.cantidad || 0)
  const descuento = Math.min(calcularMontoAjuste(totalConIva, item.porcentaje_descuento, item.monto_descuento), totalConIva)
  const recargo = calcularMontoAjuste(totalConIva, item.porcentaje_recargo, item.monto_recargo)
  const total = roundMoney(Math.max(totalConIva - descuento + recargo, 0))
  const alicuotaIva = Number(item.porcentaje_iva || 0)
  const subtotal = roundMoney(alicuotaIva > 0 ? total / (1 + alicuotaIva / 100) : total)
  const montoIva = roundMoney(total - subtotal)

  return {
    monto_descuento: descuento,
    monto_recargo: recargo,
    subtotal,
    monto_iva: montoIva,
    total,
  }
}

const calcularTotalesVenta = (
  items: VentaItemDraft[],
  porcentajeDescuento = 0,
  montoDescuento = 0,
  porcentajeRecargo = 0,
  montoRecargo = 0
) => {
  const subtotalItems = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0)
  const totalItems = items.reduce((sum, item) => sum + Number(item.total || 0), 0)
  const descuentoVenta = Math.min(calcularMontoAjuste(totalItems, porcentajeDescuento, montoDescuento), totalItems)
  const recargoVenta = calcularMontoAjuste(totalItems, porcentajeRecargo, montoRecargo)
  const total = roundMoney(Math.max(totalItems - descuentoVenta + recargoVenta, 0))
  const factor = totalItems > 0 ? total / totalItems : 1
  const subtotal = roundMoney(subtotalItems * factor)
  const totalIva = roundMoney(total - subtotal)

  return {
    subtotal,
    total_iva: totalIva,
    total,
  }
}

const VentaForm: React.FC<VentaFormProps> = ({ venta, onSuccess, showTitle = true }) => {
  const { toast } = useToast()
  const { createVenta, updateVenta } = useVentas()
  const { data: clientes = [] } = useClientes()
  const { productos } = useProductos()
  const { data: parametrizacion } = useComercioParametrizacion()
  const permiteItemsManuales = parametrizacion.funciones.venta_items_manuales
  const permiteAjustes = parametrizacion.funciones.descuentos_recargos
  
  // Estado para items de venta
  const [ventaItems, setVentaItems] = useState<VentaItemDraft[]>([])
  const [selectedProductoId, setSelectedProductoId] = useState<string>("")
  const [selectedProducto, setSelectedProducto] = useState<{ id: string; cod_producto: string; descripcion: string; precio_venta: number; porcentaje_iva: number; stock: number } | null>(null)
  const [itemDescripcion, setItemDescripcion] = useState("")
  const [itemCantidad, setItemCantidad] = useState<number>(1)
  const [itemPrecioUnitario, setItemPrecioUnitario] = useState<number>(0)
  const [itemPorcentajeIva, setItemPorcentajeIva] = useState<number>(0)
  const [itemPorcentajeDescuento, setItemPorcentajeDescuento] = useState<number>(0)
  const [itemMontoDescuento, setItemMontoDescuento] = useState<number>(0)
  const [itemPorcentajeRecargo, setItemPorcentajeRecargo] = useState<number>(0)
  const [itemMontoRecargo, setItemMontoRecargo] = useState<number>(0)
  const [productSearchOpen, setProductSearchOpen] = useState(false)
  const [productSearchTerm, setProductSearchTerm] = useState("")
  
  // Estado para búsqueda de clientes
  const [clienteSearchOpen, setClienteSearchOpen] = useState(false)
  const [clienteSearchTerm, setClienteSearchTerm] = useState("")
  const [selectedCliente, setSelectedCliente] = useState<{ id: string; nombre: string; apellido: string; cuit: string } | null>(null)
  
  // Estado para pagos
  const [pagosVenta, setPagosVenta] = useState<Omit<PagoVenta, "id" | "venta_id" | "created_at" | "updated_at">[]>([])
  const [finalizarDialogOpen, setFinalizarDialogOpen] = useState(false)

  const form = useForm<VentaFormData>({
    resolver: zodResolver(ventaSchema),
    defaultValues: {
      numero_comprobante: "",
      fecha_venta: formatDateTimeLocalInput(),
      tipo_comprobante: "ticket_fiscal",
      cliente_nombre: "Consumidor Final",
      porcentaje_descuento: 0,
      monto_descuento: 0,
      porcentaje_recargo: 0,
      monto_recargo: 0,
      subtotal: 0,
      total_iva: 0,
      total: 0,
      observaciones: "",
    },
  })

  const watchTipoComprobante = form.watch("tipo_comprobante")
  const discriminaIva = discriminaIvaEnComprobante(watchTipoComprobante)
  const watchPorcentajeDescuento = form.watch("porcentaje_descuento")
  const watchMontoDescuento = form.watch("monto_descuento")
  const watchPorcentajeRecargo = form.watch("porcentaje_recargo")
  const watchMontoRecargo = form.watch("monto_recargo")

  useEffect(() => {
    if (permiteAjustes) return

    form.setValue("porcentaje_descuento", 0)
    form.setValue("monto_descuento", 0)
    form.setValue("porcentaje_recargo", 0)
    form.setValue("monto_recargo", 0)
    setItemPorcentajeDescuento(0)
    setItemMontoDescuento(0)
    setItemPorcentajeRecargo(0)
    setItemMontoRecargo(0)
  }, [form, permiteAjustes])

  // Generar número de comprobante automático cuando cambia el tipo
  useEffect(() => {
    const generarNumeroComprobante = async () => {
      if (venta) return;
      
      const tipoComprobante = watchTipoComprobante;
      if (!tipoComprobante) return;

      try {
        const puntoVenta = "0001";
        
        const { data, error } = await supabase
          .from("ventas")
          .select("numero_comprobante")
          .eq("tipo_comprobante", tipoComprobante)
          .like("numero_comprobante", `${puntoVenta}-%`)
          .order("numero_comprobante", { ascending: false })
          .limit(1);

        if (error) throw error;

        let nuevoNumero = "00000001";
        if (data && data.length > 0) {
          const partes = data[0].numero_comprobante.split("-");
          if (partes.length === 2) {
            const ultimoNumero = parseInt(partes[1]) || 0;
            nuevoNumero = String(ultimoNumero + 1).padStart(8, "0");
          }
        }

        form.setValue("numero_comprobante", `${puntoVenta}-${nuevoNumero}`);
      } catch (error) {
        console.error("Error generando número de comprobante:", error);
      }
    };

    generarNumeroComprobante();
  }, [watchTipoComprobante, venta, form]);

  useEffect(() => {
    if (venta) {
      form.reset({
        numero_comprobante: venta.numero_comprobante,
        fecha_venta: formatDateTimeLocalInput(venta.fecha_venta),
        tipo_comprobante: venta.tipo_comprobante,
        cliente_id: venta.cliente_id || undefined,
        cliente_nombre: venta.cliente_nombre,
        porcentaje_descuento: Number(venta.porcentaje_descuento || 0),
        monto_descuento: Number(venta.monto_descuento || 0),
        porcentaje_recargo: Number(venta.porcentaje_recargo || 0),
        monto_recargo: Number(venta.monto_recargo || 0),
        subtotal: Number(venta.subtotal),
        total_iva: Number(venta.total_iva),
        total: Number(venta.total),
        observaciones: venta.observaciones || "",
      })
      
      if (venta.venta_items) {
        setVentaItems(venta.venta_items.map(item => ({
          producto_id: item.producto_id,
          descripcion_manual: item.descripcion_manual,
          codigo_manual: item.codigo_manual,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          porcentaje_iva: item.porcentaje_iva,
          porcentaje_descuento: Number(item.porcentaje_descuento || 0),
          monto_descuento: Number(item.monto_descuento || 0),
          porcentaje_recargo: Number(item.porcentaje_recargo || 0),
          monto_recargo: Number(item.monto_recargo || 0),
          monto_iva: item.monto_iva,
          subtotal: item.subtotal,
          total: item.total,
        })))
      }
      
      if (venta.pagos_venta) {
        setPagosVenta(venta.pagos_venta.map(pago => ({
          tipo_pago: pago.tipo_pago,
          monto: pago.monto,
          banco_id: pago.banco_id,
          tarjeta_id: pago.tarjeta_id,
          cuotas: pago.cuotas,
          recargo_cuotas: pago.recargo_cuotas,
          cheque_id: pago.cheque_id,
        })))
      }
    }
  }, [venta, form])

  // Calcular totales cuando cambian los items o ajustes generales
  useEffect(() => {
    const totales = calcularTotalesVenta(
      ventaItems,
      watchPorcentajeDescuento,
      watchMontoDescuento,
      watchPorcentajeRecargo,
      watchMontoRecargo
    )
    
    form.setValue("subtotal", totales.subtotal)
    form.setValue("total_iva", totales.total_iva)
    form.setValue("total", totales.total)
  }, [ventaItems, watchPorcentajeDescuento, watchMontoDescuento, watchPorcentajeRecargo, watchMontoRecargo, form])

  // Filtrar productos por término de búsqueda
  const filteredProductos = productos.filter(producto =>
    producto.descripcion.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
    producto.cod_producto.toLowerCase().includes(productSearchTerm.toLowerCase())
  )
  
  // Filtrar clientes por término de búsqueda
  const filteredClientes = clientes.filter(cliente =>
    cliente.nombre.toLowerCase().includes(clienteSearchTerm.toLowerCase()) ||
    cliente.apellido.toLowerCase().includes(clienteSearchTerm.toLowerCase()) ||
    cliente.cuit.includes(clienteSearchTerm)
  )

  const getItemDescripcion = (item: VentaItemDraft) => {
    const producto = item.producto_id ? productos.find(p => p.id === item.producto_id) : null
    if (producto) return `${producto.cod_producto} - ${producto.descripcion}`
    return item.descripcion_manual || "Item manual"
  }

  // Función para agregar producto
  const limpiarItemActual = () => {
    setSelectedProductoId("")
    setSelectedProducto(null)
    setItemDescripcion("")
    setItemCantidad(1)
    setItemPrecioUnitario(0)
    setItemPorcentajeIva(0)
    setItemPorcentajeDescuento(0)
    setItemMontoDescuento(0)
    setItemPorcentajeRecargo(0)
    setItemMontoRecargo(0)
  }

  const seleccionarProducto = (producto: typeof productos[number]) => {
    setSelectedProductoId(producto.id)
    setSelectedProducto({
      id: producto.id,
      cod_producto: producto.cod_producto,
      descripcion: producto.descripcion,
      precio_venta: Number(producto.precio_venta),
      porcentaje_iva: Number(producto.porcentaje_iva),
      stock: Number(producto.stock)
    })
    setItemDescripcion(producto.descripcion)
    setItemPrecioUnitario(Number(producto.precio_venta))
    setItemPorcentajeIva(Number(producto.porcentaje_iva))
    setProductSearchOpen(false)
    setProductSearchTerm("")
  }

  const agregarItemVenta = () => {
    const descripcion = itemDescripcion.trim()
    const cantidadItem = Number(itemCantidad)
    const precioUnitario = Number(itemPrecioUnitario)
    const porcentajeIva = Number(itemPorcentajeIva || 0)
    const porcentajeDescuento = permiteAjustes ? Number(itemPorcentajeDescuento || 0) : 0
    const montoDescuento = permiteAjustes ? Number(itemMontoDescuento || 0) : 0
    const porcentajeRecargo = permiteAjustes ? Number(itemPorcentajeRecargo || 0) : 0
    const montoRecargo = permiteAjustes ? Number(itemMontoRecargo || 0) : 0

    if (
      !descripcion ||
      cantidadItem <= 0 ||
      precioUnitario < 0 ||
      porcentajeIva < 0 ||
      porcentajeDescuento < 0 ||
      montoDescuento < 0 ||
      porcentajeRecargo < 0 ||
      montoRecargo < 0
    ) {
      toast({
        title: "Error",
        description: "Ingrese descripcion, cantidad, precio, IVA y ajustes validos",
        variant: "destructive",
      })
      return
    }

    if (!selectedProductoId && !permiteItemsManuales) {
      toast({
        title: "Funcion no habilitada",
        description: "Este comercio no tiene habilitada la carga de items manuales.",
        variant: "destructive",
      })
      return
    }

    if (selectedProductoId) {
      const producto = productos.find(p => p.id === selectedProductoId)
      if (!producto) return

      const cantidadYaAgregada = ventaItems
        .filter(item => item.producto_id === selectedProductoId)
        .reduce((sum, item) => sum + item.cantidad, 0)
      const cantidadDisponible = Number(producto.stock) - cantidadYaAgregada

      if (cantidadItem > cantidadDisponible) {
        toast({
          title: "Stock insuficiente",
          description: `Stock disponible para este producto: ${Math.max(cantidadDisponible, 0)}`,
          variant: "destructive",
        })
        return
      }
    }

    const ajustes = calcularItemVenta({
      cantidad: cantidadItem,
      precio_unitario: precioUnitario,
      porcentaje_iva: porcentajeIva,
      porcentaje_descuento: porcentajeDescuento,
      monto_descuento: montoDescuento,
      porcentaje_recargo: porcentajeRecargo,
      monto_recargo: montoRecargo,
    })

    const nuevoItem: VentaItemDraft = {
      producto_id: selectedProductoId || null,
      descripcion_manual: selectedProductoId ? null : descripcion,
      codigo_manual: selectedProductoId ? null : "MANUAL",
      cantidad: cantidadItem,
      precio_unitario: precioUnitario,
      porcentaje_iva: porcentajeIva,
      porcentaje_descuento: porcentajeDescuento,
      monto_descuento: ajustes.monto_descuento,
      porcentaje_recargo: porcentajeRecargo,
      monto_recargo: ajustes.monto_recargo,
      monto_iva: ajustes.monto_iva,
      subtotal: ajustes.subtotal,
      total: ajustes.total,
    }

    setVentaItems([...ventaItems, nuevoItem])
    limpiarItemActual()
  }
  const eliminarProducto = (index: number) => {
    const nuevosItems = ventaItems.filter((_, i) => i !== index)
    setVentaItems(nuevosItems)
  }

  const abrirFinalizacion = async () => {
    const datosValidos = await form.trigger()
    if (!datosValidos) return

    if (ventaItems.length === 0) {
      toast({
        title: "Error",
        description: "Debe agregar al menos un producto a la venta",
        variant: "destructive",
      })
      return
    }

    setFinalizarDialogOpen(true)
  }

  const onSubmit = async (data: VentaFormData) => {
    if (ventaItems.length === 0) {
      toast({
        title: "Error",
        description: "Debe agregar al menos un producto a la venta",
        variant: "destructive",
      })
      return
    }

    if (pagosVenta.length === 0) {
      toast({
        title: "Error",
        description: "Debe agregar al menos un método de pago",
        variant: "destructive",
      })
      return
    }

    if (pagosVenta.some(pago => pago.tipo_pago === "cta_cte") && !data.cliente_id) {
      toast({
        title: "Error",
        description: "Debe seleccionar un cliente para registrar pagos en cuenta corriente",
        variant: "destructive",
      })
      return
    }

    const totalPagosBase = getTotalPagosBase(pagosVenta)
    if (Math.abs(totalPagosBase - data.total) > 0.01) {
      toast({
        title: "Error",
        description: `El total de pagos ($${totalPagosBase.toFixed(2)}) debe coincidir con el total de la venta ($${data.total.toFixed(2)})`,
        variant: "destructive",
      })
      return
    }

    try {
      const totalFinal = roundMoney(pagosVenta.reduce((sum, pago) => sum + Number(pago.monto || 0), 0))
      const factorTotalFinal = data.total > 0 ? totalFinal / data.total : 1
      const subtotalFinal = roundMoney(data.subtotal * factorTotalFinal)
      const totalIvaFinal = roundMoney(totalFinal - subtotalFinal)

      const ventaData: Omit<Venta, "id" | "created_at" | "updated_at"> = {
        numero_comprobante: data.numero_comprobante,
        fecha_venta: new Date(data.fecha_venta).toISOString(),
        tipo_pago: pagosVenta[0].tipo_pago, // Por compatibilidad, usar el primer método de pago
        tipo_comprobante: data.tipo_comprobante,
        cliente_nombre: data.cliente_nombre,
        porcentaje_descuento: data.porcentaje_descuento,
        monto_descuento: data.monto_descuento,
        porcentaje_recargo: data.porcentaje_recargo,
        monto_recargo: data.monto_recargo,
        subtotal: subtotalFinal,
        total_iva: totalIvaFinal,
        total: totalFinal,
        cliente_id: data.cliente_id || undefined,
        observaciones: data.observaciones,
      }

      if (venta?.id) {
        await updateVenta({
          ventaId: venta.id,
          venta: ventaData,
          items: ventaItems,
          pagos: pagosVenta
        })
      } else {
        await createVenta({
          venta: ventaData,
          items: ventaItems,
          pagos: pagosVenta
        })
      }
      
      onSuccess()
    } catch (error) {
      toast({
        title: "Error",
        description: "Ocurrió un error al guardar la venta.",
        variant: "destructive",
      })
    }
  }

  return (
    <Card>
      {showTitle && (
        <CardHeader>
          <CardTitle>{venta ? "Editar Venta" : "Nueva Venta"}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={showTitle ? undefined : "pt-6"}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            {/* Datos principales */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(10.5rem,0.85fr)_minmax(11rem,1fr)_minmax(10.5rem,0.85fr)_minmax(22rem,2.3fr)]">
              <FormField
                control={form.control}
                name="fecha_venta"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha y Hora</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="tipo_comprobante"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Comprobante</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIPOS_COMPROBANTE.map((tipo) => (
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
                name="numero_comprobante"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número de Comprobante</FormLabel>
                    <FormControl>
                      <Input {...field} readOnly className="bg-muted" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cliente_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          value={selectedCliente ? `${selectedCliente.nombre} ${selectedCliente.apellido} - ${selectedCliente.cuit}` : "Consumidor Final"}
                          readOnly
                          placeholder="Seleccionar cliente..."
                        />
                      </FormControl>
                      <Dialog open={clienteSearchOpen} onOpenChange={setClienteSearchOpen}>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setClienteSearchOpen(true)}
                        >
                          <Search className="h-4 w-4 mr-2" />
                          Buscar
                        </Button>
                        <DialogContent className="max-w-4xl">
                          <DialogHeader>
                            <DialogTitle>Seleccionar Cliente</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="relative">
                              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Buscar por nombre, apellido o CUIT..."
                                value={clienteSearchTerm}
                                onChange={(e) => setClienteSearchTerm(e.target.value)}
                                className="pl-8"
                              />
                            </div>
                            <div className="max-h-96 overflow-y-auto rounded-md border">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>CUIT</TableHead>
                                    <TableHead>Localidad</TableHead>
                                    <TableHead>Provincia</TableHead>
                                    <TableHead className="w-24 text-right">Accion</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  <TableRow>
                                    <TableCell className="font-medium">Consumidor Final</TableCell>
                                    <TableCell>-</TableCell>
                                    <TableCell>-</TableCell>
                                    <TableCell>-</TableCell>
                                    <TableCell className="text-right">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          field.onChange(undefined);
                                          form.setValue("cliente_nombre", "Consumidor Final");
                                          setSelectedCliente(null);
                                          setClienteSearchOpen(false);
                                          setClienteSearchTerm("");
                                        }}
                                      >
                                        Elegir
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                  {filteredClientes.map((cliente) => (
                                    <TableRow key={cliente.id}>
                                      <TableCell className="font-medium">{cliente.nombre} {cliente.apellido}</TableCell>
                                      <TableCell>{cliente.cuit}</TableCell>
                                      <TableCell>{cliente.localidad || "-"}</TableCell>
                                      <TableCell>{cliente.provincia || "-"}</TableCell>
                                      <TableCell className="text-right">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            field.onChange(cliente.id);
                                            form.setValue("cliente_nombre", `${cliente.nombre} ${cliente.apellido}`);
                                            setSelectedCliente({
                                              id: cliente.id!,
                                              nombre: cliente.nombre,
                                              apellido: cliente.apellido,
                                              cuit: cliente.cuit
                                            });
                                            setClienteSearchOpen(false);
                                            setClienteSearchTerm("");
                                          }}
                                        >
                                          Elegir
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                              {filteredClientes.length === 0 && clienteSearchTerm && (
                                <TableRow>
                                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                  No se encontraron clientes que coincidan con la búsqueda
                                  </TableCell>
                                </TableRow>
                              )}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Selección de Productos */}
            <Card className="bg-muted">
              <CardHeader>
                <CardTitle className="text-lg">Productos de la Venta</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border bg-background p-4">
                  <div className="mb-3 text-sm font-medium">Item de venta</div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-[minmax(14rem,1fr)_4.25rem_8.5rem_repeat(5,3.5rem)_6.5rem] xl:items-start">
                    <div className="col-span-2 md:col-span-4 xl:col-span-1">
                      <label className="text-sm font-medium">Producto / Descripcion</label>
                      <div className="flex gap-2">
                        <Input
                          value={itemDescripcion}
                          onChange={(e) => {
                            setItemDescripcion(e.target.value)
                            if (selectedProductoId) {
                              setSelectedProductoId("")
                              setSelectedProducto(null)
                            }
                          }}
                          placeholder={permiteItemsManuales ? "Buscar producto o ingresar item manual..." : "Buscar producto..."}
                        />
                        <Dialog open={productSearchOpen} onOpenChange={setProductSearchOpen}>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setProductSearchOpen(true)}
                          >
                            <Search className="h-4 w-4" />
                          </Button>
                          <DialogContent className="max-w-4xl">
                            <DialogHeader>
                              <DialogTitle>Seleccionar Producto</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                  placeholder="Buscar por codigo o descripcion..."
                                  value={productSearchTerm}
                                  onChange={(e) => setProductSearchTerm(e.target.value)}
                                  className="pl-8"
                                />
                              </div>
                              <div className="max-h-96 overflow-y-auto rounded-md border">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Codigo</TableHead>
                                      <TableHead>Descripcion</TableHead>
                                      <TableHead className="text-right">Precio final</TableHead>
                                      <TableHead className="text-right">IVA %</TableHead>
                                      <TableHead className="text-right">Stock</TableHead>
                                      <TableHead className="w-24 text-right">Accion</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {filteredProductos.map((producto) => (
                                      <TableRow key={producto.id}>
                                        <TableCell className="font-medium">{producto.cod_producto}</TableCell>
                                        <TableCell>{producto.descripcion}</TableCell>
                                        <TableCell className="text-right">
                                          ${Number(producto.precio_venta).toFixed(2)}
                                        </TableCell>
                                        <TableCell className="text-right">{producto.porcentaje_iva}%</TableCell>
                                        <TableCell className="text-right">{producto.stock}</TableCell>
                                        <TableCell className="text-right">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => seleccionarProducto(producto)}
                                          >
                                            Elegir
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                    {filteredProductos.length === 0 && productSearchTerm && (
                                      <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                          No se encontraron productos que coincidan con la busqueda
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                      {selectedProducto && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Codigo: {selectedProducto.cod_producto} | Stock: {selectedProducto.stock}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium">Cant.</label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={itemCantidad}
                        onChange={(e) => setItemCantidad(Number(e.target.value))}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium">Prec. Un. IVA incl.</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={itemPrecioUnitario}
                        onChange={(e) => setItemPrecioUnitario(Number(e.target.value))}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium">IVA %</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={itemPorcentajeIva}
                        onChange={(e) => setItemPorcentajeIva(Number(e.target.value))}
                      />
                    </div>

                    {permiteAjustes && (
                      <>
                    <div>
                      <label className="text-sm font-medium">Desc. %</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={itemPorcentajeDescuento}
                        onChange={(e) => setItemPorcentajeDescuento(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Desc. $</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={itemMontoDescuento}
                        onChange={(e) => setItemMontoDescuento(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Rec. %</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={itemPorcentajeRecargo}
                        onChange={(e) => setItemPorcentajeRecargo(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Rec. $</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={itemMontoRecargo}
                        onChange={(e) => setItemMontoRecargo(Number(e.target.value))}
                      />
                    </div>
                      </>
                    )}
                    <div className="col-span-2 flex items-end md:col-span-1 xl:pt-5">
                      <Button type="button" variant="new" onClick={agregarItemVenta} className="w-full">
                        <Plus className="mr-2 h-4 w-4" />
                        Agregar
                      </Button>
                    </div>
                  </div>
                </div>
                {/* Tabla de items */}
                {ventaItems.length > 0 && (
                  <div className="border rounded-lg bg-background">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Producto</TableHead>
                          <TableHead className="text-right">Cant.</TableHead>
                          <TableHead className="text-right">Precio Unit. IVA incl.</TableHead>
                          <TableHead className="text-right">Desc.</TableHead>
                          <TableHead className="text-right">Rec.</TableHead>
                          {discriminaIva && <TableHead className="text-right">IVA %</TableHead>}
                          {discriminaIva && <TableHead className="text-right">Subtotal neto</TableHead>}
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ventaItems.map((item, index) => {
                          return (
                            <TableRow key={index}>
                              <TableCell>
                                {getItemDescripcion(item)}
                              </TableCell>
                              <TableCell className="text-right">{item.cantidad}</TableCell>
                              <TableCell className="text-right">${item.precio_unitario.toFixed(2)}</TableCell>
                              <TableCell className="text-right">${Number(item.monto_descuento || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-right">${Number(item.monto_recargo || 0).toFixed(2)}</TableCell>
                              {discriminaIva && <TableCell className="text-right">{item.porcentaje_iva}%</TableCell>}
                              {discriminaIva && <TableCell className="text-right">${item.subtotal.toFixed(2)}</TableCell>}
                              <TableCell className="text-right font-semibold">${item.total.toFixed(2)}</TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => eliminarProducto(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
                
                {/* Totales */}
                <div className={`grid gap-4 pt-4 ${discriminaIva ? "grid-cols-3" : "grid-cols-1"}`}>
                  {discriminaIva && (
                    <div>
                      <label className="text-sm font-medium">Subtotal neto</label>
                      <Input
                        type="number"
                        value={form.watch("subtotal").toFixed(2)}
                        disabled
                        className="bg-muted"
                      />
                    </div>
                  )}

                  {discriminaIva && (
                    <div>
                      <label className="text-sm font-medium">IVA</label>
                      <Input
                        type="number"
                        value={form.watch("total_iva").toFixed(2)}
                        disabled
                        className="bg-muted"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-medium">Total</label>
                    <Input
                      type="number"
                      value={form.watch("total").toFixed(2)}
                      disabled
                      className="bg-muted font-semibold text-lg"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Observaciones */}
            <FormField
              control={form.control}
              name="observaciones"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observaciones</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Botones de acción */}
            <div className="flex gap-4 justify-end">
              <Button type="button" variant="cancel" onClick={onSuccess}>
                Cancelar
              </Button>
              <Button type="button" variant="success" onClick={abrirFinalizacion}>
                {venta ? "Actualizar Venta" : "Registrar Venta"}
              </Button>
            </div>

            <Dialog open={finalizarDialogOpen} onOpenChange={setFinalizarDialogOpen}>
              <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{venta ? "Finalizar actualizacion de venta" : "Finalizar venta"}</DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                  {permiteAjustes && (
                  <div className="rounded-md border bg-background p-4">
                    <div className="mb-3 text-sm font-medium">Descuentos y recargos sobre el total</div>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <FormField
                        control={form.control}
                        name="porcentaje_descuento"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Desc. % total</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="monto_descuento"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Desc. $ total</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="porcentaje_recargo"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Rec. % total</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="monto_recargo"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Rec. $ total</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                  )}

                  <PagosVentaManager
                    totalVenta={form.watch("total")}
                    clienteId={form.watch("cliente_id")}
                    pagos={pagosVenta}
                    onChange={setPagosVenta}
                  />
                </div>

                <DialogFooter className="gap-2">
                  <Button type="button" variant="cancel" onClick={() => setFinalizarDialogOpen(false)}>
                    Volver
                  </Button>
                  <Button type="button" variant="success" onClick={form.handleSubmit(onSubmit)}>
                    {venta ? "Confirmar actualizacion" : "Confirmar venta"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

export default VentaForm
