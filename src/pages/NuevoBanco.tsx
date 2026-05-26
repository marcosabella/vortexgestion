import { useNavigate } from "react-router-dom";
import { BancoForm } from "@/components/BancoForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const NuevoBanco = () => {
  const navigate = useNavigate();

  return (
    <div className="p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Nuevo Banco</h1>
            <p className="text-muted-foreground">Registre una cuenta bancaria para pagos y transferencias.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/bancos")}>
            Volver al listado
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6">
            <BancoForm onSuccess={() => navigate("/bancos")} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NuevoBanco;
