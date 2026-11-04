# Comprobantes y cancelacion de pedidos online

Cambios implementados y probados localmente. Las migraciones `20261104130000` y `20261104140000` y los cambios de `obtener-cae-afip` y `mercadopago-reembolsar-pedido` se aplicaron en Supabase el 04/11/2026 con autorizacion expresa. Se verificaron las once funciones SQL contra los archivos locales, permisos y RLS. Se mantuvieron los once pedidos existentes, incluido el Nº 24 de Martin, sin generar ventas, notas ni reembolsos reales. Netlify sigue sin publicarse por instruccion del usuario.

Se corrigio la consulta de localhost para no depender obligatoriamente de relaciones opcionales: si falta una migracion, conserva el listado de pedidos y deshabilita las acciones nuevas. Los errores de permisos/red o de relaciones principales no se ocultan. Con las migraciones instaladas vuelve a habilitar el flujo completo.

La correccion puntual `20261104123000` de la funcion de reembolso anterior ya se aplico y verifico en Supabase: cambia una variable local para evitar una ambiguedad con `pedidos_online.total`; no procesa pedidos ni altera importes historicos.

## Generar el comprobante

En Confirmado, En preparacion, Listo para entregar o Entregado aparece Generar comprobante de venta, para un administrador del comercio y con pago de Checkout Pro aprobado e integro. Se mantienen los estados existentes: no se agrega Enviado.

Se puede seleccionar Recibo X o Factura A/B/C y el emisor fiscal cuando hay multiples CUIT. El servidor toma cliente, cantidades, variantes, precios e importe del pedido, valida el tenant y exige un unico cobro compatible. No recibe importes ni items editables del navegador.

Se reutilizan las RPC transaccionales de ventas y sus numeradores. Se registra una sola imputacion del pago existente de Mercado Pago, sin una nueva solicitud de cobro y sin un segundo descuento de stock. El precio es el del pedido, aunque el precio actual del catalogo haya cambiado. Un reintento o dos pestanas devuelven la misma venta. Se conserva la descripcion del pedido.

La factura queda registrada en Ventas, pendiente de CAE hasta solicitarlo desde el detalle habitual; generar el documento no autoriza automaticamente su factura en ARCA. Una vez creado, el boton cambia a Ver comprobante de venta. Se reutilizan la impresion/PDF y el detalle de Ventas. No se pueden editar, borrar o desvincular los comprobantes online para volver a mover stock/pagos.

## Cancelar y devolver dinero

1. **Sin venta:** se conserva el flujo ya desplegado: cancelar, reponer una sola vez y solicitar el reembolso de Mercado Pago.
2. **Con comprobante sin CAE:** se registra su anulacion interna y se conserva el documento original. Si existe un intento fiscal sin resultado definitivo, se exige recuperar/completar el CAE antes de decidir la anulacion; no se supone que una respuesta perdida signifique rechazo. La anulacion impide autorizarlo posteriormente.
3. **Con factura A/B/C autorizada:** se genera una unica nota de credito de la misma clase, mismo emisor, receptor fiscal original e importes, vinculada a la factura exacta por tipo, punto de venta y numero. Se conserva la factura. La funcion de CAE existente autoriza/recupera esa nota con su proteccion de reintentos. No se reemplaza esa referencia por un periodo estimado.

Solo despues de confirmar la anulacion interna o el CAE de la nota se cancela el pedido, se repone su stock y se solicita devolver el dinero. Si ARCA rechaza o demora, se registra Cancelacion pendiente de ARCA y no se solicita el reembolso ni se repone stock. Reintentar usa la misma nota. La nota puede abrirse desde el pedido.

Si Mercado Pago falla o demora despues de resolver el comprobante, la anulacion/nota se conserva y la devolucion queda pendiente/sin confirmar para consultar o reintentar con la misma clave. Una devolucion completa externa se reconcilia sin repetirla y una parcial devuelve solo el saldo, como en el flujo anterior. No se ejecutan devoluciones por migrar o desplegar.

Los cobros online ya pagados no generan movimientos nuevos de cuenta corriente al crear su nota. La nota es un contracomprobante y una obligacion de devolver, no un nuevo ingreso de caja. Los resumenes y PDF de ventas/caja computan el signo de los documentos online y solo descuentan el dinero efectivamente confirmado por Mercado Pago. Los documentos conservan sus importes positivos originales para impresion y ARCA. No se reescriben cierres historicos de caja; el saldo informado puede revisarse por periodo de documento.

El flujo automatico admite comprobantes generados por esta integracion, pagos en ARS y cancelacion total de la operacion. Ventas asociadas manualmente, cobros ambiguos/multiples o emisores incompatibles requieren revision; no se fuerza una nota ni una transferencia para esos casos. Los cambios de estado quedan bloqueados mientras hay una cancelacion fiscal en curso.

## Activacion y verificaciones

- Ya se aplicaron solamente `20261104130000_comprobante_pedido_online.sql` y `20261104140000_cancelacion_online_facturada.sql`, en ese orden y en una transaccion, con guardas sobre las funciones vigentes y registro en el historial. La correccion `20261104123000` tambien figura aplicada. No se uso un push de otras migraciones pendientes.
- Ya se desplegaron `obtener-cae-afip` con `comprobante-asociado.ts` y `mercadopago-reembolsar-pedido`. El webhook desplegado utiliza el mismo RPC de sincronizacion y no necesito otro cambio en esta etapa.
- Frontend publicado en Netlify el 04/11/2026 por pedido expreso del usuario: https://vortexgestion.netlify.app (deploy `6aeb1d5fc3102047dd171d39`). Incluye generar comprobantes y cancelar con anulacion/nota de credito y reembolso. Euforia publicada en https://euforiaclothing.netlify.app (deploy `6aeb1d5fc080ca0bc8bd07d2`) con fotos del slider y banner de 3 cuotas. Ambos builds finalizaron correctamente; se compararon por hash los archivos publicados con los builds locales. No se realizaron operaciones financieras reales para verificar la publicacion.
- Probar en homologacion de ARCA y con cuentas de pruebas de Mercado Pago antes de emitir documentos/transferencias reales. No se utiliza el pedido real de Martin como prueba.

## Verificacion

- `node scripts/test-comprobante-online-sql.mjs`: PostgreSQL local, migraciones y RPC reales de ventas, numeracion y variantes; idempotencia, concurrencia, permisos, stock agotado, anulacion sin CAE, nota antes del reembolso, proteccion de documentos con CAE, emision ambigua, multi-CUIT y cancelacion sin venta.
- `node scripts/test-comprobante-online.mjs`: orden fiscal/dinero, rechazo/timeout sin reembolso, asociacion XML y resumenes comerciales/caja con devolucion total/parcial. Proveedores simulados.
- `node scripts/test-comprobante-online-ui.mjs`: handlers del boton, estados, tipo/emisor, confirmacion, bloqueo y consulta de comprobante/nota. Sin navegador.
- `node scripts/test-pedidos-online-compat.mjs`: el mismo pedido historico sigue listado con y sin las relaciones nuevas; habilitacion progresiva y errores de permisos/red conservados.
- `node scripts/test-cae.mjs`: handler fiscal real con SOAP/Supabase simulados, incluidas notas vinculadas, receptor original, rechazo de otro emisor e idempotencia tras respuesta perdida.
- Se mantienen las pruebas de reembolso anteriores. ESLint dirigido sin errores y el chequeo TypeScript adicional se compara con HEAD para distinguir la deuda previa.

Fuentes oficiales: [ARCA, comprobantes y notas de credito/debito](https://www.arca.gob.ar/facturacion/comprobantes/), [documentacion WSFEv1](https://www.arca.gob.ar/ws/documentacion/ws-factura-electronica.asp), [API de reembolsos de Mercado Pago](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro-preferences/create-refund/post).
