# Incidentes de plataforma

## Activación

La migración `supabase/migrations/20261015120000_incidentes_plataforma.sql` se aplicó con autorización en producción (`zhtqkygjvaaizbdwwsbi`) el 15/10/2026. El frontend se publicó en https://vortexgestion.netlify.app, deploy `6ad0b61d3db3be4bbde85b67`. No recupera incidentes históricos.

La opción **Administración → Incidentes** usa el permiso existente `is_app_admin()`. Incluye filtros por comercio, módulo, estado y fechas, páginas de 50 filas, actualización cada minuto y seguimiento con notas. Las fechas se filtran por días completos de Argentina (UTC−3).

## Cobertura

- Fallos de consultas de React Query, después de agotar los reintentos configurados.
- Fallos de mutaciones de React Query, incluso cuando el formulario maneja el error.
- Avisos `destructive` emitidos mediante `use-toast` (incluyen validaciones de uso).
- Errores no controlados del navegador y promesas rechazadas durante una sesión con comercio activo.

El módulo corresponde a la pantalla donde comenzó la consulta u operación; crear un producto desde Compras se registra como Compras. Si el usuario cambia de comercio o de sesión antes de terminar la operación, el error tardío se descarta para evitar atribuirlo al comercio incorrecto.

No captura errores que se ocultan completamente en el código, avisos de otras librerías, fallos de procesos de backend que no llegan al navegador, actividad anterior a la activación ni errores previos a disponer de una sesión y comercio. Sin conectividad no se garantiza registrar el incidente: no hay cola persistente ni reenvío para evitar guardar información de errores en el dispositivo.

## Seguridad y datos

Los usuarios autenticados solo pueden reportar mediante `registrar_incidente`, que verifica pertenencia activa al comercio o el rol de administrador de plataforma. El servidor asigna usuario y fecha, valida formato y limita a 60 registros por usuario por minuto. RLS restringe lectura al administrador de plataforma. No hay permisos directos de inserción, modificación o eliminación; el seguimiento se realiza mediante una RPC que verifica el administrador.

El cliente omite variables de formularios, cuerpos de solicitudes, parámetros de URL, hashes y stack traces. Reduce el mensaje a 1600 caracteres y oculta patrones comunes de secretos, emails, identificadores y valores entre comillas. La sanitización es una protección por patrones: no es una garantía de anonimización de cualquier texto libre. Los registros deben tratarse como información interna. Los mensajes proceden del cliente y sirven para diagnóstico, no como auditoría de operaciones.

Se suprimen duplicados idénticos durante cinco segundos y avisos que siguen inmediatamente a un fallo de React Query; además se limita a 30 envíos por minuto en cada sesión del navegador. El registro es asíncrono, sin bloquear ni modificar el resultado de la operación original. Sus propios fallos se descartan y las pantallas administrativas no se reportan para evitar ciclos.

## Verificación

`node scripts/test-incidentes.mjs` verifica sanitización, límites, deduplicación, fallos del transporte, integración con QueryClient real, cambio de comercio, filtros, rango de fechas, paginación y controles del hook. Supabase se simula en estas pruebas; no verifican RLS real.

`node scripts/test-incidentes-sql.mjs` verificó en PostgreSQL temporal local el aislamiento por comercio, pertenencia activa, bloqueo de anónimos, lectura exclusiva del administrador, rechazo de escritura directa, seguimiento y límite de frecuencia. En producción se comprobó que las RPC y la tabla rechazan accesos anónimos; no se crearon registros de prueba.

Para la validación funcional con sesión y datos del comercio:

1. Usuario del comercio A puede reportar para A; no puede hacerlo para B.
2. Usuario común no puede leer incidentes ni cambiar estados/notas, tampoco por RPC o acceso directo.
3. Sesión anónima no puede reportar, leer ni cambiar estados.
4. Administrador de plataforma puede consultar todos los comercios y guardar seguimiento.
5. Provocar un alta duplicada desde Compras: debe conservarse el rechazo original y verse el incidente con fecha de servidor y módulo Compras.
6. Probar filtros, paginación, vista móvil, mensajes vacíos, falta de migración y falta de conectividad.

No se implementa purga automática de registros. La retención y cualquier eliminación requieren definir un criterio y autorizar su ejecución.
