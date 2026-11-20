import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Database, Download, Eye, RefreshCw } from "lucide-react";
import { useIsAppAdmin, useAdminComercios } from "@/hooks/useAdminComercios";
import { useAdminBackups, type AdminBackup } from "@/hooks/useAdminBackups";
import { estadosRestauracion, useAdminBackupRestores } from "@/hooks/useAdminBackupRestores";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminBackupRestaurar from "./AdminBackupRestaurar";

const fecha = (v: string) => new Date(v).toLocaleString("es-AR");
const estados = { pendiente: "Pendiente", procesando: "Generando", completado: "Completado", fallido: "Fallido" };

export default function AdminBackups() {
  const location = useLocation();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const tab = location.pathname.startsWith("/admin/backups/restaurar") ? "restaurar" : ["copias", "restauraciones"].includes(search.get("tab") || "") ? search.get("tab")! : "realizar";
  const admin = useIsAppAdmin();
  const { comerciosQuery } = useAdminComercios(admin.data === true);
  const { listado, worker, generar, descargar } = useAdminBackups(admin.data === true);
  const restauraciones = useAdminBackupRestores(admin.data === true);
  const [comercio, setComercio] = useState("");
  const [detalle, setDetalle] = useState<AdminBackup | null>(null);
  if (admin.isLoading) return <p className="p-6">Cargando permisos...</p>;
  if (!admin.data) return <Navigate to="/" replace />;
  const nombre = (id: string | null) => id ? comerciosQuery.data?.find((c) => c.id === id)?.nombre_comercio || id : "Todos los comercios";
  const ocupado = generar.isPending || listado.isPending || Boolean(listado.data?.some((b) => b.estado === "procesando" || (b.estado === "pendiente" && (!Number.isFinite(Date.parse(b.created_at)) || Date.now() - Date.parse(b.created_at) < 20 * 60000))));
  const error = listado.error || generar.error || descargar.error || comerciosQuery.error;

  return <div className="container mx-auto space-y-6 p-4 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Copias de seguridad</h1><p className="text-sm text-muted-foreground">Respaldos cifrados de la base de datos y archivos. Solo administrador general.</p></div><Button variant="outline" size="sm" onClick={() => { void listado.refetch(); void worker.refetch(); void restauraciones.listado.refetch(); }}><RefreshCw className="h-4 w-4" />Actualizar</Button></div>
    {error && <Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription></Alert>}
    <Tabs value={tab} onValueChange={(value) => navigate(value === "restaurar" ? "/admin/backups/restaurar" : value === "realizar" ? "/admin/backups" : `/admin/backups?tab=${value}`)}>
    <div className="overflow-x-auto"><TabsList aria-label="Funciones de copias de seguridad" className="w-max min-w-full justify-start"><TabsTrigger value="realizar">Realizar copia</TabsTrigger><TabsTrigger value="restaurar">Restaurar</TabsTrigger><TabsTrigger value="copias">Últimas 100 copias</TabsTrigger><TabsTrigger value="restauraciones">Últimas 100 restauraciones</TabsTrigger></TabsList></div>
    <TabsContent value="realizar" className="space-y-4 pt-4">
    {!worker.isLoading && !worker.data?.ready && <Alert><AlertDescription>{worker.data?.message || 'El servicio de copias no está disponible. Actualizá la página o volvé a intentar en unos minutos.'}</AlertDescription></Alert>}
    <Card><CardContent className="space-y-4 p-4">
      <div className="space-y-2"><Label htmlFor="backup-comercio">Alcance de la copia</Label><select id="backup-comercio" value={comercio} onChange={(e) => { setComercio(e.target.value); generar.reset(); }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Base completa · todos los comercios</option>{comerciosQuery.data?.map((c) => <option key={c.id} value={c.id}>{c.nombre_comercio}</option>)}</select></div>
      <p className="text-sm text-muted-foreground">{comercio ? "Incluye los datos y archivos del comercio seleccionado. Las identidades de acceso compartidas se conservan por separado en el respaldo general." : "Incluye la estructura, los datos de todos los comercios, las identidades de acceso y los archivos almacenados."} La generación continúa aunque cierres esta página.</p>
      <Button disabled={ocupado || !worker.data?.ready || Boolean(listado.error)} onClick={() => generar.mutate(comercio || null)}><Database className="h-4 w-4" />{generar.isPending ? "Solicitando..." : comercio ? "Generar backup del comercio" : "Generar backup general"}</Button>
      {generar.isSuccess && <p role="status" className="text-sm">Respaldo solicitado. Podés seguir su estado en el historial.</p>}
    </CardContent></Card>
    </TabsContent>
    <TabsContent value="restaurar" className="pt-4"><AdminBackupRestaurar embedded /></TabsContent>
    <TabsContent value="copias" className="space-y-4 pt-4">
    <h2 className="text-lg font-semibold">Últimas 100 copias</h2>
    <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Alcance</TableHead><TableHead>Estado</TableHead><TableHead>Tamaño</TableHead><TableHead className="sticky right-0 bg-card">Acciones</TableHead></TableRow></TableHeader><TableBody>
      {listado.data?.map((b) => <TableRow key={b.id}><TableCell className="whitespace-nowrap">{fecha(b.created_at)}</TableCell><TableCell>{nombre(b.comercio_id)}</TableCell><TableCell>{estados[b.estado]}</TableCell><TableCell>{b.bytes ? `${(b.bytes / 1048576).toFixed(2)} MB` : "—"}</TableCell><TableCell className="sticky right-0 bg-card"><div className="flex gap-1"><Button size="sm" variant="outline" title="Ver detalle" aria-label="Ver detalle" onClick={() => setDetalle(b)}><Eye className="h-4 w-4" /></Button><Button size="sm" variant="outline" title="Descargar copia cifrada" aria-label="Descargar copia cifrada" disabled={b.estado !== "completado" || descargar.isPending} onClick={() => descargar.mutate(b.id)}><Download className="h-4 w-4" /></Button></div></TableCell></TableRow>)}
      {!listado.data?.length && <TableRow><TableCell colSpan={5}>{listado.isPending ? "Cargando..." : "Todavía no hay copias de seguridad."}</TableCell></TableRow>}
    </TableBody></Table></CardContent></Card>
    <p className="text-xs text-muted-foreground">Descargá una copia completada para guardarla en tu equipo o disco externo. En navegadores compatibles podrás elegir la ubicación; en los demás se usará la configuración de descargas del navegador. Una copia general compatible permite restaurar todos los comercios o elegir uno.</p>
    </TabsContent>
    <TabsContent value="restauraciones" className="space-y-4 pt-4">
    <h2 className="text-lg font-semibold">Últimas 100 restauraciones</h2>
    {restauraciones.listado.error && <Alert><AlertDescription>{restauraciones.listado.error.message}</AlertDescription></Alert>}
    <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Alcance</TableHead><TableHead>Estado</TableHead><TableHead className="sticky right-0 bg-card">Acciones</TableHead></TableRow></TableHeader><TableBody>{restauraciones.listado.data?.map((r) => <TableRow key={r.id}><TableCell className="whitespace-nowrap">{fecha(r.created_at)}</TableCell><TableCell>{r.estado === "listo" ? "Pendiente de selección" : nombre(r.comercio_id)}</TableCell><TableCell>{estadosRestauracion[r.estado]}</TableCell><TableCell className="sticky right-0 bg-card"><Button size="sm" variant="outline" title="Ver detalle" aria-label="Ver detalle de restauración" asChild><Link to={`/admin/backups/restaurar/${r.id}`}><Eye className="h-4 w-4" /></Link></Button></TableCell></TableRow>)}{!restauraciones.listado.data?.length && <TableRow><TableCell colSpan={4}>{restauraciones.listado.isPending ? "Cargando..." : "Todavía no hay restauraciones."}</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
    </TabsContent>
    </Tabs>
    <Dialog open={Boolean(detalle)} onOpenChange={(open) => { if (!open) setDetalle(null); }}><DialogContent><DialogHeader><DialogTitle>Detalle del respaldo</DialogTitle></DialogHeader>{detalle && <div className="space-y-3 break-words text-sm"><p>{nombre(detalle.comercio_id)} · {estados[detalle.estado]}</p><p>Solicitado: {fecha(detalle.created_at)}</p>{detalle.finalizado_at && <p>Finalizado: {fecha(detalle.finalizado_at)}</p>}{detalle.error && <p role="alert">{detalle.error}</p>}{detalle.sha256 && <p className="break-all">SHA-256: {detalle.sha256}</p>}{detalle.resumen && <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{JSON.stringify(detalle.resumen, null, 2)}</pre>}</div>}</DialogContent></Dialog>
  </div>;
}
