import { MODULOS_SISTEMA, type ModuloSistema } from '@/config/parametrizacion';

export const accionesUsuario = { consultar: 'Consultar', crear: 'Crear', editar: 'Editar', eliminar: 'Eliminar', cobrar: 'Cobrar / pagar', anular: 'Anular', operar: 'Operar', administrar: 'Administrar módulo', facturar: 'Facturar' } as const;
export type AccionUsuario = keyof typeof accionesUsuario;
export type PermisosUsuario = Partial<Record<ModuloSistema, AccionUsuario[]>>;
export const catalogoPermisos: Partial<Record<ModuloSistema, AccionUsuario[]>> = {
  clientes: ['consultar','crear','editar','eliminar'], proveedores: ['consultar','crear','editar','eliminar'], productos: ['consultar','crear','editar','eliminar'],
  ventas: ['consultar','crear','editar','eliminar','anular','facturar'], presupuestos: ['consultar','crear','editar','eliminar'], compras: ['consultar','crear','editar','eliminar','cobrar'],
  cuenta_corriente: ['consultar','crear','editar','eliminar','cobrar'], caja: ['consultar','crear','editar','eliminar'], gastos_egresos: ['consultar','crear','editar','eliminar','cobrar'],
  cheques: ['consultar','crear','editar','eliminar'], bancos: ['consultar'], tarjetas: ['consultar'], listados: ['consultar'], utilidades: ['consultar'],
  transporte: ['consultar','crear','editar','operar','administrar','facturar'], restaurante: ['consultar','operar'],
  campo: ['consultar','operar','administrar'], apicola: ['consultar','administrar'], taller: ['consultar','administrar'], distribucion: ['consultar','administrar'], extintores: ['consultar','administrar'], pedidos_online: ['consultar','administrar'],
};
export const modulosConPermisos = MODULOS_SISTEMA.filter(m => catalogoPermisos[m.key]);
export const perfilesUsuario: { id: string; nombre: string; permisos: PermisosUsuario }[] = [
  { id: 'personalizado', nombre: 'Permisos personalizados', permisos: {} },
  { id: 'vendedor', nombre: 'Vendedor', permisos: { clientes:['consultar','crear','editar'],productos:['consultar'],ventas:['consultar','crear'],presupuestos:['consultar','crear','editar'],bancos:['consultar'],tarjetas:['consultar'] } },
  { id: 'cajero', nombre: 'Cajero', permisos: { clientes:['consultar'],ventas:['consultar'],cuenta_corriente:['consultar','cobrar'],caja:['consultar','crear','editar'],cheques:['consultar'],bancos:['consultar'],tarjetas:['consultar'] } },
  { id: 'compras', nombre: 'Compras y stock', permisos: { proveedores:['consultar','crear','editar'],compras:['consultar','crear','editar'],productos:['consultar','crear','editar'],bancos:['consultar'],tarjetas:['consultar'] } },
  { id: 'consulta', nombre: 'Consulta de Gestión', permisos: Object.fromEntries(['clientes','proveedores','productos','ventas','presupuestos','compras','cuenta_corriente','caja','cheques','gastos_egresos','listados'].map(m => [m,['consultar']])) },
  { id: 'chofer', nombre: 'Chofer de Transporte', permisos: { transporte:['consultar','operar'] } },
  { id: 'coordinador_transporte', nombre: 'Coordinador de Transporte', permisos: { transporte:['consultar','crear','editar','operar','administrar'],clientes:['consultar'],proveedores:['consultar'] } },
  { id: 'operario_campo', nombre: 'Operario de Campo', permisos: { campo:['consultar','operar'] } },
];
export type AccesoComercio = { admin: boolean; configurado: boolean; activo: boolean; solo_restaurante: boolean; permisos: PermisosUsuario; nombre: string; perfil: string };
export function tienePermiso(acceso: AccesoComercio | null | undefined, modulo: string, accion: AccionUsuario = 'consultar') {
  if (!acceso?.activo) return false;
  if (acceso.admin || !acceso.configurado) return true;
  return Boolean(acceso.permisos[modulo as ModuloSistema]?.includes(accion));
}
export function recursoRuta(path: string): { modulo: string; accion: AccionUsuario } | null {
  const partes = path.split('/').filter(Boolean);
  const principal = partes[0] || '';
  const modulo = principal === 'cuenta-corriente' ? 'cuenta_corriente' : principal === 'gastos-egresos' ? 'gastos_egresos' : principal === 'pedidos-online' ? 'pedidos_online' : principal === 'caja' ? 'caja'
    : principal === 'compras' ? 'compras' : principal === 'listados' ? ({ 'cuenta-corriente':'cuenta_corriente',caja:'caja','gastos-egresos':'gastos_egresos' }[partes[1]] || partes[1] || 'listados')
      : principal === 'tarjetas' ? 'tarjetas' : principal === 'tienda-online' ? 'pedidos_online' : principal === 'mercado-pago' ? 'mercado_pago' : principal;
  if (!principal || ['seguridad','notificaciones','sin-acceso'].includes(principal)) return null;
  const accion = partes.includes('nuevo') || partes.includes('nueva') ? 'crear' : partes.includes('editar') ? 'editar' : 'consultar';
  return { modulo, accion };
}
export function puedeAbrirRuta(acceso: AccesoComercio | null | undefined, path: string) {
  if (!acceso?.activo) return false;
  if (path.startsWith('/usuarios')) return acceso.admin;
  if (acceso.admin || !acceso.configurado) return true;
  const recurso = recursoRuta(path);
  if (!recurso) return true;
  if (['campo','apicola','taller','distribucion','extintores','pedidos_online'].includes(recurso.modulo) && recurso.accion !== 'consultar') return tienePermiso(acceso,recurso.modulo,'administrar');
  if (recurso.modulo === 'transporte' && !acceso.permisos.transporte?.includes('administrar') && !['/transporte/resumen','/transporte/servicios'].includes(path)) return false;
  if (path === '/transporte/liquidacion' && !tienePermiso(acceso,'transporte','facturar')) return false;
  return tienePermiso(acceso,recurso.modulo,recurso.accion);
}
export function inicioUsuario(acceso: AccesoComercio, modulos: Record<ModuloSistema, boolean>) {
  if (acceso.admin || !acceso.configurado) return '/caja';
  if (modulos.transporte && acceso.permisos.transporte?.includes('consultar')) return '/transporte/resumen';
  if (modulos.restaurante && acceso.permisos.restaurante?.includes('consultar')) return '/restaurante/resumen';
  for (const m of modulosConPermisos) if (modulos[m.key] && tienePermiso(acceso,m.key)) return '/' + ({cuenta_corriente:'cuenta-corriente',gastos_egresos:'gastos-egresos',pedidos_online:'pedidos-online',listados:'listados/clientes',campo:'campo/establecimientos'}[m.key] || m.key);
  return '/sin-acceso';
}
