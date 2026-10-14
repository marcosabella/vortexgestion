# Bostico: actualización incremental aplicada — 14/10/2026

Estado: **aplicado y verificado en producción exclusivamente para Bostico**.
El usuario autorizó expresamente: «aplicar a produccion a bostico». La transacción se completó el 14/10/2026 a las 04:47:31 UTC (01:47:31 de Argentina). No se ejecutó el importador completo ni la reversión; no hubo eliminaciones.

## Comercio y base

- Usuario: `carlosbostico@hotmail.com`.
- Comercio: BOSTICO Y BARTOLOME SOCIEDAD SIMPLE.
- UUID: `a4983b26-4f3d-46e0-8e4f-46bd34fec838`.
- Base final: `D:\BOSTICO 2026\BDsiagro.mdb`, 9.953.280 bytes.
- SHA-256 final: `0616560fc2f7e4625a691b1f830cc0da8ddfe75c97a3ac0c7ea28485d122dc63`.
- Lote preparado: `8c14d604-5043-55df-8172-0cf489581454`.

El usuario confirmó que dejó el escritorio y, en su última instrucción, pidió utilizar la última base para la venta 7210. Esa decisión reemplaza la indicación anterior de conservar su importe actual.

Se verificaron las tres importaciones originales completadas. Su hash es `0397486df43cabca2fdc3f0b4509b2a416ccb16a0322693e2bd73a67bfb07d56`. No se encontró el MDB físico con esa huella; se reconstruyó el corte mediante staging, equivalencias, excepciones archivadas y destino actual. Ningún otro MDB se utilizó como corte inicial.

Tras la recuperación de Supabase informada por el usuario, la captura se completó mediante GET paginados de 200 filas, secuenciales y filtrados por comercio. Se realizó una segunda lectura íntegra y coincidieron conteos y huellas. Captura: 14/10/2026 03:46–03:59 UTC. Los anteriores HTTP 544/522 ya no impiden las consultas efectuadas.

## Comparación completa de origen

| Entidad | Nuevos | Modificados | Iguales | Ausentes en origen | Conflictos |
| --- | ---: | ---: | ---: | ---: | ---: |
| Rubros | 0 | 0 | 1 | 0 | 0 |
| Marcas | 0 | 0 | 1 | 0 | 0 |
| Proveedores | 0 | 0 | 21 | 0 | 0 |
| Clientes | 3 | 6 | 705 | 54 | 0 |
| Productos | 321 | 4 | 20.934 | 1 | 0 |
| Ventas | 101 | 1 | 7.139 | 0 | 0 |
| Detalles de venta | 307 | 0 | 19.056 | 3 | 0 |
| Cobranzas | 61 | 0 | 3.908 | 0 | 0 |
| Cheques | 0 | 0 | 15 | 0 | 0 |
| Compras de proveedores archivadas | 43 | 0 | 2.145 | 0 | 0 |
| Pagos a proveedores archivados | 10 | 0 | 822 | 0 | 0 |
| CAE de origen | 69 | 0 | 6.051 | 0 | 0 |

Estos conteos son del origen; no equivalen necesariamente a inserciones operativas. Los seis CUIT modificados corresponden a duplicados ya corregidos: se conserva su normalización, sin actualizar esos clientes. Los CUIT compuestos por ceros o guiones bajos se normalizan a vacío.

Se conservan los 54 clientes y el producto ausentes en el nuevo origen. Se conservan los pagos negativos reparados y las excepciones de importe cero, cheque cero y detalle huérfano archivados. No hay borrados en la aplicación.

## Venta 7210

Pasa de **$67.000,01 a $138.000,02**, con cinco renglones, como la última base. Sigue siendo Recibo X a cuenta corriente y sin CAE. Conserva su UUID, el cliente y los tres UUID de detalle existentes; sólo se agregan dos renglones por $12.000,01 y $59.000,00.

Los IDs de detalle de Access cambiaron: los tres mapas anteriores quedan identificados como `items_origen_anterior`, preservando su trazabilidad. Los cinco IDs finales reciben equivalencias activas; tres reutilizan los renglones físicos existentes. Por eso los 307 detalles nuevos en origen producen **304 inserciones físicas**, sin duplicar la venta.

El débito existente pasa a $138.000,02; la diferencia es **$71.000,01**. No se crea un segundo débito para esa venta.

## Delta operativo

- 3 clientes y 321 productos nuevos.
- 4 cambios de stock final: artículo 17654 de 100 a 101; artículos 20891, 20892 y 20893 de 100 a 102.
- 101 ventas nuevas por **$11.327.101,01**; 92 a cuenta corriente por **$10.788.100,98**.
- 61 cobranzas nuevas por **$9.024.467,61**.
- 304 detalles físicos nuevos y 153 movimientos nuevos de cuenta corriente: 92 débitos y 61 créditos.
- 69 CAE asociados a ventas nuevas, más archivo de sus datos de origen. No se modifica ningún CAE existente.
- 43 compras y 10 pagos a proveedores nuevos conservados en archivo histórico. No se generan saldos operativos de proveedores; la cuenta corriente de proveedores sigue con cero registros, como el corte anterior. Las condiciones de las compras no permiten trasladar automáticamente la regla de cuenta corriente de las ventas.
- 793 mapas nuevos y 3 mapas anteriores reclasificados; 122 archivos históricos nuevos.
- Auditoría antes/después de las 1.806 operaciones y 798 registros de línea base incremental, para posteriores comparaciones.

Saldo agregado de cuenta corriente de clientes: **$17.072.255,79 → $18.906.889,17**. El saldo proyectado concilia por cliente con el origen firmado (notas y pagos negativos incluidos), conservando cualquier movimiento propio de Vortex: **cero diferencias**.

Se verificó el detalle de las 101 ventas nuevas, admitiendo como máximo un centavo por redondeo. Los siete presupuestos importados y sus 24 detalles coinciden; se conservan también el octavo presupuesto y su detalle propio de Vortex. Se conservan las 85 notas de crédito, la nota de débito, los cuatro Recibos C con CAE y los 14 cheques operativos. El cheque restante permanece archivado.

| Tabla operativa | Antes | Después verificado |
| --- | ---: | ---: |
| Clientes | 765 | 768 |
| Productos | 20.939 | 21.260 |
| Ventas | 7.140 | 7.241 |
| Detalles | 19.058 | 19.362 |
| Cuenta corriente de clientes | 9.954 | 10.107 |
| Cheques | 14 | 14 |
| Presupuestos | 8 | 8 |

## Archivos y ejecución

Los datos completos y SQL están en `private-backups/bostico-incremental-20261013/`, excluido de Git y de los recursos públicos:

- Copia congelada del MDB y `snapshot.json`.
- `comparacion-origen.json`, `delta-plan.json`, `conciliacion-delta.json`, `informe.json`.
- `precheck-delta.sql`, `verificar-tipos.sql`, `verificar-triggers.sql`.
- `aplicar-delta.sql` y `revertir-delta.sql`.
- `verificar-aplicacion.sql`, `verificar-campos-plan.sql` y `resultado-produccion.json`: evidencia de la verificación productiva posterior.

Los scripts versionables son `scripts/preparar-bostico-incremental.mjs` (lectura/preparación), `scripts/generar-delta-bostico.mjs` (genera archivos locales) y `scripts/test-bostico-incremental.mjs`.

La autorización del punto 6 de `docs/BOSTICO_ACTUALIZACION_FINAL.md` fue otorgada por el usuario y el precheck se repitió con las nueve imágenes anteriores y la cuenta corriente coincidentes. Se ejecutó una sola transacción y luego SELECT de verificación independiente. No repetir el importador ni forzar los controles para ejecutar otro lote.

El SQL utiliza una transacción, bloqueo asesor, bloqueos breves de escritura en las tablas involucradas, imágenes anteriores completas, huellas de cuenta corriente y verificaciones de funciones/triggers. Si no obtiene los bloqueos en cinco segundos, aborta. Evita duplicar IDs de origen y registros naturales; una repetición del mismo lote completado no vuelve a importarlo. Sólo trabaja con el comercio autorizado. No altera esquemas, no ejecuta `db push` y mantiene activos los triggers durante la aplicación.

Las ventas históricas utilizan el mecanismo existente `app.skip_stock_movements` dentro de la transacción para no descontar dos veces el stock final. Los CAE nuevos se completan después de sus detalles y débitos. Se conserva la corrección histórica de IVA neto para Factura A, sin reinterpretar los Recibos X existentes.

La reversión requiere **autorización separada**. Rechaza filas editadas después del lote y dependencias posteriores; conserva auditoría y marca el lote cancelado. Requiere bloqueos de tablas y suspende únicamente tres triggers fiscales durante la transacción para retirar las ventas históricas nuevas con CAE; los reactiva antes del commit. Un error revierte también la suspensión. No utiliza `session_replication_role` ni desactiva validaciones de tenant/FK. No cancela ni modifica autorizaciones externas de AFIP. No ejecutar la reversión como una prueba en producción.

## Verificación y límites

- 22 pruebas locales aprobadas: clasificación, aislamiento, preservación, cambios concurrentes, paginación y línea base incremental.
- ESLint de los scripts modificados: sin errores ni advertencias.
- TypeScript: `npx tsc --noEmit` aprobado.
- SELECT en Supabase: las nueve imágenes anteriores coinciden; la huella de cuenta corriente coincide; los tipos de las 1.806 operaciones convierten correctamente; 54 triggers siguen activos y sin diferencias de definición.
- Aplicación productiva ejecutada y confirmada: lote completado, 1.806 auditorías y 798 fuentes de línea base. SELECT posteriores verificaron todas las imágenes guardadas y todos los campos previstos, con cero diferencias. La cuenta corriente concilia por cliente y suma $18.906.889,17.
- Venta 7210: cinco detalles por $138.000,02 y un único débito por el mismo importe; se conserva su UUID y el del débito original.
- 5.996 ventas históricas con CAE o notas de crédito/débito controladas: sin cambios de CAE, vencimiento, tipo o total. Los conteos finales coinciden con el plan.
- No se realizó validación visual en la interfaz ni se ejecutó la reversión. La verificación productiva fue mediante consultas directas de datos. Los 22 tests locales no sustituyen esa comprobación.
- Se preservaron las modificaciones preexistentes de `docs/BOSTICO_ACTUALIZACION_FINAL.md` y `supabase/.temp/cli-latest`.


## Numeración fiscal corregida el 14/10/2026

Por instrucción expresa del usuario se tomó `CaeXventa.idVentaAfip` como número fiscal para los comprobantes importados con CAE, cruzando el ID de Access mediante `migracion_id_map` y exigiendo coincidencia del CAE vigente. El ID de origen sigue siendo el identificador de Access y no se sustituye por el número fiscal.

- Corrección productiva completada: lote `1ba4a86f-6d9d-4ca6-8e21-e6427cf2cf50`, a las 04:58:03 UTC.
- 6.045 números visibles corregidos. Se conservaron los números de los dos comprobantes inequívocos que ya coincidían.
- Venta de GUSTAVO DANIEL GARAY del 09/10/2026, origen 7327: número almacenado 5398; formato mostrado con el punto de venta configurado: **0006 - 00005398**. CAE y total $80.000,01 conservados.
- Verificación directa: 6.045 auditorías, cero diferencias y cero cambios fuera de numero_comprobante/updated_at; cuenta corriente idéntica.
- Se mantuvo el formato numérico simple de las ventas importadas; no se inventó un punto de venta fiscal histórico. La interfaz utiliza el punto de venta configurado (6) para su presentación. Para determinar otro punto de venta histórico hace falta respaldo del comprobante.
- Fue necesario suspender únicamente `prevent_authorized_venta_changes` durante la transacción, con bloqueo exclusivo de ventas. El resto de triggers y las FK siguieron activos; la protección fiscal fue reactivada y verificada antes de cerrar. No se modificó su función ni se permitió edición fiscal general.
- Un primer envío fue rechazado por tamaño (HTTP 413) y otro fue abortado por el control previo de integridad del archivo reducido; ambos quedaron sin escrituras productivas. El archivo corregido pasó los controles y se aplicó.
- Evidencia privada: `numeracion-arca-antes.json`, `plan-numeracion-arca.json`, `corregir-numeracion-arca.sql`, `verificar-numeracion-arca.sql` y `resultado-numeracion-arca.json`.

### Seis históricos pendientes

Estos pares repiten número fiscal dentro del mismo tipo y el origen no incluye punto de venta. Se conservaron los registros actuales hasta verificar sus comprobantes: no deben suponerse todos del punto 6.

| ID Access | Tipo | Fecha | Número fiscal de origen |
| --- | --- | --- | ---: |
| 18 | factura_a | 2020-11-20 | 18 |
| 670 | factura_b | 2021-05-28 | 66 |
| 190 | factura_a | 2020-12-30 | 18 |
| 210 | factura_b | 2021-01-08 | 164 |
| 69 | factura_b | 2020-11-24 | 66 |
| 1954 | factura_b | 2022-09-28 | 164 |

Los IDs internos todavía visibles en estos pendientes producen colisiones visuales con tres números fiscales ya corregidos (Factura A 190, Factura B 210 y Factura B 69). Los UUID y las equivalencias no están duplicados. Para resolver la numeración completa de esos seis se requiere identificar el punto de venta y número en el comprobante fiscal correspondiente; no se asignó una serie ficticia.

Para cualquier importación futura de Bostico, tomar el número fiscal al asociar un CAE y conservar el ID de Access exclusivamente como referencia de origen. No regenerar ni volver a aplicar el lote incremental anterior para reparar numeración. Su reversión protegida detectará estos cambios posteriores y se detendrá; deshacer esta corrección requiere autorización separada y usar su propia auditoría antes/después.
