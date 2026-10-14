# Cuentas corrientes y paginación — 14/10/2026

Publicado en https://vortexgestion.netlify.app, deploy `6acf5dff6fb57892a815a05a`.

## Grillas

Clientes, Proveedores, Productos, Cuenta corriente de clientes y Cuenta corriente de proveedores usan los mismos controles que Ventas: 12 registros por defecto, opciones 12/24/48/96, Anterior/Siguiente, página actual y cantidad de registros filtrados. Cada grilla guarda su preferencia; las pestañas de resumen y movimientos tienen paginación independiente. Cambiar búsqueda, tamaño o comercio vuelve a la primera página. Los totales de cuenta corriente se calculan antes de paginar.

Clientes, Proveedores y Productos cargan todas las páginas de Supabase, ordenadas con desempate por ID, y rechazan páginas incompletas o cambios de conteo. El listado no se limita a las primeras 1.000 filas. Productos mantiene la búsqueda y la selección para etiquetas sobre el conjunto completo.

La columna Cuenta online de Clientes sólo aparece cuando `parametrizacion.modulos.pedidos_online` está habilitado: es el mismo módulo que habilita la tienda online en el menú. `funciones.publicacion_tienda_online` controla la publicación de productos y no sustituye esa condición.

## Detalle de proveedores y pagos

Por defecto, el detalle resume todo lo anterior al primer día del mes en una fila «Saldo correspondiente al <último día del mes anterior>». Presenta después los movimientos del mes en orden cronológico, con saldo acumulado. «Ver histórico» habilita Desde/Hasta; vaciar Desde permite ver todos los movimientos hasta la fecha elegida. Las fechas de límite se incluyen; se informa un rango invertido. El alto máximo es `60vh`, igual que el detalle del cliente.

Los conceptos históricos se presentan sin el prefijo técnico: `Historico Access CompraProveedor:2202 | Comprobante 0007 - 124576` se muestra como `Comprobante 0007 - 124576`, y `Historico Access PagosProveedores:839` como `Pago: 839`. No se reescriben los históricos en la base.

El formulario de pago permite seleccionar «Saldo histórico del proveedor». El backend calcula el saldo a partir de movimientos sin factura ni gasto vinculados, exige equivalencias migradas de ese proveedor y bloquea pagos superiores al saldo. Se mantienen disponibles los medios y circuitos de edición/reversión existentes. La función nueva coexiste con la anterior.

## Reporte individual desde Informes

La acción Reporte de Informes → Cuenta corriente usa el inicio del mes actual como Desde por defecto. Calcula el saldo anterior, envía sólo los movimientos posteriores al generador de PDF y actualiza débitos, créditos y saldo final del resumen. Si se especifican fechas en los filtros, las utiliza para el período del reporte y rechaza un rango invertido. El filtro del listado por último movimiento y el reporte agregado mantienen su funcionamiento anterior.

## Validación

- `npx tsc --noEmit` y lint de todos los archivos modificados: sin errores.
- Build de producción: correcto; conserva las advertencias existentes de Browserslist y tamaño de bundle.
- `scripts/test-cuenta-proveedores.mjs`: conceptos, saldo histórico, cortes, límites inclusivos, orden y centavos.
- `scripts/test-master-records.mjs`: carga completa de 21.260 registros, páginas exactas/vacías y errores de conteo/truncamiento/red.
- `scripts/test-reporte-cta-periodo.mjs`: inicio de mes incluyendo enero, saldo anterior, período, totales y redondeo.
- `scripts/test-cuentas-grillas-ui.mjs`: Chrome local con datos ficticios; cinco grillas, paginación, filtro, tamaño persistido, anchos 390/1440, pestañas de movimientos, tienda online activa/inactiva, conceptos, corte mensual, rango inválido, payload del pago histórico y payload del reporte PDF.
- Pruebas SQL reales de pagos con `ROLLBACK`: registro parcial, edición/eliminación, cheque propio/reversión, mezcla con facturas/gastos, rechazo de sobregiro/precisión/método nulo/duplicados/saldo cero/usuario anónimo/comercio ajeno. Evidencia privada en `private-backups/bostico-incremental-20261013/`.

No se registraron pagos reales del cliente para validar la interfaz. La habilitación del RPC quedó aplicada y registrada en el historial de migraciones.
