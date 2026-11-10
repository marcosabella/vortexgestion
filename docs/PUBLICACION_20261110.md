# Publicación del 10/11/2026

El usuario autorizó publicar todas las modificaciones y hacer commit y push de todo el trabajo pendiente.

- Sitio: https://vortexgestion.netlify.app
- Despliegue: `6af3a4e771d24bc5e8e604e5`.
- Detalle: https://app.netlify.com/projects/vortexgestion/deploys/6af3a4e771d24bc5e8e604e5
- Incluye Vortex Transporte, altas y edición como páginas, navegación desde el menú lateral, usuarios y permisos generales para todos los comercios y cobros con excedente de cheque a favor del cliente.
- Las cuatro migraciones de esta entrega y las nueve Edge Functions de usuarios ya estaban instaladas en Supabase con autorización previa. El ajuste puntual del stock del producto 385 de Euforia también estaba aplicado y verificado; se incorpora su documentación, sin repetir el ajuste.

## Verificación de publicación

Build de producción y `npx tsc --noEmit` correctos. ESLint de los archivos frontend y pruebas modificados sin errores ni advertencias. Pasaron nuevamente las pruebas en Chrome de Usuarios, las ocho altas y edición de Transporte, y recibos/cobros con cheque excedido; también las pruebas de rutas/perfiles y los nueve casos del handler de usuarios. Las pruebas PostgreSQL realizadas durante la implementación están documentadas en los informes específicos.

El HTML y los archivos JavaScript y CSS referenciados directamente coinciden por SHA-256 con `dist`. Las rutas `/usuarios` y `/transporte/unidades/nuevo` responden con el HTML del sitio. Esta comprobación no equivale a una validación manual autenticada del negocio. No se crearon usuarios ni se registraron ventas, pagos, servicios o emisiones fiscales reales para comprobar el despliegue.

Los respaldos privados, credenciales, archivos de entorno y dependencias permanecen excluidos de Git. No se publicó el proyecto separado de la tienda Euforia: su ajuste de stock reside en la base compartida.
