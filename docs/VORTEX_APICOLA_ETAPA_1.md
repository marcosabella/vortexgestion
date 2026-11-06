# Vortex Apícola · Etapa 1: Cuaderno apícola

Primera versión operativa basada en `public/Propuesta_Vortex_Apicola.pdf`, sección 14. Es un módulo opcional de Vortex Gestión, independiente de Vortex Campo. No duplica clientes, compras, ventas, caja ni cuenta corriente; la integración económica corresponde a la etapa 3.

## Acceso demo y estado de entrega

El 06/11/2026 se habilitó **solamente** `modulos.apicola=true` para el comercio **COMERCIO DEMO**, `253d8d21-e5e9-4ceb-92fd-9baa41f731a5`, administrado por `demo@demo.com`. Se verificó la pertenencia activa y unívoca antes de cambiar la configuración. No se crearon registros operativos de ejemplo en producción ni se modificaron otros permisos.

El cambio está documentado en `scripts/habilitar-demo-apicola.sql`, separado de las migraciones estructurales. El módulo queda apagado por defecto para los demás comercios. Se administra desde la parametrización modular existente.

El frontend se encuentra implementado localmente. Las dos migraciones apícolas se aplicaron con autorización expresa el 06/11/2026 en producción (`zhtqkygjvaaizbdwwsbi`). La comprobación posterior confirmó que no quedan migraciones pendientes, que las 11 tablas apícolas tienen RLS activo, que las tres funciones públicas de acceso/operación/informes están disponibles y que el módulo sigue habilitado para COMERCIO DEMO. No se cargaron registros operativos de ejemplo en producción. La publicación en Netlify está pendiente de autorización expresa, conforme a `AGENTS.md`.

Orden para activarlo en línea:

1. `20261106130000_apicola_cuaderno_estructura.sql`: aplicada.
2. `20261106130100_apicola_cuaderno_operaciones.sql`: aplicada.
3. Publicar la nueva versión del frontend (pendiente).
4. Con `demo@demo.com`, recargar y entrar a **Vortex Apícola → Resumen** (`/apicola/resumen`). No hace falta cerrar sesión.

## Funciones incluidas

La navegación se organiza por actividad. **Resumen**, **Existencias y movimientos**, **Agenda** e **Informes** son accesos directos; **Base productiva** agrupa campañas, apiarios y colmenas/reinas; **Cuaderno de campo** agrupa visitas, alimentación y sanidad. Estos dos grupos son desplegables, no títulos estáticos: pueden abrirse/cerrarse y el grupo de la sección actual se abre automáticamente al navegar. Con el menú contraído se presentan como submenús. El mismo agrupamiento se conserva en móvil y en el selector compacto de sección.

El resumen ofrece accesos rápidos a registrar visita, alimentación, sanidad, movimiento y nueva tarea, según los permisos y la existencia de una campaña abierta/apiario activo. Se reemplazó la fila de diez botones de navegación. Los grupos de producción/trazabilidad (etapa 2), economía (etapa 3) y especializaciones (etapa 4) tienen su lugar definido en `src/config/apicolaNavigation.ts` y se mostrarán cuando incorporen rutas desarrolladas. No se presentan botones deshabilitados de etapas futuras.

- Campañas con fechas, observaciones, cierre y reapertura. El cierre impide nuevos movimientos y registros de campo.
- Apiarios: identificación, establecimiento, ubicación, coordenadas y mapa, propietario/contacto, condición y acuerdo de uso, instalación/retiro, floraciones, agua y accesibilidad. Se desactivan conservando el historial, una vez resueltas sus existencias y pendientes.
- Existencias por cantidad y recurso: colonias, pisos, cámaras, alzas, cuadros, techos y otro material.
- Identificación opcional de colonias existentes sin sumar stock nuevamente. La identidad biológica se conserva al cambiar el cajón; ficha de reina, origen, material, QR e historial individual.
- Altas, bajas, traslados, divisiones y fusiones con vínculos de origen y destino. Identificaciones individuales opcionales en altas, bajas y traslados; obligatorias en divisiones y fusiones.
- Visitas con revisión parcial, alcance por grupo, apiario completo o colmenas identificadas. “No revisado” y “No observado” son valores distintos. Se guarda la cantidad revisada y la existencia contra la que se validó al cargar el registro.
- Alimentación: alimento, composición, preparado/comprado, cantidad preparada y entregada, unidad y motivo.
- Sanidad: observación, tratamiento informado y seguimiento; problema, muestreo, producto, principio activo, lote, vencimiento, cantidad, unidad, inicio, retiro e indicaciones documentadas. El sistema registra los datos indicados por el usuario; no prescribe tratamientos.
- Registros pendientes, confirmación administrativa y anulación con motivo. El historial no se borra. Las fechas de próxima acción y de retiro generan tareas al confirmar el registro.
- Agenda con responsable, prioridad y estado, seguimiento de vencidas y finalización/cancelación.
- Resumen e informes con filtros de campaña, apiario y período. Exportación PDF. La alimentación se totaliza por unidad, sin sumar kg con litros. Las revisiones acumuladas no representan colonias únicas.

En **Actividad del período** se ofrecen **Imprimir** y **Descargar PDF**. Ambos usan el mismo archivo, generado con `buildReportePdfFile`, compartido con ventas, cheques y extintores: encabezado fiscal y logo del comercio, Helvetica, tablas celestes, márgenes, pie y numeración de páginas. Los filtros se detallan completos y los textos extensos se dividen en filas sin recortarse. La impresión abre el visor PDF habitual y la descarga guarda `Cuaderno_Apicola_AAAAMMDD.pdf`.

Las existencias mostradas son actuales y abarcan todas las campañas; los filtros de campaña y período afectan la actividad, no convierten el stock en un saldo histórico. El detalle de movimientos conserva las fechas y variaciones.

La primera entrega opera con registros en línea. Cosechas, extracciones, lotes de miel y tambores corresponden a la etapa 2; economía a la etapa 3; operación sin conexión a la etapa 4. Los adjuntos de fotos/documentos y vínculos opcionales a establecimientos de Campo quedan como ampliaciones de las fichas: no se simula su existencia con controles vacíos.

## Permisos e integridad

- Todas las tablas operativas tienen `comercio_id`, índices y RLS. No existen permisos de escritura directa para `authenticated`; las escrituras se realizan mediante RPC.
- El backend verifica módulo habilitado, comercio activo y pertenencia/rol en `comercio_usuarios`.
- Administración gestiona catálogos y existencias, confirma y anula. El operador registra trabajos y gestiona sus propios pendientes. Otros miembros sólo consultan.
- Las relaciones usan claves foráneas compuestas o validación explícita de IDs, apiario y comercio en PostgreSQL.
- Las operaciones usan clave de idempotencia y bloqueo transaccional por comercio. Un reintento no repite un traslado ni una división y las salidas no permiten saldo negativo.
- Las colonias identificadas elegidas deben pertenecer al origen; las salidas sin códigos sólo pueden utilizar existencias aún no identificadas.
- Los movimientos se cargan cronológicamente por apiario/recurso. No se permiten movimientos anteriores al último existente que reescriban saldos históricos.
- Las ediciones exigen la versión actual; los registros confirmados se anulan con motivo, en lugar de sobrescribirse. Se conserva auditoría con autor, fecha y antes/después, consultable por administración.

## Verificaciones

- `node scripts/test-apicola-sql.mjs`: PostgreSQL temporal, RLS, roles, pertenencia, módulo apagado, identificación sin duplicar, visita parcial 18/40, aprobación, agenda de seguimiento/retiro, traslados, concurrencia, idempotencia, divisiones, fusiones, materiales, anulación, cierre, informes por unidad y auditoría.
- `node scripts/test-apicola-ui.mjs`: componentes reales en Chrome contra PostgreSQL temporal mediante API local. Alta de campaña/apiario, existencias 40, visita parcial 18, confirmación, alimentación, sanidad, agenda, ficha y reportes; escritorio y móvil.
- `node scripts/test-apicola-pdf.mjs`: muestras normal, extensa y referencia del sistema; identidad fiscal, color, tipografía, filtros, texto largo y paginación; render PDFium de todas las páginas para QA visual en `tmp/pdfs/apicola-reporte/`.
- Capturas locales de prueba en `private-backups/apicola-preview/`. Los datos de esas capturas no son datos del comercio demo en producción.
- Lint de los archivos modificados, compilación TypeScript sin emitir e inspección visual de las capturas. La revisión completa de la aplicación tiene una línea base de 34 errores TypeScript ajenos a estos cambios.
