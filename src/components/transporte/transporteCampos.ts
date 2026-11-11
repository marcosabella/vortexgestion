import type { TransporteDatos } from '@/types/transporte';

export type TransporteCampo = { key: string; label: string; type?: string; required?: boolean; min?: number; options?: { value: string; label: string }[]; initial?: string | number; help?: string };
const opc = (value: string, label: string) => ({ value, label });
const fechaHoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function camposTransporte(accion: string, datos: TransporteDatos, editar = false): TransporteCampo[] {
  const unidades = datos.unidades.map(u => opc(u.id, `${u.patente} · ${u.nombre}${!u.activo ? ' (inactiva)' : ''}`));
  const clientes = datos.clientes.map(c => opc(c.id, `${c.nombre} ${c.apellido || ''}`));
  const proveedores = datos.proveedores.map(p => opc(p.id, p.razon_social || `${p.nombre} ${p.apellido || ''}`));
  const unidad: TransporteCampo = { key: 'unidad_id', label: 'Unidad', required: true, options: unidades };
  const cliente: TransporteCampo = { key: 'cliente_id', label: 'Cliente a facturar', required: true, options: clientes };
  const tipo: TransporteCampo = { key: 'tipo', label: 'Tipo de servicio', required: true, initial: 'auxilio', options: [opc('auxilio', 'Auxilio mecánico / remolque'), opc('maquinaria', 'Transporte de maquinaria agrícola')] };
  const activo: TransporteCampo = { key: 'activo', label: 'Activo', initial: 'true', options: [opc('true', 'Sí'), opc('false', 'No')] };
  const numero = (key: string, label: string, initial: number | undefined = 0): TransporteCampo => ({ key, label, type: 'number', min: 0, initial });
  const opcional = (key: string, label: string): TransporteCampo => ({ key, label, type: 'number', min: 0 });
  const textos: Record<string, string> = {
    identificacion: 'Patente / identificación de la carga', marca_modelo: 'Marca y modelo de vehículo / maquinaria', condicion: 'Condición de la carga y movilidad',
    propietario: 'Propietario / responsable', contacto_descarga: 'Contacto y teléfono de descarga', peso: 'Peso declarado (kg)', dimensiones: 'Dimensiones declaradas (largo, ancho y alto)',
    verificacion: 'Datos pendientes de verificar', accesorios: 'Accesorios transportados', acceso: 'Referencias y condiciones de acceso', maniobras: 'Necesidades de carga, descarga y sujeción', documentacion: 'Documentación / autorizaciones', constancia: 'Conformidad y receptor de entrega',
  };
  if (accion === 'unidad') return [
    { key: 'nombre', label: 'Nombre / número interno', required: true }, { key: 'patente', label: 'Patente o código de equipo', required: true },
    { key: 'tipo', label: 'Tipo de unidad', required: true, initial: 'grua', options: ['camion', 'grua', 'acoplado', 'trailer', 'equipo'].map(v => opc(v, v)) },
    { key: 'marca', label: 'Marca' }, { key: 'modelo', label: 'Modelo' },
    ...(!editar ? [numero('kilometraje', 'Kilometraje inicial'), numero('horas', 'Horas iniciales')] : []),
    { key: 'estado', label: 'Disponibilidad', required: true, initial: 'disponible', options: [opc('disponible', 'Disponible'), opc('mantenimiento', 'En mantenimiento'), opc('fuera_servicio', 'Fuera de servicio')] }, activo,
    { key: 'observaciones', label: 'Observaciones', type: 'textarea' },
  ];
  if (accion === 'chofer') return [{ key: 'nombre', label: 'Nombre', required: true }, { key: 'telefono', label: 'Teléfono' }, { key: 'user_id', label: 'Usuario del comercio', options: datos.usuarios.map(u => opc(u.user_id, u.nombre && u.email ? `${u.nombre} · ${u.email}` : u.email || `${u.rol} · ${u.user_id}`)), help: 'Creá la cuenta en Configuración → Usuarios y permisos con acceso a Transporte. Luego vinculala al chofer para que pueda operar sus servicios asignados.' }, activo];
  if (accion === 'tarifa') return [{ key: 'nombre', label: 'Nombre del convenio', required: true }, { ...cliente, required: false, help: 'Vacío: tarifa general para cualquier cliente.' }, tipo,
    numero('base', 'Salida / importe base, IVA incluido'), numero('km_incluidos', 'Kilómetros incluidos'), numero('precio_km', 'Precio por km adicional, IVA incluido'), numero('precio_hora', 'Precio por hora de espera, IVA incluido'),
    { key: 'iva', label: 'IVA (%)', initial: 21, options: [0, 10.5, 21, 27].map(v => opc(String(v), String(v))) },
    { key: 'vigente_desde', label: 'Vigente desde', type: 'date', required: true, initial: fechaHoy() }, { key: 'vigente_hasta', label: 'Vigente hasta', type: 'date' }, activo];
  if (accion === 'servicio') return [tipo, cliente, { key: 'solicitante', label: 'Quién solicita / aseguradora / agencia' }, { key: 'expediente', label: 'Asistencia / autorización / expediente' },
    { key: 'contacto', label: 'Contacto asistido / carga' }, { key: 'telefono', label: 'Teléfono', type: 'tel' }, { key: 'programado_at', label: 'Fecha y hora acordadas', type: 'datetime-local' },
    { key: 'origen', label: 'Ubicación de retiro', required: true }, { key: 'destino', label: 'Destino', required: true }, { key: 'carga', label: 'Vehículo o maquinaria a trasladar', required: true },
    { ...unidad, required: false }, { key: 'equipo_id', label: 'Equipo / acoplado', options: unidades, help: 'Opcional: elegí otro equipo o acoplado distinto de la unidad principal. Si no llevás uno adicional, dejalo sin seleccionar.' }, { key: 'chofer_id', label: 'Chofer', options: datos.choferes.map(ch => opc(ch.id, `${ch.nombre}${!ch.activo ? ' (inactivo)' : ''}`)) },
    { key: 'tarifa_id', label: 'Tarifa / convenio', options: datos.tarifas.map(t => opc(t.id, t.nombre)), help: 'Se valida cliente, tipo y vigencia. La tarifa aplicada queda guardada en el servicio.' },
    opcional('precio_manual', 'Precio acordado, IVA incluido (reemplaza base y km)'), numero('km_facturables', 'Kilómetros facturables'), numero('horas_espera', 'Horas de espera facturables'), numero('adicionales', 'Adicionales, IVA incluido'),
    { key: 'iva', label: 'IVA para precio manual (%)', initial: 21, options: [0, 10.5, 21, 27].map(v => opc(String(v), String(v))) },
    ...Object.entries(textos).map(([key, label]) => ({ key: `detalle_${key}`, label })), { key: 'observaciones', label: 'Observaciones', type: 'textarea' },
  ];
  if (accion === 'lectura') return [unidad, numero('kilometraje', 'Lectura de odómetro'), numero('horas', 'Horas de uso'), { key: 'motivo', label: 'Origen / motivo de la lectura', required: true, help: 'Las lecturas son históricas. No se permite retroceder el odómetro o las horas.' }];
  if (accion === 'plan') return [unidad, { key: 'nombre', label: 'Tarea / plan', required: true }, opcional('intervalo_km', 'Repetir cada km'), opcional('proximo_km', 'Próximo vencimiento en km'),
    opcional('intervalo_dias', 'Repetir cada días'), { key: 'proxima_fecha', label: 'Próximo vencimiento por fecha', type: 'date' }, opcional('intervalo_horas', 'Repetir cada horas'), opcional('proximas_horas', 'Próximo vencimiento en horas'),
    numero('aviso_km', 'Avisar km antes', 1000), numero('aviso_dias', 'Avisar días antes', 15), numero('aviso_horas', 'Avisar horas antes', 10), activo];
  if (accion === 'gasto') return [unidad, { key: 'servicio_id', label: 'Servicio (opcional)', options: datos.servicios.map(s => opc(s.id, `#${s.numero} · ${s.carga}`)) },
    { key: 'fecha', label: 'Fecha', type: 'date', initial: fechaHoy(), required: true }, { key: 'categoria', label: 'Categoría', initial: 'Combustible', required: true, options: ['Combustible', 'Peajes', 'Viáticos', 'Mantenimiento', 'Repuestos', 'Seguros', 'Otros'].map(v => opc(v, v)) },
    { key: 'concepto', label: 'Concepto', required: true }, { key: 'proveedor_id', label: 'Proveedor', options: proveedores }, { ...numero('monto', 'Importe'), required: true, min: 0.01 },
    opcional('litros', 'Litros de combustible'), opcional('kilometraje', 'Kilometraje de la carga'), { key: 'numero_comprobante', label: 'Número de comprobante' }];
  if (accion === 'mantenimiento') return [unidad, { key: 'plan_id', label: 'Plan asociado', options: datos.planes.map(p => opc(p.id, `${datos.unidades.find(u => u.id === p.unidad_id)?.patente} · ${p.nombre}`)) },
    { key: 'programado_para', label: 'Fecha programada', type: 'date' }, { key: 'fecha', label: 'Fecha de intervención', type: 'date', required: true, initial: fechaHoy() },
    { key: 'estado', label: 'Estado', initial: 'programado', required: true, options: [opc('programado', 'Programado'), opc('realizado', 'Realizado')] }, { key: 'tareas', label: 'Tareas / trabajo realizado', required: true, type: 'textarea' },
    numero('kilometraje', 'Kilometraje'), numero('horas', 'Horas de uso'), { key: 'proveedor_id', label: 'Taller / proveedor', options: proveedores }, numero('presupuesto', 'Presupuesto estimado'),
    { key: 'gasto_id', label: 'Gasto registrado (costo real)', options: datos.gastos.map(g => opc(g.gasto_id, `${g.gasto?.concepto} · $${g.gasto?.monto}`)), help: 'Registrá primero el gasto en Transporte. El pago se administra desde Gastos y egresos.' }];
  return [];
}
