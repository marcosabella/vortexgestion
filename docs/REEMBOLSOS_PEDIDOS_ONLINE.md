# Cancelacion de pedidos online y devoluciones de Mercado Pago

Backend aplicado en Supabase el 04/11/2026 con autorizacion expresa: migracion `20261104120000`, funcion `mercadopago-reembolsar-pedido` y actualizacion de `mercadopago-webhook`. Se verificaron las siete funciones SQL contra la migracion local, RLS y permisos. No se ejecutaron devoluciones reales ni se regularizaron pedidos historicos en lote.

Tambien se aplico la correccion puntual `20261104123000` de la variable del importe reembolsado y, con autorizacion posterior, la extension de comprobantes y cancelacion con nota de credito: ver [COMPROBANTES_PEDIDOS_ONLINE.md](COMPROBANTES_PEDIDOS_ONLINE.md). El backend esta desplegado; Netlify permanece pendiente por instruccion expresa.

Frontend pendiente de publicacion por instruccion expresa del usuario: falta otra modificacion antes de publicar en Netlify. Mientras siga la web anterior, no se podran cancelar pedidos pagados desde esa pantalla: el backend exige el nuevo flujo de devolucion.

## Comportamiento

- Al elegir Cancelado se abre una confirmacion con cliente e importe estimado. No se envia dinero solamente por seleccionar el estado.
- Para pedidos pagados, un administrador activo del mismo comercio confirma la cancelacion y la devolucion. El servidor verifica rol, tenant y un unico pago de Checkout Pro; los importes no provienen del navegador.
- La cancelacion y la reposicion de productos/variantes se guardan en una transaccion. Un pedido ya cancelado no vuelve a reponer stock.
- Se solicita el saldo pendiente al pago original usando la credencial del comercio. Se comprueban payment ID, collector ID, referencia externa, moneda e importe antes del POST.
- Una devolucion previa completa se reconcilia sin repetirla. Una previa parcial permite devolver solo el saldo. Una devolucion externa pendiente se consulta antes de enviar otra.
- Se guardan una clave de idempotencia por pedido, el importe solicitado inmutable, administrador, resultado e identificador de reembolso cuando esta disponible. Un intento tiene una concesion de 90 segundos; otro proceso no lo reemplaza mientras esta vigente.
- Ante error o respuesta ambigua, el pedido sigue cancelado y la devolucion queda visible como sin confirmar/pendiente. Consultar o reintentar vuelve a verificar el pago y conserva la misma clave e importe. No hay reintentos de dinero en segundo plano por un temporizador.
- El webhook confirma la devolucion cuando Mercado Pago la informa. Una respuesta vieja no revierte un reintegro confirmado ni descuenta stock nuevamente.
- Los pedidos cancelados antes de esta implementacion ofrecen Reembolsar pago a un administrador. No se reembolsa a Martin ni a otros clientes por desplegar la funcionalidad.
- Los pedidos reembolsados permanecen en el listado y pueden filtrarse por pago devuelto o devuelto parcialmente.
- Un pedido impago se cancela sin reintegro ni reposicion: el checkout vigente no descuenta stock hasta aprobar el pago. Si el pago sigue en proceso, se exige verificar su resultado antes de cancelar.

Los pedidos convertidos en una venta, los pagos ambiguos o multiples y los cambios externos en un importe ya solicitado requieren revision manual. Una negativa definitiva del proveedor debe revisarse en Mercado Pago; reintentar no genera una clave nueva ni fuerza un segundo movimiento.

## Componentes y activacion

1. Revisar/aplicar unicamente `supabase/migrations/20261104120000_reembolso_cancelacion_pedido_online.sql` y registrar esa version en el historial. No usar un push que incluya otras migraciones pendientes. No contiene reparaciones de datos.
2. Desplegar `mercadopago-reembolsar-pedido` y la version modificada de `mercadopago-webhook`. La nueva funcion usa autenticacion explicita con `auth.getUser` y llamadas internas de servicio; no depende de la validacion JWT del gateway. No agregar secretos al frontend.
3. Publicar el frontend actualizado solo con autorizacion expresa para Netlify. Coordinar la ventana: desde la migracion, el RPC anterior rechaza cancelar pedidos pagados sin pasar por el reembolso, por lo que el frontend anterior dejara de permitir esa cancelacion.
4. Verificar con una cuenta/pago de pruebas: cancelar, confirmar, consultar el pago en Mercado Pago y el registro en Vortex; revisar variante y stock. No utilizar automaticamente el pago real del pedido 24 como prueba.

API oficial utilizada: [reembolsos de Checkout Pro Preferences](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro-preferences/create-refund/post), POST `/v1/payments/{id}/refunds` con `X-Idempotency-Key` y consulta del pago y sus reembolsos.

## Verificacion local

- `node scripts/test-reembolso-online.mjs`: proveedor simulado; devolucion total, parcial, timeout despues de enviar dinero, reintentos, devolucion externa pendiente/completa, identidad del pago y fallos de red. No valida una transaccion real de Mercado Pago.
- `node scripts/test-reembolso-online-sql.mjs`: PostgreSQL temporal; migracion real, permisos y RLS, tenant, reposicion una vez, concurrencia, importe estable, notificaciones tardias, pedidos historicos e impagos. No conecta a Supabase.
- `node scripts/test-reembolso-online-ui.mjs`: ejecuta handlers reales de la pagina con hooks/UI aislados, confirmacion, bloqueo mientras procesa, reintento y permisos. No es una prueba visual de navegador.
- ESLint dirigido a los archivos modificados y `npx tsc --noEmit`. El chequeo adicional de `tsconfig.app.json` se compara contra HEAD en memoria para distinguir deuda previa de errores nuevos; el comando raiz no comprueba los proyectos referenciados por si solo.

No se instalan dependencias ni se usan pagos reales en estas pruebas.
