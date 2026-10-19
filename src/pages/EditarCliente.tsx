import { Link, useNavigate, useParams } from "react-router-dom";
import { ClienteForm } from "@/components/ClienteForm";
import { Button } from "@/components/ui/button";
import { useCliente } from "@/hooks/useClientes";

const EditarCliente = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: cliente, isLoading, error, refetch } = useCliente(id);

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Editar Cliente</h1>
            <p className="text-muted-foreground">Actualice los datos fiscales y de contacto o consulte el CUIT en ARCA.</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/clientes">Volver al listado</Link>
          </Button>
        </div>
        {isLoading ? (
          <p role="status" className="text-muted-foreground">Cargando cliente...</p>
        ) : error ? (
          <div className="space-y-4">
            <p role="alert" className="text-destructive">No se pudo cargar el cliente.</p>
            <Button variant="outline" onClick={() => refetch()}>Reintentar</Button>
          </div>
        ) : !cliente ? (
          <p role="alert" className="text-muted-foreground">El cliente no existe o no está disponible en el comercio actual.</p>
        ) : (
          <ClienteForm key={cliente.id} cliente={cliente} onSuccess={() => navigate("/clientes")} showTitle={false} />
        )}
      </div>
    </div>
  );
};

export default EditarCliente;
