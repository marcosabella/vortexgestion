import { ChequesList } from '@/components/ChequesList';

const Cheques = () => {
  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">Cartera de Cheques</h1>
          <p className="text-muted-foreground">
            Gestione los cheques recibidos de sus clientes, controle vencimientos y estados
          </p>
        </div>
        <ChequesList />
      </div>
    </div>
  );
};

export default Cheques;
