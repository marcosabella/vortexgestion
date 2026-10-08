# Usuarios de Vortex Restaurante

En Configuración → Usuarios y roles, el administrador crea personas con nombre, email, contraseña y funciones. El ingreso es inmediato: el alta se realiza en el servidor con `email_confirm=true`, sin enviar invitaciones ni correos de confirmación.

- Mozo / moza: Salón. Cobros opcionales.
- Repartidor: sus envíos y cobros permitidos por el circuito de reparto.
- Cocina o Barra: preparación de un sector activo. Cada cuenta de preparación tiene un único rol y sector para conservar el aislamiento actual.
- Administrador: el administrador existente del comercio mantiene acceso completo, usuarios y cierre con generación de venta. Esta pantalla no eleva operadores a administradores.

Mozo y Repartidor pueden combinarse. El usuario ingresa desde el login habitual con el email y la contraseña definidos por el administrador. Las cuentas existentes conservan sus accesos previos a Vortex. Editar acceso permite definir una contraseña nueva para cuentas exclusivas de este restaurante; dejar el campo vacío conserva la actual. No se muestran las contraseñas guardadas. Las cuentas compartidas con otros comercios o con Vortex Gestión conservan el cambio de contraseña personal desde Seguridad.

Desactivar el acceso vacía los permisos de Restaurante sin eliminar usuario, membresía o historial. Las cuentas exclusivas de Restaurante ingresan a la primera función asignada y conservan acceso a Seguridad para cambiar su contraseña. Los permisos se consultan cada cinco segundos y se verifican en cada operación del servidor. El modo de terminal con PIN queda para una etapa posterior.

## Activación

El usuario autorizó la activación el 8 de octubre de 2026 y luego indicó expresamente que el administrador debe asignar email, contraseña y rol sin correos.

1. Migración `20261008160000_restaurante_usuarios_roles.sql` aplicada al proyecto `zhtqkygjvaaizbdwwsbi`. Se confirmaron la versión y 102 políticas restrictivas. No se crearon cuentas reales durante las verificaciones.
2. Desplegadas `restaurante-usuarios`, `consultar-padron-afip`, `consultar-ultimo-comprobante`, `membresia-checkout`, `whatsapp-enviar-comprobante`, `mercado-pago` y `mercadopago-checkout`. La función nueva verifica el token y la administración del comercio internamente.
3. Retirados el destino `/acceso/clave` y la variable `APP_URL` agregados durante la preparación del flujo anterior por correo. Se conservan la URL general, las plantillas y SMTP de las otras aplicaciones del proyecto.
4. Frontend de producción: `https://vortexgestion.netlify.app`, sitio Netlify `b9996f69-d630-4d0f-ac21-d2a646930add`. El ingreso verifica el nuevo RPC y falla cerrado si no está disponible.
5. Verificación remota de lectura (`scripts/restaurante-usuarios-smoke.sql`): el administrador existente consulta acceso, usuarios y resumen; usuarios ajenos y anónimos son rechazados. La función publicada responde 401 sin autenticación, 405 a GET y 200 a OPTIONS.

La restricción usa `user_belongs_to_comercio`, políticas RLS restrictivas en las tablas operativas existentes con `comercio_id` y controles adicionales en las integraciones que verificaban la membresía directamente. Las nuevas cuentas reciben `solo_restaurante=true`; las membresías anteriores conservan el valor por defecto `false`. La gestión de identidad y la parametrización del comercio permanecen disponibles para cargar la aplicación.

## Verificación local

- `npx tsc --noEmit`: correcto.
- `deno check --no-lock`: función nueva y controles de integración modificados correctos.
- `node scripts/test-restaurante.mjs`: 51 casos en PostgreSQL temporal local, incluidos roles, RLS, sectores, autoría individual, revocación y compatibilidad. No usa Supabase remoto.
- `node scripts/test-restaurante-usuarios-api.mjs`: ejecuta la función real con Auth/DB simulados; verifica alta con contraseña y email confirmado, ausencia de llamadas de correo, permisos administrativos, limpieza del alta fallida, cambio de contraseña y protección de cuentas compartidas.
- `node scripts/test-restaurante-ui.mjs`: renderizado local con datos ficticios.
- `node scripts/test-restaurante-browser.mjs`: interacción en navegador local, alta de moza con email y contraseña, y pantallas de celular con datos ficticios.
- `npm run build`: correcto para producción.
- El lint completo actual informa 148 errores y 11 advertencias. La comparación contra HEAD de los archivos existentes modificados no agregó errores. La cifra de AGENTS.md (108/9) está desactualizada respecto del repositorio actual.

No se enviaron correos ni se crearon usuarios productivos de prueba. El alta y el cambio de contraseña se verificaron con el servidor simulado y las validaciones remotas de acceso; falta validar el primer usuario real creado por el administrador.

Referencias de autenticación: [alta administrativa de Supabase](https://supabase.com/docs/reference/javascript/auth-admin-createuser) y [cambio administrativo de contraseña](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid).

## Corrección del selector de clientes y del alta de mesa

El selector del nuevo pedido usaba `useClientes`, cuya lectura general está restringida para cuentas exclusivas de Restaurante. La migración `20261008170000_restaurante_clientes.sql` agrega una consulta con autorización de Salón/Pedidos y filtro de comercio en el servidor. Devuelve solamente los campos necesarios para seleccionar al cliente y completar contacto/domicilio. No permite modificar clientes ni acceder a otros módulos. Aplicada en producción; `scripts/restaurante-clientes-smoke.sql` comprobó con la identidad del mozo activo que Demo está disponible, sin cambios de datos.

El formulario muestra errores de operación dentro del diálogo, conserva los datos tras un rechazo y muestra `Creando pedido…` mientras espera. La validación del formulario evita que una validación nativa del navegador interrumpa el envío sin informar el motivo. Al crear abre directamente la selección de productos.

Validación: 54 casos PostgreSQL locales, TypeScript, lint de los archivos modificados, renderizado, navegador con mozo (opcionales vacíos, rechazo visible, cliente existente y apertura de productos) y build correctos. El caso descrito de mesa con opcionales vacíos también pasó sin fila de configuración guardada. No se reprodujo el motivo específico del intento original; ahora un rechazo informa el detalle en la pantalla. No se crearon pedidos productivos de prueba.

El usuario luego identificó el error `crypto.randomUUID is not a function`: la generación del identificador fallaba antes de llamar al RPC. `useRestaurante` ahora usa `generarUuid`, que emplea `randomUUID` cuando existe o construye un UUID v4 con `getRandomValues` cuando está ausente. Se mantiene la reutilización del identificador para reintentos. `scripts/test-restaurante-uuid.mjs` comprueba ambas rutas, formato, versión, variante y ausencia completa de criptografía. TypeScript, lint de los dos archivos y build correctos. La prueba anterior de navegador simulaba la operación del hook y por eso no ejercitaba esta incompatibilidad.

## Salón y mesas desde celular

En anchos menores a 768 px, Salón y mesas muestra solamente el título y tarjetas cuadradas táctiles: verde para libres y ámbar para ocupadas, con texto de estado. Tocar una libre abre Registrar pedido con esa mesa seleccionada; tocar una ocupada abre su pedido. Se ocultan el buscador, Incluir finalizados, la explicación y el botón general de nuevo pedido. La búsqueda previa de escritorio no filtra las tarjetas móviles. Desde 768 px se conserva la grilla y todos los controles de escritorio. No cambia las operaciones ni los permisos del servidor.

Verificado con datos ficticios en navegador a 320, 390 y 767 px: tarjetas cuadradas sin desborde horizontal, apertura de mesa preseleccionada y de pedido existente. A 768 y 1024 px conserva grilla, buscador, historial y botón general. TypeScript, lint de los componentes y build correctos. Se inspeccionó visualmente la captura de 390 px; no se crearon pedidos productivos.

## Detalle, cierre y rendición de mesas

El detalle usa un modal ancho, productos con importes y precios unitarios, un panel de acciones por función y cobros/historial desplegables. La grilla se ajusta al ancho; en celular usa tarjetas. Verificado en navegador a 1024, 1280 y 390 px, incluidas las acciones e impresión/PDF.

La administración cierra la mesa desde Cuentas y cobros y genera la venta transaccional existente. Se abre `RestauranteVenta` / `VentasList`, con el mismo comprobante e impresión del módulo Ventas. Cierre y rendición muestra mesas ya cerradas, sin repetir la acción de cierre.

La migración `20261008180000_restaurante_cierre_mesas_rendicion.sql` agrega `recibido_por` a cada cobro: se conserva `usuario_id` como autor del registro y se identifica por separado al receptor del dinero. Mozo y administración pueden registrar pagos de mesa; el selector permite indicar Mozo o Caja. La rendición considera al receptor efectivo y exige mesa cerrada con venta; mantiene la idempotencia, las restricciones de comercio y el circuito previo de delivery. El mozo no obtiene permisos administrativos ni autorización para generar ventas.

Para cobros anteriores sin receptor explícito, el resumen identifica al mozo que abrió la mesa; no modifica los registros históricos. Esto resuelve el caso informado del pedido 6, cerrado, cuya autoría del cobro corresponde a administración. La verificación remota `scripts/restaurante-rendicion-mesa-smoke.sql` confirmó que se ofrece para rendición con el nombre Mozo, sin cambios de datos.

63 pruebas PostgreSQL locales pasaron con todas las migraciones aplicadas antes de las pruebas de negocio, incluidos recepción por caja/mozo, rechazo de receptor ajeno, rendición previa al cierre, atribución histórica y rendición duplicada. TypeScript, lint de los archivos modificados y build correctos. No se registraron cobros ni rendiciones de prueba en producción.
