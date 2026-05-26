import { useNavigate } from "react-router-dom";
import { ProveedorForm } from "@/components/ProveedorForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const NuevoProveedor = () => {
  const navigate = useNavigate();

  return (
    <div className="p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Nuevo Proveedor</h1>
            <p className="text-muted-foreground">Cargue los datos fiscales y de contacto del proveedor.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/proveedores")}>
            Volver al listado
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6">
            <ProveedorForm onSuccess={() => navigate("/proveedores")} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NuevoProveedor;
