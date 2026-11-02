# Propuesta: Vortex Gym

Fecha: 29 de octubre de 2026.

Estado: propuesta inicial guardada para retomar. No implica autorización para implementar, ejecutar migraciones ni desplegar cambios.

## Objetivo

Crear un módulo opcional dentro de Vortex Gestión para administrar socios, cuotas, ingresos y clases de un gimnasio, aprovechando clientes, caja, comprobantes y cuenta corriente existentes.

Prioridades del negocio:

- Cobrar a tiempo.
- Resolver rápido la atención en recepción.
- Detectar socios que están dejando de asistir.

## 1. Socios y ficha individual

Cada socio tendría:

- Datos personales, foto, teléfono y contacto de emergencia.
- Fecha de alta, actividad y profesor asignado.
- Plan contratado, vigencia, pagos y deuda.
- Historial de asistencias.
- Estado: activo, suspendido o dado de baja.
- Registro de presentación y vencimiento de apto físico, cuando corresponda.

El socio se vincularía a un cliente de Vortex. Los datos específicos del gimnasio se guardarían en entidades propias, conservando una sola cuenta corriente y evitando duplicar clientes.

## 2. Planes, membresías y cuotas

Modalidades propuestas:

| Modalidad | Ejemplo |
| --- | --- |
| Pase libre | Musculación sin límite de visitas |
| Frecuencia semanal | Funcional tres veces por semana |
| Abono por clases | Pack de ocho clases con vencimiento |
| Pase diario | Acceso por un día |
| Plan combinado | Musculación más clases grupales |
| Plan familiar o convenio | Condiciones especiales para un grupo |

Contemplar inscripción, descuentos, vencimientos y congelamiento temporal del abono.

Regla central: separar la vigencia del abono de la deuda. Un socio puede tener un plan vigente con saldo pendiente; otro puede no deber nada y tener el abono vencido. El gimnasio configuraría cómo afecta cada situación al ingreso.

Permitir cobro por mes calendario o por períodos desde la inscripción. Aplicar aumentos a futuras renovaciones conservando las condiciones ya contratadas.

## 3. Recepción y control de ingreso

Pantalla principal para el trabajo diario, con pocos botones, buscador grande y uso cómodo desde celular o tablet.

Búsqueda por nombre, DNI o lectura de credencial QR. Mostrar:

- Foto y nombre.
- Plan y fecha de vencimiento.
- Clases o accesos disponibles.
- Deuda y observaciones autorizadas.
- Resultado: habilitado, con advertencia o requiere autorización.

Desde recepción se podría registrar el ingreso, cobrar o renovar. Las excepciones quedarían registradas con usuario y motivo.

Para packs, definir cuándo se descuenta una clase y evitar descuentos duplicados al registrar dos veces un mismo ingreso.

## 4. Cobranza integrada con Vortex

Cada cuota tendría período, importe, vencimiento y estado de pago. Los cobros utilizarían el circuito existente de caja, comprobantes y cuenta corriente.

Funciones propuestas:

- Pagos completos, parciales y anticipados.
- Distintos medios de pago.
- Renovación desde la ficha o recepción.
- Listado de cuotas próximas a vencer y vencidas.
- Acceso para preparar un aviso por WhatsApp.
- Historial de descuentos, anulaciones y ajustes.

Renovar un abono, generar una cuota y registrar un cobro serían acciones relacionadas pero diferenciadas para evitar deudas o ingresos duplicados.

## 5. Clases, horarios y profesores

Para funcional, spinning, pilates y otras actividades:

- Grilla semanal por actividad, sala y profesor.
- Capacidad máxima por clase.
- Reservas puntuales o recurrentes.
- Lista de espera.
- Cancelaciones y registro de ausencias.
- Validación de que el plan incluya la actividad.

El módulo debería servir tanto para musculación como para gimnasios que trabajan principalmente con turnos y cupos.

## 6. Seguimiento y tablero del dueño

| Indicador | Utilidad |
| --- | --- |
| Socios con abono vigente | Conocer la base activa |
| Cuotas por vencer y deuda vencida | Organizar la cobranza |
| Altas, renovaciones y bajas | Ver la evolución del gimnasio |
| Socios sin asistir hace varios días | Detectar posibles abandonos |
| Asistencia por horario | Ajustar horarios y personal |
| Ocupación de clases | Revisar cupos y actividades |
| Cobrado y pendiente del período | Controlar los ingresos |

Como ampliación, incorporar rutinas y seguimiento del entrenamiento, con acceso restringido a la información personal necesaria para cada profesor.

## Etapas propuestas

| Etapa | Alcance |
| --- | --- |
| Primera: operación diaria | Socios, planes, abonos, cuotas, cobros, recepción, asistencias y tablero básico |
| Segunda: actividades | Profesores, horarios, clases, reservas, cupos y lista de espera |
| Tercera: autogestión | Portal del socio para consultar vigencia, reservar y acceder a su credencial |
| Ampliaciones | Rutinas, comunicaciones automáticas e integración con dispositivos de acceso |

## Integración y arquitectura

- Habilitar Vortex Gym mediante la parametrización modular existente o una extensión compatible.
- Reutilizar clientes, caja, ventas/comprobantes y cuenta corriente según corresponda.
- Crear entidades propias para los conceptos del gimnasio sin sobrecargar las tablas generales.
- Incorporar permisos para administración, recepción y profesores.
- Mantener separación por comercio, con `comercio_id`, índices, RLS y validaciones de relaciones y permisos en el backend.
- Diseñar una interfaz responsive para escritorio, celular y tablet.
- Conservar compatibilidad con los módulos existentes.

## Punto de partida al retomar

La primera versión propuesta debe permitir completar el circuito:

**Alta del socio → contratación del plan → cobro → ingreso → renovación.**

Antes de implementar, concretar las reglas de vigencia, deuda y acceso; el momento de consumo de clases; las condiciones de congelamiento y renovación; y la integración de cuotas y cobros con el circuito administrativo existente.

Este documento conserva una propuesta para evaluación. Las funcionalidades descritas no están implementadas ni validadas funcionalmente.
