# Referidos Vortex · publicación del 05/11/2026

## Experiencia del comercio

- La campaña aparece destacada antes de los avisos habituales en Notificaciones.
- Sigue visible tras marcarla como leída y aporta una unidad al contador de la
  campanita hasta registrar esa lectura.
- Ofrece WhatsApp, copiar enlace, código seleccionable, condiciones y contadores.
- No se agregaron tarjetas ni accesos en Mi Comercio.
- El modal se presenta después de seleccionar comercio y solo en las pantallas
  iniciales (`/`, `/inicio`, `/caja`, `/notificaciones`), evitando formularios de
  ventas y terminales operativas. Espera al recordatorio de vencimiento si está
  abierto.
- En producción, PostgreSQL reclama atómicamente la presentación una sola vez
  por comercio y campaña; se conserva entre dispositivos y navegadores. Leer la
  notificación es una acción independiente de ver/cerrar el modal.

## Prueba en localhost

Entrar al panel en http://localhost:8080 y seleccionar un comercio. El modal
aparece como vista previa con código `VX-DE0000000000`. Al cerrar permanece
la campaña destacada en `/notificaciones`, con el botón **Probar modal**.
Recargar localhost permite volver a probar la presentación.

El modo local se decide por hostname (`localhost`, `127.0.0.1`, `::1`), y no por
el modo de compilación de Vite: este repositorio utiliza `--mode production`
también al desarrollar. La vista previa no consume la presentación única de la
base productiva, no consulta referidos reales ni modifica licencias. El enlace
de prueba apunta a la landing local; el formulario informa que su envío es
simulado. Los enlaces reales apuntan a https://vortexgestion.netlify.app.

`/?ref=CODIGO#contacto` conserva la referencia y desplaza hasta contacto incluso
en la primera apertura del enlace. El envío real mantiene la validación,
honeypot, idempotencia y límites existentes de `enviar_consulta_landing`.

## Administración y beneficio

Nueva sección de plataforma **Referidos y bonificaciones**, en
`/admin/referidos`. Exclusiva de `is_app_admin()`:

1. Consulta recibida mediante enlace válido de un comercio participante.
2. Marcar en contacto o descartar la consulta.
3. Confirmar manualmente el primer pago, vinculando el comercio nuevo e indicando
   el comprobante o referencia verificada.
4. Confirmar la aplicación del mes bonificado.

Se bloquean comercios anteriores a la consulta, CUIT duplicado o compartido con
el referente, mismo comercio y administradores activos compartidos (se excluye
al administrador global de plataforma). Un comercio/CUIT nuevo puede originar
un solo premio. La validación se aplica en PostgreSQL, no solo en la interfaz.

La bonificación bloquea el registro y la licencia, extiende un mes calendario
desde el vencimiento actual (o desde hoy si venció), conserva fecha anterior,
fecha nueva, usuario y momento de aplicación, y envía un aviso exclusivamente
al referente. Reintentos y llamadas simultáneas no vuelven a sumar el mes.
Requiere que la membresía tenga vencimiento definido. No anula comprobantes ni
genera caja, pagos o facturas; la facturación de licencias existente sigue
siendo administrativa y se debe respetar el período bonificado al facturar.

El panel administrativo está sin conexión de escritura en localhost, para que
las pruebas del modal no puedan bonificar una licencia real por accidente.
El circuito de administración se verificó contra PostgreSQL temporal local.

## Persistencia y activación

- `20261105150000_programa_referidos.sql`: configuración global, participaciones
  por tenant, referencias, RLS y RPC de presentación, lectura, consulta y premio.
- `20261105150100_activar_campana_referidos.sql`: activación comercial inicial,
  separada de la estructura.
- `referidos_campanas` es configuración global de plataforma; las tablas
  operativas incluyen `comercio_id`, índices y políticas. No hay escrituras
  directas desde roles públicos; todas pasan por RPC con permisos limitados y
  `search_path` definido.
- Los detalles de los interesados solo se muestran a plataforma; cada comercio
  accede a su código y contadores, sin datos personales de otros comercios.
- Para detener la campaña se desactiva su fila; ya no se muestra ni acepta
  consultas nuevas. Se conservan referencias y auditoría.

El 05/11/2026, por autorización expresa del usuario, se aplicaron ambas
migraciones en Supabase `zhtqkygjvaaizbdwwsbi`, con guardas de estado, timeout de
bloqueo, registro en el historial y recarga del esquema de PostgREST dentro de
la misma transacción. No quedan migraciones locales pendientes. La campaña
está activa y se verificó su título en UTF-8.

Las cinco funciones remotas coinciden por hash con el archivo local. Las tres
tablas tienen RLS; los usuarios no pueden insertar referencias directamente y
el rol anónimo no puede presentar el modal, consultar el programa privado ni
bonificar. La RPC pública rechaza un código inválido sin registrar una consulta.
No se crearon referencias, participaciones ni bonificaciones de prueba reales.

Frontend publicado en https://vortexgestion.netlify.app, deploy
`6aec7685426dee03a9b95063`. El HTML apunta a `/assets/index-DeAYN0n-.js` y los seis
archivos JavaScript/CSS publicados coinciden por SHA-256 con el build local.
Las rutas `/login`, `/notificaciones` y `/admin/referidos` responden con ese
frontend. La publicación incluye también el login aprobado y los cambios
anteriores de presentación de clientes, localidades y variantes de venta.
No se desplegaron Edge Functions de Supabase ni se realizaron pagos reales.

Los controles funcionales autenticados se realizaron con PostgreSQL local y API
simulada; en producción se verificaron estructura, permisos, contratos públicos
y archivos publicados, sin consumir la presentación única de ningún cliente.

## Verificación

- `npx tsc --noEmit`: correcto.
- ESLint de todos los archivos modificados/nuevos: sin errores ni advertencias.
- `node scripts/test-referidos-sql.mjs`: PostgreSQL temporal, roles y RLS,
  aislamiento, modal único, lectura independiente, referencia y reintentos,
  validación del interesado, autorreferencias, primer pago, estado inválido,
  premio concurrente/idempotente, mes calendario, auditoría, aviso dirigido y
  campaña desactivada.
- `node scripts/test-referidos-ui.mjs`: componentes reales en Chrome con API
  simulada; StrictMode, modal local reabrible, producción única entre recargas,
  separación por comercio, notificación destacada después de leerla, enlace de
  WhatsApp, primera apertura en contacto, escritorio y móvil. No envía WhatsApp
  ni registra pagos reales.
- Capturas privadas en `private-backups/referidos-preview/` (excluidas de Git).
- La comprobación adicional con `tsconfig.app.json` conserva deuda de tipos
  previa del proyecto; no sustituye al comando raíz de TypeScript.
