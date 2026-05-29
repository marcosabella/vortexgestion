import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, SlidersHorizontal } from "lucide-react";
import { useAdminComercioParametrizacion, useAdminComercios, useIsAppAdmin } from "@/hooks/useAdminComercios";
import {
  ComercioParametrizacion,
  FUNCIONES_SISTEMA,
  MODULOS_SISTEMA,
  normalizeParametrizacion,
} from "@/config/parametrizacion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

function updateParam<TGroup extends keyof ComercioParametrizacion>(
  current: ComercioParametrizacion,
  group: TGroup,
  key: keyof ComercioParametrizacion[TGroup],
  value: boolean,
) {
  return {
    ...current,
    [group]: {
      ...current[group],
      [key]: value,
    },
  };
}

export default function AdminComercioParametrizacion() {
  const { comercioId } = useParams();
  const { data: isAdmin, isLoading: isAdminLoading } = useIsAppAdmin();
  const { comerciosQuery } = useAdminComercios();
  const { parametrizacionQuery, updateParametrizacion } = useAdminComercioParametrizacion(comercioId);
  const [draft, setDraft] = useState<ComercioParametrizacion | null>(null);

  const parametros = useMemo(
    () => normalizeParametrizacion(draft || parametrizacionQuery.data),
    [draft, parametrizacionQuery.data],
  );

  const comercio = comerciosQuery.data?.find((item) => item.id === comercioId);

  if (isAdminLoading) {
    return <div className="p-8">Cargando...</div>;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const setModulo = (key: keyof ComercioParametrizacion["modulos"], value: boolean) => {
    setDraft((current) => updateParam(normalizeParametrizacion(current || parametros), "modulos", key, value));
  };

  const setFuncion = (key: keyof ComercioParametrizacion["funciones"], value: boolean) => {
    setDraft((current) => updateParam(normalizeParametrizacion(current || parametros), "funciones", key, value));
  };

  const guardar = () => {
    updateParametrizacion.mutate(parametros, {
      onSuccess: (data: any) => setDraft(normalizeParametrizacion(data.parametros)),
    });
  };

  return (
    <div className="container mx-auto space-y-6 p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
            <Link to="/admin">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <SlidersHorizontal className="h-7 w-7" />
            Parametrizacion
          </h1>
          <p className="text-sm text-muted-foreground">
            {comerciosQuery.isLoading ? "Cargando comercio..." : comercio?.nombre_comercio || "Comercio no encontrado"}
          </p>
        </div>
        <Button variant="success" onClick={guardar} disabled={updateParametrizacion.isPending || parametrizacionQuery.isLoading}>
          <Save className="h-4 w-4" />
          {updateParametrizacion.isPending ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Modulos del sistema</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {MODULOS_SISTEMA.map((modulo) => (
              <div key={modulo.key} className="flex items-center justify-between gap-4 rounded-md border p-4">
                <div className="space-y-1">
                  <Label htmlFor={`modulo-${modulo.key}`} className="text-base">
                    {modulo.label}
                  </Label>
                  <p className="text-sm text-muted-foreground">{modulo.description}</p>
                </div>
                <Switch
                  id={`modulo-${modulo.key}`}
                  className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-red-600"
                  checked={parametros.modulos[modulo.key]}
                  onCheckedChange={(checked) => setModulo(modulo.key, checked)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Funciones habilitadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {FUNCIONES_SISTEMA.map((funcion) => (
              <div key={funcion.key} className="flex items-center justify-between gap-4 rounded-md border p-4">
                <div className="space-y-1">
                  <Label htmlFor={`funcion-${funcion.key}`} className="text-base">
                    {funcion.label}
                  </Label>
                  <p className="text-sm text-muted-foreground">{funcion.description}</p>
                </div>
                <Switch
                  id={`funcion-${funcion.key}`}
                  className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-red-600"
                  checked={parametros.funciones[funcion.key]}
                  onCheckedChange={(checked) => setFuncion(funcion.key, checked)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
