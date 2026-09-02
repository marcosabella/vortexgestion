import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CampoOrdenDetail, CampoOrdenEstado } from "@/types/campo";

type OrdenDetalleProps = {
  orden: CampoOrdenDetail;
  canEdit: boolean;
  onEdit: () => void;
};

const estadoLabels: Record<CampoOrdenEstado, string> = {
  borrador: "Borrador",
  planificada: "Planificada",
  en_progreso: "En progreso",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function civilDate(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function dateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

function clienteNombre(orden: CampoOrdenDetail) {
  if (!orden.cliente) return "Cliente no disponible";
  return [orden.cliente.nombre, orden.cliente.apellido].filter(Boolean).join(" ").trim();
}

function EstadoBadge({ estado }: { estado: string }) {
  const knownEstado = estado as CampoOrdenEstado;
  const variant = knownEstado === "cancelada" ? "destructive" : knownEstado === "borrador" ? "secondary" : knownEstado === "finalizada" ? "outline" : "default";
  return <Badge variant={variant}>{estadoLabels[knownEstado] ?? estado}</Badge>;
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap font-medium">{children}</dd></div>;
}

export function OrdenDetalle({ orden, canEdit, onEdit }: OrdenDetalleProps) {
  const inicio = civilDate(orden.fecha_inicio_planificada);
  const fin = civilDate(orden.fecha_fin_planificada);
  const fechas = inicio && fin ? `${inicio} – ${fin}` : inicio ? `Desde ${inicio}` : fin ? `Hasta ${fin}` : "Sin fechas planificadas";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-2">
          <CardTitle>Orden N.º {new Intl.NumberFormat("es-AR").format(orden.numero)}</CardTitle>
          <div className="flex flex-wrap items-center gap-2"><EstadoBadge estado={orden.estado} /><span className="text-sm text-muted-foreground">{orden.codigo_interno || "Sin código"}</span></div>
        </div>
        {canEdit && <Button type="button" variant="outline" onClick={onEdit}><Pencil className="h-4 w-4" />Editar cabecera</Button>}
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <DetailField label="Cliente">{clienteNombre(orden)}</DetailField>
          <DetailField label="Establecimiento">{orden.establecimiento?.nombre ?? "Establecimiento no disponible"}</DetailField>
          <DetailField label="Fechas planificadas">{fechas}</DetailField>
          <DetailField label="Descripción">{orden.descripcion || "Sin descripción"}</DetailField>
          <DetailField label="Observaciones">{orden.observaciones || "Sin observaciones"}</DetailField>
          <DetailField label="Creada">{dateTime(orden.created_at)}</DetailField>
          <DetailField label="Última actualización">{dateTime(orden.updated_at)}</DetailField>
          {orden.iniciada_at && <DetailField label="Inicio real">{dateTime(orden.iniciada_at)}</DetailField>}
          {orden.finalizada_at && <DetailField label="Finalización">{dateTime(orden.finalizada_at)}</DetailField>}
          {orden.cancelada_at && <DetailField label="Cancelación">{dateTime(orden.cancelada_at)}</DetailField>}
        </dl>
      </CardContent>
    </Card>
  );
}
