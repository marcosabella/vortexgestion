# Recibos de pago de cuenta corriente

Al confirmar un cobro total o parcial desde la cuenta del cliente, se registra
el cobro y su recibo en una única transacción. Se abre automáticamente el modal
del recibo, con vista previa, impresión, descarga PDF y WhatsApp.

En la grilla de movimientos, junto a Eliminar:

- Las ventas tienen Ver detalle y abren el mismo modal de Ventas (`VentasList`).
- Las imputaciones del pago tienen Ver detalle y abren el recibo de la operación.
- No hay una sección inferior adicional de recibos.

Un cobro con varios medios o comprobantes tiene un único recibo. Cada fila
del pago permite recuperar ese mismo documento.

Los cobros anteriores sin recibo guardado también tienen Ver detalle. Se abre
un comprobante histórico del movimiento, con la fecha e importe registrados y
las mismas acciones. Su referencia es `H-<id del movimiento>` y no consume la
numeración de recibos nuevos. No vuelve a cobrar ni escribe datos productivos.
El saldo se identifica como reconstruido al cierre de la fecha del pago.
Por pedido del usuario se omitió la leyenda extensa de reconstrucción del pie.
Los datos del encabezado y del cliente son los actuales.
No afirma conservar un saldo original que nunca fue guardado ni
inventa comprobantes, medios desconocidos o un orden entre pagos del mismo día.

## Persistencia y seguridad

La migración `20261015160000_recibos_pago_cliente.sql` agrega la tabla y la RPC
`registrar_cobro_cliente_con_recibo`. La RPC utiliza el registro de cobros
existente, valida la pertenencia al comercio y conserva snapshots del comercio,
cliente, medios, comprobantes, importe y saldo anterior/posterior. La numeración
es consecutiva por comercio. Los reintentos con la misma solicitud no duplican
el cobro; cambios de datos en una solicitud procesada se rechazan.

RLS permite consultar solamente recibos del comercio autorizado. Los usuarios
no pueden insertar, modificar ni eliminar recibos directamente. La eliminación
o modificación de una imputación marca el original como anulado; si quedan
otras imputaciones, su detalle muestra esa condición. No se alteran los saldos
del recibo original ni se crean movimientos de caja adicionales.

El encabezado reutiliza los estilos e identidad de los comprobantes existentes.
La impresión y el PDF parten del mismo HTML. Los cheques indican que están
sujetos a acreditación. WhatsApp usa compartir archivos cuando está disponible;
en otros navegadores descarga el PDF y abre el chat para adjuntarlo manualmente.

El formulario general de movimientos también conduce los créditos de pago al
selector de comprobantes y medios, para emitir el recibo en el mismo flujo.

## Verificación y publicación

- `node scripts/test-recibos-cliente.mjs`: PostgreSQL temporal local; pagos
  parciales/totales/mixtos, snapshots, reintentos, concurrencia, numeración,
  reversiones, rollback y aislamiento entre comercios.
- `node scripts/test-recibos-cliente-ui.mjs`: Chrome con hooks simulados;
  botones en las filas, apertura automática y recuperación, PDF real y salida
  de WhatsApp sin mensajes ni conexiones a servicios externos.
- Lint de archivos modificados, `npx tsc --noEmit` y build.
- El chequeo explícito de `tsconfig.app.json` conserva errores previos fuera
  de estos cambios; no equivale a validación funcional en producción.

La migración de recibos ya fue aplicada por pedido del usuario. La recuperación
de comprobantes históricos es de consulta y no requiere otra migración.
Los cambios de interfaz requieren publicar el frontend.
