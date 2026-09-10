import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList,
  Download,
  Eye,
  MessageCircle,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
} from "lucide-react";
import { useComercio } from "@/hooks/useComercio";
import { toast } from "@/hooks/use-toast";
import { useClientes } from "@/hooks/useClientes";
import { useExtintores } from "@/hooks/useExtintores";
import { useProductos } from "@/hooks/useProductos";
import {
  EstadoOrdenTrabajo,
  OrdenTrabajo,
  OrdenTrabajoExtintor,
  OrdenTrabajoProducto,
  useOrdenesTrabajoExtintores,
} from "@/hooks/useOrdenesTrabajoExtintores";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildOrdenesTrabajoPdfFile,
  buildOrdenesTrabajoAgrupadoPdfFile,
  buildOrdenTrabajoReportePdfFile,
  downloadPdfFile,
  printPdfFile,
  openOrdenTrabajoPrint,
} from "@/utils/ordenTrabajoPdf";

const hoy = () => new Date().toISOString().slice(0, 10);
const fecha = (valor?: string | null) =>
  valor ? format(new Date(`${valor}T00:00:00`), "dd/MM/yyyy") : "-";
const nuevaOrden = () => ({
  cliente_id: "",
  fecha_orden: hoy(),
  estado: "generada" as EstadoOrdenTrabajo,
  observaciones: "",
  extintores: [] as Omit<OrdenTrabajoExtintor, "id" | "extintor">[],
  productos: [] as Omit<OrdenTrabajoProducto, "id" | "producto">[],
});
const estados: { value: EstadoOrdenTrabajo; label: string }[] = [
  { value: "generada", label: "Generada" },
  { value: "en_proceso", label: "En proceso" },
  { value: "cancelada", label: "Cancelada" },
  { value: "finalizada", label: "Finalizada" },
];
const estadoColor: Record<
  EstadoOrdenTrabajo,
  "secondary" | "default" | "destructive" | "success"
> = {
  generada: "secondary",
  en_proceso: "default",
  cancelada: "destructive",
  finalizada: "success",
};

export default function OrdenesTrabajoExtintores() {
  const { data: clientes = [] } = useClientes();
  const navigate = useNavigate();
  const { comercio } = useComercio();
  const { extintores } = useExtintores();
  const { productos } = useProductos();
  const { ordenes, save, remove, saving } = useOrdenesTrabajoExtintores();
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [form, setForm] = useState(nuevaOrden());
  const [ordenId, setOrdenId] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const [clienteOpen, setClienteOpen] = useState(false);
  const [extintorOpen, setExtintorOpen] = useState(false);
  const [productoOpen, setProductoOpen] = useState(false);
  const [productoIndice, setProductoIndice] = useState<number | null>(null);
  const [buscarProducto, setBuscarProducto] = useState("");
  const [ver, setVer] = useState<OrdenTrabajo | null>(null);
  const [buscarCliente, setBuscarCliente] = useState("");
  const [buscarExtintor, setBuscarExtintor] = useState("");
  const clienteNombre = (id: string) => {
    const c = clientes.find((cliente) => cliente.id === id);
    return c ? `${c.nombre} ${c.apellido}` : "";
  };
  const abrir = (orden?: OrdenTrabajo) => {
    setOrdenId(orden?.id);
    setForm(
      orden
        ? {
          cliente_id: orden.cliente_id,
          fecha_orden: orden.fecha_orden,
          estado: orden.estado,
          observaciones: orden.observaciones || "",
          extintores: orden.extintores.map(({ extintor_id }) => ({
            extintor_id,
          })),
          productos: orden.productos.map((
            { producto_id, cantidad, descripcion },
          ) => ({ producto_id, cantidad, descripcion })),
        }
        : nuevaOrden(),
    );
    setOpen(true);
  };
  const ordenesFiltradas = useMemo(
    () =>
      ordenes.filter((orden) =>
        (!filtroCliente ||
          `${orden.cliente?.nombre || ""} ${orden.cliente?.apellido || ""}`
            .toLowerCase().includes(filtroCliente.toLowerCase())) &&
        (filtroEstado === "todos" || orden.estado === filtroEstado) &&
        (!fechaDesde || orden.fecha_orden >= fechaDesde) &&
        (!fechaHasta || orden.fecha_orden <= fechaHasta)
      ),
    [ordenes, filtroCliente, filtroEstado, fechaDesde, fechaHasta],
  );
  const clientesFiltrados = clientes.filter((c) =>
    `${c.nombre} ${c.apellido} ${c.cuit}`.toLowerCase().includes(
      buscarCliente.toLowerCase(),
    )
  );
  const extintoresCliente = extintores.filter((e) =>
    e.cliente_id === form.cliente_id &&
    `${e.numero_extintor} ${e.numero_serie} ${e.marca?.nombre || ""}`
      .toLowerCase().includes(buscarExtintor.toLowerCase())
  );
  const productosFiltrados = productos.filter((p) => `${p.cod_producto} ${p.descripcion}`.toLowerCase().includes(buscarProducto.toLowerCase()));
  const agregarExtintor = (id: string) => {
    if (!form.extintores.some((item) => item.extintor_id === id)) {
      setForm((actual) => ({
        ...actual,
        extintores: [...actual.extintores, { extintor_id: id }],
      }));
      toast({ title: "Extintor agregado a la orden" });
    }
    setExtintorOpen(false);
  };
  const actualizarProducto = (indice: number, campo: string, valor: string) =>
    setForm((actual) => ({
      ...actual,
      productos: actual.productos.map((item, i) =>
        i === indice
          ? {
            ...item,
            [campo]: campo === "cantidad" ? Number(valor) || 1 : valor || null,
          }
          : item
      ),
    }));
  const guardar = () =>
    save({ ...form, id: ordenId }, {
      onSuccess: () => {
        setOpen(false);
        setOrdenId(undefined);
      },
    });
  const crearPdf = (items: OrdenTrabajo[]) =>
    buildOrdenesTrabajoPdfFile(items, comercio?.nombre_comercio);
  const abrirImpresion = (orden: OrdenTrabajo) => {
    openOrdenTrabajoPrint(orden, comercio);
  };
  const compartirWhatsApp = async (items: OrdenTrabajo[]) => {
    const file = crearPdf(items);
    const texto = items.length === 1
      ? `Orden de trabajo del ${items[0].fecha_orden} para ${
        items[0].cliente?.nombre || ""
      } ${items[0].cliente?.apellido || ""}.`
      : `Listado de ${items.length} órdenes de trabajo.`;
    try {
      const shareData: ShareData = {
        title: "Órdenes de trabajo",
        text: texto,
        files: [file],
      };
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
    downloadPdfFile(file);
    const telefono = items.length === 1
      ? (items[0].cliente?.telefono || "").replace(/\D/g, "")
      : "";
    window.open(
      telefono
        ? `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`
        : `https://wa.me/?text=${encodeURIComponent(texto)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };
  const compartirOrdenWhatsApp = async (orden: OrdenTrabajo) => {
    const file = await buildOrdenTrabajoReportePdfFile(orden, comercio);
    const texto = `Orden de trabajo del ${fecha(orden.fecha_orden)} para ${orden.cliente?.nombre || ""} ${orden.cliente?.apellido || ""}.`;
    const shareData: ShareData = { title: "Orden de trabajo", text: texto, files: [file] };
    try { if (navigator.share && navigator.canShare?.(shareData)) { await navigator.share(shareData); return; } } catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; }
    downloadPdfFile(file);
    const telefono = (orden.cliente?.telefono || "").replace(/\D/g, "");
    window.open(telefono ? `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
  };
  const generarReporte = () => buildOrdenesTrabajoAgrupadoPdfFile(ordenesFiltradas, comercio);
  const compartirReporteWhatsApp = async () => {
    const file = await generarReporte();
    const texto = `Reporte de ${ordenesFiltradas.length} órdenes de trabajo agrupadas por cliente.`;
    const shareData: ShareData = { title: "Reporte de órdenes de trabajo", text: texto, files: [file] };
    try { if (navigator.share && navigator.canShare?.(shareData)) { await navigator.share(shareData); return; } } catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; }
    downloadPdfFile(file); window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
  };
  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <ClipboardList />Órdenes de trabajo
          </h1>
          <p className="text-muted-foreground">
            Recargas y trabajos asignados a los extintores de cada cliente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="bg-red-600 text-white hover:bg-red-700" disabled={!ordenesFiltradas.length} onClick={async () => downloadPdfFile(await generarReporte())}><Download />PDF reporte</Button>
          <Button variant="print" disabled={!ordenesFiltradas.length} onClick={async () => printPdfFile(await generarReporte())}><Printer />Imprimir reporte</Button>
          <Button className="bg-[#25D366] text-white hover:bg-[#1DA851]" disabled={!ordenesFiltradas.length} onClick={compartirReporteWhatsApp}><MessageCircle />WhatsApp</Button>
          <Button onClick={() => abrir()}>
            <Plus />Nueva orden
          </Button>
        </div>
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-1 xl:col-span-2">
              <Label className="text-xs text-muted-foreground">Cliente</Label>
              <Input
                value={filtroCliente}
                onChange={(e) => setFiltroCliente(e.target.value)}
                placeholder="Buscar por cliente..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Estado</Label>
              <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {estados.map((estado) => (
                    <SelectItem key={estado.value} value={estado.value}>
                      {estado.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Fecha desde
              </Label>
              <Input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Fecha hasta
              </Label>
              <Input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Extintores</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenesFiltradas.map((orden) => (
                <TableRow key={orden.id}>
                  <TableCell>{fecha(orden.fecha_orden)}</TableCell>
                  <TableCell>
                    {orden.cliente?.nombre} {orden.cliente?.apellido}
                  </TableCell>
                  <TableCell>
                    <Badge variant={estadoColor[orden.estado]}>
                      {estados.find((e) => e.value === orden.estado)?.label}
                    </Badge>
                  </TableCell>
                  <TableCell>{orden.extintores.length}</TableCell>
                  <TableCell>{orden.productos.length}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => setVer(orden)}
                        title="Ver orden"
                      >
                        <Eye />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => abrir(orden)}
                        title="Editar orden"
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        onClick={() => remove(orden.id)}
                        title="Eliminar orden"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!ordenesFiltradas.length && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No hay órdenes que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] w-[calc(100%-1rem)] overflow-y-auto sm:w-[min(96vw,80rem)] sm:max-w-none">
          <DialogHeader>
            <DialogTitle>
              {ordenId ? "Editar" : "Nueva"} orden de trabajo
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Cliente</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  readOnly
                  value={clienteNombre(form.cliente_id)}
                  placeholder="Seleccionar cliente..."
                />
                <Button variant="outline" onClick={() => setClienteOpen(true)}>
                  <Search />Buscar
                </Button>
              </div>
            </div>
            <div>
              <Label>Fecha de orden</Label>
              <Input
                type="date"
                value={form.fecha_orden}
                onChange={(e) =>
                  setForm({ ...form, fecha_orden: e.target.value })}
              />
            </div>
            <div>
              <Label>Estado</Label>
              <Select
                value={form.estado}
                onValueChange={(estado: EstadoOrdenTrabajo) =>
                  setForm({ ...form, estado })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {estados.map((estado) => (
                    <SelectItem key={estado.value} value={estado.value}>
                      {estado.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observaciones</Label>
              <Input
                value={form.observaciones}
                onChange={(e) =>
                  setForm({ ...form, observaciones: e.target.value })}
              />
            </div>
          </div>
          <Tabs defaultValue="extintores" className="border-t pt-4">
            <TabsList className="grid w-full grid-cols-2 sm:w-[360px]">
              <TabsTrigger value="extintores">
                Extintores ({form.extintores.length})
              </TabsTrigger>
              <TabsTrigger value="productos">
                Productos ({form.productos.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="extintores" className="space-y-2 pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Extintores a recargar</Label>
                  <p className="text-xs text-muted-foreground">
                    Indica los equipos alcanzados por la orden.
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={!form.cliente_id}
                  onClick={() => setExtintorOpen(true)}
                >
                  <Plus />Agregar extintor
                </Button>
              </div>
              {!form.extintores.length && (
                <p className="text-sm text-muted-foreground">
                  Agregá los extintores que deben recibir recarga.
                </p>
              )}
              {form.extintores.map((item) => {
                const extintor = extintores.find((e) =>
                  e.id === item.extintor_id
                );
                return (
                  <div
                    className="relative grid gap-3 rounded-md border p-3 pr-14 md:grid-cols-4"
                    key={item.extintor_id}
                  >
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Número / Serie
                      </p>
                      <p className="text-sm font-medium">
                        {extintor?.numero_extintor || "-"} /{" "}
                        {extintor?.numero_serie || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Marca / Clase
                      </p>
                      <p className="text-sm font-medium">
                        {extintor?.marca?.nombre || "-"} /{" "}
                        {extintor?.clase?.nombre || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Próxima recarga
                      </p>
                      <p className="text-sm font-medium">
                        {fecha(extintor?.fecha_proxima_recarga)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Vencimiento
                      </p>
                      <p className="text-sm font-medium">
                        {fecha(extintor?.fecha_vencimiento)}
                      </p>
                    </div>
                    <Button
                      className="absolute right-5"
                      size="icon"
                      variant="destructive"
                      onClick={() =>
                        setForm((actual) => ({
                          ...actual,
                          extintores: actual.extintores.filter((extintor) =>
                            extintor.extintor_id !== item.extintor_id
                          ),
                        }))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
            </TabsContent>
            <TabsContent value="productos" className="space-y-2 pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Repuestos / productos</Label>
                  <p className="text-xs text-muted-foreground">
                    Detalle comercial para facturar luego desde Ventas.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => { setProductoIndice(form.productos.length); setBuscarProducto(""); setProductoOpen(true); }}
                >
                  <Plus />Agregar producto
                </Button>
              </div>
              {!form.productos.length && (
                <p className="text-sm text-muted-foreground">
                  Todavía no hay repuestos o productos cargados.
                </p>
              )}
              {form.productos.map((item, indice) => (
                <div
                  className="grid gap-2 rounded-md border p-3 md:grid-cols-[1.5fr_100px_auto]"
                  key={indice}
                >
                  <Button variant="outline" className="justify-start font-normal" onClick={() => { setProductoIndice(indice); setBuscarProducto(""); setProductoOpen(true); }}><Search className="mr-2 h-4 w-4" />{item.producto_id ? (() => { const producto = productos.find((p) => p.id === item.producto_id); return producto ? `${producto.cod_producto} - ${producto.descripcion}` : "Producto seleccionado"; })() : "Seleccionar repuesto / producto"}</Button>
                  <Input
                    type="number"
                    min="1"
                    value={item.cantidad}
                    onChange={(e) =>
                      actualizarProducto(indice, "cantidad", e.target.value)}
                  />
                  <Button
                    size="icon"
                    variant="destructive"
                    onClick={() =>
                      setForm((actual) => ({
                        ...actual,
                        productos: actual.productos.filter((_, i) =>
                          i !== indice
                        ),
                      }))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </TabsContent>
          </Tabs>
          <Button
            disabled={!form.cliente_id || !form.extintores.length || saving}
            onClick={guardar}
          >
            Guardar orden
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={clienteOpen} onOpenChange={setClienteOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Seleccionar cliente</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              value={buscarCliente}
              onChange={(e) => setBuscarCliente(e.target.value)}
              placeholder="Buscar por nombre, apellido o CUIT..."
            />
          </div>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>CUIT</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientesFiltrados.map((cliente) => (
                  <TableRow key={cliente.id}>
                    <TableCell>{cliente.nombre} {cliente.apellido}</TableCell>
                    <TableCell>{cliente.cuit}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setForm((actual) => ({
                            ...actual,
                            cliente_id: cliente.id!,
                            extintores: actual.cliente_id === cliente.id
                              ? actual.extintores
                              : [],
                          }));
                          setClienteOpen(false);
                        }}
                      >
                        Elegir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={productoOpen} onOpenChange={setProductoOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>Seleccionar producto</DialogTitle></DialogHeader>
          <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={buscarProducto} onChange={(event) => setBuscarProducto(event.target.value)} placeholder="Buscar por código o descripción..." /></div>
          <Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Descripción</TableHead><TableHead>Stock</TableHead><TableHead>Precio</TableHead><TableHead /></TableRow></TableHeader><TableBody>{productosFiltrados.map((producto) => <TableRow key={producto.id}><TableCell>{producto.cod_producto}</TableCell><TableCell>{producto.descripcion}</TableCell><TableCell>{producto.stock}</TableCell><TableCell>${Number(producto.precio_venta).toFixed(2)}</TableCell><TableCell><Button size="sm" variant="outline" onClick={() => { if (productoIndice !== null) { if (productoIndice === form.productos.length) setForm((actual) => ({ ...actual, productos: [...actual.productos, { producto_id: producto.id, cantidad: 1, descripcion: "" }] })); else actualizarProducto(productoIndice, "producto_id", producto.id); } setProductoOpen(false); }}>Elegir</Button></TableCell></TableRow>)}</TableBody></Table>
        </DialogContent>
      </Dialog>
      <Dialog open={extintorOpen} onOpenChange={setExtintorOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100%-1rem)] overflow-y-auto sm:w-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              Seleccionar extintor de {clienteNombre(form.cliente_id)}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={buscarExtintor}
            onChange={(e) => setBuscarExtintor(e.target.value)}
            placeholder="Buscar por número, serie o marca..."
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Serie</TableHead>
                <TableHead>Marca / clase</TableHead>
                <TableHead>Próxima recarga</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {extintoresCliente.map((extintor) => (
                <TableRow key={extintor.id}>
                  <TableCell>{extintor.numero_extintor}</TableCell>
                  <TableCell>{extintor.numero_serie}</TableCell>
                  <TableCell>
                    {extintor.marca?.nombre || "-"} /{" "}
                    {extintor.clase?.nombre || "-"}
                  </TableCell>
                  <TableCell>{fecha(extintor.fecha_proxima_recarga)}</TableCell>
                  <TableCell>{fecha(extintor.fecha_vencimiento)}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={form.extintores.some((item) =>
                        item.extintor_id === extintor.id
                      )}
                      onClick={() => agregarExtintor(extintor.id)}
                    >
                      Agregar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(ver)}
        onOpenChange={(valor) => !valor && setVer(null)}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Detalle de Orden de Trabajo</DialogTitle>
          </DialogHeader>
          {ver && (
            <div className="space-y-4 text-sm">
              <div className="mb-4 space-y-3">
                <div className="grid grid-cols-1 gap-x-10 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
                  <p className="whitespace-nowrap">
                    <strong>Fecha:</strong> {fecha(ver.fecha_orden)}
                  </p>
                  <p className="whitespace-nowrap">
                    <strong>Estado:</strong>{" "}
                    <Badge className="ml-1" variant={estadoColor[ver.estado]}>
                      {estados.find((e) => e.value === ver.estado)?.label}
                    </Badge>
                  </p>
                  <p className="whitespace-nowrap">
                    <strong>Extintores:</strong> {ver.extintores.length}
                  </p>
                  <p className="whitespace-nowrap">
                    <strong>Productos:</strong> {ver.productos.length}
                  </p>
                </div>
                <p>
                  <strong>Cliente:</strong> {ver.cliente?.nombre}{" "}
                  {ver.cliente?.apellido}
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    onClick={async () => downloadPdfFile(await buildOrdenTrabajoReportePdfFile(ver, comercio))}
                    size="sm"
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    <Download className="mr-2 h-4 w-4" />PDF
                  </Button>
                  <Button
                    onClick={async () => printPdfFile(await buildOrdenTrabajoReportePdfFile(ver, comercio))}
                    variant="print"
                    size="sm"
                  >
                    <Printer className="mr-2 h-4 w-4" />Imprimir
                  </Button>
                  <Button
                    onClick={() => compartirOrdenWhatsApp(ver)}
                    size="sm"
                    className="bg-[#25D366] text-white hover:bg-[#1DA851]"
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />WhatsApp
                  </Button>
                  {ver.estado === "finalizada" && <Button onClick={() => navigate("/ventas/nueva", { state: { ordenTrabajoInicial: { clienteId: ver.cliente_id, productos: ver.productos.map((item) => ({ productoId: item.producto_id, cantidad: item.cantidad, descripcion: item.descripcion })) } } })} size="sm"><ClipboardList className="mr-2 h-4 w-4" />Facturar</Button>}
                </div>
              </div>
              <div>
                <h4 className="mb-2 font-semibold">Extintores a recargar</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número / Serie</TableHead>
                      <TableHead>Marca / Clase</TableHead>
                      <TableHead>Próxima recarga</TableHead>
                      <TableHead>Vencimiento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ver.extintores.map((item) => {
                      const extintor = extintores.find((e) =>
                        e.id === item.extintor_id
                      );
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            {extintor?.numero_extintor || "-"} /{" "}
                            {extintor?.numero_serie || "-"}
                          </TableCell>
                          <TableCell>
                            {extintor?.marca?.nombre || "-"} /{" "}
                            {extintor?.clase?.nombre || "-"}
                          </TableCell>
                          <TableCell>
                            {fecha(extintor?.fecha_proxima_recarga)}
                          </TableCell>
                          <TableCell>
                            {fecha(extintor?.fecha_vencimiento)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div>
                <h4 className="mb-2 font-semibold">Repuestos / productos</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Cantidad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ver.productos.length
                      ? ver.productos.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            {item.producto?.cod_producto || "-"}
                          </TableCell>
                          <TableCell>
                            {item.producto?.descripcion || item.descripcion ||
                              "Producto sin especificar"}
                          </TableCell>
                          <TableCell>{item.cantidad}</TableCell>
                        </TableRow>
                      ))
                      : (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="text-muted-foreground"
                          >
                            Sin productos cargados.
                          </TableCell>
                        </TableRow>
                      )}
                  </TableBody>
                </Table>
              </div>
              {ver.observaciones && (
                <p>
                  <strong>Observaciones:</strong> {ver.observaciones}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
