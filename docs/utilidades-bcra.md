# Utilidades - APIs oficiales del BCRA

Módulo opcional, apagado por defecto. Se habilita en **Administración → Comercios → Parametrización → Utilidades**. El menú y todas las rutas `/utilidades/*` respetan la habilitación del comercio. Al cambiar de comercio o consulta se reinicia el formulario y se descarta el informe anterior.

Todos los informes se muestran en grillas con encabezados y desplazamiento horizontal dentro de la grilla en pantallas pequeñas. No se presentan tarjetas de resultados.

## Banco Nación (BNA)

Cotizaciones abre por defecto Billetes BNA, con dólar estadounidense, real y euro en grilla de compra y venta. La fecha y hora son las publicadas por el banco. El real se conserva por cada 100 unidades, con una columna explícita de unidad. La alternativa BCRA · Divisas mantiene fechas y filtro de todas las monedas. BNA muestra la última publicación; su histórico se consulta mediante el enlace al sitio oficial.

Se lee exclusivamente la tabla Billetes de https://www.bna.com.ar/Personas desde una función Netlify, sin API de terceros ni confusión con Divisas. Si cambia la tabla o falla la consulta, se muestra un error; nunca se reemplaza por datos BCRA. Caché pública de 60 segundos (120 en CDN), destino fijo, sólo GET y sin parámetros. No necesita credenciales ni modificaciones a Supabase. Vite usa el mismo handler en desarrollo. El frontend y la función se publicaron el 13/10/2026 en https://vortexgestion.netlify.app (deploy 6ace33362d735ab9b71e3967). Se verificó HTTP 200 en la ruta de cotizaciones y en la función BNA, con compra, venta, fecha y hora provenientes del banco.

## Consultas

- Cotizaciones de divisas (alternativa BCRA): al ingresar se carga automáticamente la última publicación disponible y se muestran USD, BRL y EUR. Un filtro permite mostrar todas las divisas, buscar por código/descripción y seleccionar otros días. El botón Última fecha disponible vuelve a la consulta más reciente. El título, la fecha y las acciones comparten una fila en escritorio, y se adaptan al ancho del celular. Se muestra la fecha del BCRA, la cotización en pesos y el tipo de pase informado. No se presentan precios compradores/vendedores ni cotizaciones de mercados ajenos al BCRA.
- Central de Deudores: CUIT/CUIL/CDI, último informe o historial de 24 meses. Entidades, período, situación, deuda y observaciones. **El monto del servicio se expresa en miles de pesos; la interfaz lo convierte a pesos multiplicando por 1000.** El historial no suma deudas de períodos distintos.
- Cheques rechazados: por identificación fiscal. Causal, agrupamiento de entidad, número, importe en pesos, rechazo, levantamiento, multa y marcas de revisión/proceso judicial. El identificador de agrupamiento del informe no se confunde con el código bancario del maestro de cheques denunciados.
- Cheques denunciados: maestro oficial de bancos y consulta por banco/número. Se muestran fecha de procesamiento, sucursales, cuentas y causas. La ausencia de denuncia no certifica fondos ni validez; pueden existir varias cuentas con el mismo número.

## Implementación y privacidad

Los hooks de React Query consultan directamente `https://api.bcra.gob.ar` mediante GET. Las APIs son públicas y no requieren autenticación BCRA. Se verificó CORS (`Access-Control-Allow-Origin: *`) en Cotizaciones, Entidades y respuestas de validación de Deudores y Cheques denunciados. No se envían credenciales, cookies, token Supabase ni datos del comercio al BCRA. Solamente se envían los parámetros necesarios para la consulta solicitada.

No se crean tablas ni se guardan informes en Supabase, archivos o almacenamiento del navegador. Las claves de caché incorporan el comercio; los informes no se reutilizan entre comercios y se eliminan al quedar sin observadores. No hay consultas automáticas de personas ni reintentos automáticos. La selección de bancos carga únicamente el maestro público. Se valida el formato de respuesta y que la identificación/número del informe coincida con lo solicitado. Los errores y límites de tráfico no se presentan como ausencia de registros.

La parametrización protege el acceso al módulo dentro de Vortex. Los datos del BCRA siguen siendo públicos por diseño y no son registros privados de un comercio. La persistencia administrativa existente admite la clave `modulos.utilidades`; no requiere una migración ni una función nueva. El valor predeterminado también se agrega a la fuente local de `admin-comercios`, para futuros despliegues. No se modificaron servicios remotos de Supabase.

## Endpoints v1.0

- `/estadisticascambiarias/v1.0/Cotizaciones` y `?fecha=YYYY-MM-DD`
- `/CentralDeDeudores/v1.0/Deudas/{identificacion}`
- `/CentralDeDeudores/v1.0/Deudas/Historicas/{identificacion}`
- `/CentralDeDeudores/v1.0/Deudas/ChequesRechazados/{identificacion}`
- `/cheques/v1.0/entidades`
- `/cheques/v1.0/denunciados/{codigoEntidad}/{numeroCheque}`

Fuentes oficiales verificadas el 13/10/2026:

- [Catálogo BCRA](https://www.bcra.gob.ar/apis-banco-central/)
- [Estadísticas cambiarias](https://www.bcra.gob.ar/archivos/Catalogo/Content/files/pdf/estadisticascambiarias-v1.pdf)
- [Central de Deudores](https://www.bcra.gob.ar/archivos/Catalogo/Content/files/pdf/central-deudores-v1.pdf)
- [Cheques denunciados](https://www.bcra.gob.ar/archivos/Catalogo/Content/files/pdf/Cheques-v1.pdf)

## Verificación

- `node scripts/test-utilidades-bna.mjs`: interpretación de billetes, unidades y separación de divisas, formato inválido, destino fijo, caché y errores de función.

- `node scripts/test-utilidades-bcra.mjs`: validación, URLs oficiales, conversión de unidades, respuestas sin registros, errores, cancelación y formato de informes con datos ficticios; no consulta personas reales.
- `node scripts/test-utilidades-bcra-ui.mjs`: navegador local con respuestas ficticias, parametrización, formularios, importes, errores y diseño móvil.
- `npx tsc --noEmit`, lint de archivos modificados y `npm run build`.

Las pruebas ficticias no acreditan disponibilidad permanente del BCRA. La activación de Utilidades por comercio se realiza desde la parametrización administrativa.
