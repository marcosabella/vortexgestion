import { useNavigate } from "react-router-dom";
import { ChequeForm } from "@/components/ChequeForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCheques } from "@/hooks/useCheques";

const NuevoCheque = () => {
  const navigate = useNavigate();
  const { createCheque } = useCheques();

  const handleSubmit = (data: any) => {
    createCheque(data, { onSuccess: () => navigate("/cheques") });
  };

  return (
    <div className="p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Registrar Cheque</h1>
            <p className="text-muted-foreground">Cargue un nuevo cheque en cartera.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/cheques")}>
            Volver al listado
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6">
            <ChequeForm onSubmit={handleSubmit} onCancel={() => navigate("/cheques")} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NuevoCheque;
