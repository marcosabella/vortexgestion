import { useNavigate, useParams } from "react-router-dom";
import VentaForm from "@/components/VentaForm";
import { Button } from "@/components/ui/button";
import { usePresupuestos } from "@/hooks/usePresupuestos";

export default function EditarPresupuesto() {
  const navigate = useNavigate();
  const { presupuestoId } = useParams<{ presupuestoId: string }>();
  const { presupuestos, isLoading } = usePresupuestos();
  const presupuesto = presupuestos.find((item) => item.id === presupuestoId);

  if (isLoading) return <div className="p-6 text-muted-foreground">Cargando presupuesto...</div>;
  if (!presupuesto || presupuesto.estado !== "pendiente") {
    return <div className="p-6">El presupuesto no existe o ya fue confirmado.</div>;
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">Editar Presupuesto</h1>
          <Button variant="outline" onClick={() => navigate("/presupuestos")}>Volver al listado</Button>
        </div>
        <VentaForm modo="presupuesto" venta={presupuesto} onSuccess={() => navigate("/presupuestos")} showTitle={false} />
      </div>
    </div>
  );
}
