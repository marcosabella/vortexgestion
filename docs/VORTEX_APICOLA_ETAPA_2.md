# Vortex Apícola · Etapa 2: Producción trazable

Implementación local de producción dentro del módulo opcional Apícola. Reutiliza campañas, apiarios, permisos, auditoría y parametrización de la etapa 1. No modifica servicios remotos ni habilita módulos para otros comercios.

## Circuito disponible

- **Cosechas:** campaña abierta, apiario activo, fecha, código, alzas retiradas, responsable y observaciones. El operador puede registrarlas; administración puede anularlas con motivo. Las alzas cosechadas son unidades de producción para extracción; no se descuentan automáticamente del inventario de material.
- **Salas de extracción:** registro de salas propias o externas, código, nombre, habilitación informada y contacto. Catálogo compartido entre campañas.
- **Extracciones:** sala identificada, campaña, fecha, responsable, kilos efectivamente medidos y cosechas de origen. Una extracción puede consumir parte de una cosecha o mezclar hasta 100 cosechas de la misma campaña. No permite repetir un origen ni procesar más alzas de las disponibles.
- **Lotes de miel:** cada extracción genera un lote con código propio, floración y humedad informadas. Conserva los orígenes y permite consultar todos los tambores vinculados.
- **Tambores:** identificación única por comercio, lote, fecha, ubicación, peso bruto y tara. El peso neto lo calcula PostgreSQL. Los pesos tienen precisión de gramos y la suma de tambores vigentes no puede superar los kilos de la extracción.
- **Análisis y muestras:** lote, muestra, fecha, laboratorio o responsable, humedad opcional, resultado informado y referencia textual del informe. Los informes se conservan; un nuevo informe vuelve a exigir revisión de calidad.
- **Stock a granel:** kilos actuales por lote, en tambores y todavía sin envasar, sin duplicar cantidades. Separación por estado pendiente, liberado o bloqueado. Administración libera con motivo y versión actual solamente cuando el último informe registrado es conforme; puede bloquear con motivo. Un informe no conforme bloquea el lote.

Las fichas permiten consultar cosecha, apiario, extracción, lote, análisis y tambores. La producción medida de una mezcla no se reparte arbitrariamente entre apiarios ni se presenta como rendimiento individual de las colmenas.

## Filtros y saldos

Cosechas, extracciones, lotes y tambores conservan filtros de campaña, apiario y fechas. En lotes se usa la fecha de extracción. El filtro de apiario incluye las mezclas con origen en ese apiario y muestra los kilos completos de la extracción, con aclaración explícita.

En **Stock a granel**, las fechas no convierten el saldo actual en saldo histórico: sólo campaña y apiario delimitan los lotes incluidos. El catálogo de salas no depende de estos filtros. En análisis, las fechas filtran la fecha del informe.

Al anular un tambor, sus kilos vuelven al saldo sin envasar. Una extracción sólo puede anularse cuando no tiene tambores vigentes; sus alzas vuelven a quedar disponibles para una nueva extracción. Una cosecha sólo puede anularse sin extracciones vigentes. No se borran registros ni se sobrescribe la trazabilidad. Los códigos anulados no se reutilizan.

## Seguridad y migraciones

1. `20261106140000_apicola_produccion_estructura.sql`: siete tablas con `comercio_id`, claves foráneas compuestas, índices, RLS y auditoría de cabeceras.
2. `20261106140100_apicola_produccion_operaciones.sql`: RPC transaccional `apicola_produccion_operar`.

Las escrituras directas están revocadas para usuarios autenticados. El backend comprueba pertenencia, módulo habilitado, rol, campaña, fechas, referencias y saldos. Usa el mismo bloqueo transaccional por comercio de la etapa 1. Cada operación lleva una clave de idempotencia; reintentar con la misma clave y datos no duplica el registro. Cambiar datos exige una nueva clave. Las decisiones de calidad y anulaciones comprueban la versión vigente; motivos, autor y cambios quedan en operaciones/auditoría.

**Estado de activación:** ambas migraciones se aplicaron en producción el 06/11/2026 en el proyecto `zhtqkygjvaaizbdwwsbi`, con autorización expresa del usuario: «APLICAR MIGRACION, NO PUBLICAR». El plan previo confirmó que eran las únicas pendientes y la comprobación posterior confirmó que la base remota está actualizada. Las siete tablas tienen RLS activo y política de lectura; `authenticated` no tiene escritura directa. La RPC está disponible para `authenticated`, revocada para `anon`, con `SECURITY DEFINER` y `search_path=pg_catalog,public`. No se cargaron datos operativos ni se cambió la parametrización modular.

La publicación del frontend queda pendiente. No se publicó en Netlify, por instrucción expresa del usuario.

## Verificación local

- `node scripts/test-apicola-produccion-sql.mjs`: PostgreSQL temporal; mezclas y consumos parciales, reintentos, permisos, aislamiento entre comercios, fechas, cierre de campaña, pesos, saldos, concurrencia entre dos conexiones, análisis, liberación/bloqueo, versiones y anulaciones con dependencias.
- `node scripts/test-apicola-ui.mjs`: componentes reales contra PostgreSQL temporal mediante API local; recorre las etapas 1 y 2 en Chrome, con formularios, trazabilidad, calidad, permisos y capturas de escritorio/celular en `private-backups/apicola-preview/produccion-*.png`.
- `node scripts/test-apicola-ui.mjs --produccion`: recorre únicamente la etapa 2 con campaña/apiario temporales.
- ESLint de todos los archivos modificados y TypeScript sin emisión. La revisión del proyecto completo conserva deuda previa fuera de Apícola; no equivale a validación funcional ni a una compilación limpia de toda la aplicación.

Resultados: pruebas SQL y recorrido de interfaz de ambas etapas aprobados; capturas móviles y de escritorio revisadas visualmente. ESLint de archivos modificados sin errores ni advertencias. El análisis global de ESLint arroja 411 errores y 33 advertencias existentes fuera de los archivos modificados, por encima de la línea base histórica indicada en AGENTS.md. `npx tsc --noEmit` finaliza correctamente; la comprobación efectiva con `npx tsc -p tsconfig.app.json --noEmit` conserva los 34 errores previos ajenos a Apícola. No se generó un build de distribución.

## Límites de esta entrega

La gestión económica, ventas vinculadas, salidas comerciales, fraccionado y costos corresponden a la etapa 3. Esta entrega no registra envíos/recepciones de material, transporte o comprobantes de traslado, no carga archivos adjuntos y no se integra con sistemas oficiales. Las habilitaciones y resultados se registran como datos informados por el usuario. El estado de calidad representa una decisión interna documentada.
