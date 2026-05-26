import { ComercioForm } from "@/components/ComercioForm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useComercio } from "@/hooks/useComercio";
import { ComercioFormData } from "@/types/comercio";

const Comercio = () => {
  const { comercio, comerciosDisponibles, isLoading, selectComercio, updateComercio } = useComercio();

  const handleSubmit = (data: ComercioFormData) => {
    if (comercio) {
      updateComercio.mutate({ id: comercio.id, formData: data });
    }
  };

  if (isLoading) {
    return <div className="p-8">Cargando...</div>;
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Mi Comercio</h1>
      <div className="space-y-6">
        {comerciosDisponibles.length > 1 && (
          <div className="max-w-xl space-y-3 rounded-lg border bg-card p-6">
            <div>
              <h2 className="text-lg font-semibold">Seleccione un comercio</h2>
              <p className="text-sm text-muted-foreground">
                Puede cambiar el comercio activo para editar sus datos.
              </p>
            </div>
            <Select value={comercio?.id} onValueChange={selectComercio}>
              <SelectTrigger>
                <SelectValue placeholder="Comercio" />
              </SelectTrigger>
              <SelectContent>
                {comerciosDisponibles.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.nombre_comercio}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {comercio ? (
          <ComercioForm
            initialData={comercio}
            onSubmit={handleSubmit}
            isLoading={updateComercio.isPending}
          />
        ) : comerciosDisponibles.length > 1 ? (
          <div className="rounded-lg border bg-card p-6 text-muted-foreground">
            Seleccione un comercio para editar sus datos.
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-6 text-muted-foreground">
            No hay un comercio activo vinculado a este usuario. Revise el acceso desde el panel de administrador.
          </div>
        )}
      </div>
    </div>
  );
};

export default Comercio;
