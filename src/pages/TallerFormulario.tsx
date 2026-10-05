import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTaller } from '@/hooks/useTaller';
import { TallerLayout, TallerEmpty, type TallerData } from '@/components/taller/TallerUI';
import { VehiculoForm, TecnicoForm, OrdenTallerForm, ItemTallerForm } from '@/components/taller/TallerForms';

type TipoFormulario = 'vehiculo' | 'tecnico' | 'orden' | 'concepto';

export default function TallerFormulario({ tipo, editar = false }: { tipo: TipoFormulario; editar?: boolean }) {
  const data = useTaller();
  const { vehiculoId, tecnicoId, ordenId, itemId } = useParams();
  return <TallerLayout data={data}><Formulario key={`${data.comercioId}-${tipo}-${vehiculoId || tecnicoId || ordenId || ''}-${itemId || ''}-${editar}`} data={data} tipo={tipo} editar={editar} /></TallerLayout>;
}

function Formulario({ data, tipo, editar }: { data: TallerData; tipo: TipoFormulario; editar: boolean }) {
  const navigate = useNavigate();
  const { vehiculoId, tecnicoId, ordenId, itemId } = useParams();
  const vehiculo = data.vehiculos.find(row => row.id === vehiculoId);
  const tecnico = data.tecnicos.find(row => row.id === tecnicoId);
  const orden = data.ordenes.find(row => row.id === ordenId);
  const item = data.items.find(row => row.id === itemId && row.orden_id === ordenId);
  const volver = tipo === 'vehiculo' ? '/taller/vehiculos' : tipo === 'tecnico' ? '/taller/tecnicos' : ordenId ? `/taller/ordenes/${ordenId}` : '/taller/ordenes';
  const titulo = tipo === 'vehiculo' ? (editar ? 'Editar vehículo' : 'Nuevo vehículo') : tipo === 'tecnico' ? (editar ? 'Editar técnico' : 'Nuevo técnico') : tipo === 'orden' ? (editar ? 'Datos del trabajo' : 'Nueva orden de trabajo') : (editar ? 'Editar concepto' : 'Agregar concepto');
  const inexistente = editar && ((tipo === 'vehiculo' && !vehiculo) || (tipo === 'tecnico' && !tecnico) || (tipo === 'orden' && !orden) || (tipo === 'concepto' && !item));
  const protegido = orden && ((tipo === 'orden' && ['entregado', 'cancelado'].includes(orden.estado)) || (tipo === 'concepto' && (!['recibido', 'diagnostico'].includes(orden.estado) || Boolean(orden.presupuesto_id))));
  const cerrar = () => navigate(volver);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">{titulo}</h2><Button asChild variant="outline" disabled={data.isPending}><Link to={volver}><ArrowLeft className="mr-2 h-4 w-4" />Volver</Link></Button></div>
    {!data.isAdmin ? <TallerEmpty>Necesitás permisos de administrador para guardar cambios.</TallerEmpty> : inexistente || (tipo === 'concepto' && !orden) ? <TallerEmpty>El registro no existe o no está disponible en este comercio.</TallerEmpty> : protegido ? <TallerEmpty>El estado de la orden no permite modificar estos datos.</TallerEmpty> : <Card><CardContent className="p-5 md:p-6">
      {tipo === 'vehiculo' && <VehiculoForm data={data} vehiculo={vehiculo} onClose={cerrar} />}
      {tipo === 'tecnico' && <TecnicoForm data={data} tecnico={tecnico} onClose={cerrar} />}
      {tipo === 'orden' && <OrdenTallerForm data={data} orden={orden} onClose={cerrar} onCreated={id => navigate(`/taller/ordenes/${id}`, { replace: true })} />}
      {tipo === 'concepto' && orden && <ItemTallerForm data={data} orden={orden} item={item} onClose={cerrar} />}
    </CardContent></Card>}
  </div>;
}
