import { ClientesList } from '@/components/ClientesList';

const Clientes = () => {
  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">Gestión de Clientes</h1>
          <p className="text-muted-foreground">
            Administre la información de sus clientes y datos fiscales
          </p>
        </div>
        <ClientesList />
      </div>
    </div>
  );
};

export default Clientes;