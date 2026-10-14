# Múltiples CUIT por comercio

Publicado el 14/10/2026 en https://vortexgestion.netlify.app. Deploy Netlify: `6acf7774268717ef55dd6484`.

## Configuración y uso

- Activar **Múltiples CUIT** en la parametrización del comercio.
- En Configuración ARCA, agregar cada emisor con su razón social, CUIT, punto de venta, ambiente, condición frente a ARCA, domicilio y certificados propios. La condición es obligatoria y usa el catálogo de Datos del comercio.
- Marcar un emisor activo como predeterminado para preseleccionarlo al abrir Nueva venta. El usuario puede seleccionar otro emisor activo antes de guardar.
- El listado de ventas muestra la columna Emisor y el filtro CUIT/Todos cuando el parámetro está activo. Todos es el filtro inicial; también contempla el CUIT del comercio para ventas anteriores.
- Clientes, productos, stock y cuentas corrientes se comparten. La cuenta corriente no se separa por CUIT.

Cada venta nueva guarda una copia de la identidad fiscal, sin certificados ni claves. El emisor de una venta guardada es inmutable. Los certificados se resuelven en el backend para el emisor de esa venta; impresión y QR usan la identidad registrada. Los comprobantes previos conservan el circuito ARCA anterior.

Los módulos que generan ventas por sus RPC anteriores necesitan una adaptación específica para elegir emisor; la base rechaza un alta sin emisor si el parámetro está activo. No se asigna automáticamente un CUIT a esas operaciones.

## Base de datos y funciones

Aplicadas en producción `zhtqkygjvaaizbdwwsbi`:

- `20261014130000_emisores_fiscales_estructura.sql`: emisores privados, metadatos públicos mediante RPC, relación con ventas y validación de tenant e identidad.
- `20261014131000_emisores_fiscales_ventas.sql`: alta transaccional y previsualización de números por emisor, conservando stock y cuenta corriente.

Publicadas las funciones `obtener-cae-afip`, `consultar-ultimo-comprobante` y `consultar-padron-afip`, con resolución de configuración fiscal por emisor. No se migraron credenciales ni se reclasificaron ventas históricas.

## Verificación

- `node scripts/test-multi-cuit.mjs`: PostgreSQL temporal, migraciones reales, permisos, certificados privados, numeración independiente, idempotencia, stock, saldo unificado e identidad inmutable.
- `node scripts/test-emisor-fiscal-backend.mjs`: resolver fiscal real con Supabase simulado; selección exacta de credenciales, aislamiento y compatibilidad anterior.
- `node scripts/test-nueva-venta-ui.mjs`: Chrome con datos ficticios; apertura de Nueva venta con parámetro activo e inactivo, selector y presupuesto. Corrige la importación ausente de `Label` que dejaba la página en blanco.
- Prueba existente de edición de ventas, TypeScript raíz, Deno y build satisfactorios. Lint de los archivos nuevos/modificados sin aumento respecto de HEAD.
- `node scripts/verify-multi-cuit-publicacion.mjs --frontend`: disponibilidad del RPC con acceso anónimo bloqueado y disponibilidad del build publicado por HTTPS.

Estas verificaciones no emiten CAE ni sustituyen una prueba con certificados propios en homologación ARCA.
