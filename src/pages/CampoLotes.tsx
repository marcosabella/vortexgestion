import { ArrowLeft, Info, Rows3 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LotesList } from "@/components/campo/LotesList";
import { useCampoAccess } from "@/hooks/useCampoAccess";
import { useCampoEstablecimiento } from "@/hooks/useCampoEstablecimientos";
import { useCampoLotes } from "@/hooks/useCampoLotes";
import { useComercio } from "@/hooks/useComercio";
import type { CampoEstablecimientoDetail } from "@/types/campo";
import { isCampoUuid } from "@/utils/campo";

function clienteNombre(establecimiento: CampoEstablecimientoDetail) {
  if (!establecimiento.cliente) return "Cliente no disponible";
  return [establecimiento.cliente.nombre, establecimiento.cliente.apellido]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function PageMessage({ children, destructive = false }: { children: React.ReactNode; destructive?: boolean }) {
  return (
    <Card>
      <CardContent className={`py-12 text-center ${destructive ? "text-destructive" : "text-muted-foreground"}`}>
        {children}
      </CardContent>
    </Card>
  );
}

export default function CampoLotes() {
  const navigate = useNavigate();
  const { establecimientoId } = useParams<{ establecimientoId: string }>();
  const idValido = isCampoUuid(establecimientoId);
  const { comercio, isLoading: isComercioLoading } = useComercio();
  const comercioId = comercio?.id ?? null;
  const access = useCampoAccess(comercioId);
  const establecimientoQuery = useCampoEstablecimiento(
    comercioId,
    establecimientoId,
    access.perteneceAlComercio && idValido,
  );
  const establecimientoAutorizado = Boolean(establecimientoQuery.data);
  const lotesQuery = useCampoLotes(
    comercioId,
    establecimientoId,
    access.perteneceAlComercio,
    establecimientoAutorizado,
  );

  let content: React.ReactNode;

  if (isComercioLoading) {
    content = <PageMessage>Cargando comercio...</PageMessage>;
  } else if (!comercioId) {
    content = <PageMessage>No hay un comercio activo seleccionado.</PageMessage>;
  } else if (!idValido) {
    content = <PageMessage>El identificador del establecimiento no es válido.</PageMessage>;
  } else if (access.isLoading) {
    content = <PageMessage>Verificando acceso...</PageMessage>;
  } else if (access.error) {
    content = <PageMessage destructive>No se pudo verificar el acceso. Intentá nuevamente.</PageMessage>;
  } else if (!access.perteneceAlComercio) {
    content = <PageMessage>Sin acceso</PageMessage>;
  } else if (establecimientoQuery.isLoading) {
    content = <PageMessage>Cargando establecimiento...</PageMessage>;
  } else if (establecimientoQuery.error) {
    content = <PageMessage destructive>No se pudo cargar el establecimiento. Intentá nuevamente.</PageMessage>;
  } else if (!establecimientoQuery.data) {
    content = <PageMessage>Establecimiento no encontrado o sin acceso.</PageMessage>;
  } else if (lotesQuery.isLoading) {
    content = <PageMessage>Cargando lotes...</PageMessage>;
  } else if (lotesQuery.error) {
    content = <PageMessage destructive>No se pudieron cargar los lotes. Intentá nuevamente.</PageMessage>;
  } else {
    const establecimiento = establecimientoQuery.data;
    content = (
      <>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
              <Rows3 className="h-7 w-7 shrink-0" />
              Lotes
            </h1>
            <h2 className="mt-2 break-words text-xl font-semibold">{establecimiento.nombre}</h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {establecimiento.codigo_interno && <span>Código: {establecimiento.codigo_interno}</span>}
              <span>Cliente: {clienteNombre(establecimiento)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {establecimiento.activo ? <Badge>Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}
            <Badge variant="outline">{access.isAdmin ? "Administrador" : "Solo lectura"}</Badge>
          </div>
        </div>

        {!establecimiento.activo && (
          <div className="flex items-start gap-3 rounded-md border border-border bg-muted/50 p-4 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Este establecimiento está inactivo. Sus lotes existentes continúan disponibles en modo lectura.</p>
          </div>
        )}

        <LotesList lotes={lotesQuery.data ?? []} />
      </>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6 lg:p-8">
      <Button type="button" variant="outline" onClick={() => navigate("/campo/establecimientos")}>
        <ArrowLeft className="h-4 w-4" />
        Volver a establecimientos
      </Button>
      {content}
    </div>
  );
}
