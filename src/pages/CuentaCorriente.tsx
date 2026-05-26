import { CuentaCorrienteList } from '@/components/CuentaCorrienteList';

const CuentaCorriente = () => {
  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">Cuenta Corriente</h1>
          <p className="text-muted-foreground">
            Gestione las cuentas corrientes de sus clientes, registre pagos y consulte saldos
          </p>
        </div>
        <CuentaCorrienteList />
      </div>
    </div>
  );
};

export default CuentaCorriente;