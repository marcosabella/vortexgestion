# Venta local y disponibilidad de la tienda: stock por talle/color

## Causa identificada

El formulario seleccionaba `producto_variante_id`, pero `useVentas` lo descartaba al preparar el JSON para registrar una venta normal, manual o multi-CUIT. Además, las funciones `registrar_venta_transaccional` y `registrar_venta_emisor_transaccional` no aceptaban ni insertaban ese campo. El trigger descontaba el stock de `productos`, dejando intacta `producto_variantes`.

La tienda consulta la vista `tienda_productos` de la misma base de Gestión. Esa vista publica el total de `productos` y las variantes con stock positivo: por eso puede seguir ofreciendo un talle ya vendido incluso después de recargar.

El 15/10/2026 se consultó únicamente el catálogo público de Euforia: 103 productos publicados, 87 con variantes y 7 con diferencias entre total y suma de variantes. Entre las blusas: código 347, BLUSA FRUNCE KATIA, total 4 y variantes sumadas 5; código 344, BLUSA VINAY, total 1 y variantes sumadas 2. Es una observación del momento, no identifica por sí sola la prenda reportada ni reemplaza la revisión del comercio. Chocolate aparece como color de la blusa 347; el catálogo público mostraba sus talles 2 y 3. No se consultaron ventas privadas ni se modificaron registros.

| Código | Producto | Total de Gestión (referencia) | Suma publicada por variantes |
| --- | --- | ---: | ---: |
| 294 | CINTO XL - APLIQUES LISOS Y LABRADOS | 2 | 3 |
| 348 | MUSCULOSA FILIS - ENCAJE | 4 | 5 |
| 339 | SET ANILLOS - ACERO DORADO/PLATEADO | 3 | 11 |
| 347 | BLUSA FRUNCE KATIA | 4 | 5 |
| 247 | BERMUDA JEAN - isos | 1 | 2 |
| 200 | CAMPERA ECOCUERO - IBIZA - NATURAL | 1 | 2 |
| 344 | BLUSA VINAY | 1 | 2 |

## Corrección local

- El hook conserva el identificador de variante en las tres modalidades.
- El formulario impide agregar el producto mientras la consulta de variantes está pendiente o falló, y descarta respuestas de una selección anterior.
- La migración `20261015140000_ventas_conservar_variante_stock.sql` acepta y guarda la variante en las RPC normal y multi-CUIT; la modalidad manual utiliza el alta normal existente.
- Un trigger valida producto, variante y comercio; exige talle/color si existen variantes, incluso para clientes anteriores del frontend.
- Si el total de Gestión difiere de la suma por variantes, la venta se rechaza sin cambiar stock. **El stock real es el de Gestión: no se lo aumenta ni reemplaza sumando variantes antiguas.**
- Cambiar únicamente la variante de un ítem también repone el talle anterior y descuenta el nuevo.

La migración no repara datos históricos ni cambia funciones de stock o checkout de la tienda. Se aplicó con autorización en producción (`zhtqkygjvaaizbdwwsbi`) el 15/10/2026, antes de publicar el frontend en https://vortexgestion.netlify.app, deploy `6ad0b61d3db3be4bbde85b67`. El dry-run posterior confirmó que no quedan migraciones pendientes. No se modificaron cantidades históricas ni se crearon ventas de prueba en producción.

## Productos ya desajustados

Requieren revisar el reparto físico entre talles y colores conservando el total correcto de Gestión. No alcanza con igualar el stock total a la suma por variantes: eso puede reponer unidades ya vendidas. El identificador perdido no se puede reconstruir con certeza a partir del total.

Consultar antes de cualquier reparación, como administrador autorizado:

```sql
SELECT p.id, p.cod_producto, p.descripcion, p.stock AS stock_real_gestion,
       sum(v.stock) AS stock_variantes,
       jsonb_agg(jsonb_build_object('variante_id', v.id, 'color', c.nombre,
         'talle', t.nombre, 'stock', v.stock) ORDER BY c.nombre, t.nombre) AS detalle
FROM public.productos p
JOIN public.producto_variantes v ON v.producto_id = p.id
LEFT JOIN public.producto_colores c ON c.id = v.color_id
LEFT JOIN public.producto_talles t ON t.id = v.talle_id
WHERE p.comercio_id = '0987ef9c-c602-40cf-84c3-64d2f644428d'
GROUP BY p.id
HAVING p.stock <> sum(v.stock)
ORDER BY p.descripcion;
```

Una reparación debe definir explícitamente cada variante y su cantidad física, conservar el total de Gestión, validar que nadie lo cambió mientras se revisaba y ejecutarse en una transacción separada, previa autorización. La migración estructural no modifica estos datos.

## Validación

`node scripts/test-ventas-variantes-stock.mjs` usa PostgreSQL temporal local y funciones reales: reproduce el fallo previo, prueba conservación y descuento por talle, reintentos, stock insuficiente, otras empresas, rollback, discrepancias, cambios de talle, multi-CUIT, numeración manual, productos sin variantes y la vista pública real.

`node scripts/test-alta-venta-variantes-hook.mjs` verifica el JSON enviado por el hook real con Supabase simulado.

## Refresco del navegador

La tienda Euforia carga el catálogo al entrar y después de confirmar un pedido online. No refresca automáticamente mientras otra persona vende en Gestión. Es un problema adicional: esta entrega corrige el stock que se obtiene al consultar/recargar; no se editó el proyecto separado de la tienda ni se agregó polling. La disponibilidad exacta de los productos históricamente desajustados sigue dependiendo de su conciliación por talle/color.

## Incidente 397, revisión del 05/11/2026

La consulta de solo lectura en producción identificó `397 - BODY VARSOVIA`
(`3bfbb59e-9701-49a6-833b-b5bb90867985`): stock general 7, suma de variantes 8.
La venta `54b99669-8bc3-4a26-a48e-c795bfc364d3`, del 04/11 a las 20:35
(Argentina), contiene una unidad con `afecta_stock=true` y variante **Negro S**
(`4a0c841b-f2d3-426e-99f2-9af14520db69`). Esa variante y Marrón S siguen
teniendo una unidad cada una. El usuario reportó Marrón S; hace falta confirmar
esa diferencia antes de conciliar el dato histórico.

La función activa `apply_venta_item_stock` solo modifica `productos` y omite
`producto_variante_id`; coincide con la definición de la migración de cantidades
decimales. Los triggers de venta y sincronización de variantes están habilitados.
Por lo tanto, este caso persiste al consultar nuevamente el catálogo y no se
resuelve solamente recargando el navegador.

Se preparó `20261105120000_restaurar_descuento_ventas_por_variante.sql`, que
integra descuento/reposición por variante, conceptos manuales decimales,
operaciones sin movimiento de stock y stock negativo de órdenes para productos
sin variantes. Conserva el control existente de coherencia entre total y
variantes. La sincronización de variantes actualiza el total una sola vez.
No modifica datos históricos.

La prueba `scripts/test-ventas-variantes-stock.mjs` reproduce la definición
observada en producción con una variante guardada pero no descontada y verifica
la corrección en PostgreSQL temporal local, incluyendo la vista de la tienda.
`npx tsc --noEmit` también pasó.

### Aplicación autorizada y descripción de ventas

El usuario autorizó aplicar la corrección después de incorporar talle/color en
la descripción. El 05/11/2026 se aplicó únicamente la migración estructural
`20261105120000` en producción, validando antes la huella de la función activa
(`72acc7e755b53be4e8933e4e6ec211d7`) y registrándola en el historial de
migraciones dentro de la misma transacción. La lectura posterior confirmó la
migración y la función con descuento por variantes, `SECURITY DEFINER` y
`search_path=pg_catalog, public` (huella nueva
`c9c962a45a4fba5a081a232db1618853`). No se crearon ventas de prueba remotas.

Se incorporó la relación de variante en la consulta de ventas y una descripción
común para formulario, detalle, impresión y comprobantes: por ejemplo,
`BODY VARSOVIA - MARRON S`. El formulario conserva los nombres de la variante
de cada renglón aunque se seleccione después otro producto; esos datos visuales
no se envían como columnas ni campos extra a las operaciones de guardado.
La descripción representa la variante guardada, sin cambiarla.

En la verificación previa, el comprobante `0001-00000186` estaba registrado como
`BODY VARSOVIA - Negro S`, con general 7 y variantes 8. La diferencia histórica
se reparó tras la confirmación posterior del usuario, como se detalla abajo.
La nueva interfaz todavía no se publicó en Netlify;
requiere pedido expreso según `AGENTS.md`.

Las pruebas locales de stock y del payload del hook pasaron. La comprobación de
descripciones cubrió Marrón S, Negro S, producto sin variante, solo talle y
concepto manual. ESLint conserva los 5 errores y 2 advertencias anteriores de
`VentaForm.tsx`; los demás archivos de frontend modificados no presentan
hallazgos de lint. La comprobación adicional con `tsconfig.app.json` detecta
34 errores tanto antes como después del cambio, sin errores nuevos; no equivale
al comando raíz `npx tsc --noEmit`. La generación real de HTML de comprobantes
también incluyó `BODY VARSOVIA - MARRON S` en A4 y tickets de 58 y 80 mm.

### Conciliación histórica confirmada: Marrón S

El usuario confirmó explícitamente que se vendió **MARRON S**. Se ejecutó
`docs/sql/reparar-stock-euforia-397.sql` el 05/11/2026, después de guardar un
respaldo privado del producto, variantes, venta e ítem en `private-backups`
(excluido de Git). La transacción validó empresa, producto, comprobante,
fecha de modificación del ítem y distribución completa de variantes.

Se cambió únicamente la variante del ítem a
`a3cbcc53-c9b3-4a4e-8c0a-26f09f485053` y se regularizó Marrón S de 1 a 0.
Se omitió el movimiento automático durante el cambio de variante para evitar
reponer Negro S, que nunca se había descontado. Luego la sincronización de
variantes conservó el stock general en 7. La cabecera de venta y sus importes,
incluido el payload original de idempotencia, se conservaron íntegros.

La lectura posterior confirmó: comprobante `0001-00000186` con
`BODY VARSOVIA - MARRON S`, cantidad 1, total $22.000; Marrón S 0, Negro S 1,
total general 7 y suma de variantes 7. La vista pública `tienda_productos` ya no
incluye Marrón S entre las variantes disponibles. Una visita de la tienda que
estuviera abierta necesita recargar para obtener ese catálogo actualizado.
