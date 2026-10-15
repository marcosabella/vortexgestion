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
