import { useNavigate } from "react-router-dom";
import { ProductoForm } from "@/components/ProductoForm";
import { Button } from "@/components/ui/button";

const NuevoProducto = () => {
  const navigate = useNavigate();

  return (
    <div className="p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Nuevo Producto</h1>
            <p className="text-muted-foreground">Cargue el producto y sus datos de inventario.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/productos")}>
            Volver al listado
          </Button>
        </div>
        <ProductoForm onClose={() => navigate("/productos")} showTitle={false} />
      </div>
    </div>
  );
};

export default NuevoProducto;
