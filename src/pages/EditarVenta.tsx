import { useNavigate, useParams } from "react-router-dom";
import VentaForm from "@/components/VentaForm";
import { Button } from "@/components/ui/button";
import { useVentas } from "@/hooks/useVentas";

const EditarVenta = () => {
  const navigate = useNavigate();
  const { ventaId } = useParams<{ ventaId: string }>();
  const { ventas, isLoading } = useVentas();
  const venta = ventas.find((venta) => venta.id === ventaId);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-6xl text-muted-foreground">Cargando venta...</div>
      </div>
    );
  }

  if (!venta) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Venta no encontrada</h1>
            <p className="text-muted-foreground">No se pudo encontrar la venta solicitada.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/ventas")}>
            Volver al listado
          </Button>
        </div>
      </div>
    );
  }

  if (venta.cae?.trim()) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Venta autorizada</h1>
            <p className="text-muted-foreground">
              Esta venta tiene CAE y ya no puede editarse ni eliminarse.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/ventas")}>
            Volver al listado
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Editar Venta</h1>
            <p className="text-muted-foreground">Modifique los datos de la venta seleccionada.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/ventas")}>
            Volver al listado
          </Button>
        </div>
        <VentaForm venta={venta} onSuccess={() => navigate("/ventas")} showTitle={false} />
      </div>
    </div>
  );
};

export default EditarVenta;
