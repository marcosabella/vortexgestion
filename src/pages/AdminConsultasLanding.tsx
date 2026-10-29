import { Navigate } from "react-router-dom";
import { useIsAppAdmin } from "@/hooks/useAdminComercios";
import { ConsultasLanding } from "@/components/admin/ConsultasLanding";

export default function AdminConsultasLanding() {
  const { data: isAdmin, isLoading } = useIsAppAdmin();
  if (isLoading) return <div role="status" className="p-6">Cargando permisos…</div>;
  if (!isAdmin) return <Navigate to="/" replace />;
  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-3xl font-bold">Consultas de la landing</h1>
        <p className="mt-2 text-sm text-muted-foreground">Consultas comerciales recibidas desde el sitio. Revisá los mensajes y registrá su seguimiento.</p>
      </div>
      <ConsultasLanding />
    </div>
  );
}
