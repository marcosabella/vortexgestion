import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createLocalBackupServer } from './local-backup-service.mjs';
import { createAdminBackupsHandler } from '../netlify/functions/admin-backups.mjs';

test('Servicio local: autenticación, origen, solicitud bajo demanda y descarga privada', async () => {
  const id = '11111111-1111-1111-1111-111111111111';
  const events = [];
  let completed = true;
  let rejectDispatch = false;
  const db = {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { estado: completed ? 'completado' : 'pendiente', archivo: `${id}/backup.tar.gz.enc` } }) }) }),
      update: (body) => ({ eq: () => ({ eq: async () => { events.push({ update: body.estado }); return {}; } }) }),
    }),
    storage: { from: () => ({ createSignedUrl: async (_file, seconds) => { assert.equal(seconds, 60); return { data: { signedUrl: 'https://storage.invalid/download-temporal' } }; } }) },
  };
  const handler = createAdminBackupsHandler({
    isReady: () => true,
    authorizeRequest: async (request) => {
      if (request.headers.get('Authorization') !== 'Bearer admin-token') throw Object.assign(new Error('Sin sesión'), { status: 401 });
      return { db, token: 'admin-token' };
    },
    makeClient: () => ({ rpc: async (name, args) => { events.push({ rpc: name, args }); return { data: id }; } }),
    dispatch: async (value) => { if (rejectDispatch) throw new Error('Proceso no iniciado'); events.push({ dispatch: value }); },
  });
  const server = createLocalBackupServer({ handler, health: () => ({ ready: true, activeJobs: 0 }) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (body, extra = {}) => fetch(base + '/.netlify/functions/admin-backups', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-token', ...extra }, body: JSON.stringify(body) });
  try {
    const health = await (await fetch(base + '/health')).json();
    assert.equal(health.ready, true); assert.deepEqual(events, []);
    assert.equal((await request({ action: 'status' }, { Authorization: '' })).status, 401);
    assert.equal((await request({ action: 'generate' }, { Origin: 'https://sitio-ajeno.invalid' })).status, 403);
    const wrongHostStatus = await new Promise((resolve, reject) => {
      const req = httpRequest(base + '/.netlify/functions/admin-backups', { method: 'POST', headers: { Host: 'sitio-ajeno.invalid', Authorization: 'Bearer admin-token' } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject); req.end(JSON.stringify({ action: 'generate' }));
    });
    assert.equal(wrongHostStatus, 403);
    assert.equal((await request({ action: 'generate', comercioId: 'inválido' })).status, 400);
    assert.deepEqual(events, []);
    assert.equal((await request({ action: 'status' })).status, 200); assert.deepEqual(events, []);
    const generated = await request({ action: 'generate', comercioId: id });
    assert.equal(generated.status, 202);
    assert.deepEqual(events, [{ rpc: 'solicitar_admin_backup_cloud', args: { p_comercio_id: id } }, { dispatch: { kind: 'backup', id } }]);
    assert.deepEqual(await (await request({ action: 'download', id })).json(), { url: 'https://storage.invalid/download-temporal' });
    completed = false; assert.equal((await request({ action: 'download', id })).status, 404);
    rejectDispatch = true; assert.equal((await request({ action: 'generate' })).status, 503);
    assert.equal(events.at(-1).update, 'fallido');
    assert.equal((await fetch(base + '/.netlify/functions/admin-backups-background', { method: 'POST' })).status, 404);
    assert.equal((await fetch(base + '/private-backups/admin-generator/local-service.env')).status, 404);
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});
