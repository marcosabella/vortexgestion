import { useNavigate } from "react-router-dom";
import { ClienteForm } from "@/components/ClienteForm";
import { Button } from "@/components/ui/button";

const NuevoCliente = () => {
  const navigate = useNavigate();

  return (
    <div className="p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Nuevo Cliente</h1>
            <p className="text-muted-foreground">Cargue los datos fiscales y de contacto del cliente.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/clientes")}>
            Volver al listado
          </Button>
        </div>
        <ClienteForm onSuccess={() => navigate("/clientes")} showTitle={false} />
      </div>
    </div>
  );
};

export default NuevoCliente;
