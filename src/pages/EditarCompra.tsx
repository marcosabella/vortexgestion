import { useNavigate, useParams } from "react-router-dom";
import CompraForm from "@/components/CompraForm";
import { Button } from "@/components/ui/button";
import { useCompras } from "@/hooks/useCompras";

export default function EditarCompra() {
  const navigate = useNavigate();
  const { compraId } = useParams<{ compraId: string }>();
  const { compras, isLoading } = useCompras();
  const compra = compras.find((item) => item.id === compraId);
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-[90rem] text-muted-foreground">
          Cargando compra…
        </div>
      </div>
    );
  }
  if (!compra) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-[90rem] space-y-4">
          <div>
            <h1 className="text-3xl font-bold">Compra no encontrada</h1>
            <p className="text-muted-foreground">
              No se pudo encontrar la compra solicitada.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/compras")}>
            Volver al listado
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="p-6">
      <div className="mx-auto max-w-[90rem] space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Editar compra</h1>
            <p className="text-muted-foreground">
              Modificá los datos de la compra seleccionada.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/compras")}>
            Volver al listado
          </Button>
        </div>
        <CompraForm
          compra={compra}
          onSuccess={() => navigate("/compras")}
          onCancel={() => navigate("/compras")}
        />
      </div>
    </div>
  );
}
