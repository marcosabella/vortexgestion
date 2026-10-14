# Continuidad: actualización final de Bostico

Última actualización de esta nota: 14/10/2026.

## Identificación

- Comercio: Bostico.
- Usuario/comercio de referencia: `carlosbostico@hotmail.com`.
- `comercio_id`: `a4983b26-4f3d-46e0-8e4f-46bd34fec838`.
- Base Access utilizada para el primer corte: `D:\BOSTICO 2026\BDsiagro.mdb`.
- La copia inicial fue tomada el 22/09/2026.
- El cliente continuó operando en el sistema de escritorio después de ese corte.

## Pedido pendiente para el cambio definitivo

El usuario solicitará por conversación, sin utilizar el módulo visual de migraciones, actualizar producción con una copia final de `BDsiagro.mdb`.

No se debe ejecutar nuevamente el importador completo actual sobre Bostico: los maestros existentes se omiten sin actualizar y las operaciones de una nueva ejecución pueden duplicar ventas, pagos, cheques y movimientos de cuenta corriente.

La actualización final debe ser incremental y usar los identificadores de origen de Access junto con `migracion_id_map` y los datos ya migrados para clasificar cada registro como:

- nuevo;
- modificado;
- sin cambios;
- eliminado en origen o conflictivo.

Las eliminaciones no deben aplicarse automáticamente. Se deben conservar o archivar hasta que el usuario autorice una decisión concreta.

## Procedimiento acordado

1. Confirmar que Bostico dejó de operar definitivamente el sistema de escritorio.
2. Recibir la ruta de la copia final de `BDsiagro.mdb` y conservar también la copia del 22/09.
3. Hacer una comparación de sólo lectura antes de modificar producción.
4. Informar cantidades nuevas, modificadas, iguales y conflictivas por entidad.
5. Preparar un script incremental específico, transaccional, auditable y reversible.
6. Solicitar autorización expresa antes de aplicar cambios en Supabase productivo.
7. Actualizar únicamente las diferencias autorizadas.
8. Conciliar ventas, notas de crédito/débito, cobranzas, cuenta corriente de clientes y proveedores, cheques, clientes, proveedores, productos y stock.
9. Entregar un informe final con conteos, importes y diferencias pendientes.

## Correcciones ya realizadas en Bostico

- Se reparó la clasificación histórica de notas de crédito y débito importadas.
- Resultado validado en producción: 85 notas de crédito y 1 nota de débito clasificadas.
- Se corrigieron 76 movimientos de cuenta corriente como créditos por un total de `$8.234.352,31`.
- Se conciliaron 61 clientes sin diferencias por notas entre ventas y cuenta corriente.
- Los clientes `CLIENTE LEGACY ELIMINADO #...` se conservan, pero se ocultan y no participan de las vistas y cálculos operativos.
- Los clientes con saldo efectivo de `$0,00` no se muestran en el listado de cuenta corriente.
- Los movimientos de cuenta corriente se presentan del más reciente al más antiguo.
- Los números simples provenientes de Access, por ejemplo `7226`, se muestran con el punto de venta activo y la máscara `0000 - 00000000` sin modificar el valor histórico almacenado.

## Migraciones relacionadas

- `supabase/migrations/20260924160000_importador_notas_credito_debito.sql`
- `supabase/migrations/20260924161000_reparar_notas_bostico.sql`

Ambas fueron aplicadas y verificadas en producción. No volver a ejecutarlas como mecanismo de actualización incremental.

## Corrección de Recibos X

- El código de comprobante Access `121` corresponde a `recibo_x`, no a `recibo_c`.
- El mapeo del importador fue corregido para las próximas importaciones.
- La reparación acotada de las ventas ya importadas está en
  `supabase/migrations/20260925130000_reclasificar_recibos_x_bostico.sql`.
- Se conservan sin cambios los cuatro Recibos C que tienen CAE.
- La migración fue aplicada y verificada en producción el 26/09/2026: se
  reclasificaron 1.089 ventas como Recibo X y se conservaron los cuatro Recibos
  C con CAE. La conciliación final no arrojó inconsistencias.

## Frase sugerida para retomar

> Leé `docs/BOSTICO_ACTUALIZACION_FINAL.md`. Bostico ya cerró el sistema de escritorio y quiero simular la actualización incremental con la nueva base ubicada en: D:\BOSTICO 2026\BDsiagro.mdb. No apliques cambios en producción hasta mostrarme la comparación.


## Actualización incremental aplicada el 14/10/2026

El usuario confirmó el cierre del escritorio, revisó el delta y autorizó expresamente su aplicación a producción sólo para `carlosbostico@hotmail.com`.

- Base final: `D:\BOSTICO 2026\BDsiagro.mdb`; SHA-256 `0616560fc2f7e4625a691b1f830cc0da8ddfe75c97a3ac0c7ea28485d122dc63`.
- Lote completado: `8c14d604-5043-55df-8172-0cf489581454`; aplicado a las 04:47:31 UTC.
- Se incorporaron 101 ventas, 61 cobranzas, 321 productos y 3 clientes; se ajustaron cuatro stocks finales sin volver a descontar ventas históricas.
- Por la última decisión del usuario, venta 7210 según la nueva base: cinco artículos y $138.000,02; conserva su UUID, tres detalles originales y un único débito actualizado.
- 43 compras y 10 pagos a proveedores se agregaron a archivo histórico, manteniendo el criterio anterior.
- Se conservaron correcciones de CUIT, notas de crédito/débito, Recibos X, CAE existentes, cheques, presupuestos y registros ausentes en origen. No hubo eliminaciones.
- Verificación directa posterior: 1.806 operaciones y todos sus campos coinciden con el plan, 798 fuentes de línea base, cero diferencias por cliente en cuenta corriente; saldo agregado $18.906.889,17.
- Informe completo: `docs/BOSTICO_PREPARACION_INCREMENTAL.md`. Copia congelada, snapshot previo, SQL, auditoría y resultado productivo en `private-backups/bostico-incremental-20261013/`, excluidos de Git.

No repetir el importador completo ni usar el corte original para reinsertar estas operaciones. Para otra actualización, considerar las fuentes de línea base de los lotes incrementales completados. No se ejecutó la reversión; requiere autorización separada y rechaza modificaciones o dependencias posteriores.


## Numeración de comprobantes ARCA — 14/10/2026

Se corrigieron en producción 6.045 comprobantes con CAE usando `CaeXventa.idVentaAfip`, manteniendo `idVenta` como ID de origen de Access en los mapas. La venta 7327 de Gustavo Daniel Garay ahora muestra 0006 - 00005398. CAE, importes y cuenta corriente quedaron intactos. Lote: `1ba4a86f-6d9d-4ca6-8e21-e6427cf2cf50`.

Seis históricos (origen 18, 190, 69, 670, 210 y 1954) requieren identificar su punto de venta: repiten el número fiscal dentro del mismo tipo y el origen no aporta ese dato. No inferir el punto 6 para todos ellos. Ver el detalle y las colisiones visuales pendientes en `docs/BOSTICO_PREPARACION_INCREMENTAL.md`.

En próximos deltas tomar la numeración fiscal del registro CAE; no restaurar el ID interno como número visible. La auditoría y evidencia privada están en `private-backups/bostico-incremental-20261013/resultado-numeracion-arca.json`.

## Cuenta corriente de proveedores — 14/10/2026

El usuario solicitó migrar los históricos de proveedores. Se aplicó el lote `cdd15285-9d35-4e98-9427-0b568d387a31`: 3.014 movimientos, saldo neto $11.862.237,61 y cero diferencias por proveedor y campos. Seis registros de importe cero permanecen archivados; 12 pagos negativos se incorporaron como débitos por reversión. Se creó un proveedor histórico eliminado #2 para conservar una deuda de $100.

Este resultado reemplaza el estado previo de cero movimientos operativos de proveedores. No repetir el lote ni el importador completo. Ver `docs/BOSTICO_CUENTA_CORRIENTE_PROVEEDORES.md` para controles, evidencia y limitaciones de imputación y publicación del frontend.
