import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeftRight, CalendarDays, Download, Eye, Hexagon, MapPin, Pencil, Plus, Printer, RefreshCw } from "lucide-react";
import QRCode from "qrcode";
import { useAuth } from "@/contexts/AuthContext";
import { useComercio } from "@/hooks/useComercio";
import { useApicolaAcceso, useApicolaCatalogos, useApicolaInforme, useApicolaLinaje, useApicolaListado, useApicolaOperar } from "@/hooks/useApicola";
import { activaColmena, recursosApicolas, vistasApicolas, type ApicolaCatalogos, type ApicolaColmena, type ApicolaEntidad, type ApicolaFila, type ApicolaFiltro } from "@/types/apicola";
import { ApicolaFormulario } from "@/components/apicola/ApicolaFormulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTablePagination } from "@/hooks/useTablePagination";
import { TablePaginationControls } from "@/components/TablePaginationControls";
import { informeApicolaPdf } from "@/utils/apicolaPdf";
import { apicolaAccionesRapidas, apicolaGruposDisponibles } from "@/config/apicolaNavigation";

const vacio: ApicolaCatalogos = { campanas: [], apiarios: [], colmenas: [], existencias: [] };
const filtroVacio: ApicolaFiltro = { campana: "", apiario: "", desde: "", hasta: "" };
const texto = (value: unknown) => value == null || value === "" ? "—" : Array.isArray(value) ? value.map(texto).join(", ") : String(value).replace(/_/g, " ");
const fecha = (value: unknown) => typeof value === "string" && value ? format(new Date(value.length === 10 ? `${value}T12:00:00` : value), value.length === 10 ? "dd/MM/yyyy" : "dd/MM/yyyy HH:mm") : "—";
const selectClass = "h-11 min-w-0 rounded-md border border-input bg-background px-3 text-sm";
const nombres: Record<ApicolaEntidad, string> = { campana: "campaña", apiario: "apiario", colmena: "colmena", visita: "visita", alimentacion: "alimentación", sanidad: "registro sanitario", movimiento: "movimiento", tarea: "tarea" };
const entidades: Record<string, ApicolaEntidad> = { campanas: "campana", apiarios: "apiario", colmenas: "colmena", visitas: "visita", alimentacion: "alimentacion", sanidad: "sanidad", movimientos: "movimiento", agenda: "tarea" };

function Estado({ value }: { value: unknown }) { return <Badge variant={["anulado", "cerrada", "baja", "muerta", "cancelada"].includes(String(value)) ? "secondary" : value === "pendiente" ? "outline" : "default"}>{texto(value)}</Badge>; }
function ErrorCarga({ retry }: { retry: () => void }) { return <div role="alert" className="space-y-3 rounded-md border border-destructive/50 p-5"><p>No se pudo cargar esta información de Apicultura.</p><Button variant="outline" onClick={retry}><RefreshCw className="mr-2 h-4 w-4" />Reintentar</Button></div>; }
function InfoRegistro({ fila, catalogos }: { fila: ApicolaFila; catalogos: ApicolaCatalogos }) {
  const datos = fila.datos && typeof fila.datos === "object" ? fila.datos as Record<string, unknown> : {};
  return <div className="space-y-4 text-sm">
    <p><strong>{catalogos.apiarios.find(a => a.id === fila.apiario_id)?.nombre}</strong> · {fecha(fila.fecha)} · <Estado value={fila.estado} /></p>
    <p>Responsable: {texto(fila.responsable)}</p>
    {fila.cantidad !== undefined && <p>Alcance: {texto(fila.alcance)} · <strong>{texto(fila.cantidad)} de {texto(fila.existencias_al_registrar)}</strong> colonias registradas al cargar el trabajo.</p>}
    {Array.isArray(fila.colmena_ids) && fila.colmena_ids.length > 0 && <p>Colmenas: {fila.colmena_ids.map(id => catalogos.colmenas.find(c => c.id === id)?.codigo || "Colmena").join(", ")}</p>}
    <dl className="grid gap-3 sm:grid-cols-2">{Object.entries(datos).filter(([, value]) => value !== "" && value != null && (!Array.isArray(value) || value.length)).map(([key, value]) => <div key={key} className="min-w-0 rounded-md bg-muted/50 p-3"><dt className="font-medium capitalize">{key.replace(/_/g, " ")}</dt><dd className="whitespace-pre-line break-words text-muted-foreground">{texto(value)}</dd></div>)}</dl>
    <p className="whitespace-pre-line">{texto(fila.observaciones)}</p>
    {fila.proxima_fecha && <p>Próxima acción: {fecha(fila.proxima_fecha)} · {texto(fila.proxima_accion)}</p>}
    {fila.motivo_anulacion && <p className="rounded-md bg-muted p-3">Anulación: {texto(fila.motivo_anulacion)}</p>}
    <p className="text-xs text-muted-foreground">Registrado: {fecha(fila.created_at)} · Última modificación: {fecha(fila.updated_at)} · Versión {fila.version}</p>
  </div>;
}

function FichaColmena({ colmena, catalogos, comercioId }: { colmena: ApicolaColmena; catalogos: ApicolaCatalogos; comercioId: string }) {
  const [pagina, setPagina] = useState(0), [qr, setQr] = useState("");
  const historial = useApicolaListado(comercioId, "apicola_registros", filtroVacio, pagina, true, undefined, colmena.id);
  const movimientos = useApicolaListado(comercioId, "apicola_movimientos", filtroVacio, pagina, true, undefined, colmena.id);
  const linaje = useApicolaLinaje(comercioId, colmena.id);
  useEffect(() => { let actual = true; void QRCode.toDataURL(`${window.location.origin}/apicola/colmenas?colmena=${encodeURIComponent(colmena.id)}`, { width: 150, margin: 1 }).then(value => { if (actual) setQr(value); }).catch(() => {}); return () => { actual = false; }; }, [colmena.id]);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2 text-sm"><p>{catalogos.apiarios.find(a => a.id === colmena.apiario_id)?.nombre} · <Estado value={colmena.estado} /></p><p>Origen: {texto(colmena.origen)} · Fecha: {fecha(colmena.fecha_alta)}</p><p>Material actual: {texto(colmena.material_codigo)}</p><p>Reina: {texto(colmena.reina_identificacion)} · {texto(colmena.reina_origen)} · {texto(colmena.reina_anio)} · {texto(colmena.reina_marca)}</p></div>{qr && <img src={qr} alt={`QR de la colmena ${colmena.codigo}`} width={120} height={120} />}</div>
    {linaje.isError ? <ErrorCarga retry={() => void linaje.refetch()} /> : <div className="rounded-md border p-3 text-sm"><p className="mb-2 font-medium">Divisiones y fusiones vinculadas</p>{linaje.data?.length ? linaje.data.map(item => <p key={`${item.origen_colmena_id}:${item.destino_colmena_id}`}>{catalogos.colmenas.find(c => c.id === item.origen_colmena_id)?.codigo} → {catalogos.colmenas.find(c => c.id === item.destino_colmena_id)?.codigo}</p>) : <p className="text-muted-foreground">Sin vínculos registrados.</p>}</div>}
    <h3 className="font-semibold">Historial individual</h3>
    {historial.isLoading || movimientos.isLoading ? <p role="status">Cargando historial...</p> : historial.isError || movimientos.isError ? <ErrorCarga retry={() => { void historial.refetch(); void movimientos.refetch(); }} /> : <>
      {historial.data?.items.map(row => <div key={row.id} className="rounded-md border p-3 text-sm"><p>{fecha(row.fecha)} · {texto(row.tipo)} · <Estado value={row.estado} /></p><p className="mt-2 whitespace-pre-line">{texto(row.observaciones)}</p></div>)}
      {movimientos.data?.items.map(row => <div key={row.id} className="rounded-md border p-3 text-sm"><p>{fecha(row.fecha)} · {texto(row.tipo)}</p><p>{texto(row.motivo)}</p></div>)}
      {!historial.data?.total && !movimientos.data?.total && <p className="text-sm text-muted-foreground">Sin trabajos individuales. Las visitas por grupo se consultan desde el apiario.</p>}
      <div className="flex items-center justify-between gap-3"><Button variant="outline" disabled={!pagina} onClick={() => setPagina(p => p - 1)}>Anterior</Button><span className="text-sm">Página {pagina + 1}</span><Button variant="outline" disabled={(pagina + 1) * 30 >= Math.max(historial.data?.total || 0, movimientos.data?.total || 0)} onClick={() => setPagina(p => p + 1)}>Siguiente</Button></div>
    </>}
  </div>;
}

export default function Apicola() {
  const { vista = "resumen" } = useParams(); const navigate = useNavigate();
  const { comercio } = useComercio(); const { user } = useAuth();
  const acceso = useApicolaAcceso(comercio?.id);
  const catalogo = useApicolaCatalogos(comercio?.id, acceso.data?.lectura);
  const catalogos = catalogo.data || vacio;
  const [filtro, setFiltro] = useState<ApicolaFiltro>(filtroVacio), [pagina, setPagina] = useState(0), [busqueda, setBusqueda] = useState("");
  const [editor, setEditor] = useState<{ entidad: ApicolaEntidad; fila?: ApicolaFila } | null>(null), [detalle, setDetalle] = useState<ApicolaFila | null>(null), [colmena, setColmena] = useState<ApicolaColmena | null>(null);
  const [anular, setAnular] = useState<ApicolaFila | null>(null), [motivo, setMotivo] = useState("");
  const [pdfModo, setPdfModo] = useState<"imprimir" | "descargar" | null>(null), [pdfError, setPdfError] = useState<string | null>(null);
  useEffect(() => { setEditor(null); setDetalle(null); setColmena(null); setAnular(null); setFiltro(filtroVacio); setPagina(0); }, [comercio?.id]);
  useEffect(() => { setPagina(0); }, [vista, filtro]);
  useEffect(() => { const id = new URLSearchParams(window.location.search).get("colmena"); if (vista === "colmenas" && id && catalogo.data) setColmena(catalogo.data.colmenas.find(c => c.id === id) || null); }, [vista, catalogo.data]);
  const esRegistro = ["visitas", "alimentacion", "sanidad"].includes(vista);
  const tipo = vista === "visitas" ? "visita" : vista;
  const tabla = vista === "movimientos" ? "apicola_movimientos" : vista === "agenda" ? "apicola_tareas" : "apicola_registros";
  const listado = useApicolaListado(comercio?.id, tabla, filtro, pagina, Boolean(acceso.data?.lectura && (esRegistro || vista === "movimientos" || vista === "agenda")), esRegistro ? tipo : undefined);
  const informe = useApicolaInforme(comercio?.id, filtro, Boolean(acceso.data?.lectura && ["resumen", "informes"].includes(vista)));
  const operar = useApicolaOperar(comercio?.id);
  const entidad = entidades[vista], esAdmin = acceso.data?.admin === true, puedeOperar = acceso.data?.operar === true;
  const apiarioNombre = (id: unknown) => catalogos.apiarios.find(a => a.id === id)?.nombre || "—";
  const activos = catalogos.colmenas.filter(activaColmena);
  const colonias = catalogos.existencias.filter(e => e.recurso === "colonias" && (!filtro.apiario || e.apiario_id === filtro.apiario)).reduce((sum, e) => sum + e.cantidad, 0);
  const filtroCatalogo = (row: ApicolaFila) => (!busqueda || [row.nombre, row.codigo, row.localidad].some(value => String(value || "").toLocaleLowerCase("es").includes(busqueda.toLocaleLowerCase("es")))) && (vista !== "colmenas" || !filtro.apiario || row.apiario_id === filtro.apiario);
  const filasCatalogo: ApicolaFila[] = vista === "campanas" ? catalogos.campanas.filter(filtroCatalogo) : vista === "apiarios" ? catalogos.apiarios.filter(filtroCatalogo) : catalogos.colmenas.filter(filtroCatalogo);
  const paginado = useTablePagination(filasCatalogo, "apicola-catalogo-registros", `${vista}:${busqueda}:${filtro.apiario}`);
  const puedeCrear = entidad && puedeOperar && (esAdmin || ["visita", "alimentacion", "sanidad", "tarea"].includes(entidad));
  const faltanCatalogos = entidad && !["campana", "apiario"].includes(entidad) && (!catalogos.apiarios.some(a => a.activo) || (entidad !== "colmena" && !catalogos.campanas.some(c => c.estado === "abierta")));
  const cambiarFiltro = (key: keyof ApicolaFiltro, value: string) => setFiltro(current => ({ ...current, [key]: value }));
  const editar = (fila: ApicolaFila) => setEditor({ entidad: entidad!, fila });
  const ejecutar = (accion: string, datos: Record<string, unknown>, done?: () => void) => operar.mutate({ accion, datos, clave: crypto.randomUUID() }, { onSuccess: done });
  const manejarPdf = async (modo: "imprimir" | "descargar") => {
    if (!informe.data || !comercio || pdfModo) return;
    // Abrir durante el clic evita el bloqueo de ventanas al esperar la carga del logo.
    const ventana = modo === "imprimir" ? window.open("", "_blank") : null;
    if (modo === "imprimir" && !ventana) { setPdfError("No se pudo abrir el PDF. Habilitá las ventanas emergentes e intentá nuevamente."); return; }
    if (ventana) ventana.opener = null;
    setPdfModo(modo); setPdfError(null); let url: string | undefined;
    try {
      const file = await informeApicolaPdf(informe.data, catalogos, filtro, comercio);
      if (ventana?.closed) throw new Error("La ventana de impresión se cerró antes de terminar.");
      url = URL.createObjectURL(file);
      if (ventana) { ventana.location.replace(url); window.setTimeout(() => URL.revokeObjectURL(url!), 60_000); }
      else { const link = document.createElement("a"); link.href = url; link.download = file.name; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url!), 1_000); }
    } catch (error) {
      if (url) URL.revokeObjectURL(url);
      if (ventana && !ventana.closed) ventana.close();
      setPdfError(error instanceof Error ? error.message : "No se pudo generar el informe PDF.");
    } finally { setPdfModo(null); }
  };

  if (acceso.isPending || catalogo.isLoading) return <p role="status" className="p-6">Cargando Apicultura...</p>;
  if (acceso.isError || catalogo.isError) return <div className="p-6"><ErrorCarga retry={() => { void acceso.refetch(); void catalogo.refetch(); }} /></div>;
  if (!acceso.data?.lectura || !comercio) return <p className="p-6">Apicultura no está disponible para tu usuario en este comercio.</p>;

  return <div className="mx-auto max-w-7xl space-y-5 p-3 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><Hexagon className="h-7 w-7 text-amber-600" />Vortex Apícola</h1><p className="text-sm text-muted-foreground">{comercio.nombre_comercio} · Cuaderno apícola</p></div>{puedeCrear && <Button className="min-h-11" disabled={Boolean(faltanCatalogos)} title={faltanCatalogos ? "Primero creá una campaña abierta y un apiario activo" : undefined} onClick={() => setEditor({ entidad })}><Plus className="mr-2 h-4 w-4" />{entidad === "campana" ? "Nueva campaña" : entidad === "apiario" ? "Nuevo apiario" : `Registrar ${nombres[entidad]}`}</Button>}</header>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs text-muted-foreground">{apicolaGruposDisponibles.find(grupo => grupo.vistas.some(item => item === vista))?.titulo}</p><h2 className="text-lg font-semibold">{vistasApicolas.find(item => item.vista === vista)?.titulo || "Apicultura"}</h2></div>
      <div className="w-full space-y-1 sm:w-auto"><Label htmlFor="apicola-seccion">Ir a una sección</Label><select id="apicola-seccion" aria-label="Secciones de Apicultura" className={`${selectClass} w-full sm:w-72`} value={vista} onChange={event => navigate(`/apicola/${event.target.value}`)}>
        {apicolaGruposDisponibles.map(grupo => grupo.opciones.length > 1 ? <optgroup key={grupo.key} label={grupo.titulo}>{grupo.opciones.map(item => <option key={item.vista} value={item.vista}>{item.titulo}</option>)}</optgroup> : grupo.opciones.map(item => <option key={item.vista} value={item.vista}>{item.titulo}</option>))}
      </select></div>
    </div>
    {vista === "resumen" && puedeOperar && <Card><CardContent className="space-y-3 p-4"><h3 className="text-sm font-medium">Accesos rápidos</h3><div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {apicolaAccionesRapidas.filter(accion => !accion.soloAdmin || esAdmin).map(accion => <Button key={accion.entidad} variant="outline" className="min-h-11 whitespace-normal" disabled={!catalogos.apiarios.some(a => a.activo) || !catalogos.campanas.some(c => c.estado === "abierta")} onClick={() => { navigate(`/apicola/${accion.vista}`); setEditor({ entidad: accion.entidad }); }}><Plus className="mr-2 h-4 w-4 shrink-0" />{accion.titulo}</Button>)}
    </div>{(!catalogos.apiarios.some(a => a.activo) || !catalogos.campanas.some(c => c.estado === "abierta")) && <p className="text-xs text-muted-foreground">Creá una campaña abierta y un apiario activo para registrar trabajos.</p>}</CardContent></Card>}
    <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1"><Label htmlFor="apicola-filtro-campana">Campaña</Label><select id="apicola-filtro-campana" className={`${selectClass} w-full`} value={filtro.campana} onChange={e => cambiarFiltro("campana", e.target.value)}><option value="">Todas las campañas</option>{catalogos.campanas.map(c => <option value={c.id} key={c.id}>{c.nombre}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="apicola-filtro-apiario">Apiario</Label><select id="apicola-filtro-apiario" className={`${selectClass} w-full`} value={filtro.apiario} onChange={e => cambiarFiltro("apiario", e.target.value)}><option value="">Todos los apiarios</option>{catalogos.apiarios.map(a => <option value={a.id} key={a.id}>{a.codigo} · {a.nombre}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="apicola-filtro-desde">Desde</Label><Input id="apicola-filtro-desde" type="date" className="h-11" value={filtro.desde} onChange={e => cambiarFiltro("desde", e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="apicola-filtro-hasta">Hasta</Label><Input id="apicola-filtro-hasta" type="date" className="h-11" value={filtro.hasta} min={filtro.desde || undefined} onChange={e => cambiarFiltro("hasta", e.target.value)} /></div>
    </CardContent></Card>
    {!catalogos.campanas.length || !catalogos.apiarios.length ? <Card className="border-amber-300"><CardContent className="space-y-3 p-5"><h2 className="font-semibold">Empezá tu cuaderno apícola</h2><p className="text-sm text-muted-foreground">Creá una campaña y un apiario. Después registrá las existencias iniciales; podés trabajar por cantidades e identificar colmenas más adelante.</p><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/apicola/campanas">1 · Campaña</Link></Button><Button asChild variant="outline"><Link to="/apicola/apiarios">2 · Apiario</Link></Button><Button asChild variant="outline"><Link to="/apicola/movimientos">3 · Alta de existencias</Link></Button></div></CardContent></Card> : null}
    {["resumen", "informes"].includes(vista) && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Apiarios activos", catalogos.apiarios.filter(a => a.activo && (!filtro.apiario || a.id === filtro.apiario)).length], ["Colonias actuales", colonias], ["Identificadas activas", activos.filter(c => !filtro.apiario || c.apiario_id === filtro.apiario).length], ["Sin identificar", colonias - activos.filter(c => !filtro.apiario || c.apiario_id === filtro.apiario).length]].map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>)}</div>
      {informe.isLoading ? <p role="status">Cargando informe...</p> : informe.isError ? <ErrorCarga retry={() => void informe.refetch()} /> : informe.data && <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Actividad del período</CardTitle><div className="flex flex-wrap gap-2"><Button variant="print" disabled={Boolean(pdfModo)} onClick={() => void manejarPdf("imprimir")}><Printer className="mr-2 h-4 w-4" />{pdfModo === "imprimir" ? "Preparando..." : "Imprimir"}</Button><Button variant="outline" disabled={Boolean(pdfModo)} onClick={() => void manejarPdf("descargar")}><Download className="mr-2 h-4 w-4" />{pdfModo === "descargar" ? "Generando..." : "Descargar PDF"}</Button></div></div></CardHeader><CardContent className="space-y-4">{pdfError && <p role="alert" className="text-sm text-destructive">{pdfError}</p>}<div className="grid gap-3 sm:grid-cols-3"><p>Visitas confirmadas: <strong>{informe.data.visitas}</strong></p><p>Revisiones acumuladas: <strong>{informe.data.revisiones}</strong></p><p>Sanidad confirmada: <strong>{informe.data.sanitarios}</strong></p><p>Pendientes de confirmar: <strong>{informe.data.registros_pendientes}</strong></p><p>Tareas pendientes: <strong>{informe.data.tareas_pendientes}</strong></p><p className={informe.data.tareas_vencidas ? "text-destructive" : ""}>Tareas vencidas: <strong>{informe.data.tareas_vencidas}</strong></p></div><p className="text-xs text-muted-foreground">Las revisiones acumuladas pueden incluir varias visitas a una misma colonia. Las existencias son actuales, de todas las campañas.</p><h3 className="font-medium">Alimentación confirmada</h3>{informe.data.alimentacion.length ? informe.data.alimentacion.map(item => <p className="text-sm" key={item.unidad}>{Number(item.cantidad).toLocaleString("es-AR")} {item.unidad}</p>) : <p className="text-sm text-muted-foreground">Sin alimentación confirmada en el período.</p>}</CardContent></Card>}
    </>}
    {["campanas", "apiarios", "colmenas"].includes(vista) && <Card><CardHeader><CardTitle>{vistasApicolas.find(v => v.vista === vista)?.titulo}</CardTitle></CardHeader><CardContent className="space-y-4"><Input placeholder="Buscar por nombre o código..." aria-label="Buscar en Apicultura" value={busqueda} onChange={e => setBusqueda(e.target.value)} className="max-w-sm" />
      <Table><TableHeader><TableRow><TableHead>{vista === "campanas" ? "Campaña" : "Código"}</TableHead><TableHead>{vista === "campanas" ? "Período" : vista === "apiarios" ? "Apiario / ubicación" : "Apiario / material"}</TableHead><TableHead>Estado / existencias</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{paginado.items.map(row => <TableRow key={row.id}>
        <TableCell className="font-medium">{texto(row.codigo || row.nombre)}</TableCell><TableCell>{vista === "campanas" ? `${fecha(row.fecha_inicio)} al ${fecha(row.fecha_fin)}` : vista === "apiarios" ? <><p>{texto(row.nombre)}</p><p className="text-xs text-muted-foreground">{texto(row.localidad)}</p></> : <><p>{apiarioNombre(row.apiario_id)}</p><p className="text-xs text-muted-foreground">Material: {texto(row.material_codigo)}</p></>}</TableCell>
        <TableCell>{vista === "apiarios" ? <><Estado value={row.activo ? "activo" : "inactivo"} /><p className="mt-1 text-xs">{catalogos.existencias.find(e => e.apiario_id === row.id && e.recurso === "colonias")?.cantidad || 0} colonias</p></> : <Estado value={row.estado} />}</TableCell>
        <TableCell><div className="flex flex-wrap gap-2">{esAdmin && <Button variant="outline" size="icon" aria-label={`Editar ${texto(row.codigo || row.nombre)}`} onClick={() => editar(row)}><Pencil className="h-4 w-4" /></Button>}
          {vista === "apiarios" && <><Button variant="outline" size="sm" onClick={() => { cambiarFiltro("apiario", row.id); navigate("/apicola/visitas"); }}>Historial</Button>{row.latitud != null && row.longitud != null && <Button asChild variant="outline" size="icon"><a aria-label={`Mapa de ${texto(row.nombre)}`} href={`https://www.google.com/maps/search/?api=1&query=${row.latitud},${row.longitud}`} target="_blank" rel="noopener noreferrer"><MapPin className="h-4 w-4" /></a></Button>}</>}
          {vista === "colmenas" && <Button variant="outline" size="sm" onClick={() => setColmena(row as ApicolaColmena)}><Eye className="mr-2 h-4 w-4" />Ficha</Button>}</div></TableCell>
      </TableRow>)}{!filasCatalogo.length && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Sin registros para esta búsqueda.</TableCell></TableRow>}</TableBody></Table><TablePaginationControls id="apicola-catalogos" label="registros" pagination={paginado} />
    </CardContent></Card>}
    {(vista === "movimientos" || vista === "informes") && <Card><CardHeader><CardTitle className="flex items-center gap-2"><ArrowLeftRight className="h-5 w-5" />Existencias actuales</CardTitle><p className="text-xs text-muted-foreground">Todas las campañas · las cantidades cambian sólo al registrar movimientos.</p></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Apiario</TableHead><TableHead>Recurso</TableHead><TableHead>Cantidad</TableHead></TableRow></TableHeader><TableBody>{catalogos.existencias.filter(e => !filtro.apiario || e.apiario_id === filtro.apiario).map(e => <TableRow key={`${e.apiario_id}:${e.recurso}`}><TableCell>{apiarioNombre(e.apiario_id)}</TableCell><TableCell>{recursosApicolas[e.recurso]}</TableCell><TableCell>{e.cantidad}</TableCell></TableRow>)}{!catalogos.existencias.length && <TableRow><TableCell colSpan={3}>Registrá un alta para cargar existencias iniciales.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>}
    {(esRegistro || vista === "movimientos" || vista === "agenda") && <Card><CardHeader><CardTitle>{vistasApicolas.find(v => v.vista === vista)?.titulo}</CardTitle></CardHeader><CardContent className="space-y-4">
      {listado.isLoading ? <p role="status">Cargando registros...</p> : listado.isError ? <ErrorCarga retry={() => void listado.refetch()} /> : <>
        <Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Apiario</TableHead><TableHead>{vista === "movimientos" ? "Movimiento" : vista === "agenda" ? "Tarea" : "Alcance real"}</TableHead><TableHead>{vista === "movimientos" ? "Cantidad / recurso" : "Estado / responsable"}</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{listado.data?.items.map(row => <TableRow key={row.id}>
          <TableCell>{fecha(row.fecha)}{vista === "agenda" && row.estado === "pendiente" && String(row.fecha) < format(new Date(), "yyyy-MM-dd") && <Badge variant="destructive" className="mt-1">Vencida</Badge>}</TableCell>
          <TableCell>{vista === "movimientos" ? <>{apiarioNombre(row.origen_apiario_id)} → {apiarioNombre(row.destino_apiario_id)}</> : apiarioNombre(row.apiario_id)}</TableCell>
          <TableCell>{vista === "movimientos" ? <><p className="capitalize">{texto(row.tipo)}</p><p className="max-w-xs whitespace-pre-line text-xs text-muted-foreground">{texto(row.motivo)}</p></> : vista === "agenda" ? <><p className="max-w-xs whitespace-pre-line">{texto(row.descripcion)}</p><Badge variant="outline">{texto(row.prioridad)}</Badge></> : <><p>{texto(row.cantidad)} de {texto(row.existencias_al_registrar)} colonias</p><p className="text-xs text-muted-foreground">{texto(row.alcance)}</p></>}</TableCell>
          <TableCell>{vista === "movimientos" ? `${row.cantidad} ${recursosApicolas[String(row.recurso)] || row.recurso}` : <><Estado value={row.estado} /><p className="mt-1 text-xs text-muted-foreground">{texto(row.responsable)}</p></>}</TableCell>
          <TableCell><div className="flex flex-wrap gap-2">{esRegistro && <Button variant="outline" size="icon" aria-label="Ver registro" onClick={() => setDetalle(row)}><Eye className="h-4 w-4" /></Button>}
            {puedeOperar && (esAdmin || row.creado_por === user?.id) && (vista === "agenda" || esRegistro && row.estado === "pendiente") && <Button variant="outline" size="icon" aria-label="Editar registro" onClick={() => editar(row)}><Pencil className="h-4 w-4" /></Button>}
            {esAdmin && esRegistro && row.estado === "pendiente" && <Button size="sm" disabled={operar.isPending} onClick={() => ejecutar("confirmar_registro", { id: row.id, version: row.version })}>Confirmar</Button>}
            {esAdmin && esRegistro && row.estado !== "anulado" && <Button size="sm" variant="outline" disabled={operar.isPending} onClick={() => { setAnular(row); setMotivo(""); }}>Anular</Button>}
            {vista === "agenda" && row.estado === "pendiente" && puedeOperar && (esAdmin || row.creado_por === user?.id) && <Button size="sm" disabled={operar.isPending} onClick={() => ejecutar("tarea", { ...row, estado: "hecha" })}>Completar</Button>}
          </div></TableCell>
        </TableRow>)}{!listado.data?.items.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Sin registros en este período.</TableCell></TableRow>}</TableBody></Table>
        <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" disabled={!pagina} onClick={() => setPagina(p => p - 1)}>Anterior</Button><span className="text-sm">Página {pagina + 1} · {listado.data?.total || 0} registros</span><Button variant="outline" disabled={(pagina + 1) * 30 >= (listado.data?.total || 0)} onClick={() => setPagina(p => p + 1)}>Siguiente</Button></div>
      </>}
      {operar.isError && <p role="alert" className="text-sm text-destructive">{operar.error.message}</p>}
    </CardContent></Card>}
    <Dialog open={Boolean(editor)} onOpenChange={open => { if (!open) setEditor(null); }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{editor?.fila ? "Editar" : "Registrar"} {editor ? nombres[editor.entidad] : ""}</DialogTitle><DialogDescription>Los datos corresponden a {comercio.nombre_comercio}. Los campos con * son obligatorios.</DialogDescription></DialogHeader>{editor && <ApicolaFormulario key={`${editor.entidad}:${editor.fila?.id || "nuevo"}`} entidad={editor.entidad} fila={editor.fila} catalogos={catalogos} filtro={filtro} comercioId={comercio.id} admin={esAdmin} onGuardado={() => setEditor(null)} />}</DialogContent></Dialog>
    <Dialog open={Boolean(detalle)} onOpenChange={open => { if (!open) setDetalle(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Ficha del registro apícola</DialogTitle><DialogDescription>Alcance y datos efectivamente registrados.</DialogDescription></DialogHeader>{detalle && <InfoRegistro fila={detalle} catalogos={catalogos} />}</DialogContent></Dialog>
    <Dialog open={Boolean(colmena)} onOpenChange={open => { if (!open) setColmena(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Colmena {colmena?.codigo}</DialogTitle><DialogDescription>Identidad de la colonia, material e historial individual.</DialogDescription></DialogHeader>{colmena && <FichaColmena key={colmena.id} colmena={colmena} catalogos={catalogos} comercioId={comercio.id} />}</DialogContent></Dialog>
    <Dialog open={Boolean(anular)} onOpenChange={open => { if (!open && !operar.isPending) setAnular(null); }}><DialogContent><DialogHeader><DialogTitle>Anular registro</DialogTitle><DialogDescription>El registro se conserva con su motivo de anulación. Los pendientes abiertos que generó se cancelarán.</DialogDescription></DialogHeader><Label htmlFor="apicola-motivo-anulacion">Motivo</Label><Textarea id="apicola-motivo-anulacion" minLength={5} value={motivo} onChange={e => setMotivo(e.target.value)} /><Button variant="destructive" disabled={motivo.trim().length < 5 || operar.isPending} onClick={() => ejecutar("anular_registro", { id: anular!.id, version: anular!.version, motivo }, () => setAnular(null))}>Confirmar anulación</Button>{operar.isError && <p role="alert" className="text-destructive">{operar.error.message}</p>}</DialogContent></Dialog>
  </div>;
}
