import { camposTransporte, type TransporteCampo } from './transporteCampos';
import { transporteResponsable } from '@/utils/transporteAcciones';
import { transporteFormularios, type TransporteFormularioVista } from '@/config/transporteNavigation';
import type { TransporteDatos } from '@/types/transporte';

export function TransporteRegistroDetalle({ vista, id, datos }: { vista: TransporteFormularioVista; id: string; datos: TransporteDatos }) {
  const registro = datos[vista].find(r => r.id === id);
  if (!registro) return <p role="alert">El registro ya no está disponible en este comercio.</p>;
  const valores: Record<string, unknown> = { ...registro, ...('gasto' in registro ? registro.gasto : {}) };
  const campos = camposTransporte(transporteFormularios[vista].accion, datos);
  const adicionales: TransporteCampo[] = [
    ...(!campos.some(c => c.key === 'created_at') && 'created_at' in registro ? [{ key: 'created_at', label: 'Fecha de registro', type: 'datetime-local' }] : []),
    ...(vista === 'unidades' ? [{ key: 'kilometraje', label: 'Kilometraje actual' }, { key: 'horas', label: 'Horas actuales' }] : []),
    ...(vista === 'lecturas' ? [{ key: 'user_id', label: 'Responsable' }] : []),
    ...(vista === 'gastos' ? [{ key: 'estado', label: 'Estado del gasto' }, { key: 'medio_pago', label: 'Medio de pago' }] : []),
  ];
  return <dl className="grid gap-4 text-sm sm:grid-cols-2">
    {[...campos.filter(c => vista !== 'unidades' || !['kilometraje', 'horas'].includes(c.key)), ...adicionales].map(campo => {
      const valor = valores[campo.key];
      const opcion = campo.options?.find(o => o.value === String(valor));
      const texto = campo.key === 'user_id' ? transporteResponsable(valor == null ? null : String(valor), datos) : valor == null || valor === '' ? '—' : opcion?.label ?? (campo.type === 'date' || campo.type === 'datetime-local' ? new Date(String(valor).length === 10 ? `${valor}T12:00:00` : String(valor)).toLocaleString('es-AR', campo.type === 'date' ? { dateStyle: 'short' } : { dateStyle: 'short', timeStyle: 'short' }) : String(valor));
      return <div key={campo.key} className="min-w-0"><dt className="font-medium text-muted-foreground">{campo.label}</dt><dd className="break-words whitespace-pre-wrap">{texto}</dd></div>;
    })}
  </dl>;
}
