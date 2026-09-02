import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { OrdenesList } from "@/components/campo/OrdenesList";
import { useCampoAccess } from "@/hooks/useCampoAccess";
import { useCampoOrdenes } from "@/hooks/useCampoOrdenes";
import { useComercio } from "@/hooks/useComercio";

function PageMessage({ children, destructive = false }: { children: React.ReactNode; destructive?: boolean }) {
  return (
    <Card>
      <CardContent className={`py-12 text-center ${destructive ? "text-destructive" : "text-muted-foreground"}`}>
        {children}
      </CardContent>
    </Card>
  );
}

export default function CampoOrdenes() {
  const { comercio, isLoading: isComercioLoading } = useComercio();
  const comercioId = comercio?.id ?? null;
  const access = useCampoAccess(comercioId);
  const hasConfirmedAccess =
    access.perteneceAlComercio && !access.isLoading && !access.error;
  const ordenesQuery = useCampoOrdenes(comercioId, hasConfirmedAccess);
  const ordenes = hasConfirmedAccess ? (ordenesQuery.data ?? []) : [];

  let content: React.ReactNode;
  if (isComercioLoading) {
    content = <PageMessage>Cargando comercio...</PageMessage>;
  } else if (!comercioId) {
    content = <PageMessage>No hay un comercio activo seleccionado.</PageMessage>;
  } else if (access.isLoading) {
    content = <PageMessage>Verificando acceso...</PageMessage>;
  } else if (access.error) {
    content = <PageMessage destructive>No se pudo verificar el acceso. Intentá nuevamente.</PageMessage>;
  } else if (!access.perteneceAlComercio) {
    content = <PageMessage>Sin acceso</PageMessage>;
  } else if (ordenesQuery.isLoading) {
    content = <PageMessage>Cargando órdenes de trabajo...</PageMessage>;
  } else if (ordenesQuery.error) {
    content = <PageMessage destructive>No se pudieron cargar las órdenes de trabajo. Intentá nuevamente.</PageMessage>;
  } else {
    content = <OrdenesList ordenes={ordenes} />;
  }

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
            <ClipboardList className="h-7 w-7" />
            Órdenes de trabajo
          </h1>
          <p className="mt-1 text-muted-foreground">
            {comercio?.nombre_comercio
              ? `Comercio activo: ${comercio.nombre_comercio}`
              : "Órdenes del comercio activo"}
          </p>
        </div>
        {!isComercioLoading && !access.isLoading && !access.error && access.perteneceAlComercio && (
          <Badge variant="outline">{access.isAdmin ? "Administrador" : "Solo lectura"}</Badge>
        )}
      </div>
      {content}
    </div>
  );
}
