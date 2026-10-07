# Vortex Restaurante / Delivery — primera versión

Desarrollo en la rama `vortex-restaurante`, como módulo opcional de Vortex Gestión. El módulo está apagado por defecto. Las tres migraciones se aplicaron al proyecto Supabase vinculado `zhtqkygjvaaizbdwwsbi` el 7 de octubre de 2026, con autorización del usuario. Quedan pendientes la publicación del frontend, la habilitación por comercio y la validación interactiva.

## Pantallas y recorrido

| Pantalla | Operación |
| --- | --- |
| Pedidos | Delivery o retiro, cliente existente o nombre libre, domicilio, teléfono, horario prometido, prioridad, observaciones y productos. |
| Salón y mesas | Abrir mesa, indicar comensales, agregar rondas, servir cada producto, mover mesa, unir cuentas sin cobros y solicitar cuenta. |
| Cocina y comandas | Nuevos productos agrupados por sector; aceptar, preparar y marcar listo por producto; impresión y reimpresión; avisos de cancelación hasta confirmar su recepción. |
| Despacho y retiro | Revisar todos los productos, armar el pedido, entregar un retiro o asignar un repartidor. |
| Envíos | Pedidos asignados al repartidor, salida, entrega, incidencias, contacto y cobro individual. |
| Cuentas y cobros | Efectivo, transferencia o tarjeta; pagos parciales y división por importe o unidades de productos. |
| Cierre y rendición | Seleccionar los cobros de un usuario, recibir el efectivo y justificar diferencias; cerrar cuentas entregadas y generar comprobante. |
| Configuración | Modalidades, sectores, formato de impresión por sector, mesas, carta, adicionales, IVA del envío y permisos. |

### Delivery

1. Crear pedido, con domicilio e indicaciones de reparto.
2. Agregar productos y enviar los nuevos a cocina.
3. Aceptar, preparar y marcar listo cada producto.
4. Controlar y armar en despacho; asignar repartidor.
5. Registrar salida, cobro y entrega. Entregar no exige haber cobrado.
6. Al regresar, caja recibe los cobros en efectivo seleccionados y registra cualquier diferencia.
7. Administración cierra la cuenta y genera la venta. Si queda saldo, se necesita un cliente de Vortex; puede vincularse al cerrar.

### Retiro

Registrar → enviar a cocina → preparar → armar → registrar retiro → cobrar → cerrar. Se permite cobrar antes de que esté listo, una vez enviada la comanda.

### Restaurante

Abrir mesa → tomar primera ronda → enviar a cocina/barra → preparar → servir por producto → agregar otras rondas → solicitar cuenta → cobrar/dividir → cerrar y liberar la mesa. Las mesas unidas permanecen ocupadas hasta cerrar su cuenta conjunta.

## Reglas de la versión

- Preparación, entrega, cobro y cierre son independientes. Imprimir es opcional y no bloquea la entrega.
- Cada ampliación genera comandas únicamente con productos nuevos. Cantidades enteras; para diferentes observaciones, cargar líneas separadas.
- Las líneas guardan precio final, IVA, adicionales y sector al agregarse. Cambiar la carta después no cambia esas líneas.
- Un mozo puede quitar productos aún en borrador. Administración puede cancelar productos enviados, con motivo; cocina recibe un aviso persistente. Los productos servidos no se cancelan individualmente.
- Un delivery en despacho requiere una incidencia antes de cancelarse. Se puede reasignar un envío con incidencia. Cancelar requiere devolver y anular previamente los cobros no rendidos.
- Una anulación exige administración, motivo y confirmación de devolución. Los cobros rendidos y las cuentas cerradas conservan su historial; las correcciones posteriores corresponden al circuito administrativo de notas de crédito.
- La división por productos asigna unidades a cada pago. Los pagos por importe no asignan unidades; siempre se controla el saldo global. El costo de envío se cobra por importe.
- Efectivo, tarjeta y transferencia son registros de pagos verificados por el operador; no procesan pagos externos automáticamente.
- Una rendición recibe cobros explícitos, de un solo usuario, sin volver a rendirlos. El efectivo del repartidor debe estar rendido antes de cerrar su pedido.
- Si un envío con cobros tiene una incidencia, primero se resuelve la entrega o se devuelve y anula el pago; después se rinde. Esto conserva la posibilidad de devolver el dinero antes de cerrar una entrega fallida.
- El cierre llama al registro transaccional existente: una venta, pagos y stock, o venta a cuenta corriente con los cobros parciales imputados. No agrega otro ingreso manual a caja. Los cobros anteriores al cierre se controlan dentro del módulo; Caja diaria los incorpora mediante el circuito existente de ventas/pagos cuando se cierra.
- La diferencia de rendición se registra como diferencia operativa; no cambia cuánto pagó el cliente ni genera automáticamente un gasto o ajuste contable.
- Stock de bebidas y productos terminados se descuenta al cerrar, si la carta tiene marcada esa opción. No se reserva al pedir ni se consumen ingredientes. Si falla el movimiento de stock o el registro contable, se revierte todo el cierre.
- Los adicionales usan el IVA del plato. El costo de envío es un precio final con IVA configurable, guardado al crear el pedido.
- Recibo X o factura A/B/C. Primero se guarda la venta; luego se solicita el CAE por la integración existente. Un fallo de ARCA permite reintentar desde el resultado del cierre o desde Ventas.

## Roles

Los permisos se combinan por usuario activo del comercio. Administración tiene todas las funciones y asigna permisos; configuración delegada no puede delegar permisos a otros usuarios.

| Perfil sugerido | Permisos |
| --- | --- |
| Telefonista | Pedidos |
| Mozo | Salón y mesas |
| Cocinero / barra | Cocina, con sector asignado o todos |
| Despachante | Despacho y retiro |
| Repartidor | Envíos; registra entrega y cobro sólo de sus envíos |
| Cajero | Cuentas y cobros + Cierre y rendición |
| Encargado | Según sus funciones; administración para correcciones y facturación |

El núcleo de Vortex exige administración del comercio para generar ventas. Se conserva esa regla: el cajero recibe rendiciones y registra cobros, y administración realiza el cierre que genera venta/factura. Ocultar botones no reemplaza los controles PostgreSQL.

## Seguridad y conexión

Las tablas nuevas incluyen comercio, índices y RLS. No permiten escritura directa desde el cliente; las operaciones usan RPC, validan permisos y relaciones del comercio y conservan auditoría. El repartidor consulta sólo pedidos asignados; cocina ve su sector y no recibe teléfonos, direcciones ni cobros.

Las operaciones usan una clave de reintento y versión de pedido. Una misma clave con los mismos datos devuelve el resultado original; otra edición sobre una versión vieja se rechaza. Los cierres y sus movimientos originales quedan protegidos; cuenta corriente admite pagos posteriores.

Las bandejas reciben eventos y consultan cada cinco segundos como respaldo. Al recuperar conexión se actualizan. Una operación sin respuesta queda pendiente en la sesión del navegador; el botón de reintento conserva su clave. No es un sistema de trabajo sin conexión y no se deben dar operaciones por confirmadas hasta recibir respuesta.

Las cuentas y comandas reutilizan los estilos de impresión de los comprobantes de Vortex: encabezado con logo o nombre, datos del comercio, tipografía, colores y tablas, tanto en A4 como en rollo térmico de 58 mm. Se mantienen como documentos no fiscales; las comandas no incluyen importes ni cobros.

En Configuración → General, Formato general de impresión permite guardar A4 o 58 mm para cuentas y comandas. Cada sector puede elegir su formato de comanda desde Configuración → Sectores. El detalle del pedido usa el formato guardado en Configuración. Los botones Imprimir y PDF usan el mismo documento y el diálogo del navegador; PDF permite seleccionar Guardar como PDF. El contador de comandas registra intentos de impresión o PDF, sin afirmar que el papel salió físicamente; no incluye impresoras automáticas ni agentes locales.

## Instalación y validación

Migraciones aplicadas en orden:

1. `20261008100000_restaurante_estructura.sql`
2. `20261008110000_restaurante_operaciones.sql`
3. `20261008120000_restaurante_consultas.sql`

Habilitar `restaurante` en la parametrización del comercio. Ingresar como administrador a Configuración para crear sectores, mesas, carta y asignar permisos a usuarios existentes. Revisar precios, IVA y opción de stock antes de operar.

Configuración se organiza en pestañas: General, Sectores, Mesas, Carta, Adicionales y Usuarios y funciones (esta última sólo para administración). Las pantallas operativas se acceden desde el menú lateral.

Los listados operativos, rendiciones, configuración, detalle del pedido y resultados de búsqueda usan grillas con los componentes de tabla y botones compartidos de Vortex. Las acciones se presentan por registro y conservan los permisos y condiciones del circuito. En celular las grillas permiten desplazamiento horizontal.

La grilla de pedidos ajusta sus columnas al ancho disponible en escritorio: acciones compactas con iconos y etiquetas accesibles, textos que pueden ocupar varias líneas y columnas Dirección/Prometido visibles sólo cuando contienen datos. En pantallas pequeñas mantiene un ancho legible con desplazamiento horizontal.

Recibir rendición sólo se habilita con cobros en efectivo no anulados ni rendidos, de usuarios activos disponibles y sin envíos abiertos o incidencias pendientes. El modal lista sólo los usuarios y cobros disponibles para rendir. Ver venta reutiliza directamente el modal del módulo Ventas para el comprobante vinculado, con el mismo formato, información y acciones; al cerrar se conserva la pantalla de Restaurante y su URL.

Tiempo de atención indica los minutos desde el registro del pedido y se detiene con el evento de cierre, cancelación o unión. Para una mesa corresponde a la duración de esa cuenta. Prometido aparece en una columna separada como horario previsto. La duración no equivale al tiempo de elaboración de cocina ni calcula todavía promedios; cocina muestra el transcurso desde la comanda hasta el cierre del pedido. Si falta el evento de finalización, se indica Sin dato en lugar de continuar contando.

Las selecciones del módulo usan botones Buscar/Cambiar y un modal con resultados, en lugar de comboboxes. Se puede buscar por nombre y por los datos disponibles de cada registro (por ejemplo, código o código de barras del producto en Configuración, CUIT o teléfono del cliente). La búsqueda no distingue mayúsculas ni acentos. Al seleccionar, el modal se cierra y el formulario muestra el registro elegido.

Comprobaciones locales:

- `node scripts/test-restaurante.mjs`: PostgreSQL temporal, migraciones reales del módulo y funciones existentes de ventas/pagos, con circuitos y rechazos de negocio.
- `node scripts/test-restaurante-ui.mjs`: renderizado estático de las ocho pantallas con datos ficticios, saldo y documentos con contenido escapado. Comprueba cuenta/comanda en A4 y 58 mm con los estilos compartidos, logo y datos del comercio, totales y distinción de productos cancelados. No equivale a una prueba interactiva del navegador.
- `node scripts/test-restaurante-browser.mjs` (ejecutar `npm run build` primero): navegador local con datos ficticios y el CSS del build; selección de producto y sector en Carta, cambio de pestañas y selección de usuario, cliente y mesa dentro del modal de pedido, envío de identificadores y uso de controles con una ventana de tamaño celular. Comprueba la grilla de pedidos sin scroll horizontal a 1024, 1280 y 1440 px reservando 256 px para el menú lateral, además del modal de venta sin navegación, disponibilidad de rendición y acción de cocina. Verifica el modal real de Ventas sin navegación y los documentos de cuenta/comanda enviados a impresión o PDF en A4 y 58 mm, usando el formato guardado en Configuración. La impresión se intercepta localmente y no valida datos reales ni el diseño completo de la aplicación.
- `npx tsc --noEmit` y `npm run build`.
- Lint de archivos modificados. El lint global conserva la deuda previa del repositorio.

Resultado del desarrollo local: 38 pruebas PostgreSQL correctas, ocho pantallas renderizadas y verificaciones de saldo/escape de impresión correctas. Build y `npx tsc --noEmit` correctos; archivos modificados sin errores ni advertencias de lint. El lint global mantiene 148 errores y 11 advertencias existentes. La comprobación específica con `tsconfig.app.json` registra 38 errores existentes en otros archivos y ninguno en los modificados; al reutilizar el modal de Ventas se completó el tipo del importe de Mercado Pago, que antes provocaba uno de los 39 errores.

Pendiente antes de habilitar en un comercio real: prueba interactiva en celular y escritorio, reconexión y dos sesiones simultáneas; impresión física en los sectores; caja del comercio; entrega fallida con devolución; solicitud real de CAE. Las pruebas locales no utilizan Supabase remoto, ARCA ni datos productivos.

Reservas, recetas, pedidos online y seguimiento público del envío continúan en la siguiente etapa de la propuesta.
