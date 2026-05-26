import { ProveedoresList } from '@/components/ProveedoresList';

const Proveedores = () => {
  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">Gestión de Proveedores</h1>
          <p className="text-muted-foreground">
            Administre la información de sus proveedores y datos fiscales
          </p>
        </div>
        <ProveedoresList />
      </div>
    </div>
  );
};

export default Proveedores;