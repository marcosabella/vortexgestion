import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CAMPO_PARTE_ESTADO_LABEL, type CampoParte, type CampoParteEstado } from "@/types/campo";
import { useCampoOrdenHistorial, useCampoParteHistorial } from "@/hooks/useCampoPartes";

export function CampoParteBadge({ estado }: { estado: CampoParteEstado }) {
  const variant = estado === "anulado" || estado === "rechazado" ? "destructive" : estado === "borrador" || estado === "descartado" ? "secondary" : "default";
  return <Badge variant={variant}>{CAMPO_PARTE_ESTADO_LABEL[estado]}</Badge>;
}

const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const stateLabel = (value: string | null) => value && value in CAMPO_PARTE_ESTADO_LABEL ? CAMPO_PARTE_ESTADO_LABEL[value as CampoParteEstado] : value ?? "Creación";

const actorLabel = (actorId: string, nuevoEstado: string, parte: CampoParte) => actorId === parte.propietario_user_id ? "Propietario del parte" : ["confirmado", "rechazado", "anulado"].includes(nuevoEstado) ? "Administrador" : "Usuario autorizado";
export function CampoParteHistory({ comercioId, ordenId, parte, access }: { comercioId: string; ordenId: string; parte: CampoParte; access: boolean }) {
  const query = useCampoParteHistorial(comercioId, ordenId, parte.id, access);
  return <Card><CardHeader><CardTitle>Historial de estados</CardTitle></CardHeader><CardContent>
    {query.isLoading ? <p className="text-muted-foreground">Cargando historial...</p> : query.error ? <p className="text-destructive">No se pudo cargar el historial.</p> : !query.data?.length ? <p className="text-muted-foreground">Sin eventos registrados.</p> : <ol className="space-y-3 border-l pl-5">{query.data.map(event => <li key={event.id} className="relative"><span className="absolute -left-[1.55rem] top-1.5 h-2 w-2 rounded-full bg-primary" /><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{stateLabel(event.estado_anterior)} → {stateLabel(event.estado_nuevo)}</span><span className="text-sm text-muted-foreground">{dateTime(event.created_at)}</span></div><p className="text-sm text-muted-foreground">{actorLabel(event.actor_user_id,event.estado_nuevo,parte)}</p>{event.motivo && <p className="mt-1 whitespace-pre-wrap text-sm">Motivo: {event.motivo}</p>}</li>)}</ol>}
  </CardContent></Card>;
}

const ORDEN_LABELS: Record<string,string> = { borrador:"Borrador", planificada:"Planificada", en_progreso:"En progreso", finalizada:"Finalizada", cancelada:"Cancelada" };
export function CampoOrdenHistory({ comercioId, ordenId, access }: { comercioId: string; ordenId: string; access: boolean }) {
  const query = useCampoOrdenHistorial(comercioId, ordenId, access);
  return <Card><CardHeader><CardTitle>Historial de la orden</CardTitle></CardHeader><CardContent>
    {query.isLoading ? <p className="text-muted-foreground">Cargando historial...</p> : query.error ? <p className="text-destructive">No se pudo cargar el historial.</p> : !query.data?.length ? <p className="text-muted-foreground">Sin eventos registrados.</p> : <ol className="space-y-3 border-l pl-5">{query.data.map(event => <li key={event.id} className="relative"><span className="absolute -left-[1.55rem] top-1.5 h-2 w-2 rounded-full bg-primary" /><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{event.estado_anterior ? ORDEN_LABELS[event.estado_anterior] ?? event.estado_anterior : "Creación"} → {ORDEN_LABELS[event.estado_nuevo] ?? event.estado_nuevo}</span><span className="text-sm text-muted-foreground">{dateTime(event.created_at)}</span></div><p className="text-sm text-muted-foreground">Administrador</p>{event.motivo && <p className="mt-1 whitespace-pre-wrap text-sm">Motivo: {event.motivo}</p>}</li>)}</ol>}
  </CardContent></Card>;
}

export function ParteLifecycleDetails({ parte }: { parte: CampoParte }) {
  return <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
    <p><span className="text-muted-foreground">Propietario:</span> {parte.propietario_operario ? `${parte.propietario_operario.nombre}${parte.propietario_operario.codigo_interno ? ` · ${parte.propietario_operario.codigo_interno}` : ""}` : "Administrador"}</p>
    {parte.enviado_at && <p><span className="text-muted-foreground">Enviado:</span> {dateTime(parte.enviado_at)}</p>}
    {parte.rechazado_at && <p><span className="text-muted-foreground">Rechazado:</span> {dateTime(parte.rechazado_at)}</p>}
    {parte.motivo_rechazo && <p className="sm:col-span-2"><span className="text-muted-foreground">Motivo de rechazo:</span> {parte.motivo_rechazo}</p>}
    {parte.confirmado_at && <p><span className="text-muted-foreground">Confirmado:</span> {dateTime(parte.confirmado_at)}</p>}
    {parte.anulado_at && <p><span className="text-muted-foreground">Anulado:</span> {dateTime(parte.anulado_at)}</p>}
    {parte.motivo_anulacion && <p className="sm:col-span-2"><span className="text-muted-foreground">Motivo de anulación:</span> {parte.motivo_anulacion}</p>}
    {parte.descartado_at && <p><span className="text-muted-foreground">Descartado:</span> {dateTime(parte.descartado_at)}</p>}
    {parte.motivo_descarte && <p className="sm:col-span-2"><span className="text-muted-foreground">Motivo de descarte:</span> {parte.motivo_descarte}</p>}
  </div>;
}
