import { VentasList } from '@/components/VentasList';

const Ventas = () => {
  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">Gestión de Ventas</h1>
          <p className="text-muted-foreground">
            Registre y administre las ventas de su comercio
          </p>
        </div>
        <VentasList />
      </div>
    </div>
  );
};

export default Ventas;