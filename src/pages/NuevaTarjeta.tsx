import { useNavigate } from "react-router-dom";
import { TarjetaForm } from "@/components/TarjetaForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const NuevaTarjeta = () => {
  const navigate = useNavigate();

  return (
    <div className="p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Nueva Tarjeta</h1>
            <p className="text-muted-foreground">Registre una tarjeta para usarla en ventas.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/tarjetas")}>
            Volver al listado
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6">
            <TarjetaForm onSuccess={() => navigate("/tarjetas")} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NuevaTarjeta;
