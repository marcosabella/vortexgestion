# Carta por QR de mesa

## Funcionamiento actual

- En **Vortex Restaurante → Configuración → QR por mesa**, generar/ver los QR de las mesas activas. Cada cartel se puede descargar como PNG de 1200 × 1500 píxeles o imprimir a 100 mm de ancho.
- El QR fijo muestra la carta del comercio sin iniciar sesión. Sólo incluye productos activos en la carta, en sectores activos, con precio positivo en pesos.
- La consulta de consumo está temporalmente oculta. La página pública no muestra pedidos, totales ni campos de acceso y siempre consulta sin credencial de apertura. Los accesos guardados anteriormente se descartan.
- El detalle interno del pedido no ofrece QR de apertura. Los carteles invitan únicamente a consultar los productos y sus precios.
- Los comensales no pueden realizar pedidos, pagos, solicitudes de cuenta ni modificaciones.

## Backend conservado

La migración `20261013100000_restaurante_consulta_qr.sql` ya aplicada conserva las funciones y credenciales de consulta de consumo para una posible reactivación futura. Esta ocultación no elimina tablas ni modifica funciones remotas y no requiere una migración adicional.

El QR fijo por sí solo no autoriza acceso a una cuenta. El backend valida credenciales por apertura y revoca accesos al cerrar, cancelar, mover o unir cuentas. Las tablas mantienen RLS y no conceden acceso directo a anon ni authenticated.

## Publicación y carteles

Publicar el frontend con la configuración de producción existente para que la ocultación se vea en el sitio. Desde Vortex Restaurante → Configuración → QR por mesa, generar los carteles del comercio y descargarlos. Los enlaces utilizan el dominio donde se está utilizando Vortex. Los carteles descargados anteriormente conservan su texto hasta volver a generarlos.

## Verificación local

- `npx tsc --noEmit`
- `npm run build`
- `node scripts/test-restaurante.mjs`: PostgreSQL temporal local, permisos, aislamiento y ciclo de aperturas del backend conservado.
- `node scripts/test-restaurante-consulta-ui.mjs`: navegador con datos ficticios, carta sin login ni consumo, accesos anteriores descartados, fallos de conexión, tamaños móviles, PNG e impresión. Usa el CSS de `dist` generado por el build y verifica lint de los archivos nuevos/modificados.

Para capturas opcionales, definir `RESTAURANTE_QR_SCREENSHOT` (PNG de la página; agrega una captura móvil) y `RESTAURANTE_QR_PNG` (cartel de prueba). Los QR ficticios apuntan al servidor de prueba y no son carteles productivos.
