import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Building2, CalendarCheck2, KeyRound, Loader2, Pencil, Plus, Search, ShieldCheck, ShieldOff, SlidersHorizontal, Trash2, UserPlus } from "lucide-react";
import { useAdminComercios, useIsAppAdmin, AdminComercio } from "@/hooks/useAdminComercios";
import { ComercioFormData } from "@/types/comercio";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SITUACIONES_AFIP } from "@/types/cliente";
import { useConsultarArca } from "@/hooks/useConsultarArca";
import { useToast } from "@/hooks/use-toast";
import { formatCUIT, validateCUIT } from "@/utils/validations";
import { useComerciosExternos } from '@/hooks/useComerciosExternos';
import { ComercioExternoRow } from '@/components/admin/ComercioExternoRow';
import { LicenciaComercioButton } from "@/components/admin/LicenciaComercioButton";

const emptyComercio: ComercioFormData = {
  nombre_comercio: "",
  calle: "",
  numero: "",
  codigo_postal: "",
  localidad: "",
  provincia: "",
  telefono: "",
  cuit: "",
  situacion_afip: "",
  ingresos_brutos: "",
  fecha_inicio_actividad: "",
  logo_url: "",
  fecha_ingreso_sistema: "",
  membresia_vigente_hasta: "",
};

const accessDateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatLastAccess(value: string | null | undefined) {
  return value ? accessDateFormatter.format(new Date(value)) : "Nunca ingreso";
}

function AdminComercioForm({
  initialData = emptyComercio,
  includeAccess = true,
  onSubmit,
  isLoading,
  submitLabel,
  loadingLabel,
}: {
  initialData?: ComercioFormData;
  includeAccess?: boolean;
  onSubmit: (payload: { comercio: ComercioFormData; userEmail: string; password: string }) => void;
  isLoading: boolean;
  submitLabel: string;
  loadingLabel: string;
}) {
  const [comercio, setComercio] = useState<ComercioFormData>(initialData);
  const [userEmail, setUserEmail] = useState("");
  const [password, setPassword] = useState("");
  const { consultarCuit, isLoading: isLoadingArca } = useConsultarArca({ altaComercio: true });
  const { toast } = useToast();
  const [periodoInicioArca, setPeriodoInicioArca] = useState("");
  const [arcaConsultado, setArcaConsultado] = useState(false);

  useEffect(() => {
    setComercio(initialData);
    setPeriodoInicioArca("");
    setArcaConsultado(false);
  }, [initialData]);

  const updateField = (field: keyof ComercioFormData, value: string) => {
    setComercio((current) => ({ ...current, [field]: value }));
    if (field === "cuit") {
      setArcaConsultado(false);
      setPeriodoInicioArca("");
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoadingArca) return;
    onSubmit({ comercio, userEmail, password });
  };

  const handleConsultarArca = async () => {
    const cuit = comercio.cuit;
    setArcaConsultado(false);
    if (!validateCUIT(cuit)) {
      toast({ title: "CUIT inválido", description: "Ingresá un CUIT válido de 11 dígitos para buscar en ARCA.", variant: "destructive" });
      return;
    }
    const datos = await consultarCuit(cuit);
    if (!datos) return;
    setArcaConsultado(true);
    const periodo = /^\d{4}-(0[1-9]|1[0-2])$/.test(datos.periodoInicioActividad || "") ? datos.periodoInicioActividad! : "";
    setPeriodoInicioArca(periodo);
    setComercio((current) => {
      if (current.cuit !== cuit) return current;
      const domicilio = datos.domicilioFiscal;
      const nombre = datos.razonSocial || [datos.nombre, datos.apellido].filter(Boolean).join(" ");
      return {
        ...current,
        cuit: formatCUIT(datos.cuitEncontrado || cuit),
        nombre_comercio: nombre || current.nombre_comercio,
        situacion_afip: datos.situacionAfip || current.situacion_afip,
        calle: domicilio?.calle || current.calle,
        numero: domicilio?.numero ?? current.numero,
        codigo_postal: domicilio?.codigoPostal || current.codigo_postal,
        localidad: domicilio?.localidad || current.localidad,
        provincia: domicilio?.provincia || current.provincia,
        fecha_inicio_actividad: current.fecha_inicio_actividad || (periodo ? `${periodo}-01` : ""),
      };
    });
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nombre_comercio">Comercio</Label>
          <Input id="nombre_comercio" value={comercio.nombre_comercio} onChange={(event) => updateField("nombre_comercio", event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cuit">CUIT</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="cuit" value={comercio.cuit} onChange={(event) => updateField("cuit", event.target.value)} required minLength={11} maxLength={13} inputMode="numeric" placeholder="20-12345678-9" className="min-w-0 flex-1" disabled={isLoadingArca || isLoading} />
            <Button type="button" variant="secondary" onClick={handleConsultarArca} disabled={isLoadingArca || isLoading} aria-label="Buscar comercio en ARCA por CUIT">
              {isLoadingArca ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {isLoadingArca ? "Consultando..." : "Buscar en ARCA"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Completá el CUIT y buscá en ARCA. Revisá los datos antes de guardar.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="situacion_afip">Condicion frente a ARCA</Label>
          <Select value={comercio.situacion_afip || ""} onValueChange={(value) => updateField("situacion_afip", value)}>
            <SelectTrigger id="situacion_afip">
              <SelectValue placeholder="Seleccionar condicion" />
            </SelectTrigger>
            <SelectContent>
              {SITUACIONES_AFIP.map((situacion) => (
                <SelectItem key={situacion} value={situacion}>
                  {situacion}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="calle">Calle</Label>
          <Input id="calle" value={comercio.calle} onChange={(event) => updateField("calle", event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="numero">Numero</Label>
          <Input id="numero" value={comercio.numero} onChange={(event) => updateField("numero", event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="codigo_postal">Codigo postal</Label>
          <Input id="codigo_postal" value={comercio.codigo_postal} onChange={(event) => updateField("codigo_postal", event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="localidad">Localidad</Label>
          <Input id="localidad" value={comercio.localidad} onChange={(event) => updateField("localidad", event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="provincia">Provincia</Label>
          <Input id="provincia" value={comercio.provincia} onChange={(event) => updateField("provincia", event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="telefono">Telefono</Label>
          <Input id="telefono" value={comercio.telefono} onChange={(event) => updateField("telefono", event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fecha_inicio_actividad">Inicio de actividad</Label>
          <Input id="fecha_inicio_actividad" type="date" value={comercio.fecha_inicio_actividad} onChange={(event) => updateField("fecha_inicio_actividad", event.target.value)} required />
          {periodoInicioArca && <p className="text-xs text-muted-foreground">ARCA informa {periodoInicioArca.slice(5)}/{periodoInicioArca.slice(0, 4)} como el alta más antigua de las actividades consultadas. Si la fecha estaba vacía, se propuso el día 1. Revisá y confirmá la fecha exacta.</p>}
          {arcaConsultado && !periodoInicioArca && <p role="status" className="text-xs text-muted-foreground">La consulta no devolvió el período de inicio de actividad. Completá la fecha manualmente.</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="ingresos_brutos">Ingresos brutos</Label>
          <Input id="ingresos_brutos" value={comercio.ingresos_brutos} onChange={(event) => updateField("ingresos_brutos", event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="logo_url">URL del logo</Label>
          <Input id="logo_url" value={comercio.logo_url} onChange={(event) => updateField("logo_url", event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fecha_ingreso_sistema">Fecha de pago / alta</Label>
          <Input id="fecha_ingreso_sistema" type="date" value={comercio.fecha_ingreso_sistema || ""} onChange={(event) => updateField("fecha_ingreso_sistema", event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="membresia_vigente_hasta">Membresía vigente hasta</Label>
          <Input id="membresia_vigente_hasta" type="date" value={comercio.membresia_vigente_hasta || ""} onChange={(event) => updateField("membresia_vigente_hasta", event.target.value)} />
        </div>
      </div>

      {includeAccess && (
        <div className="grid gap-4 border-t pt-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="userEmail">Email de ingreso</Label>
            <Input id="userEmail" type="email" value={userEmail} onChange={(event) => setUserEmail(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contrasena inicial</Label>
            <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} />
          </div>
        </div>
      )}

      <Button type="submit" variant="success" disabled={isLoading || isLoadingArca}>
        {includeAccess ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        {isLoading ? loadingLabel : submitLabel}
      </Button>
    </form>
  );
}

function comercioToForm(comercio: AdminComercio): ComercioFormData {
  return {
    nombre_comercio: comercio.nombre_comercio || "",
    calle: comercio.calle || "",
    numero: comercio.numero || "",
    codigo_postal: comercio.codigo_postal || "",
    localidad: comercio.localidad || "",
    provincia: comercio.provincia || "",
    telefono: comercio.telefono || "",
    cuit: comercio.cuit || "",
    situacion_afip: comercio.situacion_afip || "",
    ingresos_brutos: comercio.ingresos_brutos || "",
    fecha_inicio_actividad: comercio.fecha_inicio_actividad || "",
    logo_url: comercio.logo_url || "",
    fecha_ingreso_sistema: comercio.fecha_ingreso_sistema || "",
    membresia_vigente_hasta: comercio.membresia_vigente_hasta || "",
  };
}

function ResetPasswordButton({
  comercio,
  resetPassword,
}: {
  comercio: AdminComercio;
  resetPassword: ReturnType<typeof useAdminComercios>["resetPassword"];
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");

  if (!comercio.usuario) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetPassword.mutate(
      { userId: comercio.usuario!.user_id, password },
      {
        onSuccess: () => {
          setPassword("");
          setOpen(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resetear contrasena</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="new-password">Nueva contrasena</Label>
            <Input id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} />
          </div>
          <Button type="submit" variant="success" disabled={resetPassword.isPending}>
            {resetPassword.isPending ? "Guardando..." : "Actualizar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenewMembershipButton({
  comercio,
  renovarMembresia,
}: {
  comercio: AdminComercio;
  renovarMembresia: ReturnType<typeof useAdminComercios>["renovarMembresia"];
}) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [fechaIngresoSistema, setFechaIngresoSistema] = useState(comercio.fecha_ingreso_sistema || today);
  const [membresiaVigenteHasta, setMembresiaVigenteHasta] = useState(comercio.membresia_vigente_hasta || today);
  const [sinVencimiento, setSinVencimiento] = useState(!comercio.membresia_vigente_hasta);

  useEffect(() => {
    setFechaIngresoSistema(comercio.fecha_ingreso_sistema || today);
    setMembresiaVigenteHasta(comercio.membresia_vigente_hasta || today);
    setSinVencimiento(!comercio.membresia_vigente_hasta);
  }, [comercio.fecha_ingreso_sistema, comercio.membresia_vigente_hasta, today]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" title="Registrar membresía">
          <CalendarCheck2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar membresía</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          renovarMembresia.mutate({ comercioId: comercio.id, fechaIngresoSistema, membresiaVigenteHasta: sinVencimiento ? null : membresiaVigenteHasta }, { onSuccess: () => setOpen(false) });
        }}>
          <p className="text-sm text-muted-foreground">Al registrar el pago se habilita el comercio y su usuario hasta la fecha de vencimiento indicada.</p>
          <div className="space-y-2">
            <Label htmlFor={`fecha-ingreso-${comercio.id}`}>Fecha de pago / alta</Label>
            <Input id={`fecha-ingreso-${comercio.id}`} type="date" value={fechaIngresoSistema} onChange={(event) => setFechaIngresoSistema(event.target.value)} required />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div><Label htmlFor={`sin-vencimiento-${comercio.id}`}>Membresía sin vencimiento</Label><p className="text-xs text-muted-foreground">No se bloqueará ni mostrará aviso de vencimiento.</p></div>
            <Switch id={`sin-vencimiento-${comercio.id}`} checked={sinVencimiento} onCheckedChange={setSinVencimiento} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`membresia-hasta-${comercio.id}`}>Membresía vigente hasta</Label>
            <Input id={`membresia-hasta-${comercio.id}`} type="date" min={fechaIngresoSistema} value={sinVencimiento ? "" : membresiaVigenteHasta} onChange={(event) => setMembresiaVigenteHasta(event.target.value)} disabled={sinVencimiento} required={!sinVencimiento} />
          </div>
          <Button type="submit" variant="success" disabled={renovarMembresia.isPending}>
            {renovarMembresia.isPending ? "Guardando..." : "Registrar pago y habilitar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccessUserButton({
  comercio,
  createOrUpdateAccess,
}: {
  comercio: AdminComercio;
  createOrUpdateAccess: ReturnType<typeof useAdminComercios>["createOrUpdateAccess"];
}) {
  const [open, setOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createOrUpdateAccess.mutate(
      { comercioId: comercio.id, userEmail, password },
      {
        onSuccess: () => {
          setUserEmail("");
          setPassword("");
          setOpen(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar acceso</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor={`access-email-${comercio.id}`}>Email de ingreso</Label>
            <Input
              id={`access-email-${comercio.id}`}
              type="email"
              value={userEmail}
              onChange={(event) => setUserEmail(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`access-password-${comercio.id}`}>Contrasena</Label>
            <Input
              id={`access-password-${comercio.id}`}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
          </div>
          <Button type="submit" variant="success" disabled={createOrUpdateAccess.isPending}>
            {createOrUpdateAccess.isPending ? "Guardando..." : "Guardar acceso"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteComercioButton({
  comercio,
  deleteComercio,
}: {
  comercio: AdminComercio;
  deleteComercio: ReturnType<typeof useAdminComercios>["deleteComercio"];
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" disabled={deleteComercio.isPending}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar comercio</AlertDialogTitle>
          <AlertDialogDescription>
            Se eliminara {comercio.nombre_comercio} de la lista, Supabase y sus datos asociados. Esta accion no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => deleteComercio.mutate(comercio.id)}
          >
            {deleteComercio.isPending ? "Eliminando..." : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function AdminComercios() {
  const { data: isAdmin, isLoading: isAdminLoading } = useIsAppAdmin();
  const { comerciosQuery, createComercio, deleteComercio, setAccess, renovarMembresia, createOrUpdateAccess, resetPassword } = useAdminComercios();
  const externos = useComerciosExternos(isAdmin === true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [estadoFiltro, setEstadoFiltro] = useState<"habilitados_externos" | "todos" | "habilitados" | "deshabilitados" | "externos">("habilitados_externos");

  if (isAdminLoading) {
    return <div className="p-8">Cargando...</div>;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const comercios = comerciosQuery.data || [];
  const registrosExternos = ["habilitados_externos", "todos", "externos"].includes(estadoFiltro) ? externos.query.data?.externos || [] : [];
  const importes = new Map(externos.query.data?.licencias.map(l => [l.destinatario_comercio_id, Number(l.importe_mensual)]));
  const today = new Date().toISOString().slice(0, 10);
  const comerciosFiltrados = comercios.filter((comercio) => {
    const habilitado = Boolean(comercio.activo && comercio.usuario?.activo && !comercio.membresia_vencida && (!comercio.membresia_vigente_hasta || comercio.membresia_vigente_hasta >= today));
    return estadoFiltro === "externos" ? false : estadoFiltro === "todos" || (["habilitados", "habilitados_externos"].includes(estadoFiltro) ? habilitado : !habilitado);
  });
  const membresiasVisibles = [
    ...comerciosFiltrados.map((comercio) => importes.get(comercio.id) ?? 0),
    ...registrosExternos.map((externo) => Number(externo.importe_mensual)),
  ].filter((importe) => Number.isFinite(importe) && importe > 0);
  const totalMembresiaMensual = membresiasVisibles.reduce((total, importe) => total + Math.round(importe * 100), 0) / 100;
  const cargandoTotales = comerciosQuery.isLoading || externos.query.isLoading;
  const errorTotales = comerciosQuery.isError || externos.query.isError;

  return (
    <div className="mx-auto w-full min-w-0 max-w-full space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Administrador</h1>
          <p className="text-sm text-muted-foreground">Comercios, sistemas externos, membresías y facturación centralizada.</p>
        </div>
        <div className="flex flex-wrap gap-2"><Button asChild variant="new"><Link to="/admin/comercios/externos/nuevo"><Plus className="h-4 w-4" />Comercio externo</Link></Button><Button onClick={() => setShowCreateForm(true)} variant="new">
          <Plus className="h-4 w-4" />
          Nuevo comercio
        </Button></div>
      </div>

      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Alta de comercio</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminComercioForm
              isLoading={createComercio.isPending}
              submitLabel="Crear comercio"
              loadingLabel="Creando..."
              onSubmit={(payload) =>
                createComercio.mutate(payload, {
                  onSuccess: () => setShowCreateForm(false),
                })
              }
            />
          </CardContent>
        </Card>
      )}

      {externos.query.error && <p role="alert" className="text-sm text-destructive">{externos.query.error.message}</p>}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="flex items-center gap-2 text-lg"><Building2 className="h-5 w-5" />Comercios</CardTitle>
          <Select value={estadoFiltro} onValueChange={(value) => setEstadoFiltro(value as typeof estadoFiltro)}>
            <SelectTrigger className="w-[230px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="habilitados_externos">Habilitados y externos</SelectItem>
              <SelectItem value="todos">Todos los comercios</SelectItem><SelectItem value="externos">Sistemas externos</SelectItem>
              <SelectItem value="habilitados">Habilitados</SelectItem>
              <SelectItem value="deshabilitados">Deshabilitados</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <Table className="[&_th]:whitespace-nowrap [&_th]:px-2 [&_td]:whitespace-nowrap [&_td]:px-2 [&_th:nth-child(2)]:w-full [&_tbody_td:nth-child(2)]:min-w-56 [&_tbody_td:nth-child(2)]:whitespace-normal [&_tbody_td:nth-child(2)]:[overflow-wrap:anywhere] [&_td:last-child_button:not([role=switch])]:h-8 [&_td:last-child_button:not([role=switch])]:w-8 [&_td:last-child_button:not([role=switch])]:p-0 [&_td:last-child_a]:h-8 [&_td:last-child_a]:w-8 [&_td:last-child_a]:p-0">
            <TableHeader>
              <TableRow>
                <TableHead>N.º</TableHead>
                <TableHead>Comercio</TableHead>
                <TableHead>Ultimo acceso</TableHead>
                <TableHead>Pago / alta</TableHead>
                <TableHead className="w-px">Membresía hasta</TableHead>
                <TableHead className="text-right">Membresía mensual</TableHead><TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comerciosQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Cargando comercios...
                  </TableCell>
                </TableRow>
              ) : comerciosFiltrados.length === 0 && registrosExternos.length === 0 && !externos.query.isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    {comercios.length ? "No hay comercios para el filtro seleccionado." : "No hay comercios cargados."}
                  </TableCell>
                </TableRow>
              ) : (
                comerciosFiltrados.map((comercio, index) => {
                  const membershipExpired = Boolean(comercio.membresia_vencida || (comercio.membresia_vigente_hasta && comercio.membresia_vigente_hasta < today));
                  const enabled = Boolean(comercio.activo && comercio.usuario?.activo && !membershipExpired);

                  return (
                    <TableRow key={comercio.id}>
                      <TableCell className="tabular-nums">{index + 1}</TableCell>
                      <TableCell className="font-medium">{comercio.nombre_comercio}</TableCell>
                      <TableCell>{formatLastAccess(comercio.usuario?.last_sign_in_at)}</TableCell>
                      <TableCell>{comercio.fecha_ingreso_sistema ? new Date(`${comercio.fecha_ingreso_sistema}T00:00:00`).toLocaleDateString("es-AR") : "-"}</TableCell>
                      <TableCell>{comercio.membresia_vigente_hasta ? new Date(`${comercio.membresia_vigente_hasta}T00:00:00`).toLocaleDateString("es-AR") : null}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{importes.has(comercio.id) ? importes.get(comercio.id)!.toLocaleString("es-AR", { style: "currency", currency: "ARS" }) : null}</TableCell>
                      <TableCell>
                        <Badge variant={enabled ? "default" : "secondary"} className="gap-1">
                          {enabled ? <ShieldCheck className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
                          {enabled ? "Habilitado" : membershipExpired ? "Membresía vencida" : "Deshabilitado"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-nowrap items-center justify-end gap-1 [&>*]:shrink-0">
                          {comercio.usuario ? (
                            <ResetPasswordButton comercio={comercio} resetPassword={resetPassword} />
                          ) : (
                            <AccessUserButton comercio={comercio} createOrUpdateAccess={createOrUpdateAccess} />
                          )}
                          <Button asChild variant="outline" size="sm"><Link to={`/admin/comercios/${comercio.id}/editar`} title="Editar comercio" aria-label={`Editar ${comercio.nombre_comercio}`}><Pencil className="h-4 w-4" /></Link></Button>
                          <RenewMembershipButton comercio={comercio} renovarMembresia={renovarMembresia} />
                          <LicenciaComercioButton comercio={comercio} />
                          <Button asChild variant="outline" size="sm">
                            <Link to={`/admin/comercios/${comercio.id}/parametrizacion`}>
                              <SlidersHorizontal className="h-4 w-4" />
                            </Link>
                          </Button>
                          <DeleteComercioButton comercio={comercio} deleteComercio={deleteComercio} />
                          <Switch
                            checked={enabled}
                            disabled={setAccess.isPending || !comercio.usuario}
                            className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-red-600 disabled:opacity-100"
                            onCheckedChange={(checked) => setAccess.mutate({ comercioId: comercio.id, enabled: checked })}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
              {registrosExternos.map((externo, index) => <ComercioExternoRow key={externo.id} externo={externo} numero={comerciosFiltrados.length + index + 1} emisorId={externos.comercio?.id} eliminar={externos.eliminar} />)}
            </TableBody>
            <TableFooter aria-live="polite">
              {cargandoTotales ? <TableRow><TableCell colSpan={8}>Cargando totales de membresías...</TableCell></TableRow>
                : errorTotales ? <TableRow><TableCell colSpan={8} role="alert" className="text-destructive">No se pudieron cargar los totales de membresías.</TableCell></TableRow>
                : <TableRow>
                  <TableCell colSpan={5} className="!whitespace-normal">Total de comercios con membresía: <span className="tabular-nums">{membresiasVisibles.length}</span></TableCell>
                  <TableCell className="text-right font-semibold tabular-nums" aria-label="Total de membresía mensual">{totalMembresiaMensual.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>}
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminComercioEditar() {
  const { data: isAdmin, isLoading } = useIsAppAdmin();
  const { comerciosQuery, updateComercio } = useAdminComercios();
  const { comercioId } = useParams();
  const navigate = useNavigate();
  if (isLoading) return <p className="p-6">Cargando...</p>;
  if (!isAdmin) return <Navigate to="/" replace />;
  const comercio = comerciosQuery.data?.find(c => c.id === comercioId);
  return <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
    <header className="flex items-center justify-between gap-3"><h1 className="text-2xl font-bold">Editar comercio</h1><Button asChild variant="outline"><Link to="/admin">Volver</Link></Button></header>
    {comerciosQuery.isLoading ? <p>Cargando comercio...</p> : comerciosQuery.error ? <p role="alert">No se pudo cargar el comercio.</p> : !comercio ? <p role="alert">Comercio no disponible.</p> : <Card><CardContent className="space-y-5 pt-6">
      <div className="space-y-2"><Label htmlFor="comercio-usuario">Usuario de ingreso</Label><Input id="comercio-usuario" value={comercio.usuario?.email || 'Sin usuario configurado'} readOnly /></div>
      <AdminComercioForm initialData={comercioToForm(comercio)} includeAccess={false} isLoading={updateComercio.isPending} submitLabel="Guardar cambios" loadingLabel="Guardando..." onSubmit={({ comercio: formData }) => updateComercio.mutate({ comercioId: comercio.id, comercio: formData }, { onSuccess: () => navigate('/admin') })} />
      <Button asChild variant="cancel"><Link to="/admin">Cancelar</Link></Button>
    </CardContent></Card>}
  </div>;
}
