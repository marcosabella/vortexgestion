import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CreditCard,
  Eye,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDistribucion } from "@/hooks/useDistribucion";
import { distribucionSecciones, type VistaDistribucion } from "@/config/distribucionNavigation";
import { useClientes } from "@/hooks/useClientes";
import { useProductos } from "@/hooks/useProductos";
import { useComercio } from "@/hooks/useComercio";
import type { Json } from "@/integrations/supabase/types";
import type {
  AccionDistribucion,
  CargaDistribucion,
  ParadaDistribucion,
  PedidoDistribucion,
  RepartoDistribucion,
  ResumenDistribucion,
} from "@/types/distribucion";
import {
  cobroVigente,
  distribucionMoney as money,
  distribucionToday as today,
  pendienteItem,
  resumenParada,
} from "@/utils/distribucion";
import { HojaRutaImpresion } from "@/components/HojaRutaImpresion";
import { DistribucionHojaRuta } from "@/components/DistribucionHojaRuta";
import {
  EntregaRemito,
  FacturacionRemitos,
  RemitosReparto,
} from "@/components/DistribucionRemitos";

const pedidoSchema = z.object({
  cliente_id: z.string().uuid(),
  direccion: z.string().trim().min(1, "Indicá la dirección de entrega"),
  telefono: z.string(),
  fecha: z.string().min(1),
  observaciones: z.string(),
});
const repartoSchema = z.object({
  nombre: z.string().trim().min(1, "Indicá un nombre"),
  fecha: z.string().min(1),
  repartidor_id: z.string().uuid("Seleccioná un usuario"),
  vehiculo: z.string(),
});
type PedidoForm = z.infer<typeof pedidoSchema>;
type RepartoForm = z.infer<typeof repartoSchema>;
const selectClass =
  "flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
const normalizarBusqueda = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const labels: Record<string, string> = {
  pendiente_cae: "Pendiente de CAE",
  asignado: "Asignado",
  entregado: "Entregado",
  entrega_parcial: "Entrega parcial",
  pendiente_facturacion: "Pendiente de facturar",
  facturado: "Facturado",
  sin_entrega: "Sin entrega",
  pendiente: "Pendiente",
  preparacion: "En preparación",
  listo: "Preparado",
  cancelado: "Cancelado",
  planificado: "Planificado",
  en_reparto: "En reparto",
  pendiente_rendicion: "Por rendir",
  rendido: "Rendido",
};
type ActionDialog = {
  accion:
    | "entrega"
    | "devolucion"
    | "devolucion_rendida"
    | "cobro"
    | "rendir"
    | "anular_cobro"
    | "reabrir";
  reparto: RepartoDistribucion;
  parada?: ParadaDistribucion;
  carga?: CargaDistribucion;
  eventoId?: string;
  titulo: string;
};

export default function Distribucion({ vista = "pedidos" }: { vista?: VistaDistribucion }) {
  const { comercio } = useComercio();
  return <DistribucionContenido key={`${comercio?.id || "sin-comercio"}:${vista}`} vista={vista} />;
}

function DistribucionContenido({ vista }: { vista: VistaDistribucion }) {
  const navigate = useNavigate();
  const query = useDistribucion();
  const clientes = useClientes();
  const productos = useProductos();
  const catalogoCache = useQueryClient();
  const [busqueda, setBusqueda] = useState("");
  const [nuevoPedido, setNuevoPedido] = useState(false);
  const [pedidoEditando, setPedidoEditando] = useState<
    PedidoDistribucion | null
  >(null);
  const [pedidoEliminando, setPedidoEliminando] = useState<
    PedidoDistribucion | null
  >(null);
  const [pedidoDetalleId, setPedidoDetalleId] = useState<string | null>(null);
  const [repartoDetalleId, setRepartoDetalleId] = useState<string | null>(null);
  const [detalleTab, setDetalleTab] = useState("pedidos");
  const [etapaPedido, setEtapaPedido] = useState("todos");
  const [nuevoReparto, setNuevoReparto] = useState(false);
  const [lineas, setLineas] = useState<
    { producto_id: string; cantidad: number }[]
  >([]);
  const [productoId, setProductoId] = useState("");
  const [clienteSelectorOpen, setClienteSelectorOpen] = useState(false);
  const [productoSelectorOpen, setProductoSelectorOpen] = useState(false);
  const [buscarCliente, setBuscarCliente] = useState("");
  const [buscarProducto, setBuscarProducto] = useState("");
  const [dialog, setDialog] = useState<ActionDialog | null>(null);
  const [cantidad, setCantidad] = useState("1");
  const [medio, setMedio] = useState("contado");
  const [motivo, setMotivo] = useState("");
  const [errorForm, setErrorForm] = useState("");
  const [asignaciones, setAsignaciones] = useState<Record<string, string>>({});
  // Conserva la clave si el servidor confirmó y se cortó la respuesta; el reintento no duplica.
  const intentos = useRef(new Map<string, string>());
  const bloqueo = useRef(false);
  const pedidoForm = useForm<PedidoForm>({
    resolver: zodResolver(pedidoSchema),
    defaultValues: {
      cliente_id: "",
      direccion: "",
      telefono: "",
      fecha: today(),
      observaciones: "",
    },
  });
  const repartoForm = useForm<RepartoForm>({
    resolver: zodResolver(repartoSchema),
    defaultValues: {
      nombre: "",
      fecha: today(),
      repartidor_id: "",
      vehiculo: "",
    },
  });
  const data = query.data;
  const clienteId = pedidoForm.watch("cliente_id");
  const clienteSeleccionado = clientes.data?.find((c) => c.id === clienteId);
  const productoSeleccionado = productos.productos.find((p) =>
    p.id === productoId
  );
  const clientesFiltrados = (clientes.data || []).filter((c) =>
    normalizarBusqueda(
      [c.nombre, c.apellido, c.cuit, c.telefono, c.localidad].filter(Boolean)
        .join(" "),
    )
      .includes(normalizarBusqueda(buscarCliente))
  );
  const productosFiltrados = productos.productos.filter((p) =>
    p.tipo_moneda === "ARS" && !lineas.some((l) => l.producto_id === p.id) &&
    normalizarBusqueda(
      [p.cod_producto, p.cod_barras, p.descripcion].filter(Boolean).join(" "),
    )
      .includes(normalizarBusqueda(buscarProducto))
  );
  async function ejecutar(accion: AccionDistribucion, datos: Json) {
    if (bloqueo.current) return false;
    bloqueo.current = true;
    const firma = JSON.stringify({ accion, datos });
    const clave = intentos.current.get(firma) || crypto.randomUUID();
    intentos.current.set(firma, clave);
    try {
      await query.operar({ accion, datos, clave });
      intentos.current.delete(firma);
      return true;
    } catch {
      return false;
    } finally {
      bloqueo.current = false;
    }
  }
  function abrir(value: ActionDialog) {
    setDialog(value);
    setCantidad(
      value.accion === "rendir" && data
        ? String(
          data.eventos.filter((e) =>
            e.reparto_id === value.reparto.id && cobroVigente(data, e.id) &&
            e.datos.medio === "contado"
          ).reduce((s, e) => s + Number(e.datos.monto || 0), 0),
        )
        : value.accion === "cobro"
        ? ""
        : "1",
    );
    setMedio("contado");
    setMotivo("");
    setErrorForm("");
  }
  async function modificarPedido(
    pedido: PedidoDistribucion,
    eliminar: boolean,
    datos: Json,
  ) {
    if (bloqueo.current) return false;
    bloqueo.current = true;
    const firma = JSON.stringify({
      pedidoId: pedido.id,
      version: pedido.version,
      eliminar,
      datos,
    });
    const clave = intentos.current.get(firma) || crypto.randomUUID();
    intentos.current.set(firma, clave);
    try {
      await query.modificarPedido({
        pedidoId: pedido.id,
        version: pedido.version,
        eliminar,
        datos,
        clave,
      });
      intentos.current.delete(firma);
      return true;
    } catch {
      return false;
    } finally {
      bloqueo.current = false;
    }
  }
  function editarPedido(p: PedidoDistribucion) {
    setPedidoEditando(p);
    pedidoForm.reset({
      cliente_id: p.cliente_id,
      direccion: p.direccion,
      telefono: p.telefono,
      fecha: p.fecha,
      observaciones: p.observaciones,
    });
    setLineas(
      (data?.items || []).filter((i) => i.pedido_id === p.id).map((i) => ({
        producto_id: i.producto_id,
        cantidad: i.cantidad,
      })),
    );
    setProductoId("");
    setErrorForm("");
    setNuevoPedido(true);
  }
  if (query.isLoading) {
    return <div className="p-6">Cargando distribución...</div>;
  }
  if (query.error || !data) {
    return (
      <div className="space-y-3 p-6">
        <h1 className="text-2xl font-bold">Vortex Distribución</h1>
        <p role="alert">
          {query.error?.message || "No se pudo cargar el módulo."}
        </p>
        <Button onClick={() => query.refetch()}>Reintentar</Button>
      </div>
    );
  }
  const pedidosVisibles = data.pedidos.filter((p) =>
    (vista !== "preparacion" || ["pendiente", "preparacion"].includes(p.estado) || (p.estado === "listo" && data.items.some(i => i.pedido_id === p.id && pendienteItem(data, i.id) > 0))) &&
    (etapaPedido === "todos" || p.estado === etapaPedido) &&
    `${p.numero} ${p.cliente_nombre} ${p.direccion}`.toLowerCase().includes(
      busqueda.toLowerCase(),
    )
  );
  const pedidoDetalle = data.pedidos.find((p) => p.id === pedidoDetalleId);
  const repartoDetalle = data.repartos.find((r) => r.id === repartoDetalleId);
  const itemsDetalle = data.items.filter((i) =>
    i.pedido_id === pedidoDetalleId
  );
  const disponibles = data.pedidos.filter((p) =>
    p.estado === "listo" &&
    data.items.some((i) =>
      i.pedido_id === p.id && pendienteItem(data, i.id) > 0
    )
  );
  function puedeModificarPedido(p: PedidoDistribucion) {
    if (!Number.isInteger(p.version)) return false;
    return !data.paradas.filter((parada) => parada.pedido_id === p.id).some((
      parada,
    ) =>
      parada.venta_id || data.repartos.some((r) =>
        r.id === parada.reparto_id && r.estado === "rendido"
      ) ||
      data.cargas.some((c) =>
        c.parada_id === parada.id && c.entregada > 0
      ) ||
      data.eventos.some((e) => e.parada_id === parada.id)
    );
  }
  const counts = [
    [
      "Pedidos por preparar",
      data.pedidos.filter((p) =>
        ["pendiente", "preparacion"].includes(p.estado)
      ).length,
    ],
    [
      "Repartos en calle",
      data.repartos.filter((r) => r.estado === "en_reparto").length,
    ],
    [
      "Rendiciones pendientes",
      data.repartos.filter((r) => r.estado === "pendiente_rendicion").length,
    ],
  ];
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Vortex Distribución</p>
          <h1 className="text-2xl font-bold">{distribucionSecciones.find(s => s.vista === vista)?.title}</h1>
          <p className="text-sm text-muted-foreground">
            Pedido → Preparación → Planificación y remitos → Entrega y cobro → Cierre y rendición → Facturación.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Actualizar distribución"
            onClick={() => query.refetch()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          {vista === "pedidos" && <Button
            onClick={() => {
              setNuevoPedido(true);
              setPedidoEditando(null);
              pedidoForm.reset();
              setLineas([]);
              setProductoId("");
              setErrorForm("");
            }}
          >
            <Plus className="mr-2 h-4 w-4" />Pedido
          </Button>}
          {data.admin && vista === "planificacion" && (
            <Button
              variant="outline"
              onClick={() => setNuevoReparto(true)}
            >
              <Truck className="mr-2 h-4 w-4" />Reparto
            </Button>
          )}
        </div>
      </div>
      <dl className="grid gap-3 border-y py-3 sm:grid-cols-3">
        {counts.map(([label, count]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-bold">{count}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-4">
        {["pedidos", "preparacion"].includes(vista) && <section className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {vista === "pedidos" ? "Preventista: registrar pedidos y consultar su seguimiento." : "Depósito: iniciar la preparación y marcar el pedido preparado para asignarlo a un reparto."}
          </p>
          <div className="flex flex-wrap gap-2" aria-label="Etapa del pedido">
            {[["todos", "Todos"], ["pendiente", "Por preparar"], ["preparacion", "En preparación"], ["listo", "Preparados"]].map(([value, label]) => (
              <Button key={value} size="sm" variant={etapaPedido === value ? "default" : "outline"} aria-pressed={etapaPedido === value} onClick={() => setEtapaPedido(value)}>{label}</Button>
            ))}
          </div>
          <Input
            aria-label="Buscar pedidos"
            placeholder="Buscar cliente, pedido o dirección"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Ítems</TableHead>
                  <TableHead className="text-right">
                    Pendiente de asignar
                  </TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!pedidosVisibles.length && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No hay pedidos para mostrar.
                    </TableCell>
                  </TableRow>
                )}
                {pedidosVisibles.map((p) => {
                  const items = data.items.filter((i) => i.pedido_id === p.id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">#{p.numero}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {new Date(`${p.fecha}T12:00:00`).toLocaleDateString(
                          "es-AR",
                        )}
                      </TableCell>
                      <TableCell>{p.cliente_nombre}</TableCell>
                      <TableCell>{p.direccion}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className="whitespace-nowrap"
                        >
                          {labels[p.estado_operativo || p.estado]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {items.length}
                      </TableCell>
                      <TableCell className="text-right">
                        {items.reduce(
                          (sum, i) => sum + pendienteItem(data, i.id),
                          0,
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium">
                        {money(
                          items.reduce(
                            (sum, i) => sum + i.cantidad * Number(i.precio),
                            0,
                          ),
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            title="Ver pedido"
                            aria-label={`Ver pedido #${p.numero}`}
                            onClick={() => setPedidoDetalleId(p.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {data.admin && (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                title={puedeModificarPedido(p)
                                  ? "Editar pedido"
                                  : "Las entregas y rendiciones se corrigen con devoluciones"}
                                aria-label={`Editar pedido #${p.numero}`}
                                disabled={query.trabajando ||
                                  !puedeModificarPedido(p)}
                                onClick={() => editarPedido(p)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                title={puedeModificarPedido(p)
                                  ? "Eliminar pedido"
                                  : "Las entregas y rendiciones se corrigen con devoluciones"}
                                aria-label={`Eliminar pedido #${p.numero}`}
                                disabled={query.trabajando ||
                                  !puedeModificarPedido(p)}
                                onClick={() => setPedidoEliminando(p)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                title="Cuenta del cliente"
                                aria-label={`Cuenta de ${p.cliente_nombre}`}
                                asChild
                              >
                                <Link to={`/cuenta-corriente/${p.cliente_id}`}>
                                  <CreditCard className="h-4 w-4" />
                                </Link>
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>}
        {vista === "facturacion" && (
          <section>
            {data.admin ? <FacturacionRemitos data={data} /> : <p className="text-muted-foreground">La facturación de distribución requiere permisos de administración.</p>}
          </section>
        )}
        {["planificacion", "repartos", "rendiciones"].map((tab) => {
          if (tab !== vista) return null;
          const rutas = data.repartos.filter((r) =>
            tab === "rendiciones"
              ? ["en_reparto", "pendiente_rendicion", "rendido"].includes(r.estado)
              : tab === "planificacion" ? ["planificado", "cancelado"].includes(r.estado) : r.estado === "en_reparto"
          );
          return (
            <section key={tab} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {tab === "planificacion" ? "Armá el reparto con pedidos preparados. En el detalle, revisá los clientes, generá los remitos y registrá la salida." : tab === "repartos" ? "Repartos en calle: registrá la entrega y el cobro de cada cliente en Pedidos y entregas." : "Revisá el cierre al regreso del camión y confirmá la rendición para habilitar la facturación."}
              </p>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reparto</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Pedidos</TableHead>
                      <TableHead className="text-right">
                        {tab === "rendiciones" ? "Efectivo" : "Total neto"}
                      </TableHead>
                      {tab === "rendiciones" && (
                        <TableHead className="text-right">Diferencia</TableHead>
                      )}
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rutas.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={tab === "rendiciones" ? 7 : 6}
                          className="h-24 text-center text-muted-foreground"
                        >
                          No hay repartos en esta sección.
                        </TableCell>
                      </TableRow>
                    )}
                    {rutas.map((r) => {
                      const paradas = data.paradas.filter((p) =>
                        p.reparto_id === r.id
                      );
                      const resumenes = paradas.map((p) =>
                        resumenParada(data, p.id)
                      );
                      const nombresClientes = [
                        ...new Set(
                          paradas.map((p) =>
                            data.pedidos.find((pedido) =>
                              pedido.id === p.pedido_id
                            )?.cliente_nombre
                          ).filter((nombre): nombre is string =>
                            Boolean(nombre)
                          ),
                        ),
                      ];
                      const efectivo = data.eventos.filter((e) =>
                        e.reparto_id === r.id && e.datos.medio === "contado" &&
                        cobroVigente(data, e.id)
                      ).reduce((sum, e) => sum + Number(e.datos.monto || 0), 0);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">
                            {r.nombre}
                            <div className="text-xs font-normal text-muted-foreground">
                              {r.fecha}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            {nombresClientes.length > 0
                              ? nombresClientes.map((nombre) => (
                                <div key={nombre} className="break-words">
                                  {nombre}
                                </div>
                              ))
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge>{labels[r.estado]}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {paradas.length}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            {tab === "rendiciones"
                              ? (
                                <>
                                  {money(
                                    r.estado === "rendido"
                                      ? Number(r.efectivo_rendido)
                                      : efectivo,
                                  )}
                                  <div className="text-xs text-muted-foreground">
                                    {r.estado === "rendido"
                                      ? "Rendido"
                                      : "Por rendir"}
                                  </div>
                                </>
                              )
                              : money(
                                resumenes.reduce((sum, p) => sum + p.total, 0),
                              )}
                          </TableCell>
                          {tab === "rendiciones" && (
                            <TableCell className="whitespace-nowrap text-right">
                              {r.diferencia === null
                                ? "—"
                                : money(Number(r.diferencia))}
                            </TableCell>
                          )}
                          <TableCell>
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                title="Ver detalle"
                                aria-label={"Ver reparto " + r.nombre}
                                onClick={() => { setDetalleTab("pedidos"); setRepartoDetalleId(r.id); }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {tab !== "rendiciones" && <>
                              <Button variant="outline" size="sm" title="Ver hoja de ruta y mapa" aria-label={`Ver ruta de ${r.nombre}`} onClick={() => { setDetalleTab("ruta"); setRepartoDetalleId(r.id); }}><MapPin className="h-4 w-4"/></Button>
                              <HojaRutaImpresion
                                data={data}
                                reparto={r}
                                compact
                              />
                              </>}
                              {data.admin && r.estado === "planificado" && (
                                <>
                                  <Button
                                    size="sm"
                                    disabled={query.trabajando || paradas.length === 0 || (r.circuito_remitos && paradas.some(p => !data.remitos?.some(m => m.parada_id === p.id && m.estado === "emitido")))}
                                    onClick={() =>
                                      ejecutar("despachar", {
                                        reparto_id: r.id,
                                      })}
                                  >
                                    Iniciar reparto
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={query.trabajando}
                                    onClick={() =>
                                      ejecutar("cancelar_reparto", {
                                        reparto_id: r.id,
                                      })}
                                  >
                                    Cancelar
                                  </Button>
                                </>
                              )}
                              {r.estado === "en_reparto" && (
                                <Button
                                  size="sm"
                                  disabled={query.trabajando}
                                  onClick={() =>
                                    { setDetalleTab("cierre"); setRepartoDetalleId(r.id); }}
                                >
                                  Revisar cierre
                                </Button>
                              )}
                              {data.admin &&
                                r.estado === "pendiente_rendicion" && (
                                <>
                                  <Button
                                    size="sm"
                                    disabled={query.trabajando}
                                    onClick={() =>
                                      abrir({
                                        accion: "rendir",
                                        reparto: r,
                                        titulo: "Rendir " + r.nombre,
                                      })}
                                  >
                                    Rendir
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={query.trabajando}
                                    onClick={() =>
                                      abrir({
                                        accion: "reabrir",
                                        reparto: r,
                                        titulo: "Reabrir para corregir",
                                      })}
                                  >
                                    Reabrir
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>
          );
        })}
      </div>
      <Dialog
        open={Boolean(repartoDetalle)}
        onOpenChange={(open) => {
          if (!open) setRepartoDetalleId(null);
        }}
      >
        <DialogContent className="flex h-[90dvh] max-h-[90dvh] max-w-6xl flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>{repartoDetalle?.nombre}</DialogTitle>
            <DialogDescription>
              {repartoDetalle?.fecha} ·{" "}
              {repartoDetalle?.vehiculo || "Sin vehículo"} ·{" "}
              {data.usuarios.find((u) => u.id === repartoDetalle?.repartidor_id)
                ?.nombre || "Mi reparto"} ·{" "}
              {repartoDetalle && labels[repartoDetalle.estado]}
            </DialogDescription>
          </DialogHeader>
          {repartoDetalle &&
            [repartoDetalle].map((r) => (
              <Tabs
                key={r.id}
                value={detalleTab}
                onValueChange={setDetalleTab}
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <TabsList className="grid h-auto w-full shrink-0 grid-cols-2 sm:grid-cols-5">
                  <TabsTrigger value="pedidos" className="whitespace-normal">
                    Pedidos y entregas
                  </TabsTrigger>
                  <TabsTrigger value="resumen" className="whitespace-normal">Remitos y salida</TabsTrigger>
                  <TabsTrigger value="ruta" className="whitespace-normal">Hoja de ruta</TabsTrigger>
                  <TabsTrigger value="cierre" className="whitespace-normal">Cierre y rendición</TabsTrigger>
                  <TabsTrigger value="historial">Historial</TabsTrigger>
                </TabsList>
                <TabsContent
                  value="resumen"
                  className="min-h-0 flex-1 space-y-4 overflow-y-auto [scrollbar-gutter:stable]"
                >
                  <p className="text-sm text-muted-foreground">3. Despachante: revisar la carga por cliente, generar remitos y registrar la salida del camión. La confirmación de ejemplares impresos es opcional.</p>
                  <RemitosReparto data={data} reparto={r} />
                  {data.admin && r.estado === "planificado" && (
                      <div className="flex gap-2">
                        <Button
                          disabled={query.trabajando || !data.paradas.some(p => p.reparto_id === r.id) || (r.circuito_remitos && data.paradas.filter(p => p.reparto_id === r.id).some(p => !data.remitos?.some(m => m.parada_id === p.id && m.estado === "emitido")))}
                          onClick={() =>
                            ejecutar("despachar", { reparto_id: r.id })}
                        >
                          Iniciar reparto y reservar stock
                        </Button>
                        <Button
                          variant="outline"
                          disabled={query.trabajando}
                          onClick={() =>
                            ejecutar("cancelar_reparto", { reparto_id: r.id })}
                        >
                          Cancelar reparto
                        </Button>
                      </div>
                  )}
                  {vista !== "rendiciones" && <div className="flex flex-wrap gap-2">
                    <HojaRutaImpresion data={data} reparto={r} />
                  </div>}
                </TabsContent>
                <TabsContent
                  value="pedidos"
                  className="min-h-0 flex-1 space-y-4 overflow-y-auto [scrollbar-gutter:stable]"
                >
                  <p className="text-sm text-muted-foreground">Todos los clientes del reparto aparecen en esta lista. Ingresá a cada cliente para registrar sus despachos y cobros. Nombre, firma y observaciones son opcionales.</p>
                  {data.admin && r.estado === "planificado" && (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <select
                          aria-label={`Pedido para ${r.nombre}`}
                          className={selectClass}
                          value={asignaciones[r.id] || ""}
                          onChange={(e) =>
                            setAsignaciones({
                              ...asignaciones,
                              [r.id]: e.target.value,
                            })}
                        >
                          <option value="">Agregar pedido preparado</option>
                          {disponibles.map((p) => (
                            <option key={p.id} value={p.id}>
                              #{p.numero} {p.cliente_nombre}
                            </option>
                          ))}
                        </select>
                        <Button
                          disabled={query.trabajando || !asignaciones[r.id]}
                          onClick={async () => {
                            if (
                              await ejecutar("asignar", {
                                reparto_id: r.id,
                                pedido_id: asignaciones[r.id],
                              })
                            ) {
                              setAsignaciones({ ...asignaciones, [r.id]: "" });
                            }
                          }}
                        >
                          Agregar
                        </Button>
                      </div>
                    </div>
                  )}
                  <ClientesReparto
                    key={r.id}
                    data={data}
                    reparto={r}
                    trabajando={query.trabajando}
                    abrir={abrir}
                    quitar={(parada) => ejecutar("quitar", {
                      reparto_id: r.id,
                      parada_id: parada.id,
                    })}
                  />
                  {r.estado === "planificado" && (
                    <Button variant="outline" disabled={!data.paradas.some(p => p.reparto_id === r.id)} onClick={() => setDetalleTab("resumen")}>
                      Continuar con remitos y salida
                    </Button>
                  )}
                </TabsContent>
                <TabsContent value="cierre" className="min-h-0 flex-1 space-y-4 overflow-y-auto [scrollbar-gutter:stable]">
                  <p className="text-sm text-muted-foreground">5. Al regresar el camión: revisar despachos por cliente, mercadería que volvió y cobros. Finalizar el reparto y luego confirmar la rendición.</p>
                  <ResumenReparto data={data} reparto={r} />
                  <div className="space-y-2 rounded-md border p-3">
                    {data.paradas.filter(p => p.reparto_id === r.id).map(p => {
                      const remito = data.remitos?.find(m => m.parada_id === p.id && m.estado !== "anulado");
                      const resumen = resumenParada(data, p.id);
                      return <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0">
                        <span>{data.pedidos.find(pedido => pedido.id === p.pedido_id)?.cliente_nombre}</span>
                        <span className="text-sm">{r.circuito_remitos ? remito?.estado === "confirmado" ? "Despacho registrado" : "Visita pendiente" : "Circuito anterior"} · Entregado: {money(resumen.total)} · Cobrado: {money(resumen.cobrado)} · Saldo: {money(resumen.saldo)}</span>
                      </div>;
                    })}
                  </div>
                  {r.circuito_remitos && data.paradas.some(p => p.reparto_id === r.id && !data.remitos?.some(m => m.parada_id === p.id && m.estado === "confirmado")) && <p className="text-sm text-muted-foreground">Registrá todas las visitas en Pedidos y entregas, incluso sin entrega, antes de finalizar.</p>}
                  {r.estado === "en_reparto" && (
                    <Button
                      disabled={query.trabajando || (r.circuito_remitos && data.paradas.some(p => p.reparto_id === r.id && !data.remitos?.some(m => m.parada_id === p.id && m.estado === "confirmado")))}
                      onClick={() =>
                        ejecutar("finalizar", { reparto_id: r.id })}
                    >
                      Finalizar reparto y enviar a rendición
                    </Button>
                  )}
                  {r.estado === "pendiente_rendicion" && (
                    <div className="space-y-2">
                      <p className="text-sm">
                        {r.circuito_remitos
                          ? "Confirmá el efectivo y la mercadería que volvió. Las entregas confirmadas quedan pendientes de facturación; rendir no genera otra venta ni descuenta stock."
                          : "Confirmá el efectivo recibido para generar las ventas y aplicar los cobros registrados."}
                      </p>
                      {data.admin && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={query.trabajando}
                            onClick={() =>
                              abrir({
                                accion: "rendir",
                                reparto: r,
                                titulo: `Rendir ${r.nombre}`,
                              })}
                          >
                            Confirmar rendición
                          </Button>
                          <Button
                            variant="outline"
                            disabled={query.trabajando}
                            onClick={() =>
                              abrir({
                                accion: "reabrir",
                                reparto: r,
                                titulo: "Reabrir para corregir",
                              })}
                          >
                            Reabrir para corregir
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  {r.estado === "rendido" && (
                    <div className="rounded-md bg-muted p-3">
                      <p>
                        Efectivo rendido:{" "}
                        <b>{money(Number(r.efectivo_rendido))}</b> · Diferencia:
                        {" "}
                        <b>{money(Number(r.diferencia))}</b>
                      </p>
                      {r.observaciones && (
                        <p className="text-sm">{r.observaciones}</p>
                      )}
                    </div>
                  )}
                </TabsContent>
                <TabsContent
                  value="historial"
                  className="min-h-0 flex-1 space-y-3 overflow-y-auto text-sm [scrollbar-gutter:stable]"
                >
                  <h3 className="font-medium">
                    Historial de entregas, devoluciones y cobros
                  </h3>
                  {!data.eventos.some((e) => e.reparto_id === r.id) && (
                    <p className="py-4 text-center text-muted-foreground">
                      No hay movimientos registrados.
                    </p>
                  )}
                  <div className="space-y-2 pt-2">
                    {data.eventos.filter((e) => e.reparto_id === r.id).map(
                      (e) => (
                        <div key={e.id}>
                          <p>
                            {new Date(e.created_at).toLocaleString("es-AR")} ·
                            {" "}
                            {e.tipo.replace(/_/g, " ")}
                            {e.datos.cantidad
                              ? ` · ${e.datos.cantidad} unidades`
                              : ""}
                            {e.datos.monto
                              ? ` · ${money(Number(e.datos.monto))} (${
                                e.datos.medio === "contado"
                                  ? "efectivo"
                                  : "transferencia"
                              })`
                              : ""}
                            {e.datos.motivo ? ` · ${e.datos.motivo}` : ""}
                            {e.tipo === "cobro" && !cobroVigente(data, e.id)
                              ? " · Anulado"
                              : ""}
                          </p>
                          {r.estado === "en_reparto" &&
                            cobroVigente(data, e.id) && (
                            <Button
                              variant="link"
                              size="sm"
                              disabled={query.trabajando}
                              onClick={() =>
                                abrir({
                                  accion: "anular_cobro",
                                  reparto: r,
                                  parada: data.paradas.find((p) =>
                                    p.id === e.parada_id
                                  ),
                                  eventoId: e.id,
                                  titulo: "Anular cobro registrado",
                                })}
                            >
                              Corregir cobro
                            </Button>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="ruta" className="min-h-0 flex-1 space-y-4 overflow-y-auto [scrollbar-gutter:stable]">
                  <DistribucionHojaRuta key={r.id} data={data} reparto={r}/>
                </TabsContent>
              </Tabs>
            ))}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pedidoEliminando)}
        onOpenChange={(open) => {
          if (!open && !query.trabajando) setPedidoEliminando(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar el pedido #{pedidoEliminando?.numero}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el pedido de {pedidoEliminando?.cliente_nombre}{" "}
              y se quitará de los repartos asignados. Se liberará el stock
              reservado, sin sumar unidades que no se descontaron. Los pedidos
              con entregas o rendiciones se conservan y se corrigen mediante
              devoluciones.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={query.trabajando}
              onClick={() => setPedidoEliminando(null)}
            >
              Volver
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={query.trabajando}
              onClick={async () => {
                if (
                  pedidoEliminando &&
                  await modificarPedido(pedidoEliminando, true, {})
                ) {
                  if (
                    pedidoDetalleId === pedidoEliminando.id
                  ) setPedidoDetalleId(null);
                  setPedidoEliminando(null);
                }
              }}
            >
              {query.trabajando ? "Eliminando..." : "Eliminar pedido"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={Boolean(pedidoDetalle)}
        onOpenChange={(open) => {
          if (!open && !query.trabajando) setPedidoDetalleId(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Detalle del pedido #{pedidoDetalle?.numero}
            </DialogTitle>
            <DialogDescription>
              Productos, cantidades y seguimiento de la preparación del pedido.
            </DialogDescription>
          </DialogHeader>
          {pedidoDetalle && (
            <div className="space-y-5">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <p>
                  <strong>Cliente:</strong> {pedidoDetalle.cliente_nombre}
                </p>
                <p>
                  <strong>Fecha:</strong>{" "}
                  {new Date(`${pedidoDetalle.fecha}T12:00:00`)
                    .toLocaleDateString("es-AR")}
                </p>
                <p>
                  <strong>Dirección:</strong> {pedidoDetalle.direccion}
                </p>
                <p>
                  <strong>Teléfono:</strong> {pedidoDetalle.telefono
                    ? (
                      <a
                        className="underline"
                        href={`tel:${pedidoDetalle.telefono}`}
                      >
                        {pedidoDetalle.telefono}
                      </a>
                    )
                    : "—"}
                </p>
                <p>
                  <strong>Estado:</strong>{" "}
                  <Badge variant="secondary">
                    {labels[
                      pedidoDetalle.estado_operativo || pedidoDetalle.estado
                    ]}
                  </Badge>
                </p>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">
                        Pendiente de asignar
                      </TableHead>
                      <TableHead className="text-right">
                        Precio unitario
                      </TableHead>
                      <TableHead className="text-right">IVA</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemsDetalle.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>{i.descripcion}</TableCell>
                        <TableCell className="text-right">
                          {i.cantidad}
                        </TableCell>
                        <TableCell className="text-right">
                          {pendienteItem(data, i.id)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {money(Number(i.precio))}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(i.iva)}%
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {money(i.cantidad * Number(i.precio))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-wrap justify-between gap-3 border-t pt-4">
                <p className="text-sm">
                  <strong>Observaciones:</strong>{" "}
                  {pedidoDetalle.observaciones || "—"}
                </p>
                <p className="text-lg font-semibold">
                  Total pedido: {money(itemsDetalle.reduce((sum, i) =>
                    sum + i.cantidad * Number(i.precio), 0))}
                </p>
              </div>
              {data.admin && (
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  {pedidoDetalle.estado === "pendiente" && (
                    <Button
                      type="button"
                      disabled={query.trabajando}
                      onClick={() =>
                        ejecutar("preparar", { pedido_id: pedidoDetalle.id })}
                    >
                      Iniciar preparación
                    </Button>
                  )}
                  {pedidoDetalle.estado === "preparacion" && (
                    <Button
                      type="button"
                      disabled={query.trabajando}
                      onClick={() =>
                        ejecutar("listo", { pedido_id: pedidoDetalle.id })}
                    >
                      Confirmar preparado
                    </Button>
                  )}
                  {pedidoDetalle.estado !== "cancelado" &&
                    !data.paradas.some((p) =>
                      p.pedido_id === pedidoDetalle.id
                    ) && (
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={query.trabajando}
                      onClick={() =>
                        ejecutar("cancelar_pedido", {
                          pedido_id: pedidoDetalle.id,
                        })}
                    >
                      Cancelar pedido
                    </Button>
                  )}
                  <Button variant="outline" asChild>
                    <Link to={`/cuenta-corriente/${pedidoDetalle.cliente_id}`}>
                      <CreditCard className="mr-2 h-4 w-4" />Cuenta del cliente
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={nuevoPedido}
        onOpenChange={(open) => {
          if (!query.trabajando) {
            setNuevoPedido(open);
            if (!open) {
              setClienteSelectorOpen(false);
              setProductoSelectorOpen(false);
            }
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {pedidoEditando
                ? `Editar pedido #${pedidoEditando.numero}`
                : "Nuevo pedido"}
            </DialogTitle>
            <DialogDescription>
              {pedidoEditando
                ? "Al guardar se liberan las reservas y se quita el pedido de los repartos. Volverá a Pendiente para prepararlo y asignarlo nuevamente. Los productos conservados mantienen sus precios originales."
                : "Elegí un cliente y los productos del catálogo. Los precios quedan guardados en el pedido."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={pedidoForm.handleSubmit(async (values) => {
              if (
                !lineas.length ||
                lineas.some((l) =>
                  !Number.isInteger(l.cantidad) || l.cantidad <= 0
                )
              ) {
                setErrorForm(
                  "Agregá productos con cantidades enteras mayores a cero.",
                );
                return;
              }
              const guardado = pedidoEditando
                ? await modificarPedido(pedidoEditando, false, {
                  ...values,
                  items: lineas,
                })
                : await ejecutar("pedido", { ...values, items: lineas });
              if (guardado) {
                setNuevoPedido(false);
                setPedidoEditando(null);
                pedidoForm.reset();
                setLineas([]);
                setProductoId("");
                setClienteSelectorOpen(false);
                setProductoSelectorOpen(false);
              }
            })}
          >
            <Label htmlFor="dis-cliente">Cliente</Label>
            <input type="hidden" {...pedidoForm.register("cliente_id")} />
            <div className="flex gap-2">
              <Input
                id="dis-cliente"
                className="min-w-0 flex-1"
                readOnly
                value={clienteSeleccionado
                  ? `${clienteSeleccionado.nombre} ${clienteSeleccionado.apellido}`
                    .trim()
                  : ""}
                placeholder="Seleccioná un cliente"
              />
              <Button
                type="button"
                variant="outline"
                aria-label="Buscar cliente"
                disabled={query.trabajando}
                onClick={() => {
                  setBuscarCliente("");
                  setClienteSelectorOpen(true);
                }}
              >
                <Search className="mr-2 h-4 w-4" />Buscar
              </Button>
            </div>
            <Label htmlFor="dis-direccion">Dirección de entrega</Label>
            <Input id="dis-direccion" {...pedidoForm.register("direccion")} />
            <Label htmlFor="dis-telefono">Teléfono</Label>
            <Input id="dis-telefono" {...pedidoForm.register("telefono")} />
            <Label htmlFor="dis-fecha">Fecha prevista</Label>
            <Input
              id="dis-fecha"
              type="date"
              {...pedidoForm.register("fecha")}
            />
            <Label htmlFor="dis-producto">Producto</Label>
            <div className="flex gap-2">
              <Input
                id="dis-producto"
                className="min-w-0 flex-1"
                readOnly
                value={productoSeleccionado?.descripcion || ""}
                placeholder="Seleccioná un producto"
              />
              <Button
                type="button"
                variant="outline"
                aria-label="Buscar producto"
                disabled={query.trabajando}
                onClick={() => {
                  setBuscarProducto("");
                  setProductoSelectorOpen(true);
                }}
              >
                <Search className="mr-2 h-4 w-4" />Buscar
              </Button>
              <Button
                type="button"
                disabled={!productoId}
                onClick={() => {
                  setLineas([...lineas, {
                    producto_id: productoId,
                    cantidad: 1,
                  }]);
                  setProductoId("");
                }}
              >
                Agregar
              </Button>
            </div>
            {productoSeleccionado && (
              <p className="text-sm text-muted-foreground">
                {productoSeleccionado.cod_producto} ·{" "}
                {money(productoSeleccionado.precio_venta)} · Stock:{" "}
                {productoSeleccionado.stock}
              </p>
            )}
            {lineas.map((l) => (
              <div key={l.producto_id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-sm">
                  {productos.productos.find((p) =>
                    p.id === l.producto_id
                  )?.descripcion}
                </span>
                <Input
                  className="w-20"
                  aria-label="Cantidad pedida"
                  type="number"
                  min="1"
                  step="1"
                  value={l.cantidad || ""}
                  onChange={(e) =>
                    setLineas(lineas.map((v) =>
                      v.producto_id === l.producto_id
                        ? { ...v, cantidad: Number(e.target.value) }
                        : v
                    ))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  aria-label="Quitar producto"
                  onClick={() =>
                    setLineas(
                      lineas.filter((v) => v.producto_id !== l.producto_id),
                    )}
                >
                  ×
                </Button>
              </div>
            ))}
            <Label htmlFor="dis-obs">Observaciones</Label>
            <Textarea id="dis-obs" {...pedidoForm.register("observaciones")} />
            {Object.values(pedidoForm.formState.errors).map((e, i) => (
              <p key={i} role="alert" className="text-sm text-destructive">
                {e.message}
              </p>
            ))}
            {errorForm && (
              <p role="alert" className="text-sm text-destructive">
                {errorForm}
              </p>
            )}
            {(clientes.error || productos.error) && (
              <p role="alert">
                No se pudo cargar el catálogo o los clientes. Actualizá la
                página.
              </p>
            )}
            <Button
              className="w-full"
              disabled={query.trabajando || clientes.isLoading ||
                productos.isLoading ||
                Boolean(clientes.error || productos.error)}
            >
              Guardar pedido
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={nuevoPedido && clienteSelectorOpen}
        onOpenChange={setClienteSelectorOpen}
      >
        <DialogContent className="flex max-h-[85dvh] max-w-2xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Seleccionar cliente</DialogTitle>
            <DialogDescription>
              Buscá por nombre, apellido, CUIT, teléfono o localidad.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Buscar cliente en el listado"
            autoFocus
            placeholder="Nombre, apellido, CUIT, teléfono o localidad"
            value={buscarCliente}
            onChange={(e) => setBuscarCliente(e.target.value)}
          />
          <div className="min-h-0 space-y-2 overflow-y-auto" aria-live="polite">
            {clientes.isLoading
              ? <p className="py-4">Cargando clientes...</p>
              : clientes.error
              ? (
                <div className="space-y-2 py-4">
                  <p role="alert">No se pudieron cargar los clientes.</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => clientes.refetch()}
                  >
                    Reintentar
                  </Button>
                </div>
              )
              : clientesFiltrados.length === 0
              ? (
                <p className="py-4 text-muted-foreground">
                  No se encontraron clientes.
                </p>
              )
              : clientesFiltrados.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">
                      {c.nombre} {c.apellido}
                    </p>
                    <p className="break-words text-sm text-muted-foreground">
                      {[c.cuit && `CUIT: ${c.cuit}`, c.localidad, c.telefono]
                        .filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    disabled={!c.id}
                    aria-label={`Elegir cliente ${c.nombre} ${c.apellido}`}
                    onClick={() => {
                      pedidoForm.setValue("cliente_id", c.id!, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      pedidoForm.setValue(
                        "direccion",
                        [c.calle, c.numero, c.localidad].filter(Boolean).join(
                          " ",
                        ),
                        { shouldDirty: true },
                      );
                      pedidoForm.setValue("telefono", c.telefono || "", {
                        shouldDirty: true,
                      });
                      setClienteSelectorOpen(false);
                    }}
                  >
                    Elegir
                  </Button>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={nuevoPedido && productoSelectorOpen}
        onOpenChange={setProductoSelectorOpen}
      >
        <DialogContent className="flex max-h-[85dvh] max-w-2xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Seleccionar producto</DialogTitle>
            <DialogDescription>
              Buscá por código, código de barras o descripción. Se muestran
              productos en pesos que todavía no agregaste.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Buscar producto en el listado"
            autoFocus
            placeholder="Código, código de barras o descripción"
            value={buscarProducto}
            onChange={(e) => setBuscarProducto(e.target.value)}
          />
          <div className="min-h-0 space-y-2 overflow-y-auto" aria-live="polite">
            {productos.isLoading
              ? <p className="py-4">Cargando productos...</p>
              : productos.error
              ? (
                <div className="space-y-2 py-4">
                  <p role="alert">No se pudieron cargar los productos.</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      catalogoCache.invalidateQueries({
                        queryKey: ["productos"],
                      })}
                  >
                    Reintentar
                  </Button>
                </div>
              )
              : productosFiltrados.length === 0
              ? (
                <p className="py-4 text-muted-foreground">
                  No se encontraron productos disponibles para agregar.
                </p>
              )
              : productosFiltrados.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">{p.descripcion}</p>
                    <p className="break-words text-sm text-muted-foreground">
                      {p.cod_producto} · {money(p.precio_venta)} · Stock:{" "}
                      {p.stock}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    aria-label={`Elegir producto ${p.descripcion}`}
                    onClick={() => {
                      setProductoId(p.id);
                      setProductoSelectorOpen(false);
                    }}
                  >
                    Elegir
                  </Button>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={nuevoReparto}
        onOpenChange={(open) => {
          if (!query.trabajando) setNuevoReparto(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Planificar reparto</DialogTitle>
            <DialogDescription>
              Asigná un usuario activo del comercio y agregá los pedidos
              preparados.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={repartoForm.handleSubmit(async (values) => {
              if (await ejecutar("reparto", values)) {
                setNuevoReparto(false);
                repartoForm.reset();
                navigate("/distribucion/planificacion");
              }
            })}
          >
            <Label htmlFor="dis-rnombre">Nombre o zona</Label>
            <Input id="dis-rnombre" {...repartoForm.register("nombre")} />
            <Label htmlFor="dis-rfecha">Fecha</Label>
            <Input
              id="dis-rfecha"
              type="date"
              {...repartoForm.register("fecha")}
            />
            <Label htmlFor="dis-driver">Repartidor</Label>
            <select
              id="dis-driver"
              className={selectClass}
              {...repartoForm.register("repartidor_id")}
            >
              <option value="">Seleccioná usuario</option>
              {data.usuarios.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
            <Label htmlFor="dis-vehiculo">Vehículo</Label>
            <Input id="dis-vehiculo" {...repartoForm.register("vehiculo")} />
            {Object.values(repartoForm.formState.errors).map((e, i) => (
              <p key={i} role="alert" className="text-sm text-destructive">
                {e.message}
              </p>
            ))}
            <Button className="w-full" disabled={query.trabajando}>
              Crear reparto
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(dialog)}
        onOpenChange={(open) => {
          if (!open && !query.trabajando) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.titulo}</DialogTitle>
            <DialogDescription>
              {dialog?.accion === "rendir"
                ? "Las ventas se generan por la entrega neta y los cobros se imputan a la cuenta corriente. Los recibos de este circuito no son fiscales."
                : dialog?.accion === "devolucion_rendida"
                ? "La devolución repone stock y acredita la cuenta del cliente. Si ya pagó, conserva un saldo a favor."
                : "La operación queda registrada en el historial del reparto."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!dialog) return;
              const number = Number(cantidad);
              const esDinero = ["cobro", "rendir"].includes(dialog.accion);
              if (
                !cantidad || !Number.isFinite(number) ||
                number < (dialog.accion === "rendir" ? 0 : 0.01) ||
                (!esDinero && !Number.isInteger(number)) ||
                (esDinero &&
                  Math.abs(number * 100 - Math.round(number * 100)) > 0.000001)
              ) {
                setErrorForm("Revisá el importe o la cantidad.");
                return;
              }
              if (
                (dialog.accion.includes("devolucion") ||
                  ["anular_cobro", "reabrir"].includes(dialog.accion)) &&
                !motivo.trim()
              ) {
                setErrorForm("Indicá el motivo.");
                return;
              }
              const datos: Json = {
                reparto_id: dialog.reparto.id,
                ...(dialog.parada ? { parada_id: dialog.parada.id } : {}),
                ...(dialog.carga ? { carga_id: dialog.carga.id } : {}),
                ...(dialog.accion === "rendir"
                  ? { efectivo: number, observaciones: motivo }
                  : dialog.accion === "cobro"
                  ? { monto: number, medio, observaciones: motivo }
                  : dialog.accion === "anular_cobro"
                  ? { evento_id: dialog.eventoId, motivo }
                  : dialog.accion === "reabrir"
                  ? { motivo }
                  : { cantidad: number, motivo }),
              };
              if (await ejecutar(dialog.accion, datos)) setDialog(null);
            }}
          >
            {!["anular_cobro", "reabrir"].includes(dialog?.accion || "") && (
              <>
                <Label htmlFor="dis-value">
                  {dialog?.accion === "rendir"
                    ? "Efectivo recibido"
                    : dialog?.accion === "cobro"
                    ? "Importe recibido"
                    : "Cantidad"}
                </Label>
                <Input
                  id="dis-value"
                  type="number"
                  inputMode="decimal"
                  min={dialog?.accion === "rendir"
                    ? "0"
                    : dialog?.accion === "cobro"
                    ? "0.01"
                    : "1"}
                  step={["rendir", "cobro"].includes(dialog?.accion || "")
                    ? "0.01"
                    : "1"}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  required
                />
              </>
            )}
            {dialog?.accion === "cobro" && (
              <>
                <Label htmlFor="dis-medio">Medio de cobro</Label>
                <select
                  id="dis-medio"
                  className={selectClass}
                  value={medio}
                  onChange={(e) => setMedio(e.target.value)}
                >
                  <option value="contado">Efectivo</option>
                  <option value="transferencia">
                    Transferencia confirmada
                  </option>
                </select>
              </>
            )}
            <Label htmlFor="dis-motivo">
              {dialog?.accion.includes("devolucion")
                ? "Motivo de devolución"
                : dialog?.accion === "anular_cobro"
                ? "Motivo de corrección (confirmá la devolución del dinero si corresponde)"
                : "Observaciones / diferencia de rendición"}
            </Label>
            <Textarea
              id="dis-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            {errorForm && (
              <p role="alert" className="text-sm text-destructive">
                {errorForm}
              </p>
            )}
            <Button className="w-full" disabled={query.trabajando}>
              Confirmar
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResumenReparto(
  { data, reparto }: {
    data: ResumenDistribucion;
    reparto: RepartoDistribucion;
  },
) {
  const paradas = data.paradas.filter((p) => p.reparto_id === reparto.id);
  const resumenes = paradas.map((p) => resumenParada(data, p.id));
  const cargas = resumenes.flatMap((p) => p.cargas);
  const efectivo = data.eventos.filter((e) =>
    e.reparto_id === reparto.id && e.datos.medio === "contado" &&
    cobroVigente(data, e.id)
  ).reduce((sum, e) => sum + Number(e.datos.monto || 0), 0);
  const datos: [string, string | number][] = [
    ["Pedidos", paradas.length],
    ["Unidades cargadas", cargas.reduce((sum, c) => sum + c.cargada, 0)],
    [
      "Unidades entregadas netas",
      cargas.reduce((sum, c) => sum + c.entregada - c.devuelta, 0),
    ],
    ["Unidades devueltas", cargas.reduce((sum, c) => sum + c.devuelta, 0)],
    ["Unidades sin entregar", cargas.reduce((sum, c) => sum + c.cargada - c.entregada, 0)],
    ["Total que vuelve al depósito", cargas.reduce((sum, c) => sum + c.cargada - c.entregada + c.devuelta, 0)],
    ["Total neto", money(resumenes.reduce((sum, p) => sum + p.total, 0))],
    ["Cobrado", money(resumenes.reduce((sum, p) => sum + p.cobrado, 0))],
    ["Efectivo esperado", money(efectivo)],
    [
      "Efectivo rendido",
      reparto.efectivo_rendido === null
        ? "—"
        : money(Number(reparto.efectivo_rendido)),
    ],
    [
      "Diferencia",
      reparto.diferencia === null ? "—" : money(Number(reparto.diferencia)),
    ],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 border-y py-3 sm:grid-cols-3">
      {datos.map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ClientesReparto({
  data, reparto, trabajando, abrir, quitar,
}: {
  data: ResumenDistribucion;
  reparto: RepartoDistribucion;
  trabajando: boolean;
  abrir: (dialog: ActionDialog) => void;
  quitar: (parada: ParadaDistribucion) => Promise<boolean>;
}) {
  const [clienteId, setClienteId] = useState<string | null>(null);
  const clientesReparto = new Map<string, {
    id: string;
    nombre: string;
    paradas: ParadaDistribucion[];
  }>();
  for (const parada of data.paradas.filter(p => p.reparto_id === reparto.id).sort((a, b) => a.orden - b.orden)) {
    const pedido = data.pedidos.find(p => p.id === parada.pedido_id);
    const id = pedido?.cliente_id || parada.pedido_id;
    const cliente = clientesReparto.get(id) || { id, nombre: pedido?.cliente_nombre || "Cliente sin datos", paradas: [] };
    cliente.paradas.push(parada);
    clientesReparto.set(id, cliente);
  }
  const seleccionado = clienteId ? clientesReparto.get(clienteId) : undefined;
  if (seleccionado) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">{seleccionado.nombre}</h3>
          <Button variant="outline" disabled={trabajando} onClick={() => setClienteId(null)}>Volver a clientes</Button>
        </div>
        {seleccionado.paradas.map(parada => (
          <Parada key={parada.id} data={data} parada={parada} reparto={reparto} trabajando={trabajando} abrir={abrir} quitar={() => quitar(parada)} />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Clientes del reparto ({clientesReparto.size})</h3>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Orden</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Pedidos</TableHead>
              <TableHead>Despachos</TableHead>
              <TableHead className="text-right">Cobrado</TableHead>
              <TableHead>Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientesReparto.size === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No hay clientes asignados a este reparto. Agregá pedidos preparados.</TableCell></TableRow>}
            {[...clientesReparto.values()].map(cliente => {
              const confirmados = cliente.paradas.filter(p => data.remitos?.some(m => m.parada_id === p.id && m.estado === "confirmado")).length;
              const pendiente = reparto.circuito_remitos && confirmados < cliente.paradas.length;
              const pedidos = cliente.paradas.map(p => data.pedidos.find(pedido => pedido.id === p.pedido_id));
              const direcciones = [...new Set(pedidos.map(p => p?.direccion).filter(Boolean))];
              const cobrado = cliente.paradas.reduce((sum, p) => sum + resumenParada(data, p.id).cobrado, 0);
              return (
                <TableRow key={cliente.id}>
                  <TableCell>{cliente.paradas.map(p => p.orden).join(", ")}</TableCell>
                  <TableCell>
                    <p className="font-medium">{cliente.nombre}</p>
                    {direcciones.map(direccion => <p key={direccion} className="text-xs text-muted-foreground">{direccion}</p>)}
                  </TableCell>
                  <TableCell>{pedidos.map((p, i) => p ? `#${p.numero}` : `Pedido ${i + 1}`).join(", ")}</TableCell>
                  <TableCell><Badge variant="outline">{reparto.estado === "cancelado" ? "Cancelado" : reparto.estado === "planificado" ? "Por salir" : reparto.circuito_remitos ? `${confirmados}/${cliente.paradas.length} registrados` : "Ver entregas"}</Badge></TableCell>
                  <TableCell className="text-right">{money(cobrado)}</TableCell>
                  <TableCell>
                    <Button size="sm" variant={reparto.estado === "en_reparto" && pendiente ? "default" : "outline"} aria-label={`Abrir despachos de ${cliente.nombre}`} onClick={() => setClienteId(cliente.id)}>
                      {reparto.estado === "planificado" ? "Ver pedidos" : reparto.estado === "en_reparto" && (pendiente || !reparto.circuito_remitos) ? "Registrar despachos" : "Ver despachos"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Parada({
  data,
  parada,
  reparto,
  trabajando,
  abrir,
  quitar,
}: {
  data: ResumenDistribucion;
  parada: ParadaDistribucion;
  reparto: RepartoDistribucion;
  trabajando: boolean;
  abrir: (d: ActionDialog) => void;
  quitar: () => void;
}) {
  const pedido = data.pedidos.find((p) => p.id === parada.pedido_id);
  const resumen = resumenParada(data, parada.id);
  if (reparto.circuito_remitos) {
    const remito = data.remitos?.find((m) => m.parada_id === parada.id);
    if (remito) {
      return (
        <EntregaRemito
          key={remito.id}
          data={data}
          reparto={reparto}
          remito={remito}
          cobrar={() =>
            abrir({
              accion: "cobro",
              reparto,
              parada,
              titulo: `Cobrar a ${remito.cliente_nombre}`,
            })}
        />
      );
    }
    return (
      <section className="space-y-2 border-t pt-3">
        <h3 className="font-semibold">
          Pedido #{pedido?.numero} · {pedido?.cliente_nombre}
        </h3>
        <p>{pedido?.direccion}</p>
        <p className="text-sm text-muted-foreground">
          Generá los remitos desde Remitos y salida antes de iniciar el reparto.
        </p>
        {data.admin && reparto.estado === "planificado" && (
          <Button variant="outline" onClick={quitar} disabled={trabajando}>
            Quitar pedido
          </Button>
        )}
      </section>
    );
  }
  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">
            {parada.orden}. #{pedido?.numero} · {pedido?.cliente_nombre}
          </h3>
          <p className="text-sm text-muted-foreground">{pedido?.direccion}</p>
          {pedido?.telefono && (
            <a className="text-sm underline" href={`tel:${pedido.telefono}`}>
              Llamar al cliente
            </a>
          )}
        </div>
        {data.admin && reparto.estado === "planificado" && (
          <Button
            variant="ghost"
            size="sm"
            disabled={trabajando}
            onClick={quitar}
          >
            Quitar
          </Button>
        )}
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Cargado</TableHead>
              <TableHead className="text-right">Entregado</TableHead>
              <TableHead className="text-right">Devuelto</TableHead>
              <TableHead className="text-right">Sin entregar</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resumen.cargas.map((c) => {
              const i = data.items.find((i) => i.id === c.item_id);
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    {i?.descripcion}
                  </TableCell>
                  <TableCell className="text-right">{c.cargada}</TableCell>
                  <TableCell className="text-right">{c.entregada}</TableCell>
                  <TableCell className="text-right">{c.devuelta}</TableCell>
                  <TableCell className="text-right">
                    {c.cargada - c.entregada}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {reparto.estado === "en_reparto" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={trabajando || c.entregada >= c.cargada}
                            onClick={() =>
                              abrir({
                                accion: "entrega",
                                reparto,
                                parada,
                                carga: c,
                                titulo: `Entregar ${i?.descripcion}`,
                              })}
                          >
                            Entregar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={trabajando || c.entregada <= c.devuelta}
                            onClick={() =>
                              abrir({
                                accion: "devolucion",
                                reparto,
                                parada,
                                carga: c,
                                titulo: `Devolver ${i?.descripcion}`,
                              })}
                          >
                            Devolución
                          </Button>
                        </>
                      )}
                      {data.admin && reparto.estado === "rendido" &&
                        c.entregada > c.devuelta && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={trabajando}
                          onClick={() =>
                            abrir({
                              accion: "devolucion_rendida",
                              reparto,
                              parada,
                              carga: c,
                              titulo: `Devolver ${i?.descripcion}`,
                            })}
                        >
                          Registrar devolución posterior
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-sm">
        Entrega neta: <b>{money(resumen.total)}</b> · Cobrado en reparto:{" "}
        <b>{money(resumen.cobrado)}</b>
        {parada.venta_id && (
          <>
            · Saldo actual:{" "}
            <b>
              {money(
                Number(
                  data.saldos.find((s) => s.venta_id === parada.venta_id)
                    ?.saldo || 0,
                ),
              )}
            </b>
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {reparto.estado === "en_reparto" && (
          <Button
            disabled={trabajando || resumen.saldo <= 0}
            onClick={() =>
              abrir({
                accion: "cobro",
                reparto,
                parada,
                titulo: `Cobrar a ${pedido?.cliente_nombre}`,
              })}
          >
            Registrar cobro
          </Button>
        )}
        {data.admin && parada.venta_id && (
          <>
            <Button variant="outline" asChild>
              <Link to="/ventas">Ver comprobantes</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/cuenta-corriente/${pedido?.cliente_id}`}>
                Cobros y cuenta corriente
              </Link>
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
