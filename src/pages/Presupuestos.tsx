import { PresupuestosList } from "@/components/PresupuestosList";

export default function Presupuestos() {
  return (
    <div className="p-6">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-2 text-3xl font-bold">Gestion de Presupuestos</h1>
        <p className="mb-6 text-muted-foreground">Prepare cotizaciones sin afectar stock y confirmelas como ventas.</p>
        <PresupuestosList />
      </div>
    </div>
  );
}
