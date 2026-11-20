# Copias de seguridad del panel administrador

## Restauración habilitada en localhost por solicitud expresa (20/11/2026)

Se activó únicamente `BACKUP_RESTORE_ENABLED=true` en la configuración privada del
servicio local y se reinició sin trabajos activos. No se cambió Netlify, no se
ejecutaron más migraciones ni se inició un reemplazo de datos. La carga desde PC,
análisis, selección de alcance, confirmación y respaldo previo siguen siendo
obligatorios. Esta habilitación local se solicitó expresamente; continúa pendiente
el ensayo integral de recuperación contra una API Supabase aislada, incluido
Storage. Las referencias a restauración deshabilitada más abajo describen el
estado anterior a esta habilitación.

Se validó la copia completada `ed5a5af6-dd91-4341-8b34-6070048a2b41` sin restaurarla:
hash cifrado, autenticación AES-GCM, entradas tar, hashes internos, catálogo,
esquema actual y selección de 22.301 filas. Ese archivo no contiene archivos de
Storage. Los temporales descifrados se eliminaron de la carpeta privada al terminar.
Resultado sin datos operativos: `private-backups/admin-generator/restore-enable-validation.json`.

El lector anterior rechazaba números de alta precisión presentes en esta copia.
Se agregó un parser/serializador JSON sin pérdida: conserva los literales bigint,
numeric y JSON anidado al generar SQL, sin convertirlos a strings de negocio ni
redondearlos como Number. Las claves FK comparan valores equivalentes con distinta
escala. Pruebas de archivo/HTTP y PostgreSQL temporal verifican importes decimales,
identificadores grandes, JSON y conservación del otro comercio; no se usó una
restauración productiva como prueba.

## Servicio de generación en localhost configurado (20/11/2026)

`npm run dev` conserva su conexión actual al proyecto de producción
`zhtqkygjvaaizbdwwsbi`. Vite inicia el servicio local de respaldos en segundo plano
si existe su configuración privada, y reenvía únicamente
`/.netlify/functions/admin-backups` a `127.0.0.1:8787`. También puede iniciarse con
`INICIAR-BACKUPS.cmd`. No se inicia un worker que consuma la cola al arrancar:
los procesos se lanzan sólo ante solicitudes autenticadas del administrador general.

Configuración privada: `private-backups/admin-generator/local-service.env`, creada
por `node scripts/setup-local-backup-service.mjs` en la carpeta protegida existente.
Reutiliza la clave AES de `generator.env`; no rota la clave ni publica secretos.
`ca.pem` y PostgreSQL 17 deben estar disponibles. No utiliza el runtime Linux en
Windows y no instala dependencias. Vite rechaza el acceso HTTP a `private-backups`
y `.netlify`; la API local rechaza hosts/orígenes ajenos a localhost.

Cada trabajo obtiene su conexión temporal y renueva la credencial antes de expirar
entre comandos. El pooler requiere `SET ROLE postgres` dentro de la sesión de
`psql` y `--role postgres` para `pg_dump`; las opciones de inicio por sí solas no
dan acceso a Storage. No se cambian contraseñas permanentes ni permisos almacenados.
Las credenciales son del proceso servidor y nunca variables `VITE_`.

Comprobación independiente: `node scripts/local-backup-job.mjs --check`.
Sólo comprueba herramientas, SELECT, API e inventario; no anuncia heartbeat,
reclama trabajos ni crea copias. El servicio repite esa comprobación periódicamente
cuando no tiene trabajos activos. La descarga firmada se prepara desde el mismo
servicio, sin depender de una Edge Function desplegada.

Una solicitud **pendiente, sin reclamar y de más de 20 minutos** no bloquea el botón
de una copia nueva. Su vencimiento se registra por la RPC existente al solicitar
la siguiente, no al cargar la página. Un trabajo `procesando` sigue bloqueando.
No se reparó la solicitud histórica ni se generaron copias de prueba en producción.

Verificado: herramientas nativas, conexión TLS, API y cobertura de buckets; health
con `ready=true`, cero trabajos locales activos; proxy desde localhost con HTTP 401
sin sesión y bloqueo HTTP 403 de archivos privados. Las pruebas de HTTP usan datos
simulados y verifican autenticación, origen, solicitud, fallo de lanzamiento y
descarga. No equivalen a una generación real ni a un ensayo integral de recuperación.
La restauración continúa deshabilitada (`BACKUP_RESTORE_ENABLED=false`) hasta el
ensayo aislado. Para generar desde localhost, la PC y el servicio deben permanecer
encendidos hasta que el historial indique que finalizó el trabajo.

La primera solicitud individual recibida desde el panel se detuvo en el control de
cobertura por `membresia_pagos_mercadopago.receptor_comercio_id`: el esquema define
ese UUID como el comercio receptor del cobro de la plataforma, distinto del tenant
pagador. Se agregó una política explícita `externalComercioReferences` para esa FK.
Conserva el UUID en la fila propia y **no exporta datos del comercio receptor**;
la recuperación exige que ese padre exista en el destino y valida la FK. No se
permite omitir `comercio_id` ni extender la excepción a otra relación por nombre.
La validación posterior en lectura del alcance solicitado seleccionó 184 tablas,
176 filas y exactamente un comercio. No creó otro trabajo ni un archivo de backup;
la solicitud fallida se conserva para auditoría y debe volver a pedirse desde el
panel. Se añadieron pruebas ficticias para la referencia externa y el aislamiento.

## Migración de restauración aplicada en producción (20/11/2026)

Con autorización expresa se aplicó únicamente `20261120120000_admin_backup_restore.sql`
al proyecto `zhtqkygjvaaizbdwwsbi`, en una transacción con validación de dependencias,
control de cambios sobre la función anterior y tiempos de espera limitados. Se
registró en `supabase_migrations.schema_migrations` y se notificó la recarga de
esquema de PostgREST. No se publicaron frontend ni funciones, ni se inició una
restauración, ni se reparó la solicitud de copia pendiente.

Verificación posterior: RLS habilitada en ambas tablas nuevas, 187 guards activos
(184 tablas operativas y tres controles de Storage), ninguna tabla operativa sin
guard, cero trabajos/bloqueos de restauración y permisos de solicitud/reclamación
separados. Se conservaron los 14 comercios y el único trabajo de backup existente.
La definición anterior, SQL ejecutado, hash y comprobaciones se guardaron en
`private-backups/admin-restore-migration-20261120/`, excluido de Git.

La migración **no habilita por sí sola las copias en localhost**: Vite todavía
necesita un servicio local que atienda las rutas `/.netlify/functions/` de backups.
La activación integral y ensayo de restauración siguen pendientes.

## Desarrollo de restauración del 20/11/2026 (sin publicar)

Se agregó `/admin/backups/restaurar` y el detalle `/admin/backups/restaurar/:id`.
El panel se organiza en cuatro pestañas: Realizar copia, Restaurar, Últimas 100
copias y Últimas 100 restauraciones. La pestaña y los detalles se conservan en URL.
El administrador general carga el `.enc` guardado en su PC; el servidor autentica
AES-GCM, extrae solamente entradas permitidas, verifica hashes, conteos, catálogo,
esquema y política de cobertura. No ejecuta el SQL del archivo importado.

Una copia general nueva permite elegir **todos los comercios o uno solo**. Una
individual sólo permite el comercio de origen. Se recuperan datos operativos de
`public` y los archivos de Storage del alcance. La restauración individual recorre
las FK y conserva los registros y archivos de otros comercios. Los catálogos
compartidos existentes se conservan; se reponen padres referenciados ausentes.
Un ID histórico que hoy pertenezca a otro alcance detiene la operación.

La recuperación del panel conserva las identidades de Auth, contraseñas, sesiones,
administradores globales y auditoría de copias actuales. **No equivale a una
recuperación de infraestructura o de Auth tras perder todo el proyecto.** Para esa
contingencia se conserva `database.dump` en la general y se necesita un Supabase
aislado, credenciales/clave AES guardadas fuera del proveedor y el procedimiento
técnico de recuperación. No se deben prometer cuentas históricas recuperadas por
el botón del panel.

Antes de reemplazar, se solicita confirmación explícita y se activa mantenimiento
en PostgreSQL: los triggers rechazan escrituras operativas y de Storage. Se genera
una copia general previa y se verifica su carga cifrada antes del primer reemplazo.
El historial permite descargarla. El reemplazo SQL usa una transacción, restaura
triggers y restricciones, valida FK y compara **todas** las tablas operativas antes
y después (incluidas las filas ajenas). No requiere `session_replication_role`.
Las secuencias nunca retroceden. Si una general retira comercios posteriores al
respaldo, sus trabajos históricos se conservan con `resumen.comercio_original_id`.

Storage se recupera después del commit SQL: no existe una transacción distribuida
entre ambos servicios. Cada archivo recuperado se verifica por hash y se verifica
el inventario final. Si hay un fallo o corte, el sistema continúa en mantenimiento,
el historial muestra **Interrumpida** y permite reanudar el mismo archivo/alcance,
reutilizando la copia previa. Tras una invocación terminada abruptamente, el control
de recuperación se ofrece después de 20 minutos. **Nunca desbloquear manualmente
para continuar operando con una restauración parcial.** La descarga de la copia
previa y los accesos administrativos permanecen disponibles.

Activación pendiente, sólo con autorización para cambios remotos y publicación:

1. Verificar la migración de respaldos ya registrada y aplicar sólo las pendientes
   `20261119130000_admin_backups_cloud.sql` y
   `20261120120000_admin_backup_restore.sql`; no arrastrar otras migraciones.
2. Empaquetar y verificar el runtime Linux y la CA; desplegar las funciones de
   generación/restauración y el frontend con los secretos de servidor existentes.
3. La conexión de recuperación debe ser propietaria de las tablas operativas para
   diferir FK y deshabilitar/restablecer triggers de usuario. Verificarlo en un
   Supabase aislado con permisos equivalentes a los reales, **sin superusuario**.
   Ensayar también el token privado del guard de Storage mediante su API real.
4. Completar un ensayo integral con al menos dos comercios y sus módulos, incluida
   la copia previa, carga desde PC, restauración general/individual, contenido de
   Storage ajeno intacto y reanudación tras un fallo. Sólo entonces configurar
   `BACKUP_RESTORE_ENABLED=true` en el entorno de funciones. Por defecto está
   deshabilitada; no se configuró ni desplegó nada remoto en este desarrollo.

Límites de esta versión: copias nuevas con `restore_version: 2`, catálogo y esquema
idénticos al destino; archivo cifrado máximo 256 MB, tar descomprimido máximo 1 GiB,
además de la capacidad de disco/memoria/tiempo y límites de carga del proveedor.
Un archivo aceptado por tamaño puede requerir un host de recuperación con más
recursos. Los archivos anteriores se siguen descargando; no se habilitan como
restaurables si no contienen el índice. Los números que perderían precisión en
JavaScript se rechazan y requieren recuperación técnica. No se admiten tablas
particionadas. Toda tabla operativa futura requiere el trigger de mantenimiento;
la prevalidación cancela si falta. No se instala ninguna dependencia nueva.

Pruebas locales (servicios externos no utilizados):

- `node --test scripts/test-admin-backups.mjs`: cifrado, autenticación, extracción
  y manifiesto, manipulación, límites, política de rutas y precisión.
- `node scripts/test-admin-backups-postgres.mjs`: instancia temporal con comercios
  ficticios, migraciones/RLS, selección, reemplazo, mantenimiento y rollback.
- `node scripts/test-backup-restore-ui.mjs`: pantalla React real en Chrome con hooks
  simulados; no constituye un ensayo del servicio Netlify/Supabase.

Resultado local: seis pruebas de archivos/cifrado aprobadas; reemplazo PostgreSQL
individual desde general con rol propietario **sin superusuario**, conservación
del segundo y tercer comercio, general con eliminación del comercio posterior y
auditoría preservada, identity/generated, RLS, mantenimiento y rollback aprobados.
Chrome verificó las cuatro pestañas, selección, carga sin reemplazo, confirmación,
servicio deshabilitado y rechazo de acceso no administrador con hooks simulados.
No se ensayó una recuperación integral contra la API real de Supabase/Netlify.

`npx tsc --noEmit` finaliza correctamente con el comando habitual del repositorio.
La revisión ampliada `npx tsc --noEmit -p tsconfig.app.json` detecta 34 errores fuera
de los archivos de backups. El lint de los archivos de esta implementación termina
sin errores ni advertencias. El lint global incluye copias auxiliares dentro de
`.netlify` y devuelve 409 errores/33 advertencias; excluyendo `.netlify` y
`private-backups`, el código actual tiene 127/11, por encima de la referencia
histórica de 108/9 indicada en AGENTS.md. Ninguno corresponde a los archivos de
esta implementación. No se corrigió deuda ajena al alcance. Los informes se
conservaron en `private-backups/admin-generator/restore-{lint.json,typescript.txt}`.

Las secciones siguientes documentan el diagnóstico y generador original del 19/11;
sus referencias a restauración pendiente corresponden a ese estado anterior.

## Desarrollo de restauración del 20/11/2026 (sin publicar)

Se agregó `/admin/backups/restaurar` y el detalle `/admin/backups/restaurar/:id`.
El administrador general carga el `.enc` guardado en su PC; el servidor autentica
AES-GCM, extrae solamente entradas permitidas, verifica hashes, conteos, catálogo,
esquema y política de cobertura. No ejecuta el SQL del archivo importado.

Una copia general nueva permite elegir **todos los comercios o uno solo**. Una
individual sólo permite el comercio de origen. Se recuperan datos operativos de
`public` y los archivos de Storage del alcance. La restauración individual recorre
las FK y conserva los registros y archivos de otros comercios. Los catálogos
compartidos existentes se conservan; se reponen padres referenciados ausentes.
Un ID histórico que hoy pertenezca a otro alcance detiene la operación.

La recuperación del panel conserva las identidades de Auth, contraseñas, sesiones,
administradores globales y auditoría de copias actuales. **No equivale a una
recuperación de infraestructura o de Auth tras perder todo el proyecto.** Para esa
contingencia se conserva `database.dump` en la general y se necesita un Supabase
aislado, credenciales/clave AES guardadas fuera del proveedor y el procedimiento
técnico de recuperación. No se deben prometer cuentas históricas recuperadas por
el botón del panel.

Antes de reemplazar, se solicita confirmación explícita y se activa mantenimiento
en PostgreSQL: los triggers rechazan escrituras operativas y de Storage. Se genera
una copia general previa y se verifica su carga cifrada antes del primer reemplazo.
El historial permite descargarla. El reemplazo SQL usa una transacción, restaura
triggers y restricciones, valida FK y compara **todas** las tablas operativas antes
y después (incluidas las filas ajenas). No requiere `session_replication_role`.
Las secuencias nunca retroceden. Si una general retira comercios posteriores al
respaldo, sus trabajos históricos se conservan con `resumen.comercio_original_id`.

Storage se recupera después del commit SQL: no existe una transacción distribuida
entre ambos servicios. Cada archivo recuperado se verifica por hash y se verifica
el inventario final. Si hay un fallo o corte, el sistema continúa en mantenimiento,
el historial muestra **Interrumpida** y permite reanudar el mismo archivo/alcance,
reutilizando la copia previa. Tras una invocación terminada abruptamente, el control
de recuperación se ofrece después de 20 minutos. **Nunca desbloquear manualmente
para continuar operando con una restauración parcial.** La descarga de la copia
previa y los accesos administrativos permanecen disponibles.

Activación pendiente, sólo con autorización para cambios remotos y publicación:

1. Verificar la migración de respaldos ya registrada y aplicar sólo las pendientes
   `20261119130000_admin_backups_cloud.sql` y
   `20261120120000_admin_backup_restore.sql`; no arrastrar otras migraciones.
2. Empaquetar y verificar el runtime Linux y la CA; desplegar las funciones de
   generación/restauración y el frontend con los secretos de servidor existentes.
3. La conexión de recuperación debe ser propietaria de las tablas operativas para
   diferir FK y deshabilitar/restablecer triggers de usuario. Verificarlo en un
   Supabase aislado con permisos equivalentes a los reales, **sin superusuario**.
   Ensayar también el token privado del guard de Storage mediante su API real.
4. Completar un ensayo integral con al menos dos comercios y sus módulos, incluida
   la copia previa, carga desde PC, restauración general/individual, contenido de
   Storage ajeno intacto y reanudación tras un fallo. Sólo entonces configurar
   `BACKUP_RESTORE_ENABLED=true` en el entorno de funciones. Por defecto está
   deshabilitada; no se configuró ni desplegó nada remoto en este desarrollo.

Límites de esta versión: copias nuevas con `restore_version: 2`, catálogo y esquema
idénticos al destino; archivo cifrado máximo 256 MB, tar descomprimido máximo 1 GiB,
además de la capacidad de disco/memoria/tiempo y límites de carga del proveedor.
Un archivo aceptado por tamaño puede requerir un host de recuperación con más
recursos. Los archivos anteriores se siguen descargando; no se habilitan como
restaurables si no contienen el índice. Los números que perderían precisión en
JavaScript se rechazan y requieren recuperación técnica. No se admiten tablas
particionadas. Toda tabla operativa futura requiere el trigger de mantenimiento;
la prevalidación cancela si falta. No se instala ninguna dependencia nueva.

Pruebas locales (servicios externos no utilizados):

- `node --test scripts/test-admin-backups.mjs`: cifrado, autenticación, extracción
  y manifiesto, manipulación, límites, política de rutas y precisión.
- `node scripts/test-admin-backups-postgres.mjs`: instancia temporal con comercios
  ficticios, migraciones/RLS, selección, reemplazo, mantenimiento y rollback.
- `node scripts/test-backup-restore-ui.mjs`: pantalla React real en Chrome con hooks
  simulados; no constituye un ensayo del servicio Netlify/Supabase.

Las secciones siguientes documentan el diagnóstico y generador original del 19/11;
sus referencias a restauración pendiente corresponden a ese estado anterior.

## Estado y activación

### Diagnóstico para ejecución en Netlify (19/11/2026)

Sitio confirmado: `vortexgestion` (`b9996f69-d630-4d0f-ac21-d2a646930add`). La consulta de configuración remota confirmó que no hay `DATABASE_URL`, `PGPASSWORD`, `SUPABASE_DB_PASSWORD` ni `BACKUP_ENCRYPTION_KEY` en el entorno de Netlify. No se imprimieron valores de variables. Se puede repetir esta inspección con `node scripts/inspect-backup-cloud.mjs`, usando la sesión local existente de Netlify.

La base remota ocupa 196 MB y usa PostgreSQL 17.4. Se comprobó que el rol `postgres` no tiene permiso SET sobre `session_replication_role`; por ello, el SQL de recuperación aislada preparado anteriormente **no está validado para la base alojada en Supabase**, y no debe presentarse como restauración disponible en producción.

La adaptación a Netlify sigue pendiente: las herramientas PostgreSQL encontradas son ejecutables Windows locales y no se pueden subir como herramientas de una función Linux. Debe prepararse y verificarse un runtime compatible, conexión PostgreSQL, almacenamiento de respaldo y procedimiento de restauración compatible con los permisos reales. No se desplegaron funciones Netlify que anuncien respaldo/restauración operativos ni se cambiaron credenciales remotas. No se restableció la contraseña de base de datos.

Para seguir con la conexión, el responsable puede completar `PGPASSWORD` en el archivo privado `private-backups/admin-generator/generator.env`; no copiar contraseñas en la conversación. El archivo tiene ACL restringida. Una vez disponible la conexión y resuelta la adaptación, se deben verificar los paquetes realmente desplegados y realizar el ensayo integral de recuperación antes de anunciar la función como habilitada.

El 19/11/2026 se aplicó únicamente la migración `20261119120000_admin_backups.sql` al proyecto `zhtqkygjvaaizbdwwsbi` y se desplegó `admin-backups` (versión 1, ACTIVE). Se verificaron el registro de migración, RLS, bucket privado, restricciones de escritura y reclamación de trabajos para clientes, y respuesta HTTP 401 de la función sin sesión. El generador y su configuración siguen pendientes; no se publicó el frontend. Antes de habilitar la generación en producción se requiere un ensayo completo de generación y restauración en un Supabase aislado, con dos comercios y todos los módulos usados. Los tests de cifrado no validan la integridad del respaldo de negocio.

Componentes: `/admin/backups`, tabla privada de trabajos, RPC de solicitud solo para `app_admins`, RPC de reclamación exclusiva para `service_role`, función `admin-backups` para descargas firmadas de 60 segundos y worker Node de larga duración. No instalar el worker en una Edge Function: utiliza PostgreSQL CLI y disco privado. No requiere dependencias npm nuevas.

Activación, con autorización del responsable:

1. Aplicar únicamente `20261119120000_admin_backups.sql`; no aplicar otras migraciones pendientes por arrastre.
2. Desplegar `admin-backups` y el frontend. La función valida sesión y pertenencia a `app_admins` internamente.
3. Preparar un host privado con Node 20+, `psql`, `pg_dump` compatible con la versión del servidor y `tar`. No se instalan automáticamente. Configurar tamaño máximo permitido de Storage acorde al respaldo previsto. El worker usa upload estándar, sujeto a límites del proveedor.
4. Configurar secretos solo en ese host: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSSLMODE=verify-full`, `PGSSLROOTCERT`, `BACKUP_ENCRYPTION_KEY` (32 bytes aleatorios como 64 caracteres hexadecimales), `BACKUP_POLICY_FILE`, `BACKUP_OFFSITE_DIR` y opcionalmente `BACKUP_WORK_DIR`, `BACKUP_PSQL`, `BACKUP_PG_DUMP`. Usar conexión directa o session pooler de PostgreSQL, no transaction pooler.
5. `BACKUP_OFFSITE_DIR` debe apuntar a un volumen externo/NAS protegido y realmente independiente del servicio y disco de trabajo. El código comprueba que sea otra carpeta y valida el hash; la independencia física requiere configuración del operador. Guardar la clave AES en un gestor de secretos y una copia de recuperación separada: perderla impide recuperar los archivos.
6. Ejecutar `node scripts/admin-backup-worker.mjs` como servicio único supervisado. `--once` procesa como máximo un trabajo. El panel solo habilita solicitudes si hay heartbeat reciente. No se ejecuta desde el navegador.

No hay borrado desde la interfaz ni restauración sobre producción. Los trabajos y su alcance quedan auditados. Se muestra un máximo de 100 trabajos recientes. La cola permite un único respaldo activo. Si el proceso se interrumpe abruptamente, revisar el respaldo incompleto y marcar el trabajo fallido mediante una intervención administrativa autorizada antes de solicitar otro; no reenviar un trabajo ya procesado.

## Política de alcance del comercio

Se preparó `config/backup-policy.json` a partir del esquema y los buckets consultados el 19/11/2026. `referidos_campanas` es configuración global. `notificaciones` usa `referencedTables`: incluye únicamente avisos vinculados a filas seleccionadas del comercio, sin copiar avisos destinados a otros. Los cinco buckets operativos actuales usan `{comercio_id}/`; se verificó ese formato en los 465 objetos existentes. Cualquier bucket nuevo sin política detiene la copia individual.

Crear un JSON privado revisado contra el esquema real. No copiar nombres de ejemplo sin revisar:

```json
{
  "version": 1,
  "excludedTables": [],
  "sharedTables": [],
  "storage": {
    "bucket-con-carpetas-por-comercio": { "prefix": "{comercio_id}/" },
    "bucket-solo-con-recursos-globales": { "exclude": true }
  }
}
```

El worker no adivina por nombre qué tablas/archivos pertenecen a un comercio. Parte de `comercio.id` y de todas las tablas públicas con `comercio_id`; expande los detalles mediante claves foráneas y verifica que no queden padres públicos fuera de la selección. No amplía tablas con `comercio_id` por otras relaciones. Si detecta un vínculo cruzado, una tabla poblada sin clasificar, una política que comparte/excluye tablas operativas o tablas particionadas, falla sin publicar un respaldo completo.

`excludedTables` solo admite tablas globales que no deban formar parte de un respaldo individual, por ejemplo auditoría administrativa global, una vez revisadas. `sharedTables` incluye todos los registros de catálogos globales realmente públicos para todos los comercios. Ambas clasificaciones exigen revisión; el código no puede deducir relaciones de negocio que no existen como FK. No declarar una tabla con datos privados como catálogo compartido. Se omiten por diseño `app_admins`, `admin_backups` y `admin_backup_worker` del individual.

Cada bucket que tenga objetos necesita política. El prefijo debe incluir el UUID del comercio y terminar con `/`. Los buckets con archivos sin organización por tenant requieren un selector específico antes de poder respaldarlos por comercio; no marcarlos globales para sortear la validación. `exclude` solo corresponde a recursos globales que se conservan aparte. El bucket de copias se excluye siempre para evitar respaldos recursivos. Si el inventario de archivos cambia durante la generación, el trabajo falla y debe reintentarse. Evitar cambios de esquema mientras se generan copias individuales.

El individual incluye `schema.sql`, datos en `tenant.ndjson`, inventario y archivos binarios de Storage. Las identidades `auth` son compartidas y no se copian al archivo individual; sus vínculos operativos sí. La recuperación individual requiere conservar o mapear esas identidades desde el sistema o respaldo general. El general es un `pg_dump` custom completo de la base accesible por el usuario configurado, con roles/propietarios del destino gestionados por separado; incluye datos Auth y metadatos Storage pero los archivos van aparte. La configuración externa (OAuth, secretos Edge, DNS, certificados del host) se conserva mediante el procedimiento de infraestructura, no en el dump.

## Formato y recuperación

Archivo `backup.tar.gz.enc`: cabecera `VXBACK01`, IV de 12 bytes, contenido tar comprimido con gzip y cifrado con AES-256-GCM, seguido por tag de autenticación de 16 bytes. El SHA-256 del cifrado figura en el panel. El manifiesto interno contiene hashes de datos/inventarios y cada archivo Storage tiene hash propio. El worker verifica la segunda copia y vuelve a descargar/verificar la copia privada antes de marcar completado. Elimina los temporales de datos sin cifrar del trabajo al terminar; usar disco cifrado y ACL privadas para protegerlos durante generación y ante cortes de energía. Los cifrados locales y la segunda copia se conservan; definir retención operativa según capacidad disponible.

Para preparar recuperación, en un host privado y con la clave cargada:

```powershell
node scripts/verify-admin-backup.mjs decrypt backup.tar.gz.enc recuperacion.tar
mkdir recuperacion
tar -xf recuperacion.tar -C recuperacion
node scripts/verify-admin-backup.mjs verify recuperacion
```

No extraer un archivo si el descifrado devuelve error. El script no sobrescribe el tar existente. No compartir el tar descifrado por canales públicos.

Ensayo obligatorio antes de producción:

1. Restaurar el general con `pg_restore` en un Supabase aislado compatible, usando el procedimiento oficial de Supabase para roles, Auth y extensiones. Nunca apuntar este ensayo a la base activa. No usar `--clean` sobre producción.
2. Para el individual, preparar el esquema compatible y las identidades referenciadas en el destino aislado. Ejecutar `node scripts/prepare-tenant-recovery.mjs recuperacion/tenant.ndjson recuperacion.sql`. Esto solo prepara SQL para revisión, no conecta a ninguna base. Tras revisar el archivo, el operador debe ejecutarlo con `psql -X -v ON_ERROR_STOP=1 -f recuperacion.sql` apuntando exclusivamente al Supabase aislado y con `PGOPTIONS=-c vortex.recovery_isolated=yes`. Requiere privilegios para `session_replication_role`. Rechaza destinos con comercios o tablas de importación pobladas; preserva valores UUID/identity, omite columnas generadas y triggers operativos, verifica FK (incluidas identidades Auth) y reajusta secuencias. Todo ocurre en una transacción. El esquema debe coincidir exactamente; no ejecutar este SQL contra producción. El NDJSON preserva tabla y conteos. El registro `kind=manifest` identifica comercio, exclusiones y catálogos compartidos.
3. Recuperar cada archivo listado en `storage.json` al bucket y nombre original mediante Storage API; no basta con restaurar sus metadatos PostgreSQL. Usar los hashes para verificar contenido y configurar permisos del destino.
4. Comparar conteos por tabla, referencias, ventas/detalles, caja, saldos, stock y módulos específicos. Con dos tenants de prueba, verificar explícitamente que el individual del primero no contiene datos ni archivos del segundo. Verificar que un usuario común no pueda listar, solicitar ni descargar copias.
5. Registrar resultado y tiempo de recuperación. Mientras este ensayo no exista, el panel dice que la restauración está pendiente de ensayo; "completado" indica generación/verificación del archivo, no recuperación funcional comprobada.

## Comprobaciones locales

PostgreSQL 17 se encontró en `C:/Program Files/PostgreSQL/17/bin`, fuera del PATH. El worker detecta esa ubicación automáticamente en Windows. `node scripts/test-admin-backups-postgres.mjs` crea una instancia temporal con datos ficticios en `private-backups`, comprueba selección por tenant y FK, rechazo de tablas desconocidas y políticas inseguras; al finalizar detiene y elimina únicamente esa instancia. No toca el servicio PostgreSQL existente ni Supabase.

Se creó `private-backups/admin-generator/generator.env` con ACL restringida en Windows y clave AES aleatoria. No está versionado y no debe compartirse por chat. `node scripts/setup-admin-backup.mjs` no reemplaza archivos existentes ni rota claves. Antes de iniciar, completar en ese archivo `SUPABASE_SERVICE_ROLE_KEY`, `PGPASSWORD`, `PGSSLROOTCERT` (certificado de CA confiable) y `BACKUP_OFFSITE_DIR`; revisar host/puerto/usuario si se usa session pooler. Conservar una copia segura de la clave de recuperación en un lugar separado.

Comprobar sin anunciar disponibilidad ni procesar trabajos:

```powershell
node --env-file=private-backups/admin-generator/generator.env scripts/admin-backup-worker.mjs --check
```

Luego, en el host elegido, `INICIAR-BACKUPS.cmd` inicia el proceso con esa configuración. En Windows requiere permanecer abierto; todavía no se registró como servicio ni tarea programada. Falta elegir host permanente, configurar conexión/segunda copia y completar un ensayo integral antes de operar contra producción.

`node --test scripts/test-admin-backups.mjs` prueba cifrado/descifrado, rechazo de alteraciones, política de prefijos e identificadores. Se requiere PostgreSQL local para probar la exportación y migración; no ejecutar estos ensayos contra producción.

Referencias: https://supabase.com/docs/guides/platform/backups y https://www.postgresql.org/docs/current/app-pgdump.html.
