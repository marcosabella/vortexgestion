import { FormEvent, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Archive, ArchiveRestore, BellPlus, Building2, CheckCircle2, Circle, Eye, Pencil, ReceiptText, Save, Send, Trash2, X } from "lucide-react";
import { useAdminComercios, useIsAppAdmin } from "@/hooks/useAdminComercios";
import {
  categoriaLabels,
  NotificacionCategoria,
  NotificacionPrioridad,
  prioridadLabels,
  Notificacion,
  useAdminNotificaciones,
} from "@/hooks/useNotificaciones";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function EstadoLectura({
  notificacion,
  comercios,
}: {
  notificacion: Notificacion;
  comercios: { id: string; nombre_comercio: string }[];
}) {
  const destinatarioIds = notificacion.destinatarios?.length
    ? notificacion.destinatarios
    : comercios.map(({ id }) => id);
  const nombres = new Map(comercios.map(({ id, nombre_comercio }) => [id, nombre_comercio]));
  const lecturas = new Map(
    (notificacion.lecturas || [])
      .filter((lectura) => lectura.comercio_id)
      .map((lectura) => [lectura.comercio_id as string, lectura.read_at]),
  );
  const leidas = destinatarioIds.filter((id) => lecturas.has(id)).length;
  const total = destinatarioIds.length;
  const todasLeidas = total > 0 && leidas === total;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-auto gap-2 px-2 py-1">
          <Eye className="h-4 w-4" />
          <Badge variant={todasLeidas ? "default" : "secondary"}>
            {total === 1 ? (leidas === 1 ? "Leida" : "No leida") : `${leidas}/${total} leidas`}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <p className="mb-3 font-medium">Estado por comercio</p>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">No hay comercios destinatarios.</p>
        ) : (
          <div className="max-h-64 space-y-3 overflow-y-auto">
            {destinatarioIds.map((id) => {
              const readAt = lecturas.get(id);
              return (
                <div key={id} className="flex items-start gap-2 text-sm">
                  {readAt
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                  <div>
                    <p className="font-medium">{nombres.get(id) || "Comercio"}</p>
                    <p className="text-xs text-muted-foreground">
                      {readAt ? `Leida el ${formatDate(readAt)}` : "No leida"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default function AdminNotificaciones() {
  const { data: isAdmin, isLoading: isAdminLoading } = useIsAppAdmin();
  const { comerciosQuery } = useAdminComercios();
  const {
    notificacionesQuery,
    crearNotificacion,
    desactivarNotificacion,
    reactivarNotificacion,
    modificarNotificacion,
    eliminarNotificacion,
  } = useAdminNotificaciones();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [categoria, setCategoria] = useState<NotificacionCategoria>("general");
  const [prioridad, setPrioridad] = useState<NotificacionPrioridad>("normal");
  const [destino, setDestino] = useState<"todos" | "seleccionados">("todos");
  const [selectedComercios, setSelectedComercios] = useState<string[]>([]);
  const [comprobanteNumero, setComprobanteNumero] = useState("");
  const [comprobanteFecha, setComprobanteFecha] = useState("");
  const [comprobanteMonto, setComprobanteMonto] = useState("");
  const [comprobantePeriodo, setComprobantePeriodo] = useState("");
  const [activeTab, setActiveTab] = useState("carga");

  const comercios = useMemo(() => comerciosQuery.data || [], [comerciosQuery.data]);
  const comerciosById = useMemo(
    () => new Map(comercios.map((comercio) => [comercio.id, comercio.nombre_comercio])),
    [comercios],
  );

  if (isAdminLoading) {
    return <div className="p-8">Cargando...</div>;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const resetForm = () => {
    setEditingId(null);
    setTitulo("");
    setMensaje("");
    setCategoria("general");
    setPrioridad("normal");
    setDestino("todos");
    setSelectedComercios([]);
    setComprobanteNumero("");
    setComprobanteFecha("");
    setComprobanteMonto("");
    setComprobantePeriodo("");
  };

  const startEditing = (notificacion: Notificacion) => {
    setEditingId(notificacion.id);
    setTitulo(notificacion.titulo);
    setMensaje(notificacion.mensaje);
    setCategoria(notificacion.categoria);
    setPrioridad(notificacion.prioridad);
    setDestino(notificacion.destinatarios?.length ? "seleccionados" : "todos");
    setSelectedComercios(notificacion.destinatarios || []);
    setComprobanteNumero(notificacion.comprobante_numero || "");
    setComprobanteFecha(notificacion.comprobante_fecha || "");
    setComprobanteMonto(notificacion.comprobante_monto?.toString() || "");
    setComprobantePeriodo(notificacion.comprobante_periodo || "");
    setActiveTab("carga");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleComercio = (comercioId: string, checked: boolean) => {
    setSelectedComercios((current) =>
      checked ? [...current, comercioId] : current.filter((id) => id !== comercioId),
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload = {
        titulo,
        mensaje,
        categoria,
        prioridad,
        comercioIds: destino === "todos" ? [] : selectedComercios,
        comprobante_numero: comprobanteNumero,
        comprobante_fecha: comprobanteFecha,
        comprobante_monto: comprobanteMonto ? Number(comprobanteMonto) : null,
        comprobante_periodo: comprobantePeriodo,
      };

    if (editingId) {
      modificarNotificacion.mutate({ id: editingId, ...payload }, { onSuccess: resetForm });
      return;
    }

    crearNotificacion.mutate(payload, { onSuccess: resetForm });
  };

  return (
    <div className="container mx-auto space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold">Centro de notificaciones</h1>
        <p className="text-sm text-muted-foreground">
          Envio de avisos del administrador a comercios del sistema.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:w-[520px]">
          <TabsTrigger value="carga">Carga de notificaciones</TabsTrigger>
          <TabsTrigger value="historial">Historial de notificaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="carga" className="mt-0">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {editingId ? <Pencil className="h-5 w-5" /> : <BellPlus className="h-5 w-5" />}
            {editingId ? "Modificar notificacion" : "Nueva notificacion"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="titulo">Titulo</Label>
                <Input id="titulo" value={titulo} onChange={(event) => setTitulo(event.target.value)} required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={categoria} onValueChange={(value) => setCategoria(value as NotificacionCategoria)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(categoriaLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Prioridad</Label>
                  <Select value={prioridad} onValueChange={(value) => setPrioridad(value as NotificacionPrioridad)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(prioridadLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mensaje">Mensaje</Label>
              <Textarea
                id="mensaje"
                value={mensaje}
                onChange={(event) => setMensaje(event.target.value)}
                required
                rows={5}
              />
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <Label>Destinatarios</Label>
              <RadioGroup value={destino} onValueChange={(value) => setDestino(value as "todos" | "seleccionados")}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="todos" id="destino-todos" />
                  <Label htmlFor="destino-todos">Todos los comercios</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="seleccionados" id="destino-seleccionados" />
                  <Label htmlFor="destino-seleccionados">Comercios seleccionados</Label>
                </div>
              </RadioGroup>

              {destino === "seleccionados" && (
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-3">
                  {comerciosQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Cargando comercios...</p>
                  ) : comercios.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay comercios disponibles.</p>
                  ) : (
                    comercios.map((comercio) => (
                      <div key={comercio.id} className="flex items-center gap-3">
                        <Checkbox
                          id={`comercio-${comercio.id}`}
                          checked={selectedComercios.includes(comercio.id)}
                          onCheckedChange={(checked) => toggleComercio(comercio.id, checked === true)}
                        />
                        <Label htmlFor={`comercio-${comercio.id}`} className="text-sm font-normal">
                          {comercio.nombre_comercio}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {(categoria === "abono" || categoria === "comprobante") && (
              <div className="grid gap-4 rounded-md border p-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="comprobante-numero">Comprobante</Label>
                  <Input id="comprobante-numero" value={comprobanteNumero} onChange={(event) => setComprobanteNumero(event.target.value)} />
                  {categoria === "comprobante" && (
                    <p className="text-xs text-muted-foreground">Ingrese el numero exacto de una venta del comercio destinatario.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comprobante-fecha">Fecha</Label>
                  <Input id="comprobante-fecha" type="date" value={comprobanteFecha} onChange={(event) => setComprobanteFecha(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comprobante-monto">Importe</Label>
                  <Input id="comprobante-monto" type="number" min="0" step="0.01" value={comprobanteMonto} onChange={(event) => setComprobanteMonto(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comprobante-periodo">Periodo</Label>
                  <Input id="comprobante-periodo" value={comprobantePeriodo} onChange={(event) => setComprobantePeriodo(event.target.value)} placeholder="Julio 2026" />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="submit"
                variant="success"
                disabled={
                  crearNotificacion.isPending
                  || modificarNotificacion.isPending
                  || (destino === "seleccionados" && selectedComercios.length === 0)
                }
              >
                {editingId ? <Save className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                {modificarNotificacion.isPending
                  ? "Guardando..."
                  : crearNotificacion.isPending
                    ? "Enviando..."
                    : editingId
                      ? "Guardar cambios"
                      : "Enviar notificacion"}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm} disabled={modificarNotificacion.isPending}>
                  <X className="h-4 w-4" />
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="historial" className="mt-0">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" />
            Historial
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Titulo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Destinatarios</TableHead>
                <TableHead>Lectura</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notificacionesQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Cargando notificaciones...
                  </TableCell>
                </TableRow>
              ) : (notificacionesQuery.data || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No hay notificaciones enviadas.
                  </TableCell>
                </TableRow>
              ) : (
                (notificacionesQuery.data || []).map((notificacion) => (
                  <TableRow key={notificacion.id}>
                    <TableCell>{formatDate(notificacion.created_at)}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {(notificacion.comprobante_numero || notificacion.comprobante_monto) && <ReceiptText className="h-4 w-4" />}
                        {notificacion.titulo}
                      </div>
                    </TableCell>
                    <TableCell>{categoriaLabels[notificacion.categoria]}</TableCell>
                    <TableCell>
                      {notificacion.destinatarios?.length
                        ? notificacion.destinatarios.map((id) => comerciosById.get(id) || "Comercio").join(", ")
                        : "Todos"}
                    </TableCell>
                    <TableCell>
                      <EstadoLectura notificacion={notificacion} comercios={comercios} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={notificacion.activo ? "default" : "secondary"}>
                        {notificacion.activo ? "Activa" : "Archivada"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        title="Modificar notificacion"
                        disabled={modificarNotificacion.isPending || eliminarNotificacion.isPending}
                        onClick={() => startEditing(notificacion)}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Modificar</span>
                      </Button>
                      {notificacion.activo ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={desactivarNotificacion.isPending || reactivarNotificacion.isPending}
                          onClick={() => desactivarNotificacion.mutate(notificacion.id)}
                          title="Archivar notificacion"
                        >
                          <Archive className="h-4 w-4" />
                          <span className="sr-only">Archivar</span>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={reactivarNotificacion.isPending || desactivarNotificacion.isPending}
                          onClick={() => reactivarNotificacion.mutate(notificacion.id)}
                          title="Restaurar notificacion"
                        >
                          <ArchiveRestore className="h-4 w-4" />
                          <span className="sr-only">Restaurar</span>
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            title="Eliminar notificacion"
                            disabled={eliminarNotificacion.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Eliminar</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminar notificacion</AlertDialogTitle>
                            <AlertDialogDescription>
                              Se eliminara definitivamente “{notificacion.titulo}”, incluidas sus lecturas y destinatarios. Esta accion no se puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => eliminarNotificacion.mutate(notificacion.id, {
                                onSuccess: () => editingId === notificacion.id && resetForm(),
                              })}
                            >
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
