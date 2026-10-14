# Bostico: cuenta corriente de proveedores migrada

Aplicada el 14/10/2026 exclusivamente al comercio `a4983b26-4f3d-46e0-8e4f-46bd34fec838`, correspondiente a `carlosbostico@hotmail.com`. Autorización: «migrar los datos». Lote: `cdd15285-9d35-4e98-9427-0b568d387a31`.

Se compararon todos los campos de las 2.188 compras y 832 pagos de la copia final de Access con el archivo histórico productivo: coincidieron íntegramente. SHA-256 del origen: `0616560fc2f7e4625a691b1f830cc0da8ddfe75c97a3ac0c7ea28485d122dc63`.

## Resultado

| Concepto | Cantidad |
| --- | ---: |
| Compras con importe, incorporadas como deuda | 2.185 |
| Pagos positivos, incorporados como crédito | 817 |
| Pagos negativos, incorporados como deuda por reversión | 12 |
| Movimientos operativos nuevos | 3.014 |
| Registros de importe cero, conservados en archivo histórico | 6 |
| Proveedores con movimientos | 20 |

Saldo neto: **$11.862.237,61**. Se conservaron los signos y las fechas originales. Todas las compras tienen condición de venta nula: no se aplicó el filtro de condición 2 de las ventas a clientes. Ninguno de los tipos de comprobante presentes en compras indica resta en el catálogo de origen.

Se creó `PROVEEDOR LEGACY ELIMINADO #2` para conservar una compra de $100 del 24/10/2019 cuyo proveedor ya no existe en Access. El maestro ahora tiene 22 proveedores; los 21 existentes se conservaron.

## Verificación y trazabilidad

Se guardó una captura previa y se simuló la transacción completa con `ROLLBACK`. La aplicación utilizó bloqueo asesor, bloqueos breves de escritura, validación de identidad y comercio, huellas del estado anterior, comprobación del tenant de cada proveedor y controles de campos y saldos antes del `COMMIT`. No se deshabilitaron triggers.

La verificación independiente del 14/10/2026 a las 10:04:41 UTC confirmó 3.014 movimientos, **cero diferencias** de campos y saldos por proveedor, cero equivalencias faltantes y archivo histórico intacto.

Cada movimiento tiene UUID determinista y equivalencia con entidad `cuenta_corriente_proveedores` y origen `CompraProveedor:<id>` o `PagosProveedores:<id>`. Las observaciones conservan comprobantes y notas disponibles. El SQL rechaza repetir el lote o aplicarlo sobre una cuenta con movimientos existentes. No ejecutar nuevamente el importador completo.

Evidencia privada en `private-backups/bostico-incremental-20261013/`, excluida de Git: `cta-proveedores-antes.json`, `cta-proveedores-plan.json`, `cta-proveedores-aplicar.sql`, `cta-proveedores-simular.sql`, `cta-proveedores-verificar.sql` y `cta-proveedores-resultado.json`.

## Alcance y limitaciones

Se insertaron movimientos en `cuenta_corriente_proveedores`. No se crearon compras ni facturas nuevas ni se modificaron stock, caja o emisiones de cheques. Access no aporta imputaciones entre pagos y facturas: los movimientos históricos tienen `factura_id`, `gasto_egreso_id` y `cheque_id` nulos.

Se ajustó localmente `src/hooks/useCompras.ts` para cargar todos los movimientos en páginas de 500, detectar cargas incompletas y separar la caché por proveedor. Río Cuarto Distribuciones tiene 1.724 movimientos; una consulta única puede truncarlos.

El hook pasó `npx tsc --noEmit`, lint del archivo y ocho verificaciones con consultas simuladas: 3.014 movimientos, filtro por proveedor, cuenta vacía, múltiplo exacto de página, error de página, cambio de conteo, duplicación y truncamiento.

## Pagos habilitados y frontend publicado — 14/10/2026

El usuario autorizó «publicar y habilitar pagos». La migración `20261014110000_pagos_saldo_historico_proveedores.sql` agrega el RPC `registrar_pagos_proveedor_multi_documento_v2`, conservando la versión anterior. El formulario permite seleccionar el saldo histórico neto como una única opción, combinarlo con facturas y gastos y pagar con efectivo, transferencia, tarjeta o cheques. No se inventan imputaciones para los registros de Access.

El RPC verifica pertenencia al comercio, coincidencia de proveedor de cada documento, origen migrado del saldo histórico, saldo disponible, importes positivos con dos decimales, cheques disponibles y selecciones sin duplicados. Serializa los pagos mediante bloqueo del proveedor y sus movimientos históricos. Limita `search_path` y sólo concede ejecución a `authenticated`; `anon` no puede ejecutarlo.

Una transacción real con `ROLLBACK` verificó pagos parciales, edición/eliminación, cheque propio y su reversión, pagos mixtos distribuidos entre saldo histórico/factura/gasto, saldo cero, sobregiro, decimales inválidos, método ausente, duplicados y aislamiento de comercio/usuario anónimo. No quedaron pagos de prueba: después de habilitar el RPC, Bostico conserva 3.014 movimientos y saldo $11.862.237,61.

El detalle de proveedores ahora muestra los conceptos `Comprobante <número>` y `Pago: <id>` conservando las observaciones completas en la base. Incluye «Ver histórico», fechas Desde/Hasta y, por defecto, saldo al último día del mes anterior más movimientos del mes actual. Usa el mismo alto máximo de grilla que clientes (`60vh`).

También se publicaron paginación de Clientes, Proveedores, Productos y ambas cuentas corrientes, columna Cuenta online condicionada por `modulos.pedidos_online` y reporte individual de Informes con corte mensual.

Publicación productiva: https://vortexgestion.netlify.app. Deploy: `6acf5dff6fb57892a815a05a`. Se verificaron en Chrome local las cinco grillas, filtros, preferencias de tamaño, diseño móvil, columna condicional, detalle, selección de saldo histórico y argumentos enviados al PDF desde la acción Reporte. Ver `docs/CUENTAS_CORRIENTES_PAGINACION.md` para los criterios y pruebas. Las pruebas de UI usan datos ficticios y no equivalen a registrar pagos reales del cliente.
