import { ArrowLeft, AlertTriangle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CampoTelemetriaDetalle as Detail } from "@/pages/CampoTelemetria";
import { useCampoAccess } from "@/hooks/useCampoAccess";
import { useComercio } from "@/hooks/useComercio";

export default function CampoTelemetriaDetalle() {
  const navigate = useNavigate(), { importacionId } = useParams();
  const { comercio, isLoading } = useComercio();
  const access = useCampoAccess(comercio?.id);
  const allowed = access.perteneceAlComercio && !access.isLoading && access.isAdmin;
  if (isLoading || access.isLoading) return <div className="p-6">Cargando telemetria...</div>;
  if (!allowed || !comercio?.id || !importacionId) return <div className="container mx-auto p-6"><Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertDescription>No tenes acceso a esta importacion.</AlertDescription></Alert></div>;
  return <div className="container mx-auto space-y-6 p-4 md:p-6"><Button variant="outline" onClick={() => navigate("/campo/telemetria?tab=importaciones")}><ArrowLeft className="mr-2 h-4 w-4"/>Volver a importaciones</Button><Detail comercioId={comercio.id} id={importacionId} allowed={allowed}/></div>;
}
