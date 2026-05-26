import { TarjetasList } from '@/components/TarjetasList';

const Tarjetas = () => {
  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">Gestión de Tarjetas de Crédito</h1>
          <p className="text-muted-foreground">
            Administre las tarjetas de crédito, configure cuotas y recargos para ventas
          </p>
        </div>
        <TarjetasList />
      </div>
    </div>
  );
};

export default Tarjetas;