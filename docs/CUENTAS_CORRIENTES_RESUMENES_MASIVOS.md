# Impresión masiva de resúmenes de clientes — 14/10/2026

Botón **Impresión masiva de resúmenes** en Listados → Cuenta corriente (`/listados/cuenta-corriente`). Publicado en https://vortexgestion.netlify.app, deploy `6acf65265b7018f94ac3e297`.

El modal permite seleccionar todos los clientes del filtro o algunos individualmente, buscar por nombre/CUIT y elegir saldo actual deudor, acreedor o todos. Todos incluye clientes con saldo cero o sin movimientos. Se cargan los maestros del comercio, conservando la exclusión existente de clientes legacy eliminados. La búsqueda sólo reduce las filas visibles: no cambia una selección hecha previamente. Cambiar tipo de saldo limpia la selección manual.

La fecha de corte es inclusiva y por defecto es el último día del mes anterior. Con corte 31/08/2026, el saldo inicial incluye los movimientos hasta ese día y el detalle empieza el 01/09/2026. Los saldos se calculan en centavos. Los resúmenes muestran comprobantes y pagos posteriores, saldo acumulado y saldo final. El filtro de deudores/acreedores usa el saldo actual; la fecha de corte define la separación entre saldo inicial y detalle.

Se genera un único PDF usando el formato individual existente. Cada cliente comienza en una página nueva y conserva su numeración interna si necesita varias páginas. El logo del comercio se carga una sola vez. La generación cede periódicamente el control al navegador. Se abre la ventana desde el click para evitar bloqueo de ventanas emergentes y la URL del PDF se conserva hasta cerrar esa ventana, permitiendo revisar e imprimir documentos largos.

La función no escribe datos ni realiza operaciones en Supabase. Los errores de carga impiden imprimir información parcial. El modal se reinicia si cambia el comercio.

## Verificación

- TypeScript, lint de archivos modificados y build correctos.
- `scripts/test-resumenes-masivos.mjs`: corte inclusivo, días posteriores, cambio de año, fechas inválidas, saldo deudor/acreedor/cero, rechazo de movimientos de otro cliente y documento de cinco páginas para tres clientes. Las páginas del primer cliente coinciden con las del PDF individual.
- `scripts/test-cuentas-grillas-ui.mjs`: botón y modal reales en Chrome con consultas y datos ficticios; todos/deudores/acreedores/cero, selección manual, búsqueda, fecha de corte, diseño móvil y payload del PDF. Conserva las verificaciones previas de grillas y reportes individuales.
- Se inspeccionaron visualmente las cinco páginas del PDF generado mediante el visor nativo Chrome/PDFium: continuaciones, saldo final y separaciones de clientes correctos.

Evidencia ficticia de PDF y PNG archivada en `private-backups/bostico-incremental-20261013/pdf-qa-resumenes-masivos/`, excluida de Git. No se usaron ni se modificaron datos reales del cliente para estas pruebas.
