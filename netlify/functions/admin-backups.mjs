import { authorize, ready, client, json } from './lib/backup-cloud.mjs';
import { UUID } from '../../scripts/backup-selection.mjs';

async function cloudDispatch({ kind, id }) {
  const name = kind === 'restore' ? 'admin-backup-restore-background' : 'admin-backups-background';
  const response = await fetch(`${process.env.URL}/.netlify/functions/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Backup-Secret': process.env.BACKUP_DISPATCH_SECRET }, body: JSON.stringify({ id }), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('No se pudo iniciar el proceso');
}

export function createAdminBackupsHandler({ dispatch = cloudDispatch, isReady = ready, unavailableMessage = () => 'El servicio de copias todavía no está configurado.', authorizeRequest = authorize, makeClient = client } = {}) {
return async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  try {
    if (!isReady()) return json({ error: unavailableMessage(), ready: false }, 503);
    const { db, token } = await authorizeRequest(request);
    const body = await request.json();
    if (body.action === 'status') return json({ ready: true, restoreReady: process.env.BACKUP_RESTORE_ENABLED === 'true' });
    if (body.action === 'download') {
      if (!UUID.test(body.id || '')) return json({ error: 'Identificador inválido' }, 400);
      const { data: backup, error } = await db.from('admin_backups').select('estado,archivo').eq('id', body.id).single();
      if (error || !backup || backup.estado !== 'completado' || !backup.archivo) return json({ error: 'El respaldo no está disponible.' }, 404);
      const { data: signed, error: signError } = await db.storage.from('admin-backups').createSignedUrl(backup.archivo, 60, { download: true });
      if (signError || !signed?.signedUrl) return json({ error: 'No se pudo preparar la descarga.' }, 503);
      return json({ url: signed.signedUrl });
    }
    if (['restore-upload', 'restore-inspect', 'restore-apply', 'restore-retry'].includes(body.action)) {
      if (process.env.BACKUP_RESTORE_ENABLED !== 'true') return json({ error: 'La restauración requiere completar el ensayo de recuperación y habilitación del servidor.' }, 503);
      if (body.action !== 'restore-upload' && !UUID.test(body.id || '')) return json({ error: 'Restauración inválida' }, 400);
      if (body.comercioId != null && !UUID.test(body.comercioId)) return json({ error: 'Comercio inválido' }, 400);
      if (body.action === 'restore-upload' && (!Number.isSafeInteger(body.bytes) || body.bytes < 37 || body.bytes > 268435456)) return json({ error: 'Elegí una copia cifrada de hasta 256 MB.' }, 400);
      if (body.action === 'restore-retry') {
        const { error } = await makeClient(token).rpc('retry_admin_backup_restore', { p_id: body.id });
        if (error) return json({ error: error.message }, 409);
        const { data: job } = await db.from('admin_backup_restores').select('estado').eq('id', body.id).single();
        if (job?.estado !== 'analisis_pendiente') return json({ id: body.id });
      }
      const action = body.action.replace('restore-', '');
      const { data: id, error } = action === 'retry' ? { data: body.id } : await makeClient(token).rpc('admin_backup_restore_request', { p_action: action, p_id: body.id || null, p_bytes: body.bytes || null, p_comercio_id: body.comercioId || null, p_confirmation: body.confirmation || null });
      if (error) return json({ error: error.message }, 409);
      if (action === 'upload') {
        const path = `restore-inputs/${id}/source.enc`;
        const { data, error: uploadError } = await db.storage.from('admin-backups').createSignedUploadUrl(path, { upsert: false });
        if (uploadError) return json({ error: 'No se pudo preparar la carga.' }, 503);
        return json({ id, path, token: data.token });
      }
      try {
        await dispatch({ kind: 'restore', id });
      } catch {
        // No cambiar un estado ya reclamado: la entrega podría haber ocurrido.
        await db.from('admin_backup_restores').update({ estado: action === 'apply' ? 'interrumpido' : 'fallido', error: 'No se pudo confirmar el inicio. Revisá el estado y reanudá.', updated_at: new Date().toISOString() }).eq('id', id).eq('estado', action === 'apply' ? 'restauracion_pendiente' : 'analisis_pendiente');
        return json({ error: 'No se pudo confirmar el inicio de la operación. Actualizá el estado.' }, 503);
      }
      return json({ id }, 202);
    }
    if (body.action !== 'generate') return json({ error: 'Operación no válida' }, 400);
    if (body.comercioId != null && !UUID.test(body.comercioId)) return json({ error: 'Comercio inválido' }, 400);
    const { data: id, error } = await makeClient(token).rpc('solicitar_admin_backup_cloud', { p_comercio_id: body.comercioId || null });
    if (error) return json({ error: error.message }, 409);
    try { await dispatch({ kind: 'backup', id }); }
    catch {
      await db.from('admin_backups').update({ estado: 'fallido', error: 'No se pudo iniciar la generación. Volvé a intentar.', finalizado_at: new Date().toISOString() }).eq('id', id).eq('estado', 'pendiente');
      return json({ error: 'No se pudo iniciar el respaldo.' }, 503);
    }
    return json({ id }, 202);
  } catch (error) { return json({ error: error.status ? error.message : 'No se pudo procesar la solicitud.' }, error.status || 500); }
};
}

export default createAdminBackupsHandler();
