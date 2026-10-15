# Publicación del 15/10/2026

Actualización posterior del mismo día: nombre completo del comercio en la barra lateral, con salto de línea, alineación centrada y encabezado sin compresión vertical. Deploy `6ad0b7befd0c858d490e6257`, build principal `/assets/index-BG42SEQ4.js`. Lint del componente, TypeScript raíz y build satisfactorios. Publicación por HTTPS verificada; sin nuevas migraciones.

Publicación autorizada expresamente por el usuario para aplicar migraciones y despliegues pendientes.

- Sitio: https://vortexgestion.netlify.app
- Netlify site ID: `b9996f69-d630-4d0f-ac21-d2a646930add`.
- Deploy: `6ad0b61d3db3be4bbde85b67`, estado verificado `ready` y deploy publicado activo.
- Build principal verificado por HTTPS: `/assets/index-gWW_vrYg.js`.
- Proyecto Supabase: `zhtqkygjvaaizbdwwsbi`.

## Cambios publicados

1. Mensaje y validación de código duplicado al crear/editar productos, incluido el alta desde Compras.
2. Administración → Incidentes: captura automática, grilla, filtros y seguimiento restringidos al administrador de plataforma.
3. Taller → Vehículos: búsqueda de cliente mediante botón/modal, creación del cliente en el mismo flujo y retorno con selección inmediata, conservando el vehículo.
4. Ventas: conservación de talle/color hasta PostgreSQL, descuento por variante y protección ante desajustes entre total y variantes.

## Migraciones

Se aplicaron exclusivamente las dos pendientes confirmadas por el historial y el dry-run:

- `20261015120000_incidentes_plataforma.sql`.
- `20261015140000_ventas_conservar_variante_stock.sql`.

Un dry-run posterior devolvió `upToDate: true`, sin migraciones pendientes. No hubo Edge Functions de Supabase modificadas. El despliegue de Netlify incluyó las funciones existentes; `cotizaciones-bna` respondió HTTP 200 con cotizaciones después de publicar.

## Comprobaciones

- Build de producción satisfactorio, destino de Supabase verificado antes de generar los artefactos.
- TypeScript raíz satisfactorio; la configuración completa de la aplicación conserva los 37 diagnósticos preexistentes, sin errores nuevos en los archivos modificados.
- Lint sin aumento respecto de HEAD en Ventas; los componentes nuevos ya habían pasado sus verificaciones específicas.
- Pruebas de productos duplicados y del JSON enviado por las tres modalidades de alta de venta, con Supabase simulado.
- PostgreSQL temporal: reproducción y corrección del descuento por variante, idempotencia, rollback, otras empresas, protección del total de Gestión, numeración manual, múltiples emisores y vista pública real.
- PostgreSQL temporal: RLS y permisos de Incidentes, usuarios activos, acceso anónimo, cambios de seguimiento y límite de reportes.
- Navegador local con datos ficticios: alta de cliente desde Taller, búsqueda, selección, cancelación, errores, reintentos y conservación del vehículo.
- Producción: endpoints nuevos y tabla de Incidentes rechazan acceso anónimo (`42501`); no se insertaron registros de prueba.
- Producción: assets iguales al build local y rutas `/admin/incidentes`, `/taller/vehiculos/nuevo` y `/compras/nueva` responden con el build actual. Se comprobó la presencia de las funcionalidades nuevas en el JavaScript publicado. Esto no sustituye una prueba funcional con sesión de administrador.

## Pendiente operativo

Los stocks históricos por talle/color de Euforia necesitan conciliarse con el stock real de Gestión. No se alteraron cantidades ni se supuso qué variante se vendió. La base rechaza una nueva venta de un producto desajustado hasta revisar esa distribución.

La tienda Euforia es un proyecto separado y no tuvo cambios de frontend en esta publicación. Consulta el stock corregido al recargar; sigue pendiente un refresco automático del catálogo para visitas que permanecen abiertas. Ver `EUFORIA_STOCK_VARIANTES.md`.
