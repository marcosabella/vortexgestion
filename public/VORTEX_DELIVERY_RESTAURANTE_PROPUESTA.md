# Vortex Delivery / Restaurante — Propuesta y organización del avance

Fecha: 7 de octubre de 2026.

Estado: propuesta funcional para organizar el desarrollo. No representa funcionalidades implementadas ni permisos ya habilitados.

## Objetivo y alcance

Crear un módulo opcional dentro de Vortex Gestión con un circuito común para delivery, retiro en mostrador y atención en mesas. Reutilizar clientes, productos, ventas, cobros, caja y facturación. Agregar las entidades propias de gastronomía: mesas, cuentas, comandas, sectores de preparación y envíos.

El pedido comercial, la preparación, la entrega y el cobro tendrán estados independientes. Una comida puede estar preparada y todavía sin cobrar; una mesa puede tener varias comandas abiertas; un pedido puede estar pagado antes de cocinarse.

Un único módulo tendrá modalidades configurables. Un comercio de delivery podrá ocultar Salón y mesas; un restaurante podrá habilitarlo junto con delivery y retiro.

## Pantallas del submenú

| Pantalla | Función principal |
| --- | --- |
| Pedidos | Registrar delivery o retiro, consultar pedidos y seguir su avance. |
| Salón y mesas | Ver mesas disponibles, ocupadas y pendientes de cierre; abrir sus cuentas. |
| Cocina y comandas | Recibir pedidos, organizar la preparación y marcar productos listos. |
| Despacho y retiro | Revisar pedidos preparados, controlar el armado y entregar al cliente o repartidor. |
| Envíos | Asignar repartidores y registrar salida, entrega, incidencias y cobros. |
| Cuentas y cobros | Cobrar pedidos o mesas, dividir cuentas y consultar saldos. |
| Cierre y rendición | Controlar dinero recibido, rendiciones de repartidores y diferencias. |
| Configuración | Administrar mesas, sectores, carta, adicionales y parámetros del circuito. |

Cada pantalla funcionará como una bandeja de trabajo para el rol correspondiente.

## Circuito de delivery

| Paso | Responsable | Acción |
| --- | --- | --- |
| 1. Registrar pedido | Telefonista / vendedor | Elegir cliente, domicilio, productos, adicionales, horario y modalidad de pago. |
| 2. Confirmar y enviar a cocina | Telefonista | Revisar el pedido y generar las comandas correspondientes. |
| 3. Preparar | Cocinero | Aceptar la comanda, iniciar preparación y marcar cada producto listo. |
| 4. Armar el pedido | Despachante | Controlar comida, bebidas, adicionales, envases y observaciones. |
| 5. Asignar envío | Despachante | Elegir repartidor y registrar la salida. |
| 6. Entregar | Repartidor | Confirmar entrega y registrar cobro, si corresponde. |
| 7. Rendir y cerrar | Caja / encargado | Controlar los cobros y cerrar la operación. |

El registro inicial contemplará instrucciones como “sin cebolla”, “timbre roto”, costo de envío y hora prometida. Las observaciones para cocina se separarán de las instrucciones para el repartidor.

Para retiro en mostrador se utilizará el mismo circuito hasta despacho. Allí se registrará “Entregado al cliente”, sin generar un envío.

## Circuito de restaurante

La mesa tendrá una cuenta abierta que podrá recibir varias comandas.

1. El mozo selecciona la mesa y abre la cuenta, indicando cantidad de comensales.
2. Carga productos desde el celular, con cantidades, adicionales y observaciones.
3. Envía la selección a preparación: comidas a cocina y bebidas a barra, según configuración.
4. Cocina y barra preparan sus productos.
5. El mozo ve cuáles están listos y registra que fueron servidos.
6. Agrega nuevas rondas sin volver a enviar lo anterior.
7. Al finalizar, solicita la cuenta y se cobra.
8. Se cierra la cuenta y la mesa queda disponible.

Contemplar mover una cuenta de mesa, unir mesas y dividir el cobro por productos o por importes, conservando el historial de los cambios.

## Cocina y comandas

La pantalla de cocina será el centro operativo del módulo, con tarjetas grandes utilizables en una pantalla táctil.

Ejemplo de tarjeta:

> Mesa 8 · Comanda 143 · Hace 12 minutos
>
> 2 hamburguesas — una sin cebolla
>
> 1 porción de papas
>
> Aceptar → Preparar → Listo

Cada tarjeta mostrará origen, hora de ingreso, tiempo transcurrido, prioridad y observaciones. Tendrá filtros por cocina, barra u otros sectores. Un pedido quedará preparado cuando estén listos todos los productos que requiere su entrega.

Una modificación posterior generará una ampliación o corrección de comanda. Agregar dos empanadas enviará únicamente esas dos unidades, sin repetir toda la preparación. Las cancelaciones de productos ya enviados deberán avisarse a cocina y quedar registradas con responsable y motivo.

La impresión de comandas será configurable por sector. La pantalla de cocina y la impresión compartirán el mismo registro, con control de reimpresiones.

## Estados independientes

| Parte del circuito | Estados propuestos |
| --- | --- |
| Pedido | Borrador → Confirmado → En atención → Completado / Cancelado |
| Comanda | Pendiente → Aceptada → En preparación → Lista → Entregada a despacho o servida |
| Envío | Sin asignar → Asignado → En camino → Entregado / Con incidencia |
| Cobro | Pendiente → Parcial → Pagado |
| Cuenta de mesa | Abierta → Cuenta solicitada → Cerrada |

“Comida lista” no confirmará automáticamente entrega, cobro ni facturación.

## Roles previstos

| Rol | Responsabilidad |
| --- | --- |
| Mozo | Mesas, pedidos y servicio. |
| Telefonista | Delivery y retiro. |
| Cocina / barra | Sus comandas y preparación. |
| Despachante | Armado, control y salida. |
| Repartidor | Sus envíos, entregas y cobros. |
| Cajero | Cuentas, pagos y rendiciones. |
| Encargado | Correcciones, cancelaciones, configuración y supervisión. |

Una persona podrá reunir varios permisos. Los permisos se validarán en el backend por comercio y, cuando corresponda, por asignación. Ocultar botones no reemplazará estas validaciones.

Cada cambio conservará usuario y hora. Los reintentos no deberán duplicar comandas, cobros ni ventas.

## Arquitectura e integración con Vortex Gestión

- Utilizar React, TypeScript, React Query y Supabase existentes, siguiendo la arquitectura del repositorio.
- Habilitar el módulo mediante la parametrización modular existente o una extensión compatible.
- Crear entidades propias para mesas, cuentas gastronómicas, comandas, sectores y envíos; evitar duplicar el núcleo administrativo.
- Todas las tablas operativas nuevas incluirán `comercio_id`, índices, RLS y validaciones de relaciones del mismo comercio.
- Reutilizar el registro transaccional de ventas, pagos, cuenta corriente, caja y facturación, evitando registrar dos veces una misma operación.
- Actualizar las bandejas en tiempo real y recuperar su estado al reconectar. Definir cómo se informa una operación sin confirmar ante un corte de conexión.
- Diseñar la toma de pedidos y las entregas para celular y la cocina para uso táctil.
- Definir el momento del movimiento de stock y su relación con recetas e ingredientes antes de implementar consumos automáticos.

## Avance propuesto

La primera versión deberá cubrir el circuito completo de pedidos, mesas, comandas, despacho, envíos y cobros. El checklist refleja el desarrollo local. Las migraciones se aplicaron al proyecto Supabase vinculado el 7 de octubre de 2026. Quedan pendientes la publicación del frontend, la habilitación del módulo y la validación interactiva en el comercio.

### Primera versión

- [x] Definir estados, transiciones, permisos y reglas de modificación/cancelación.
- [x] Definir el modelo de datos, migraciones y seguridad multiempresa.
- [x] Incorporar parametrización del módulo y modalidades habilitadas.
- [x] Crear configuración de mesas, sectores, carta y adicionales.
- [x] Implementar registro de pedidos de delivery y retiro.
- [x] Implementar salón, apertura de cuentas y toma de pedidos desde mesas.
- [x] Implementar emisión de comandas por sector y ampliaciones sin duplicaciones.
- [x] Implementar bandeja de cocina/barra, aceptación, preparación y productos listos.
- [x] Implementar armado, control y entrega en despacho o mostrador.
- [x] Implementar asignación de repartidor, salida, entrega e incidencias.
- [x] Implementar servicio en mesa y nuevas rondas sobre una misma cuenta.
- [x] Implementar cuentas, cobros parciales y división de cobros.
- [x] Integrar cierre, rendición y facturación con Vortex Gestión.
- [x] Implementar auditoría, control de reintentos y recuperación al reconectar.
- [x] Validar permisos, aislamiento por comercio y operaciones concurrentes.
- [ ] Validar manualmente un circuito completo de delivery, uno de retiro y uno de restaurante.

### Ampliaciones posteriores

- [ ] Reservas de mesas.
- [ ] Recetas y consumo de ingredientes.
- [ ] Integración de pedidos online.
- [ ] Seguimiento del envío para el cliente.

## Decisiones adoptadas para la primera versión

- Pantalla de cocina e impresión mediante el navegador, configurable por sector; imprimir no bloquea el circuito.
- Ampliaciones sólo con líneas nuevas. Cancelaciones enviadas requieren administración, motivo y aviso persistente a cocina.
- Cobros desde que se envía la comanda. Venta y stock al cerrar, con rendición previa del efectivo del repartidor.
- Cuentas combinables sin cobros, cambios de mesa auditados y cobros por importe o unidades de productos.
- Costo de envío con IVA configurable. Incidencias para entregas fallidas; devolución confirmada para anular cobros no rendidos.
- Operaciones con versión e idempotencia; reintentos conservan su clave y las bandejas se actualizan al reconectar.
- El cajero cobra y recibe rendiciones. Administración genera ventas/facturas, respetando la restricción actual del núcleo de Vortex.

El detalle de pantallas, reglas, instalación y verificaciones está en [VORTEX_RESTAURANTE_PRIMERA_VERSION.md](VORTEX_RESTAURANTE_PRIMERA_VERSION.md).
