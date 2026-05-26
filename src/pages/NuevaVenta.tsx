import { useNavigate } from "react-router-dom";
import VentaForm from "@/components/VentaForm";
import { Button } from "@/components/ui/button";

const NuevaVenta = () => {
  const navigate = useNavigate();

  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Nueva Venta</h1>
            <p className="text-muted-foreground">Registre una nueva venta del comercio.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/ventas")}>
            Volver al listado
          </Button>
        </div>
        <VentaForm onSuccess={() => navigate("/ventas")} showTitle={false} />
      </div>
    </div>
  );
};

export default NuevaVenta;
