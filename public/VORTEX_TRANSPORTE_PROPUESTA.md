# VORTEX TRANSPORTE
## Propuesta de módulo para auxilio mecánico y transporte de maquinaria agrícola

Fecha: 9 de noviembre de 2026.

## Objetivo

Administrar los servicios de auxilio mecánico, remolque de vehículos y transporte de maquinaria agrícola desde la solicitud hasta el cobro, controlar la documentación de cada operación y conocer los kilómetros, gastos y mantenimientos de las unidades, integrado con Vortex Gestión.

Vortex Transporte se propone como un módulo opcional dentro de Vortex Gestión, con dos líneas de servicio:

1. **Auxilio mecánico y remolque de vehículos**, para aseguradoras, agencias y particulares.
2. **Transporte de maquinaria agrícola**, para productores, contratistas, concesionarias y otros clientes.

En esta propuesta, el remolque se agrupa dentro de auxilio mecánico. La asistencia o reparación en el lugar queda pendiente de confirmar y no se presupone incluida.

Aunque la empresa actualmente dispone de un solo camión grúa, el módulo quedará preparado para incorporar más unidades y registrar el equipo de transporte utilizado en cada servicio.

El alcance descripto es una propuesta funcional, pendiente de definir en detalle con la empresa.

## 1. Orden de servicio

Cada solicitud tendrá una ficha con:

- Número de servicio y fecha/hora de solicitud.
- Tipo de servicio: auxilio mecánico/remolque o transporte de maquinaria agrícola.
- Solicitante: aseguradora, agencia, particular, productor, contratista o empresa.
- Cliente a quien se factura.
- Número de asistencia, autorización o expediente de la aseguradora, cuando corresponda.
- Nombre y teléfono del conductor asistido.
- Vehículo o maquinaria a trasladar: patente o identificación disponible, marca, modelo y condición.
- Ubicación de retiro y destino, con enlaces para abrir el mapa.
- Motivo: avería, accidente, traslado programado u otro.
- Unidad, equipo de transporte y chofer asignados.
- Observaciones: vehículo bloqueado, sin llaves, ruedas dañadas, acceso difícil u otras condiciones.

Se separará quién solicita, quién recibe la asistencia y quién paga. Por ejemplo, la aseguradora puede contratar y pagar el servicio mientras el contacto en el lugar es el dueño del vehículo.

### Datos específicos del transporte de maquinaria agrícola

- Tipo de maquinaria: tractor, cosechadora, implemento u otro.
- Propietario o cliente responsable y contactos de carga y descarga.
- Peso y dimensiones declarados, con indicación de si están pendientes de verificar.
- Estado de la maquinaria y posibilidad de subir o bajar por sus propios medios.
- Accesorios o elementos transportados.
- Campo, establecimiento, taller o concesionaria de origen y destino.
- Ubicación precisa, referencias y condiciones de acceso.
- Fecha y horario acordados para carga y entrega.
- Equipo previsto y necesidades de carga, descarga y sujeción.
- Documentación, autorizaciones o acompañamiento que deban verificarse para el traslado, según corresponda.

Estos datos permitirán planificar el servicio. La aptitud de la unidad y las condiciones del traslado requerirán confirmación del responsable operativo.

## 2. Seguimiento del servicio

Circuito operativo propuesto:

**Solicitado → asignado → en camino → en el lugar → trasladando → finalizado.**

Para maquinaria agrícola se podrán detallar los hitos de carga y descarga. Se conservarán las fechas y horas previstas y reales.

También se podrá cancelar o registrar un servicio que no pudo realizarse, indicando el motivo y si corresponde cobrarlo.

Desde el celular, el chofer podrá actualizar el estado, cargar fotos del vehículo o maquinaria al retirarlo y entregarlo, registrar novedades y obtener una firma o constancia de recepción.

## 3. Kilómetros y tarifas

Se registrarán por separado:

- Kilómetros de salida y regreso de la grúa.
- Kilómetros de aproximación al vehículo o maquinaria.
- Kilómetros del traslado.
- Kilómetros de retorno.
- Kilómetros facturables según el acuerdo.

Los kilómetros reales del camión y los que se cobran pueden ser distintos. Esta separación permitirá facturar correctamente y calcular costos y mantenimientos.

Cada lectura de kilometraje conservará fecha, responsable y origen. Las correcciones deberán quedar registradas para preservar el historial.

Las tarifas podrán contemplar:

| Concepto | Modalidad posible |
| --- | --- |
| Salida o servicio mínimo | Importe fijo |
| Kilómetros incluidos | Base con determinada distancia incluida |
| Kilómetros adicionales | Precio por kilómetro excedente |
| Espera | Importe por hora o fracción |
| Rescate o maniobra especial | Adicional acordado |
| Transporte de maquinaria agrícola | Importe por viaje, kilómetro o presupuesto acordado |
| Carga y descarga | Incluidas o como adicionales acordados |
| Horario nocturno o feriado | Recargo configurable |
| Peajes | Incluidos o cobrados aparte |

Cada aseguradora o agencia podrá tener su convenio con vigencia. El servicio conservará la tarifa aplicada aunque posteriormente se actualicen los precios.

Para transporte de maquinaria agrícola se podrá preparar un presupuesto en Vortex Gestión y vincularlo al servicio al ser aceptado. Se conservarán el importe acordado, sus condiciones y los adicionales autorizados.

## 4. Clientes, liquidación y facturación

Se reutilizarán los clientes de Vortex Gestión y se agregarán los datos operativos del convenio.

Para aseguradoras o agencias se incorporará una bandeja de servicios pendientes de presentar y facturar, con filtros por empresa, período y estado:

- Pendiente de documentación.
- Pendiente de conformidad o autorización.
- Listo para facturar.
- Facturado.
- Observado o rechazado.

Esto permitirá reunir los servicios del mes, preparar una liquidación con su detalle y generar la venta correspondiente en Gestión. Cada servicio quedará vinculado al comprobante para evitar duplicaciones.

Para particulares, el circuito será: **servicio → venta/factura → cobro**, utilizando caja y medios de pago de Gestión.

Para productores, contratistas, concesionarias y otros clientes de transporte agrícola, se contemplará el circuito **presupuesto cuando corresponda → servicio → conformidad de entrega → venta/factura → cobro**. Se podrá facturar por traslado o agrupar servicios compatibles del mismo cliente, conservando el detalle de cada operación.

La emisión fiscal utilizará la integración existente cuando esté habilitada y configurada. El estado operativo del servicio se mantendrá separado del estado de facturación y cobro.

## 5. Gastos y mantenimiento de las unidades y equipos

Los gastos se registrarán una sola vez en Gestión, vinculados al camión y, cuando corresponda, al servicio:

- Combustible, incluyendo litros, importe y kilometraje.
- Peajes.
- Viáticos.
- Reparaciones.
- Neumáticos.
- Seguros.
- Mantenimiento del equipo de grúa.

Se distinguirán el gasto registrado, la obligación pendiente de pago y el pago realizado. Cargar una reparación no implicará automáticamente una salida de caja.

Además del mantenimiento del motor y chasis, se contemplará el equipo de auxilio: sistema hidráulico, malacate, cables, plataforma y elementos de sujeción.

Si se utilizan tráileres, acoplados u otros equipos para maquinaria agrícola, tendrán identificación e historial propios, con planes de mantenimiento según el equipo. La maquinaria del cliente se registrará como carga transportada, separada de la flota propia y de sus mantenimientos.

Los planes podrán vencer por fecha, kilómetros o, si el equipo dispone de ese dato, horas de uso. Cuando se combinen criterios, se considerará el que ocurra primero.

Cada mantenimiento podrá incluir tareas, fecha programada, kilometraje, taller o proveedor, presupuesto, costo real, comprobantes y próxima intervención.

Se mostrarán avisos próximos y vencidos, junto con el historial de trabajos y costos. Los márgenes de aviso serán configurables. Las alertas por kilómetros dependerán de la última lectura cargada, cuya fecha se mostrará para conocer su actualización.

## 6. Pantalla principal

El tablero priorizará:

- Servicio activo y próximos servicios.
- Servicios y resultados filtrados por auxilio/remolque o transporte de maquinaria agrícola.
- Disponibilidad del camión.
- Solicitudes pendientes de asignar.
- Servicios pendientes de documentación o facturación.
- Importes facturados y pendientes de cobro por aseguradora.
- Kilómetros y gastos del mes.
- Próximos mantenimientos y mantenimientos vencidos.

El análisis económico podrá mostrar el ingreso del servicio y sus costos directos registrados. Un resultado completo que incluya distribución de seguros, sueldos y otros costos fijos requerirá definir los criterios de asignación.

## 7. Integración y acceso

- Habilitación como módulo opcional mediante la parametrización de Vortex Gestión.
- Reutilización de clientes, proveedores, ventas, cuenta corriente, caja y gastos existentes.
- Entidades propias para unidades, equipos de transporte, choferes, servicios, cargas transportadas, lecturas y planes de mantenimiento.
- Operación responsive desde celular y escritorio.
- Acceso del chofer a los servicios asignados y funciones operativas autorizadas.
- Administración de tarifas, facturación y pagos por usuarios habilitados.
- Separación de datos por empresa y validación de permisos y relaciones en el backend.

## 8. Primera versión propuesta

1. Camión, equipos de auxilio/transporte y choferes.
2. Órdenes de auxilio/remolque y transporte de maquinaria agrícola con estados, ubicaciones, datos de la carga y fotos.
3. Kilometraje real y facturable.
4. Tarifas por aseguradora/agencia, precios particulares y presupuestos de transporte agrícola.
5. Liquidación de servicios y vinculación con presupuestos y facturación de Gestión.
6. Gastos vinculados al camión y al servicio.
7. Mantenimiento programado y alertas internas.
8. Operación básica desde el celular.

Esta versión deberá cubrir el circuito completo: **recibir solicitud → presupuestar cuando corresponda → asignar → realizar auxilio o traslado → registrar kilómetros y gastos → completar documentación → facturar → cobrar**.

## 9. Ampliaciones posteriores

- GPS en vivo o integración con telemetría.
- Recepción automática de pedidos de aseguradoras, según las posibilidades de integración de cada empresa.
- Notificaciones externas por correo o WhatsApp.
- Planificación avanzada y detección de superposiciones de servicios.
- Portal de consulta para clientes o aseguradoras.
- Operación sin conexión con sincronización posterior.

Los avisos externos automáticos requerirán un proceso programado en el servidor para funcionar aunque nadie tenga abierto el sistema.

## 10. Definiciones pendientes para presupuestar

- Cómo se reciben hoy los pedidos: WhatsApp, teléfono, planilla o portal de la aseguradora.
- Si se factura cada auxilio o una liquidación periódica de varios servicios.
- Cómo calcula cada convenio la salida, los kilómetros incluidos, el retorno y los adicionales.
- Qué autorizaciones, fotos y constancias exige cada aseguradora.
- Si un servicio puede tener una parte a cargo de la aseguradora y otra a cargo del particular.
- Quién registra los servicios y qué acciones realizará el chofer desde el celular.
- Si el auxilio mecánico incluye asistencia o reparación en el lugar, además del remolque.
- Qué maquinaria agrícola se transporta y con qué unidades o equipos propios o contratados.
- Cómo se presupuestan los traslados agrícolas y qué conceptos incluyen carga, descarga, espera y retorno.
- Qué información y documentación se verifica antes de confirmar cada transporte de maquinaria.

Con estas definiciones se podrá cerrar el alcance presupuestable, los entregables y los criterios de aceptación.
