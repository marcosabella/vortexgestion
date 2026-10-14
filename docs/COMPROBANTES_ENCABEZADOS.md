# Encabezados de comprobantes y reportes

Publicado el 14/10/2026 en https://vortexgestion.netlify.app. Deploy final con autoajuste de razón social: `6acf835342d56a1d83a040e9`.

## Comportamiento

- El teléfono cargado en Mi Comercio aparece debajo de la dirección cuando está informado.
- Se aplica en ventas, presupuestos, órdenes de taller y extintores, remitos, hojas de reparto y ruta, comprobantes de restaurante, reportes generales, productos, ventas, caja y cuentas corrientes individuales y masivas. Los informes que imprimen la pantalla usan el encabezado compartido de reportes.
- Mi Comercio incorpora la opción **Mostrar razón social junto al logo en comprobantes y reportes**. Permite conservar el comportamiento anterior para los comercios cuyos logos ya incluyen su nombre.
- En ventas con múltiples CUIT se conserva la razón social del emisor registrada en el comprobante; teléfono y preferencia de presentación se toman del comercio.
- La razón social se imprime completa en una sola línea. En HTML se mide el ancho disponible y se ajusta el tamaño de letra antes de imprimir o generar el PDF; en los PDF nativos se ajusta la tipografía sin truncar el nombre.

## Migraciones aplicadas en producción el 14/10/2026

1. `20261014150000_comercio_razon_social_con_logo.sql`: agrega la preferencia al comercio, desactivada por defecto. Conserva las políticas RLS existentes.
2. `20261014151000_bostico_razon_social_con_logo.sql`: activa la preferencia solamente para el comercio `a4983b26-4f3d-46e0-8e4f-46bd34fec838`. Antes de modificarlo verifica una membresía activa del usuario `carlosbostico@hotmail.com`. Si no coincide, aborta la transacción.

La configuración puntual está separada de la migración de estructura. No se cambian saldos, movimientos, comprobantes, logos ni teléfonos guardados. El usuario autorizó expresamente aplicar ambas migraciones y publicar. La consulta posterior confirmó para Bostico el nombre `BOSTICO Y BARTOLOME SOCIEDAD SIMPLE`, preferencia activa, logo cargado y teléfono cargado.

## Verificación local

- `node scripts/test-comercio-encabezado-sql.mjs`: migraciones reales en PostgreSQL temporal. Verifica valor inicial, destinatario, rechazo por correo distinto, idempotencia y conservación del aislamiento de comercio.
- `node scripts/test-comprobantes-encabezados.mjs`: generadores reales en Chrome con datos ficticios. Verifica nombre y logo juntos, preferencia desactivada, ausencia de logo/teléfono, texto escapado y teléfono en encabezados HTML y PDF. Produce siete muestras para revisión visual.
- Revisadas las capturas de factura, presupuesto, ticket de 58 mm, caja, productos, reporte general y resumen de cuenta corriente.
- Pruebas existentes de restaurante y resúmenes masivos satisfactorias; TypeScript raíz, lint de cambios contra HEAD y build satisfactorios.

Las muestras de esta revisión se archivan en `private-backups/comprobantes-encabezados-20261014/pdf-qa/` y `pdf-qa-autoajuste/`, excluidas de Git. La segunda revisión usa el nombre completo de Bostico con logo y teléfono ficticios, y verifica automáticamente que no se desborde ni ocupe más de una línea.
