# Circuito de pedidos y distribución

El pedido, el reparto y el comprobante conservan estados propios. Iniciar la salida del camión no confirma la entrega de ningún cliente. Cerrar un reparto no equivale a completar todos sus pedidos: las cantidades sin entregar pueden asignarse a otro reparto después de rendir.

| Paso | Responsable futuro | Pantalla y acción | Resultado |
| --- | --- | --- | --- |
| 1. Tomar pedido | Preventista | Pedidos: registrar cliente, productos, cantidades y entrega prevista | Pedido pendiente |
| 2. Preparar | Preparador de depósito | Preparación: filtrar Por preparar, iniciar preparación, revisar mercadería y marcar preparado | En preparación → Preparado |
| 3. Planificar y cargar | Planificador / despachante | Planificación: crear reparto, abrir Pedidos y entregas, agregar pedidos preparados y revisar la carga de cada cliente. Ordenar visitas en Hoja de ruta | Reparto planificado |
| 4. Documentar y salir | Despachante | Remitos y salida: generar remitos, imprimir o descargar e iniciar reparto | En reparto; stock reservado |
| 5. Despachar a cada cliente | Repartidor | Pedidos y entregas: cantidades recibidas, registrar cobro o seleccionar sin cobro, confirmar despacho | Visita registrada; stock descontado por lo recibido |
| 6. Cerrar y rendir | Responsable de regreso / rendición | Cierre y rendición: revisar visitas, cantidades que vuelven, efectivo, transferencias y saldos. Finalizar reparto; luego confirmar efectivo rendido y diferencias | Por rendir → Rendido |
| 7. Facturar | Facturador | Facturación: seleccionar entrega de un reparto rendido y emitir comprobante por cantidades netas | Pendiente de CAE / Facturado |

## Detalle del reparto

Las etapas se abren desde el submenú **Vortex Distribución**, con rutas independientes: `/distribucion/pedidos`, `/distribucion/preparacion`, `/distribucion/planificacion`, `/distribucion/repartos`, `/distribucion/rendiciones` y `/distribucion/facturacion`. La entrada `/distribucion` redirige a Pedidos. La ruta identifica la pantalla al recargar y al usar Atrás/Adelante del navegador. El menú conserva su presentación expandida, contraída y móvil.

La primera pestaña es **Pedidos y entregas**. Las demás son **Remitos y salida**, **Hoja de ruta**, **Cierre y rendición** e **Historial**.

**Pedidos y entregas** abre con todos los clientes asignados al reparto, una fila por cliente con su orden, pedidos, despachos registrados y total cobrado. Desde **Registrar despachos** se ingresa al detalle de ese cliente, donde se registran por separado las entregas de cada pedido y sus cobros. **Volver a clientes** retorna al listado para continuar con el siguiente. Antes de salir, la acción se llama **Ver pedidos**; después del registro, **Ver despachos** conserva el acceso al detalle y los cobros adicionales.

- Generar remitos precede a la salida. Confirmar que se llevan los ejemplares impresos es opcional y no bloquea la salida.
- El despacho por cliente registra la visita, incluso cuando todas las cantidades recibidas son cero. Nombre del receptor, firma y observaciones son opcionales.
- El cobro pertenece a la visita de ese cliente. La interfaz exige elegir registrar cobro o sin cobro; no exige que toda entrega esté pagada. El importe puede ser parcial y no puede superar lo recibido.
- Entrega y cobro inicial se guardan en una transacción. Un rechazo del cobro revierte también la entrega y el descuento de stock. Reintentar la misma operación no duplica cobros.
- Los cobros adicionales y sus correcciones permanecen disponibles durante el reparto. El historial conserva sus movimientos.
- Todas las visitas deben estar registradas antes de finalizar. Al regreso se separa finalizar reparto de confirmar rendición. Una diferencia de efectivo exige explicación.
- Una entrega sin cobrar puede rendirse y facturarse: su saldo se conserva en cuenta corriente. Facturar no vuelve a descontar stock ni duplica cobros.

## Roles futuros

La tabla describe responsabilidades, no permisos ya implementados. Actualmente se conservan administración y repartidor asignado, con validaciones del backend y aislamiento por comercio.

Para habilitar roles especializados, definir permisos para tomar y editar pedidos, preparar, planificar, iniciar salida, registrar visitas/cobros, cerrar, rendir y facturar. Validarlos en RPC y PostgreSQL por comercio y, cuando corresponda, por asignación de reparto. Una misma persona podrá reunir varios permisos; ocultar botones no reemplaza estas validaciones.

## Activación

Los cambios de backend están en `20261007150000_distribucion_circuito_pasos.sql`. La migración conserva los datos históricos y los permisos existentes. Se aplicó al proyecto Supabase vinculado con autorización del usuario y se verificó que la salida no exige confirmar los ejemplares impresos. El backend ya anuncia el circuito actualizado para habilitar el registro conjunto de entrega y cobro en el frontend correspondiente.
