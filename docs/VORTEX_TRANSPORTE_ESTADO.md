# Vortex Transporte: estado de implementación

## Carga administrativa de viajes realizados — 14/11/2026

- Administración dispone únicamente de **Registrar viaje realizado**, página `/transporte/servicios/realizado`. La URL anterior `/transporte/servicios/nuevo` redirige a esta carga para administración. El chofer conserva el seguimiento por etapas en sus servicios asignados, sin acceso a la carga administrativa; administración no muestra los botones de avance por etapas.
- Una sola página con Servicio, Operación e Importe; contactos, expediente y documentación complementaria quedan en **Más datos**. Fecha real obligatoria, unidad y chofer obligatorios; odómetros opcionales, ambos juntos si se conocen. La fecha real se conserva en `programado_at`, usada como fecha del servicio en grillas y filtros; `created_at` y el evento registran cuándo y quién lo cargó.
- **Guardar y cargar otro** finaliza el viaje y limpia el formulario. **Guardar y liquidar** abre su liquidación con el viaje seleccionado; requiere permiso de facturación. Se conservan comprobantes, contado, cuenta corriente, pagos y emisor existentes. Los viajes también pueden liquidarse agrupados por cliente desde la grilla habitual.
- Después de confirmar la venta aparece un enlace directo a `/ventas?detalle=<id>` para consultar y continuar la emisión fiscal y el CAE desde Gestión. Guardar el viaje o registrar la venta no solicita automáticamente autorización fiscal.
- Migración local preparada: `20261114100000_transporte_viaje_realizado.sql`. La RPC valida administración, crear y operar, tenant, fecha no futura, asignaciones y kilómetros; conserva el cálculo comercial actual. Alta y finalización son atómicas, con identificación estable y bloqueo para reintentos sin duplicados. No crea etapas intermedias ficticias.
- Los odómetros retrospectivos se conservan en el servicio y **no actualizan el odómetro actual ni agregan lecturas a la unidad**. Por ello no alteran las alertas ni el indicador de kilómetros del mes basado en lecturas. La carga de lecturas de unidad conserva su circuito habitual.
- Verificación local: 53 pruebas PostgreSQL y 10 casos de cálculo; prueba automatizada en Chrome con datos ficticios para carga, validación, conservación ante error, reintento, liquidación individual, enlace a venta y siguiente viaje. Sin escrituras remotas ni emisión fiscal real. Pendiente validación manual con una base que tenga instalada la migración.
- El 14/11/2026, por pedido expreso de aplicar solo la migración, se aplicó `20261114100000_transporte_viaje_realizado` al proyecto vinculado `zhtqkygjvaaizbdwwsbi`, en una transacción que verifica el hash previo de la RPC y registra únicamente esa versión. Se guardó la definición anterior en `private-backups` (ignorado por Git). Verificación remota: versión registrada, rama de carga directa y permisos centrales presentes, ejecución permitida a `authenticated` y denegada a `anon`. Los hashes de servicios, eventos y lecturas permanecieron idénticos; se conservaron los seis servicios existentes. No se crearon operaciones de prueba ni se publicó el frontend.

Fecha: 10 de noviembre de 2026.

## Implementado

- Módulo opcional, menú y ruta `/transporte/resumen`.
- Las ocho altas se abren en páginas con URL `/transporte/<sección>/nuevo`; las ediciones disponibles usan `/transporte/<sección>/<id>/editar`. Incluyen Volver, Cancelar y retorno al listado al guardar. Los accesos a las secciones están en el menú lateral. La preferencia de usar páginas para altas y edición en futuras tareas quedó registrada en `AGENTS.md`.
- Resumen operativo, búsqueda y filtros de servicios por estado y tipo.
- Unidades, equipos, choferes vinculados a usuarios existentes y tarifas por cliente, tipo y vigencia.
- Solicitudes de auxilio/remolque y transporte de maquinaria con datos propios de la carga.
- Seguimiento por estados, lecturas de salida/regreso, kilómetros de tramos, novedades e historial.
- Fotografías y constancias como imágenes o PDF en Storage privado con enlaces temporales.
- Presupuesto individual y liquidación de servicios finalizados/listos del mismo cliente mediante venta X en cuenta corriente de Gestión. Los cobros y la emisión fiscal se continúan en Gestión.
- Gastos pendientes vinculados a unidades y servicios; los pagos se administran en Gastos y egresos.
- Planes de mantenimiento por fecha, kilómetros y horas, alertas internas e historial de intervenciones.
- Permisos en backend: administración y operación de servicios asignados al chofer; validación de relaciones por comercio.

La migración de infraestructura es `supabase/migrations/20261110100000_vortex_transporte.sql`. No habilita comercios ni modifica sus datos existentes. El script de habilitación del demo está separado en `scripts/habilitar-demo-transporte.sql` y valida su identidad antes de actualizar la parametrización.

## Estado remoto confirmado

Se ejecutó la habilitación exclusivamente para el comercio `253d8d21-e5e9-4ceb-92fd-9baa41f731a5`, identificado por la cuenta administradora `demo@demo.com`. La consulta posterior devolvió `transporte_habilitado = true` y `transporte_instalado = false`.

El 10 de noviembre de 2026, con autorización expresa del usuario, se aplicó `20261110100000_vortex_transporte.sql` al proyecto vinculado `zhtqkygjvaaizbdwwsbi` mediante `supabase db push --linked --yes`. La comprobación posterior con `--dry-run` confirmó que no quedan migraciones pendientes. No se publicó en Netlify.

La verificación remota confirmó diez tablas con RLS, diez políticas de tablas, el bucket privado `transporte` y sus dos políticas de Storage. La RPC `transporte_datos` respondió bajo el rol `authenticated` y la identidad administradora del demo, reutilizando sus clientes, proveedores y usuarios existentes. No se crearon servicios, ventas ni gastos de prueba en producción. La consulta reproducible está en `scripts/verificar-transporte.sql` y termina con `ROLLBACK`.

## Verificaciones

- `node scripts/test-transporte.mjs`: 18 pruebas en PostgreSQL temporal local y 7 casos de cálculo de tarifas/alertas. Incluye aislamiento por comercio, permisos de chofer, versiones, estados, disponibilidad, kilometraje, snapshot de tarifa, gastos pendientes, renovación de mantenimiento, presupuestos y venta sin duplicación por reintento. Usa dependencias mínimas de prueba y las migraciones reales de presupuestos, ventas y Transporte.
- `node scripts/test-transporte-ui.mjs`: renderizado aislado de diez vistas, ocho formularios y sus rutas de alta sin modal; edición, registros inexistentes, documentos protegidos, acceso administrativo, detalle operativo y estado vacío. No ejecuta interacciones en navegador ni llamadas externas.
- `node scripts/test-transporte-formularios-ui.mjs`: prueba en Chrome de las ocho altas como páginas, cancelación, acceso directo, validación, guardado, edición precargada, retorno al listado, conservación de datos ante errores y permisos. Usa hooks simulados y datos ficticios, sin Supabase. La ejecución requirió permisos fuera del sandbox para que respondiera el navegador de prueba.
- ESLint de todos los archivos nuevos de Transporte y sus pruebas: cero errores y advertencias. Los tres archivos existentes modificados conservan sus cantidades de diagnósticos respecto de HEAD: cero en cada uno.
- ESLint global observado: 411 errores y 33 advertencias, distinto de la referencia histórica de AGENTS.md. No se modificaron archivos ajenos para corregir esa deuda.
- `npx tsc --noEmit` finaliza correctamente. La comprobación adicional con `-p tsconfig.app.json` muestra errores en otros módulos, sin diagnósticos de Transporte.
- `git diff --check`: sin errores.

## Pendiente de validación y ampliación

- Prueba funcional manual y revisión visual en celular/escritorio, con una base que tenga instalada la migración.
- Prueba de escritura remota del circuito operativo y con múltiples CUIT. La lectura remota bajo la identidad del demo ya está verificada. La rama de venta con emisor reutiliza la función existente; las pruebas locales de Transporte cubren la venta sin emisor múltiple.
- Las pruebas locales verifican rechazo de recursos ocupados y reintentos, pero no ejecutan transacciones concurrentes.
- Firma dibujada en pantalla y generación de una constancia PDF propia del servicio. Actualmente se pueden registrar receptor/conformidad y adjuntar constancias externas.
- Correcciones auditadas de odómetro: por ahora se rechazan lecturas inferiores a la última registrada.
- Reportes completos de rentabilidad, saldos por aseguradora y distribución de costos fijos. El resumen actual muestra operación, kilometraje registrado y gastos del mes.
- GPS en vivo, funcionamiento sin conexión y avisos externos automáticos, contemplados como ampliaciones en la propuesta.

El módulo no representa todavía la totalidad de los entregables propuestos en `public/VORTEX_TRANSPORTE_PROPUESTA.md`.

## Publicación posterior autorizada

El 10/11/2026 el usuario autorizó publicar todas las modificaciones. El frontend quedó publicado en https://vortexgestion.netlify.app, despliegue `6af3a4e771d24bc5e8e604e5`, junto con los usuarios y permisos generales y los cobros con excedente de cheque. Se verificó coincidencia por SHA-256 del HTML y sus archivos principales, y la resolución de rutas SPA de Usuarios y altas de Transporte. No se registraron operaciones reales para probar la publicación. Ver `PUBLICACION_20261110.md`.
