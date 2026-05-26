import { useNavigate } from "react-router-dom";
import { CuentaCorrienteForm } from "@/components/CuentaCorrienteForm";
import { Button } from "@/components/ui/button";

const NuevoMovimientoCuentaCorriente = () => {
  const navigate = useNavigate();

  return (
    <div className="p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Nuevo Movimiento</h1>
            <p className="text-muted-foreground">Registre un movimiento de cuenta corriente.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/cuenta-corriente")}>
            Volver al listado
          </Button>
        </div>
        <CuentaCorrienteForm onSuccess={() => navigate("/cuenta-corriente")} showTitle={false} />
      </div>
    </div>
  );
};

export default NuevoMovimientoCuentaCorriente;
