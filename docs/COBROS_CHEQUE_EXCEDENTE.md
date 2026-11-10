# Cobros con excedente de cheque

## Cambio preparado el 10/11/2026

El formulario acepta el valor completo de un cheque recibido aunque supere la deuda seleccionada. Antes de confirmar muestra la imputación, el excedente a cuenta y el saldo total posterior del cliente. Efectivo, transferencia y tarjeta conservan su límite anterior.

La migración `20261110110000_cobros_cheque_excedente_cliente.sql` reemplaza la función de cobros sin cambiar su firma ni modificar datos existentes. Imputa hasta el menor valor entre deuda seleccionada y saldo global; registra el resto como crédito del cliente sin venta, con el mismo `cheque_id`. El cheque ingresa una sola vez en cartera por su importe completo. Los otros medios se imputan antes de los cheques, respetando el orden elegido de comprobantes.

La emisión de recibos conserva el total recibido, las imputaciones y el saldo a favor. Revertir el cheque desde una imputación o desde su excedente elimina todos sus créditos y anula el recibo. Se mantienen las restricciones para cheques ya utilizados, la validación de comercio y cliente, los bloqueos transaccionales y la idempotencia del recibo.

## Caso informado

Consulta de solo lectura: cuenta `carlosbostico@hotmail.com`, cliente `VRANBI S.A.S.`. Saldo global observado: $626.500,04. Un cheque de $650.000 dejaría $23.499,96 a favor. No se registró ningún cobro real ni se alteraron los datos del cliente.

## Verificación

- `node scripts/test-cobros-cliente.mjs`: 35 pruebas PostgreSQL local temporal, incluidos tres comprobantes por $626.500,04, cheque por $650.000, excedentes con créditos previos, selección parcial, medios mixtos y reversión completa.
- `node scripts/test-recibos-cliente.mjs`: 14 pruebas PostgreSQL local temporal, incluido recibo con saldo negativo, reintento sin duplicación y anulación desde el excedente.
- `node scripts/test-recibos-cliente-ui.mjs`: interacción del formulario real en Chrome con hooks simulados, cheque superior a la deuda, aviso previo, confirmación habilitada, envío del valor completo y saldo a favor en HTML del recibo. También verifica los flujos existentes de recibos y PDF. Los fixtures fijan la fecha y usan las etiquetas actuales de la interfaz.
- TypeScript sin emisión, ESLint de los archivos modificados y `git diff --check` correctos.
- Con autorización expresa del usuario («aplicar solo migracion»), se aplicó únicamente `20261110110000_cobros_cheque_excedente_cliente.sql` mediante `supabase db push --linked --yes`. La consulta posterior confirmó su registro, la función con soporte de excedente, ejecución para `authenticated` y bloqueo de `anon`. El `--dry-run` posterior confirmó que no quedan migraciones pendientes.

## Estado de publicación

El frontend se publicó el 10/11/2026 tras la autorización posterior de publicar todas las modificaciones: https://vortexgestion.netlify.app, despliegue `6af3a4e771d24bc5e8e604e5`. El formulario permite ingresar el importe completo del cheque y muestra el excedente a favor antes de confirmar. No se registró ni se modificó ningún pago real: el cliente ingresará los datos de su cheque.

Las pruebas automatizadas no registran pagos en Supabase. No se realizó validación manual del circuito con un cheque real.
