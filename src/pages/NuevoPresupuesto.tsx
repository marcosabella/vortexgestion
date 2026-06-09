import { useNavigate } from "react-router-dom";
import VentaForm from "@/components/VentaForm";
import { Button } from "@/components/ui/button";

export default function NuevoPresupuesto() {
  const navigate = useNavigate();
  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Nuevo Presupuesto</h1>
            <p className="text-muted-foreground">Los productos no se descuentan del stock.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/presupuestos")}>Volver al listado</Button>
        </div>
        <VentaForm modo="presupuesto" onSuccess={() => navigate("/presupuestos")} showTitle={false} />
      </div>
    </div>
  );
}
