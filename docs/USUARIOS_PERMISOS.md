# Usuarios y permisos generales

Implementación del 10/11/2026. Las dos migraciones y las nueve Edge Functions se instalaron en Supabase con autorización expresa del usuario. El frontend se publicó posteriormente por pedido expreso, en el despliegue `6af3a4e771d24bc5e8e604e5` de https://vortexgestion.netlify.app. No se crearon o modificaron cuentas reales.

## Uso

Configuración → Usuarios y permisos está disponible para el administrador de cualquier comercio activo, sin depender de Restaurante, Transporte ni otros módulos adicionales.

- Listado y búsqueda por nombre o correo.
- Alta en `/usuarios/nuevo`; edición en `/usuarios/:usuarioId/editar`.
- Nombre, correo de ingreso, contraseña inicial, rol general y estado activo.
- Perfiles sugeridos de vendedor, cajero, compras y stock, consulta, chofer, coordinador de Transporte y operario de Campo, con permisos ajustables.
- Se ofrecen solamente los módulos habilitados del comercio. Configuración general e identidades quedan reservadas a administración.
- Los administradores del comercio conservan acceso administrativo. Administrar un módulo no permite gestionar usuarios.
- Desactivar una cuenta conserva su identidad y los documentos e historial asociados. El administrador no puede quitar su propio acceso administrativo ni dejar al comercio sin administrador desde los accesos autenticados.
- Editar una cuenta no cambia su correo ni su contraseña global. El titular mantiene el cambio de contraseña en Seguridad. El alta no envía correos ni mensajes automáticos.

Las cuentas que ya pertenecen al comercio aparecen en la pantalla sin convertir automáticamente sus permisos. Se identifican como acceso existente. Al configurar y guardar una cuenta, se aplican los permisos seleccionados; los permisos de módulos deshabilitados no se conceden desde el formulario.

Un correo ya registrado en otra cuenta no se duplica ni se apropia desde un comercio. La vinculación de identidades compartidas que todavía no pertenecen al comercio requiere intervención de administración de la plataforma; no se cambia su contraseña desde esta pantalla.

## Integración con los módulos

- Transporte muestra nombre y correo en el selector de usuario del chofer, filtrando cuentas compatibles. El backend también rechaza una vinculación sin acceso a Transporte. El chofer sigue operando únicamente sus servicios asignados. Consulta, altas, edición, operación y facturación se autorizan por separado. Los permisos de crear, editar o facturar requieren la administración operativa de Transporte.
- Restaurante deriva las cuentas y roles a Configuración. Se mantienen las funciones nativas de mozo, cocina, barra y repartidor, su sector y el permiso de cobros del mozo. El sector se selecciona por nombre. Se conservan PIN y terminales en Restaurante.
- Campo deriva altas, bajas y permisos a Configuración. Conserva la vinculación de cuentas con operarios, ahora en una página con URL propia. Operar Campo conserva la autorización nativa sobre partes y recorridos propios; administrar Campo no equivale a administrar usuarios.
- Taller, Distribución, Apícola y Extintores tienen consulta y administración del módulo. Se conservan sus validaciones operativas. Registrar operaciones puede requerir además consulta de clientes, proveedores, productos y medios de pago, que se asigna explícitamente en el editor.
- Las ventas originadas dentro de un módulo autorizado reutilizan las funciones transaccionales de Gestión. Esa autorización no concede acceso general a Ventas fuera de ese flujo. Las notas de crédito o débito requieren el permiso adicional de anulación.

## Backend

Migraciones preparadas:

1. `20261110120000_usuarios_permisos_generales.sql`: accesos, auditoría, catálogo, validaciones, RLS restrictiva, gestión de cuentas y control previo de solicitudes de la API.
2. `20261110121000_integrar_permisos_modulos.sql`: operaciones existentes, Transporte y sus usuarios, funciones nativas, metadatos fiscales sin secretos, protección del administrador, Storage y validaciones por comercio en escrituras y lecturas de funciones privilegiadas.

No contienen reparaciones ni conversiones de datos de comercios. Las altas y cambios efectivos se realizan posteriormente mediante acciones del administrador.

`comercio_usuario_accesos` identifica los usuarios configurados. La ausencia de registro conserva el comportamiento anterior, sin ampliar los privilegios administrativos de operadores existentes. La asignación se valida contra el catálogo y la parametrización del comercio. Los cambios usan bloqueo por comercio y versión para impedir sobrescrituras concurrentes. `comercio_usuario_eventos` conserva la auditoría sin contraseñas.

Los usuarios configurados tienen validaciones en la API, políticas de filas y controles por comercio en funciones y escrituras. No se confía en el comercio elegido del navegador. Un permiso administrativo de otra empresa no autoriza operaciones sobre la empresa restringida. Los recursos nuevos de la API deben integrarse en `vortex_recurso_api` antes de habilitarlos a estas cuentas; los módulos especializados mantienen además sus controles nativos.

El control previo usa `pgrst.db_pre_request`; su configuración está documentada por [Supabase](https://supabase.com/docs/guides/api/securing-your-api) y el contexto de solicitud por [PostgREST](https://docs.postgrest.org/en/stable/references/transactions.html). Ese control no sustituye las políticas de Storage ni la autorización de las Edge Functions. La migración aborta si detecta otro control previo distinto, para no sobrescribir una integración existente. La consulta remota de solo lectura realizada en esta tarea no encontró un control previo configurado.

Las cuentas no administradoras consultan metadatos fiscales necesarios para operar sin recibir certificados ni claves. Las funciones que utilizan service_role validan al usuario y sus permisos antes de operar. La nueva Edge Function `usuarios-comercio` valida la administración antes de crear identidades; usa metadatos de aplicación confiables para vincular el alta y revierte la identidad nueva si falla la asignación. La compensación de Auth y la transacción de permisos son operaciones separadas: un fallo de conectividad durante esa compensación puede requerir revisar la identidad pendiente, sin concederle acceso al comercio.

## Estado de instalación

El usuario autorizó aplicar las migraciones y desplegar las funciones, manteniendo pendiente la publicación. Ambas migraciones se aplicaron en `zhtqkygjvaaizbdwwsbi` y las nueve funciones quedaron `ACTIVE`. La consulta posterior confirmó las dos versiones registradas, las tablas de accesos y auditoría y `pgrst.db_pre_request=public.vortex_validar_solicitud`. El dry-run final confirmó que no quedan migraciones pendientes. Se comprobó que todavía no hay cuentas configuradas en la tabla nueva.

Funciones desplegadas por código nuevo o dependencias compartidas modificadas:

- `usuarios-comercio`
- `obtener-cae-afip`
- `consultar-ultimo-comprobante`
- `consultar-padron-afip`
- `whatsapp-enviar-comprobante`
- `mercado-pago`
- `mercadopago-checkout`
- `mercadopago-oauth-callback`
- `mercadopago-webhook`

El empaquetado inicial de `mercadopago-oauth-callback` no detectó la importación de su dependencia local en el archivo minificado. Se aplicó formato al archivo, sin cambiar su comportamiento, y el despliegue individual posterior finalizó correctamente. Deno check también finalizó correctamente.

La comprobación HTTP de `usuarios-comercio` sin credenciales devolvió `401` y `Sesión inválida`, sin crear cuentas ni modificar datos.

La publicación del frontend fue autorizada posteriormente y se completó el 10/11/2026; ver `PUBLICACION_20261110.md`. No se deben crear usuarios de prueba en comercios reales ni registrar operaciones productivas para comprobar la instalación.

## Verificaciones

- `node scripts/test-usuarios-permisos.mjs`: 32 casos en PostgreSQL temporal local; aislamiento, permisos RLS/API, roles, compatibilidad, sesiones simultáneas, directorio y operaciones reales de Transporte, vinculación de operarios y protección de lecturas de Campo, venta real con permisos de vendedor, notas, auditoría, revocación, metadatos sin secretos y Storage. Usa las migraciones reales de usuarios, ventas, presupuestos, gestión de operadores de Campo y Transporte sobre un esquema mínimo local.
- `node scripts/test-usuarios-edge.mjs`: handler real con Auth/RPC simulados; nueve casos de autorización, alta, duplicados, compensación y edición sin alterar credenciales globales.
- `node scripts/test-usuarios-ui.mjs`: interacción en Chrome con hooks simulados; comercio genérico, perfiles, alta y edición en páginas, baja, conservación de datos ante error, cuenta ajena, chofer y selector de sectores.
- `node scripts/test-usuarios-rutas.mjs`: igualdad de catálogos frontend/backend, perfiles y permisos sobre rutas.
- Pruebas existentes de renderizado de Restaurante y Transporte y prueba de formularios de Transporte en Chrome.
- Deno check de las funciones modificadas. El ajuste de tipo de `PeriodoAsoc` en emisión fiscal no cambia el cálculo ni la comparación del período.
- `npx tsc --noEmit` y ESLint de los archivos frontend nuevos y modificados. El análisis semántico de los archivos revisados no mostró diagnósticos; el chequeo completo de `tsconfig.app.json` conserva errores en otros archivos del repositorio.
- Revisión de `git status`, diferencias y `git diff --check`, conservando el trabajo previo de Transporte y cobros.

Estas pruebas no reemplazan una validación manual de cuentas reales cuando se publique la interfaz. No se ejecutó alta remota de cuentas, cambio de permisos de usuarios productivos, emisión fiscal, cobro, envío de mensajes ni publicación.
