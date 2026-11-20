import { timingSafeEqual } from 'node:crypto';
import { prepareCloudEnvironment, ready, client } from './lib/backup-cloud.mjs';
import { runRestoreWorker } from '../../scripts/admin-backup-restore-worker.mjs';
import { UUID } from '../../scripts/backup-selection.mjs';

export const handler = async (event) => {
  const supplied = Buffer.from(event.headers?.['x-backup-secret'] || '');
  const expected = Buffer.from(process.env.BACKUP_DISPATCH_SECRET || '');
  if (!ready() || process.env.BACKUP_RESTORE_ENABLED !== 'true' || !expected.length || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return { statusCode: 403 };
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400 }; }
  if (!UUID.test(body.id || '')) return { statusCode: 400 };
  await prepareCloudEnvironment();
  await runRestoreWorker(client(), body.id);
  return { statusCode: 200 };
};
