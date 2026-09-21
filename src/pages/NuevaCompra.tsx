import { useNavigate } from "react-router-dom";
import CompraForm from "@/components/CompraForm";
import { Button } from "@/components/ui/button";

export default function NuevaCompra() {
  const navigate = useNavigate();
  return (
    <div className="p-6">
      <div className="mx-auto max-w-[90rem] space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Nueva compra</h1>
            <p className="text-muted-foreground">
              Registrá la compra, actualizá stock y generá el pago o la deuda
              del proveedor.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/compras")}>
            Volver al listado
          </Button>
        </div>
        <CompraForm
          onSuccess={() => navigate("/compras")}
          onCancel={() => navigate("/compras")}
        />
      </div>
    </div>
  );
}
