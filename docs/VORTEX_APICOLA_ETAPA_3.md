# Vortex Apícola · Etapa 3: Gestión económica

## Alcance implementado

La etapa 3 incluye imputaciones de costos e ingresos, fraccionado, entregas comerciales trazables, devoluciones físicas, caja por campaña y valorización opcional del stock. La navegación incorpora **Fraccionado**, **Salidas comerciales**, **Devoluciones físicas** y **Caja de campaña**, además de costos, ingresos y resultados.

Se reutilizan compras, gastos, ventas, pagos y productos de Vortex Gestión. Las imputaciones económicas y las asignaciones de caja no crean comprobantes ni vuelven a cobrar/pagar. Los movimientos físicos se registran desde fraccionado, salidas y devoluciones, con saldos calculados en PostgreSQL.

## Operación

- **Costo documentado:** seleccionar una compra recibida o un gasto existente, campaña abierta, destino general o apiario activo, fecha, actividad, concepto e importe. La moneda de compras y gastos es ARS, conforme al modelo actual de esos módulos.
- **Ingreso asignado:** seleccionar una venta existente y asignar su importe total o una parte a una campaña/apiario. La moneda se toma de la venta. No admite notas de crédito/débito, ventas anuladas ni ventas con una nota de crédito asociada.
- **Costo estimado:** registrar una estimación interna en ARS o USD, separada de costos respaldados por comprobantes. No representa un egreso pagado. Al disponer del comprobante, anular la estimación y cargar la imputación documentada.
- **Reparto:** un mismo comprobante puede distribuirse entre campañas/apiarios mediante varias imputaciones. Cada una conserva su importe y un criterio explícito, por ejemplo porcentaje según kilos transportados o colonias atendidas. El usuario calcula los importes del reparto; el backend controla el saldo global del documento entre todos los destinos.
- **Correcciones:** anular con motivo y versión vigente; el registro permanece en el historial y el importe vuelve al saldo sin imputar del documento. No se editan importes ya registrados. Se conserva una copia del número, fecha, total, moneda y cliente informado al asignar, cuando corresponde.

Las fechas filtran la fecha de imputación, no la fecha de cobro/pago. Una venta se fecha según su día en Argentina para evitar desplazar ventas nocturnas al día siguiente por UTC. Las compras y gastos conservan sus fechas documentales. La imputación debe estar dentro de una campaña abierta y no ser anterior al comprobante.

## Lectura de resultados

Los totales abarcan todas las imputaciones vigentes de los filtros seleccionados, aunque el listado esté paginado. Se separan ARS y USD; no hay conversión automática ni suma entre monedas.

`Resultado estimado = ingresos asignados − costos documentados − costos estimados`.

Hay detalle por campaña y destino y costos agrupados por actividad. Los importes generales de campaña se muestran como tales: no se reparten arbitrariamente entre apiarios. Los totales usan los importes registrados en Gestión; no recalculan impuestos. Un resultado depende de las imputaciones cargadas y no garantiza que todos los movimientos de la campaña hayan sido asignados.

El resultado estimado y el resultado de caja se consultan por separado. La valorización del stock aparece como una estimación adicional y no se suma a las ventas ni altera los costos registrados. No hay conversión automática de monedas ni cálculo de rendimiento individual por colmena.

## Fraccionado y existencias de miel

Cada fraccionamiento identifica lote y origen (miel sin envasar o tambor), fecha, presentación, peso de miel por unidad, unidades obtenidas, merma y responsable. Admite varios insumos: envases, tapas, etiquetas u otros productos existentes. Los envases consumidos deben cubrir las unidades obtenidas.

Los insumos se descuentan de `productos` en la misma transacción que el consumo de miel. Se admiten insumos sin variantes de talle/color; un insumo con fraccionamientos vigentes no puede pasar a manejar variantes. Se conservan cantidades, descripción, costo unitario y moneda al consumirlos, consultables sólo por administración. Estos costos son referencias: para incorporarlos al resultado se imputa la compra/gasto con actividad Fraccionado, evitando sumar el mismo costo otra vez.

`Miel consumida = unidades × peso de miel por unidad + merma`.

El remanente permanece en el origen. Los frascos obtenidos mantienen su stock propio por fraccionamiento y lote; no se crean además como stock genérico de miel en Productos. La vista de stock y las fichas usan los saldos actuales del backend, separados en miel sin envasar, tambores y fraccionada. Se descuentan merma y salidas netas de devoluciones.

Una anulación de fraccionado es una corrección de registro, no un descarte físico: revierte miel e insumos y exige que no existan salidas vigentes del fraccionamiento. No se permite anular un tambor o extracción con operaciones dependientes vigentes.

## Ventas, entregas y devoluciones

1. Registrar la venta en Vortex con un **ítem manual sin descuento de stock de Gestión**. Su cantidad representa kg para granel o unidades para frascos. No se admiten ítems con producto/stock genérico en este circuito, para evitar descontar dos veces.
2. En **Salidas comerciales**, seleccionar el ítem existente, lote liberado y origen: sin envasar, tambor o fraccionamiento. Registrar la entrega física en kg/unidades. Una línea puede vincular varias entregas/orígenes compatibles, hasta su cantidad pendiente; el saldo del origen también se controla.
3. Consultar el recorrido desde el lote: apiarios/cosechas → extracción → tambores/fraccionados → comprobantes, compradores y retornos, con paginación. Las mezclas conservan todos sus orígenes y no se reparten arbitrariamente entre apiarios.
4. Registrar el retorno real desde la salida. La devolución puede ser parcial; no puede superar lo entregado neto ni devolver fracciones de un frasco. Devuelve cantidades al origen y bloquea el lote hasta una revisión administrativa de calidad.

La entrega no vuelve a crear la venta ni modifica sus cobros. Una nota de crédito o anulación financiera no devuelve kilos automáticamente. La devolución física y el reembolso de dinero son operaciones diferentes. El vínculo económico inicial conserva su protección: deben anularse sus imputaciones antes de asociar una nota de crédito. Los ítems con historia física no pueden eliminarse, cambiar de comercio/venta ni alterar cantidades mientras tengan entregas pendientes.

Las devoluciones permanecen registradas; su anulación exige que el stock alcance para revertir el retorno. Las salidas con devoluciones vigentes no se anulan hasta corregir esas devoluciones. Todas las operaciones tienen autor, versión, motivo cuando corresponde, auditoría e idempotencia. El lote no se libera automáticamente al anular un retorno.

## Caja de campaña

Permite asignar a campaña/apiario, total o parcialmente, movimientos de dinero existentes:

- Pagos de ventas distintos de cuenta corriente.
- Créditos de cobro posteriores aplicados a ventas desde cuenta corriente de clientes.
- Pagos a proveedores documentados en `cuenta_corriente_proveedores`.
- Gastos marcados pagados con medios distintos de cuenta corriente.
- Reembolsos confirmados. La réplica entre el pago original y su nota de crédito se identifica para ofrecer el reembolso una sola vez.

Se excluyen las deudas y la réplica de pagos en `pagos_compra`. El saldo por movimiento impide duplicar asignaciones entre campañas. Cada reparto lleva criterio; fecha, moneda y dirección provienen del movimiento. Las fechas filtran el momento registrado del cobro/pago, no la fecha de la imputación económica. Se admite que un cobro/pago sea posterior a la temporada productiva, asignándolo a una campaña abierta.

`Resultado de caja = cobros asignados − pagos y reembolsos asignados`.

El informe separa monedas y destinos; anular una asignación no revierte el pago original. Los movimientos con asignaciones vigentes quedan protegidos frente a cambios incompatibles de importe, fecha, moneda u origen; para corregirlos primero deben anularse sus asignaciones. Las referencias históricas impiden borrar movimientos vinculados. Los cambios de comercio quedan restringidos también sobre sus documentos padre.

El resultado depende de los movimientos asignados, no supone que toda la actividad esté conciliada. Incluye medios electrónicos y cheques registrados: no equivale a acreditación bancaria ni únicamente a efectivo. En reembolsos, la fecha disponible es la última actualización del registro al asignarlo, que se conserva en la asignación; no se inventa una fecha bancaria. No se aplican comisiones bancarias automáticamente.

## Valorización opcional

En Resultados se puede ingresar un valor por kg en ARS o USD. Se multiplica por la miel actual **liberada**, tanto a granel como en frascos; no incluye miel pendiente/bloqueada. El valor es una estimación uniforme por peso, no una tasación de cada presentación ni una venta. Se muestra separado de los dos resultados y no persiste como un asiento. Campaña y apiario delimitan los lotes; las fechas del informe no convierten el stock actual en saldo histórico. Con un apiario seleccionado se incluyen completas sus mezclas, con aclaración en pantalla.

## Seguridad e integridad

- `apicola_imputaciones` tiene `comercio_id`, índices, RLS, claves foráneas y auditoría. Sólo administración con el módulo habilitado puede consultar o modificar economía, también por RPC. No hay escritura directa para `authenticated`.
- Campaña, apiario y comprobante se validan en PostgreSQL contra el mismo comercio. Los documentos históricos no pueden cambiar de empresa. Los comprobantes ajenos a las imputaciones apícolas conservan su funcionamiento.
- Las operaciones comparten el bloqueo por comercio de Apícola, bloquean el documento de origen al asignar y usan clave de idempotencia. Dos conexiones no pueden asignar más que el saldo disponible.
- Los triggers de integración impiden reducir un comprobante por debajo del importe imputado, cancelar una compra o venta con imputaciones vigentes, cambiar la moneda de una venta imputada o asociarle una nota de crédito. Para esas correcciones primero deben anularse las imputaciones relacionadas.
- Las referencias históricas impiden eliminar un comprobante incluso cuando sus imputaciones ya están anuladas. Se preserva la trazabilidad; las correcciones deben conservar el documento.
- El control de saldo identifica cada registro de origen. No detecta dos comprobantes distintos cargados por error en Compras y Gastos para la misma operación real. Las estimaciones deben reemplazarse con su anulación explícita para evitar duplicarlas con un comprobante posterior.

## Migraciones aplicadas

1. `20261106150000_apicola_economia_estructura.sql`: tabla, referencias, índices, RLS y auditoría.
2. `20261106150100_apicola_economia_operaciones.sql`: RPC de imputación/anulación y protección de documentos vinculados.
3. `20261106150200_apicola_economia_consultas.sql`: búsqueda paginada de documentos e informes económicos agregados.
4. `20261106153000_apicola_comercial_estructura.sql`: fraccionamientos, consumo de insumos, salidas y devoluciones, RLS y auditoría.
5. `20261106153100_apicola_stock_saldos.sql`: saldos canónicos y controles sobre las operaciones de la etapa 2.
6. `20261106153200_apicola_comercial_operaciones.sql`: operaciones transaccionales de producción comercial y protección de ítems/ventas vinculados.
7. `20261106153300_apicola_flujos_caja.sql`: asignaciones de dinero y fuentes canónicas de cobros/pagos/reembolsos.
8. `20261106153400_apicola_comercial_consultas.sql`: catálogos paginados, trazabilidad, caja y valorización.
9. `20261106153500_apicola_proteger_flujos.sql`: integridad de movimientos financieros y de insumos vinculados.

Las nueve migraciones de la etapa 3 se aplicaron en producción el **06/11/2026 (Argentina)**, en el proyecto `zhtqkygjvaaizbdwwsbi`, con autorización expresa del usuario: «APLICAR MIGRACION NO PUBLIAR». El plan previo confirmó que eran las únicas pendientes y se ejecutaron en el orden indicado. La verificación posterior confirmó seis tablas nuevas con RLS activo, políticas de lectura y sin escritura directa para `authenticated`; once RPC públicas con `SECURITY DEFINER`, `search_path=pg_catalog,public`, ejecución para `authenticated` y revocada para `anon`. Las consultas internas de stock y fuentes de caja ejecutaron correctamente contra el esquema productivo.

No se cargaron registros operativos de ejemplo ni se cambió la parametrización modular. La publicación del frontend continúa pendiente: la instrucción vigente del usuario es **no publicar**.

El contraste final del historial remoto mediante consulta de sólo lectura confirmó **246 migraciones locales y 246 remotas**, sin pendientes ni versiones exclusivamente remotas. Se utilizó esta comprobación después de que el `dry-run` posterior fallara al autenticar el rol temporal del CLI; la aplicación de las nueve migraciones había finalizado correctamente.

## Verificación

- `node scripts/test-apicola-economia-sql.mjs`: PostgreSQL temporal; reparto entre campañas, saldos por documento, reintentos, validación de importes/monedas/fechas, protección de comprobantes y notas de crédito, aislamiento entre empresas, privacidad por rol, auditoría, anulaciones, paginación, concurrencia entre conexiones y cierre de campaña.
- `node scripts/test-apicola-comercial-sql.mjs`: balance físico completo, consumo/reversión de envases, rollback, idempotencia, salidas por ítem, ausencia de doble descuento, devoluciones, calidad, protección de orígenes e ítems, NC sin retorno automático, flujos canónicos y reembolsos, permisos y concurrencia entre conexiones para miel y dinero.
- `node scripts/test-apicola-ui.mjs --economia`: componentes reales contra PostgreSQL temporal mediante API local. Compra recibida, estimación en USD, imputación de ventas existentes en ARS/USD, resultados, anulación, acceso de operador y ausencia de desbordes en celular. Capturas en `private-backups/apicola-preview/economia-*.png`.
- `node scripts/test-apicola-ui.mjs`: recorrido conjunto de las etapas 1, 2 y 3, incluidos fraccionado, entregas, devoluciones y caja.
- `node scripts/test-apicola-ui.mjs --comercial`: formularios reales de fraccionado, salida, retorno, caja y valorización; saldo actualizado en la vista de stock y la ficha de lote, privacidad de costos y uso en móvil. Capturas `private-backups/apicola-preview/comercial-*.png`.
- ESLint de los archivos modificados sin errores ni advertencias. `npx tsc --noEmit` finaliza correctamente; el análisis efectivo con `npx tsc -p tsconfig.app.json --noEmit` conserva los 34 errores previos ajenos a Apícola. No se generó un build de distribución.

Resultados locales: pruebas SQL económica y comercial aprobadas, incluidas conexiones concurrentes para miel y dinero. Recorridos UI económico, comercial y conjunto de las tres etapas aprobados. Capturas de stock, trazabilidad, caja, resultados y formularios revisadas visualmente en escritorio/celular.

Las pruebas usan tablas mínimas compatibles con comprobantes, productos y movimientos existentes para verificar vínculos, restricciones y consultas de este módulo. No sustituyen una validación real de facturación fiscal, integraciones bancarias o las transacciones completas de Compras/Ventas. No se probó una emisión fiscal ni un reembolso real en producción.

## Publicación pendiente

El backend de la etapa 3 está aplicado. La publicación del frontend requiere una instrucción posterior que revoque **no publicar**. No se habilitaron módulos para nuevos comercios ni se cargaron datos operativos remotos.
