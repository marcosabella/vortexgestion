# Vortex Distribución

Módulo opcional en la rama `vortex-distribuidora`, ruta `/distribucion`, parámetro `modulos.distribucion`. Reutiliza clientes, productos, ventas, cobros, cuenta corriente e impresión. No incorpora dependencias.

## Circuito para nuevos repartos

1. Crear el pedido seleccionando cliente y productos mediante Buscar y sus modales. Se conservan descripción, precio con IVA y alícuota originales.
2. Administración inicia la preparación y confirma Preparado. Sólo se asignan pedidos preparados; un pedido no puede integrar dos repartos activos. El despacho vuelve a validar la preparación en PostgreSQL.
3. Crear el reparto, asignar repartidor y agregar cantidades pendientes. Emitir los remitos fija los productos y cantidades; desde entonces la carga no se edita.
4. Generar remitos e iniciar la salida desde Remitos y salida. La confirmación de ejemplares impresos es opcional. Imprimir y PDF abren el diálogo del navegador, sin descarga automática.
5. En cada cliente, registrar las cantidades recibidas y elegir cobro o sin cobro. Entrega y cobro se guardan juntos. Nombre del receptor, firma, observaciones y foto son opcionales.
6. La confirmación descuenta una sola vez el stock recibido. Las devoluciones previas a facturar restituyen stock y conservan historial; no pueden dejar cobros superiores al importe neto. Los originales impresos mantienen las cantidades previstas.
7. Finalizar y rendir efectivo y mercadería. Toda parada debe estar confirmada, incluyendo rechazos totales. La rendición libera reservas restantes y registra diferencias; no genera ventas ni vuelve a descontar stock.
8. En Facturación, seleccionar el remito confirmado y rendido. El comprobante utiliza cantidades netas y precios originales, aplica cobros registrados y deja el saldo en cuenta corriente. Elegir factura A, B o C, o recibo X. La factura solicita CAE mediante la integración existente. Si falla, se reintenta sobre la misma venta sin duplicarla.

El remito queda vinculado a su venta, conservando el papel firmado. El carácter fiscal corresponde al comprobante de venta autorizado. Por defecto, el remito es una constancia interna NO FISCAL. Opcionalmente administración configura un CAI previamente autorizado, vencimiento, punto de venta y rango; al emitir debe elegir utilizarlo. El módulo no solicita autorizaciones de remitos ante ARCA. La numeración no se reutiliza; un rango vencido o agotado bloquea esa modalidad y permite optar por la constancia interna.

Cada operación conserva una clave idempotente. Reintentos y doble clic no duplican entregas, descuentos, cobros ni facturas. Facturar y vincular cobros forman una transacción. La venta vinculada protege su contenido comercial, permitiendo completar número, punto de venta y autorización fiscal. Las devoluciones posteriores a facturar requieren el circuito contable correspondiente; remitos no permite modificar una entrega ya facturada.

## Pantallas e impresión

Pedidos, Preparación, Planificación y salida, Repartos en curso, Cierre y rendición y Facturación son opciones del submenú Vortex Distribución, cada una con ruta y grilla propias. Las pestañas permanecen dentro del detalle de un reparto. La [guía de pantallas y roles futuros](distribucion-circuito.md) detalla responsabilidades y transiciones. Cliente permanece visible, incluyendo todos los nombres cuando hay varias paradas. Ver abre detalle y acciones según estado y permisos. El estado visible del pedido refleja operaciones reales: asignado, en reparto, pendiente de rendición, entrega parcial, pendiente de facturación, pendiente de CAE o facturado.

Planificación muestra planificados y cancelados; Reparto muestra los que están en calle. Cierre y rendición reúne repartos en calle, pendientes de rendición y rendidos. El detalle abre en Pedidos y entregas y continúa con Remitos y salida, Hoja de ruta, Cierre y rendición e Historial. Finalizar y rendir tienen acciones separadas. El modal conserva altura fija y desplazamiento interno. La impresión de la hoja de reparto queda oculta por ahora. La hoja de ruta A4 muestra orden, cliente, pedido, dirección, teléfono y espacio para registrar la visita; comparte los estilos de comprobantes y ofrece Imprimir y PDF. Los remitos por cliente usan los mismos estilos en A4, sin importes ni rendición de efectivo, con campos para recepción y firma. En Pedidos y entregas, Ver comprobante, Cobros y cuenta corriente y Ver remito firmado aparecen junto a Despacho registrado.

Administración organiza la ruta mientras está Planificado: sube o baja visitas, ubica la salida y los clientes y opcionalmente indica regreso al depósito. La salida toma por defecto calle, número, localidad y provincia de Mi comercio y permite editarla o recuperar esa dirección mediante Usar dirección del comercio. Usar mi ubicación solicita la ubicación actual del dispositivo, marca la salida en el mapa y muestra la precisión aproximada. Si se rechaza el permiso o falla el GPS, conserva la salida anterior y permite ubicarla manualmente. La geolocalización requiere permiso del navegador y un contexto seguro, como HTTPS o localhost ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition)). Guardar persiste el orden y coordenadas en PostgreSQL, valida todas las paradas del mismo reparto, controla versiones e idempotencia y conserva auditoría sin afectar cantidades, stock ni ventas. Pedidos y entregas, impresión de remitos y hoja de ruta siguen el orden guardado. Una dirección cambiada invalida su ubicación previa. El repartidor consulta el circuito guardado y navega hacia cada cliente.

El mapa integrado utiliza Leaflet y OpenStreetMap. Armar circuito busca las direcciones con Photon y acepta automáticamente sólo coincidencias de calle, número y localidad sin ambigüedad. Si falta una ubicación, conserva todos los clientes y pide corregir la dirección o marcarla manualmente mediante Ubicar. Consulta la matriz de tiempos por calles de OSRM/FOSSGIS y ordena los clientes desde la salida, considerando el regreso cuando está seleccionado. Hasta doce visitas calcula el mínimo de esa matriz; para más visitas utiliza una aproximación por tiempos con mejoras de orden. No incorpora tránsito en vivo ni ventanas horarias. Muestra el recorrido y las estimaciones de distancia y conducción; Guardar ruta confirma el circuito. Buscar dirección permite elegir manualmente un resultado o marcar un punto. Nunca se omiten silenciosamente paradas sin ubicar. Referencia: [OSRM Table service](https://project-osrm.org/docs/v5.24.0/api/#table-service).

Los pedidos nuevos que usan el domicilio del cliente se actualizan al editar calle, número o localidad mientras permanecen pendientes y sin remitos emitidos ni reparto iniciado. Se invalidan sus coordenadas para recalcular el circuito. Las direcciones de entrega personalizadas y los documentos históricos conservan su dirección original. La actualización queda auditada y no modifica stock ni importes.

Google Maps se abre mediante enlaces de navegación. Para conservar todas las visitas en navegadores móviles se generan tramos de hasta cuatro destinos, con hasta tres puntos intermedios, encadenando el origen de cada tramo con el destino anterior. No requiere clave de Google. La impresión no depende de la disponibilidad del mapa. Los servicios de mapa requieren conexión y envían la dirección consultada o coordenadas, sin nombres, cobros ni productos. Los endpoints se pueden cambiar mediante `VITE_DISTRIBUCION_GEOCODER_URL` (API Photon) y `VITE_DISTRIBUCION_ROUTER_URL` (ruta OSRM), sin dependencias nuevas. Se cachean búsquedas y recorridos, con solicitudes manuales limitadas. Referencias: [Photon](https://github.com/komoot/photon), [FOSSGIS](https://routing.openstreetmap.de/about.html), [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started).

Editar o eliminar pedidos requiere administración y ausencia de operaciones o documentos emitidos. Libera reservas sin incrementar existencias que nunca se descontaron. Editar conserva precios e IVA de productos que permanecen y vuelve a Pendiente. Las versiones desactualizadas se rechazan; eliminar conserva auditoría.

## Seguridad y compatibilidad

Tablas con tenant, índices, RLS y relaciones del mismo comercio. Las escrituras por RPC validan módulo, pertenencia y rol. El repartidor sólo consulta y opera repartos asignados; preparación, emisión, rendición y facturación requieren administración.

Fotos en `distribucion-remitos`, bucket privado con límite de 10 MB y JPEG, PNG o WebP. Las políticas validan comercio y reparto asignado. Se consultan con URL temporal y la primera foto asociada no se sustituye. Se requiere conexión; no existe cola sin conexión.

Los repartos anteriores conservan el circuito previo: recibo X y descuento neto al rendir, con devoluciones posteriores protegidas. No se reescribe información histórica. Los nuevos usan remitos y facturación separada.

La rendición registra efectivo esperado, recibido y diferencia. No agrega automáticamente efectivo a Caja diaria; la recepción física utiliza el procedimiento de caja del comercio. Cantidades enteras, como en ventas existentes.

Migraciones, en orden:

- `20261007100000_vortex_distribucion.sql`: tablas, permisos y circuito original.
- `20261007110000_distribucion_editar_eliminar_pedidos.sql`: edición y eliminación controladas.
- `20261007120000_distribucion_remitos_entrega_facturacion.sql`: remitos, fotos privadas, estados, rendición y facturación separadas; compatible con repartos anteriores.
- `20261007130000_distribucion_hoja_ruta.sql`: orden, origen y ubicaciones persistentes con RPC administrativa, versiones y auditoría.
- `20261007140000_distribucion_direccion_cliente.sql`: actualización de domicilios en pedidos nuevos pendientes, conservando documentos e historial.

Las cinco migraciones están aplicadas al proyecto vinculado bajo autorización del usuario. Se verificaron los registros, RLS en las tablas nuevas, privacidad del bucket, columnas de ruta, triggers de direcciones y permisos de funciones. Los tipos se extienden localmente en el hook hasta regenerar los tipos de Supabase.

## Verificación

`node scripts/test-distribucion.mjs`: 75 pruebas en PostgreSQL temporal local con funciones reales de ventas, cobros y stock y las cinco migraciones. Comprueba tenant, roles, preparación, duplicaciones, reservas, entregas parciales, devoluciones, cobros, rendición, factura única, CAI y numeración opcionales, estados, fotos privadas, edición, eliminación, compatibilidad, ruta y actualización de direcciones pendientes. Las verificaciones de ruta incluyen permisos, paradas ajenas, duplicación, coordenadas inválidas, rollback, concurrencia por versión, idempotencia, lectura del repartidor, conservación de remitos y ausencia de cambios en stock. No conecta a Supabase ni solicita CAE reales. `node scripts/test-distribucion-ruta-ui.mjs` comprueba coincidencias de direcciones, orden por tiempos con y sin regreso, ubicaciones vigentes, conservación de todas las visitas, tramos móviles completos y HTML de impresión.

`node scripts/verificar-distribucion-types.mjs` compara la app con HEAD: 39 diagnósticos preexistentes, sin nuevos. `node scripts/verificar-distribucion-lint.mjs`: 148 errores y 11 advertencias preexistentes, sin nuevos. El archivo existente useClientes conserva un error previo por any; los archivos nuevos no agregan errores ni advertencias. La cifra difiere de la línea base histórica de AGENTS.md. `tsc --noEmit` raíz también pasa.

Pendiente validar con sesiones reales de administrador y repartidor, celular, impresora y autorización fiscal del comercio. Las pruebas de PostgreSQL verifican negocio; la compilación no sustituye la prueba manual. No se publicó el frontend.
