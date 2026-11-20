import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RotateCcw, Upload } from "lucide-react";
import { useIsAppAdmin } from "@/hooks/useAdminComercios";
import { useAdminBackups } from "@/hooks/useAdminBackups";
import { estadosRestauracion, useAdminBackupRestores } from "@/hooks/useAdminBackupRestores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function AdminBackupRestaurar({ embedded = false }: { embedded?: boolean }) {
  const admin = useIsAppAdmin();
  const navigate = useNavigate();
  const { id } = useParams();
  const { worker, descargar } = useAdminBackups(admin.data === true);
  const { listado, cargar, analizar, aplicar, reintentar } = useAdminBackupRestores(admin.data === true);
  const [file, setFile] = useState<File | null>(null);
  const [selection, setSelection] = useState<{ id: string; comercio: string } | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [texto, setTexto] = useState("");
  if (admin.isLoading) return <p className="p-6">Cargando permisos...</p>;
  if (!admin.data) return <Navigate to="/" replace />;
  const job = listado.data?.find((row) => row.id === id);
  const scope = selection && selection.id === id ? selection.comercio : job && ["restauracion_pendiente", "restaurando", "completado", "interrumpido"].includes(job.estado) ? job.comercio_id || job.resumen?.comercio_original_id || "" : job?.resumen?.comercio_id || "";
  const nombre = scope ? job?.resumen?.comercios.find((c) => c.id === scope)?.nombre || scope : "Todos los comercios";
  const busy = cargar.isPending || analizar.isPending || aplicar.isPending || reintentar.isPending;
  const error = listado.error || cargar.error || analizar.error || aplicar.error || reintentar.error || descargar.error;
  const disponible = worker.data?.restoreReady === true;
  const stale = job && ["analizando", "analisis_pendiente", "restaurando", "restauracion_pendiente"].includes(job.estado) && Date.now() - new Date(job.updated_at).getTime() > 20 * 60000;
  return <div className={embedded ? "space-y-6" : "container mx-auto space-y-6 p-4 md:p-6"}>
    {embedded ? <h2 className="text-lg font-semibold">Restaurar copia de seguridad</h2> : <div className="flex flex-wrap items-center gap-3"><Button size="sm" variant="outline" asChild><Link to="/admin/backups"><ArrowLeft className="h-4 w-4" />Volver</Link></Button><h1 className="text-2xl font-bold">Restaurar copia de seguridad</h1></div>}
    {!disponible && !worker.isLoading && <Alert><AlertDescription>La restauración todavía no está habilitada en este servidor. Requiere completar el ensayo de recuperación.</AlertDescription></Alert>}
    {error && <Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription></Alert>}
    {!id && <Card><CardContent className="space-y-4 p-4">
      <p>Elegí la copia cifrada guardada en tu PC. Primero analizaremos el archivo, su fecha y los comercios incluidos. Esta carga no reemplaza datos.</p>
      <div className="space-y-2"><Label htmlFor="restore-file">Archivo de respaldo</Label><Input id="restore-file" type="file" accept=".enc" disabled={busy} onChange={(e) => { setFile(e.target.files?.[0] || null); cargar.reset(); }} /></div>
      <p className="text-sm text-muted-foreground">Tamaño máximo: 256 MB. Conservá también una copia en un disco externo.</p>
      <div className="flex gap-2"><Button disabled={!file || busy || !disponible} onClick={() => cargar.mutate(file!, { onSuccess: (newId) => { navigate(`/admin/backups/restaurar/${newId}`); analizar.mutate(newId); } })}><Upload className="h-4 w-4" />{cargar.isPending ? "Cargando..." : "Cargar y analizar"}</Button><Button variant="outline" asChild><Link to="/admin/backups">Cancelar</Link></Button></div>
    </CardContent></Card>}
    {id && !job && <p>{listado.isPending ? "Consultando restauración..." : "No se encontró la restauración entre los últimos 100 registros."}</p>}
    {job && <Card><CardContent className="space-y-4 p-4">
      <p role="status" className="font-medium">{estadosRestauracion[job.estado]}</p>
      {job.error && <Alert variant="destructive"><AlertDescription>{job.error}</AlertDescription></Alert>}
      {job.resumen && <><p>Fecha de la copia: <strong>{new Date(job.resumen.fecha).toLocaleString("es-AR")}</strong></p><p>{job.resumen.comercios.length} comercio(s), {job.resumen.filas} registros y {job.resumen.archivos} archivos incluidos.</p>
        <div className="space-y-2"><Label htmlFor="restore-scope">Qué querés restaurar</Label><select id="restore-scope" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={scope} disabled={job.estado !== "listo" || busy} onChange={(e) => { setSelection({ id: job.id, comercio: e.target.value }); setTexto(""); }}>{!job.resumen.comercio_id && <option value="">Todos los comercios</option>}{job.resumen.comercios.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
        <p className="text-sm">{scope ? "Se reemplazarán los datos y archivos del comercio elegido. Los demás comercios conservarán su estado actual." : "Se reemplazarán los datos operativos y archivos de todos los comercios por los de esta copia."} Los cambios posteriores a la fecha del respaldo se perderán en ese alcance.</p>
        <p className="text-sm text-muted-foreground">Se conservan las cuentas de acceso actuales y el historial de respaldos. Antes de restaurar se genera una copia general del estado actual. Durante el proceso se bloquearán las modificaciones en el sistema.</p>
        {["listo", "interrumpido"].includes(job.estado) && <Button variant="destructive" disabled={busy || !disponible} onClick={() => { setTexto(""); setConfirmar(true); }}><RotateCcw className="h-4 w-4" />{job.estado === "interrumpido" ? "Reanudar restauración" : "Revisar y restaurar"}</Button>}
      </>}
      {job.estado === "cargando" && <Button disabled={busy || !disponible} onClick={() => analizar.mutate(job.id)}>Reintentar análisis del archivo cargado</Button>}
      {stale && <Button variant="outline" disabled={busy} onClick={() => reintentar.mutate(job.id)}>Recuperar proceso interrumpido</Button>}
      {job.backup_previo_id && <Button variant="outline" disabled={descargar.isPending} onClick={() => descargar.mutate(job.backup_previo_id!)}>Descargar respaldo previo</Button>}
      {job.estado === "completado" && <p>Restauración finalizada. El sistema volvió a permitir modificaciones.</p>}
    </CardContent></Card>}
    <AlertDialog open={confirmar} onOpenChange={setConfirmar}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar restauración</AlertDialogTitle><AlertDialogDescription>Alcance: {nombre}. Se recuperará el estado del {job?.resumen && new Date(job.resumen.fecha).toLocaleString("es-AR")}. Los datos posteriores de ese alcance serán reemplazados. Se guardará una copia previa y el sistema quedará temporalmente en mantenimiento.</AlertDialogDescription></AlertDialogHeader><Label htmlFor="restore-confirm">Escribí RESTAURAR para confirmar</Label><Input id="restore-confirm" autoComplete="off" value={texto} onChange={(e) => setTexto(e.target.value)} /><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={texto !== "RESTAURAR" || busy || !job} onClick={() => { if (job) aplicar.mutate({ id: job.id, comercioId: scope || null }); }}>Confirmar restauración</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
