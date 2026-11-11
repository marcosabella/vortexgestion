import type { TransporteDatos } from '@/types/transporte';
import type { TransporteFormularioVista } from '@/config/transporteNavigation';

export function transporteResponsable(id: string | null | undefined, d: TransporteDatos): string {
  if (!id) return 'Sin responsable';
  const usuario = d.usuarios.find(u => u.user_id === id);
  return usuario?.nombre?.trim() || usuario?.email?.trim() || 'Usuario no disponible';
}

// Orienta la interfaz; PostgreSQL vuelve a validar estado, vínculos y permisos.
export function motivoNoEliminarTransporte(vista: TransporteFormularioVista, id: string, d: TransporteDatos): string | null {
  const vinculado = 'Tiene registros vinculados. Podés desactivarlo desde Editar.';
  if (!d[vista].some(r => r.id === id)) return 'El registro ya no está disponible.';
  if (vista === 'lecturas') return 'Las lecturas son históricas y no se eliminan para conservar el odómetro y las horas.';
  if (vista === 'gastos') return 'La eliminación y los pagos se administran desde Gastos y egresos en Gestión.';
  if (vista === 'unidades' && d.lecturas.filter(l => l.unidad_id === id).length > 1) return vinculado;
  if (vista === 'unidades' && (d.servicios.some(s => s.unidad_id === id || s.equipo_id === id) || d.planes.some(p => p.unidad_id === id) || d.mantenimientos.some(m => m.unidad_id === id) || d.gastos.some(g => g.unidad_id === id) || d.lecturas.some(l => l.unidad_id === id && (l.servicio_id || l.motivo !== 'Alta de unidad')))) return vinculado;
  if (vista === 'choferes' && d.servicios.some(s => s.chofer_id === id)) return vinculado;
  if (vista === 'tarifas' && d.servicios.some(s => s.tarifa_id === id)) return vinculado;
  if (vista === 'planes' && d.mantenimientos.some(m => m.plan_id === id)) return vinculado;
  if (vista === 'servicios') {
    const s = d.servicios.find(s => s.id === id)!;
    if (s.estado !== 'solicitado' || s.presupuesto_id || s.venta_id || s.km_salida != null || d.adjuntos.some(a => a.servicio_id === id) || d.lecturas.some(l => l.servicio_id === id) || d.gastos.some(g => g.servicio_id === id) || d.eventos.some(e => e.servicio_id === id && e.estado !== 'solicitado')) return 'Solo se eliminan solicitudes sin actividad ni documentación vinculada. Usá el seguimiento para cancelar el servicio.';
  }
  if (vista === 'mantenimientos') {
    const m = d.mantenimientos.find(m => m.id === id)!;
    if (m.estado !== 'programado' || m.gasto_id) return 'Solo se eliminan mantenimientos programados sin gasto vinculado.';
  }
  return null;
}
