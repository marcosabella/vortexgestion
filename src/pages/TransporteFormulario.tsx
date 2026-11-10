import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TransporteForm } from '@/components/transporte/TransporteForm';
import { camposTransporte } from '@/components/transporte/transporteCampos';
import { transporteFormularios, type TransporteFormularioVista } from '@/config/transporteNavigation';
import type { useTransporte } from '@/hooks/useTransporte';
import type { TransporteDatos } from '@/types/transporte';

export function TransporteFormulario({ query, datos, vista, id }: {
  query: ReturnType<typeof useTransporte>;
  datos: TransporteDatos;
  vista: TransporteFormularioVista;
  id?: string;
}) {
  const navigate = useNavigate();
  const config = transporteFormularios[vista];
  const actual = datos[vista].find(row => row.id === id);
  // Conserva la versión que corresponde a los datos abiertos en el formulario.
  const [valores] = useState(actual);
  const volver = () => navigate(`/transporte/${vista}`);
  const protegido = actual && (
    ('presupuesto_id' in actual && (actual.presupuesto_id || actual.venta_id || ['cancelado', 'no_realizado'].includes(actual.estado)))
    || (vista === 'mantenimientos' && 'estado' in actual && actual.estado === 'realizado')
  );
  const error = !datos.admin ? 'Esta sección requiere acceso de administración.'
    : datos.permisos && !(id ? datos.permisos.editar : datos.permisos.crear) ? 'No tenés permiso para guardar cambios en esta sección.'
    : id && (!actual || !valores || !config.editable) ? 'El registro no existe o no está disponible para editar en este comercio.'
      : protegido ? 'El registro ya tiene documentación vinculada o está realizado y no permite modificar estos datos.' : null;

  return <div className="mx-auto w-full max-w-5xl space-y-6 p-3 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">{id ? 'Editar' : 'Nuevo'} {config.titulo}</h1><p className="text-muted-foreground">Vortex Transporte · {query.comercio?.nombre_comercio}</p></div>
      <Button variant="outline" disabled={query.isPending} onClick={volver}><ArrowLeft className="mr-2 h-4 w-4" />Volver</Button>
    </header>
    {error ? <p role="alert">{error}</p> : <Card><CardContent className="space-y-5 p-4 sm:p-6">
      <p className="text-sm text-muted-foreground">Datos del comercio activo. Los gastos se registran pendientes y su pago se administra en Gestión.</p>
      <TransporteForm campos={camposTransporte(config.accion, datos, Boolean(id))} valores={valores} pending={query.isPending} cancelar={volver} guardar={async datosFormulario => {
        await query.run({ accion: config.accion, id, version: valores && 'version' in valores ? valores.version : undefined, datos: datosFormulario });
        navigate(`/transporte/${vista}`, { replace: true });
      }} />
    </CardContent></Card>}
  </div>;
}
