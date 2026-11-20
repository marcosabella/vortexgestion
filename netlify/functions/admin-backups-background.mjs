import { timingSafeEqual } from 'node:crypto';
import { prepareCloudEnvironment, ready } from './lib/backup-cloud.mjs';
import { runBackupWorker } from '../../scripts/admin-backup-worker.mjs';

export const handler = async (event) => {
  const supplied = Buffer.from(event.headers['x-backup-secret'] || '');
  const expected = Buffer.from(process.env.BACKUP_DISPATCH_SECRET || '');
  if (!ready() || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return { statusCode: 403 };
  const { id } = JSON.parse(event.body || '{}');
  if (!/^[a-f0-9-]{36}$/i.test(id || '')) return { statusCode: 400 };
  await prepareCloudEnvironment();
  await runBackupWorker({ once: true, jobId: id });
  return { statusCode: 200 };
};
