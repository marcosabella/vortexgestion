# Gestión de campañas y avisos con modal

Desde **Administrador de comercios → Notificaciones**, la campaña aparece como una fila en la misma grilla de la solapa **Historial de notificaciones**, junto con los demás avisos. La solapa **Carga de notificaciones** permite crear y enviar avisos:

- **Editar textos** actualiza el título, mensaje y condiciones de la campaña de referidos. No cambia códigos, bonificaciones, lecturas ni la presentación inicial. Los textos no modifican las reglas que aplica el sistema para bonificar.
- **Preparar reenvío de campaña** carga un nuevo aviso con los textos actuales y la opción de modal activada. Permite revisar el mensaje, previsualizarlo y elegir todos los comercios o destinatarios específicos antes de enviar.
- **Nueva notificación** permite crear avisos generales con o sin modal.
- **Destacada** está disponible en Prioridad: identifica el aviso y lo coloca primero en la bandeja. Se conserva al editar o reenviar. Categoría, Prioridad y **Mostrar también como modal** comparten una línea cuando el ancho lo permite; en celular se acomodan sin desbordes.
- En la fila de la campaña, **Archivar** oculta el aviso inicial y su modal y habilita **Restaurar**. **Eliminar** pide confirmación y lo quita de la grilla sin posibilidad de restaurarlo desde el panel. Ambas acciones conservan códigos, enlaces, referidos y bonificaciones: no desactivan el programa. Los reenvíos ya creados son avisos independientes y se archivan/eliminan desde sus propias filas.
- **Detalle de venta → Enviar a notificaciones** incluye **Mostrar también como modal**, desmarcada por defecto. Conserva los datos del comprobante y la opción de cobro con Mercado Pago, y guarda el aviso junto con sus destinatarios en una sola operación.
- **Historial → Preparar reenvío** copia un aviso a un nuevo envío. El original y sus lecturas/presentaciones permanecen en el historial. Guardar una edición del original no vuelve a presentar su modal a quienes ya lo cerraron.
- El historial distingue las lecturas de la bandeja de los modales cerrados y permite consultar ambas por comercio.

Los modales generales se muestran a los administradores de comercios activos en Inicio, Caja o Notificaciones. Se consultan cada 30 segundos con la aplicación visible y al volver a la ventana o recuperar conexión. Se muestran en secuencia, después de la campaña inicial y respetando los bloqueos de selección de comercio, membresía y terminal de restaurante.

La presentación se confirma al cerrar el modal. Si no se logra guardar, el usuario puede reintentar; no se consume el aviso antes de mostrarlo. Cerrar el modal no marca automáticamente la notificación de la bandeja como leída. Dos dispositivos abiertos simultáneamente pueden mostrar el mismo aviso antes de que uno confirme su cierre.

## Activación

La migración `supabase/migrations/20261105160000_gestion_comunicaciones_modal.sql` se aplicó con autorización en producción (`zhtqkygjvaaizbdwwsbi`) el 06/11/2026. La comprobación posterior no detectó migraciones pendientes. Es compatible con el frontend anterior. Queda pendiente publicar la nueva versión del frontend, con autorización expresa. Una pestaña que conserva una versión anterior necesita recargar para incorporar el código nuevo; no necesita cerrar sesión.

La migración `supabase/migrations/20261106120000_estado_aviso_campana_referidos.sql`, para archivar, restaurar y eliminar el aviso de campaña, también se aplicó con autorización en producción el 06/11/2026. La comprobación posterior confirmó que no quedan migraciones pendientes. La visibilidad del aviso es independiente de la vigencia del programa. Sigue pendiente publicar el frontend.

## Verificación local

- `node scripts/test-referidos-sql.mjs`: PostgreSQL temporal, permisos, aislamiento, guardado atómico, edición, reenvío y confirmación concurrente idempotente.
- `node scripts/test-referidos-ui.mjs`: campaña inicial, sesiones abiertas, recarga y vista móvil con API simulada.
- `node scripts/test-comunicaciones-ui.mjs`: gestión en el panel, destinatarios, vista previa, modal, reintento, edición y reenvío con API simulada.

Estas verificaciones no conectan con Supabase de producción.
