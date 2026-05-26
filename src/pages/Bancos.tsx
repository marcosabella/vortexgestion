import { BancosList } from '@/components/BancosList';

const Bancos = () => {
  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">Gestión de Bancos</h1>
          <p className="text-muted-foreground">
            Administre las cuentas bancarias para transferencias y pagos
          </p>
        </div>
        <BancosList />
      </div>
    </div>
  );
};

export default Bancos;