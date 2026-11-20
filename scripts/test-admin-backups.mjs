import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, rm, stat, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { encryptArchive, storageBelongsToTenant, hashFile, backupCommand } from './admin-backup-worker.mjs';
import { decryptBackup } from './verify-admin-backup.mjs';
import { tenantExportSql } from './backup-tenant-sql.mjs';
import { prepareRecovery } from './prepare-tenant-recovery.mjs';
import { loadRestorePackage, extractBackupTar } from './backup-restore-package.mjs';
import { parseBackupRows } from './backup-data-sql.mjs';
import { parseBackupJson, stringifyBackupJson, backupValuesKey } from './backup-json.mjs';

test('Storage mantiene separados comercios con prefijos parecidos y falla sin política', () => {
  const rules = { fotos: { prefix: '{comercio_id}/' }, global: { exclude: true } };
  assert.equal(storageBelongsToTenant({ bucket_id: 'fotos', name: 'abc/imagen.png' }, 'abc', rules), true);
  assert.equal(storageBelongsToTenant({ bucket_id: 'fotos', name: 'abcd/imagen.png' }, 'abc', rules), false);
  assert.equal(storageBelongsToTenant({ bucket_id: 'global', name: 'abc/imagen.png' }, 'abc', rules), false);
  assert.throws(() => storageBelongsToTenant({ bucket_id: 'desconocido', name: 'abc/imagen.png' }, 'abc', rules));
  assert.throws(() => storageBelongsToTenant({ bucket_id: 'fotos', name: 'abc/imagen.png' }, 'abc', { fotos: { prefix: '{comercio_id}' } }));
});

test('Cifrado se recupera exactamente y rechaza clave incorrecta o archivo alterado', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vortex-backup-test-'));
  try {
    const source = path.join(dir, 'source.tar');
    const encrypted = path.join(dir, 'backup.enc');
    const original = Buffer.from('Datos de prueba: comercio uno, ventas y archivos.');
    await writeFile(source, original);
    await encryptArchive(source, encrypted, 'ab'.repeat(32));
    await decryptBackup(encrypted, path.join(dir, 'restored.tar'), 'ab'.repeat(32));
    assert.deepEqual(await readFile(path.join(dir, 'restored.tar')), original);
    await assert.rejects(decryptBackup(encrypted, path.join(dir, 'wrong.tar'), 'cd'.repeat(32)));
    await assert.rejects(stat(path.join(dir, 'wrong.tar')), { code: 'ENOENT' });
    await assert.rejects(decryptBackup(encrypted, path.join(dir, 'exceeded.tar'), 'ab'.repeat(32), 1), /límite/);
    await assert.rejects(stat(path.join(dir, 'exceeded.tar')), { code: 'ENOENT' });
    await assert.rejects(decryptBackup(encrypted, path.join(dir, 'restored.tar'), 'ab'.repeat(32)), { code: 'EEXIST' });
    assert.deepEqual(await readFile(path.join(dir, 'restored.tar')), original);
    const bytes = await readFile(encrypted);
    bytes[bytes.length - 1] ^= 1;
    await writeFile(encrypted, bytes);
    await assert.rejects(decryptBackup(encrypted, path.join(dir, 'tampered.tar'), 'ab'.repeat(32)));
    await assert.rejects(stat(path.join(dir, 'tampered.tar')), { code: 'ENOENT' });
  } finally {
    const resolved = path.resolve(dir);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('vortex-backup-test-'));
    await rm(resolved, { recursive: true, force: true });
  }
});

test('Archivo completo cifrado: descifra, extrae y verifica índice, datos y archivos', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vortex-backup-test-'));
  try {
    const source = path.join(dir,'package'); await mkdir(source);
    const tenant = '11111111-1111-1111-1111-111111111111';
    const records = [{kind:'manifest',version:1,comercio_id:null},{kind:'row',table:'comercio',data:{id:tenant,nombre_comercio:'Prueba'}},{kind:'table',table:'comercio',rows:1}];
    await writeFile(path.join(source,'public.ndjson'),records.map(JSON.stringify).join('\n'));
    await writeFile(path.join(source,'schema.sql'),'-- No se ejecuta este contenido');
    await writeFile(path.join(source,'catalog.json'),'[]');
    await writeFile(path.join(source,'storage.json'),'[]');
    const files=[];
    for(const file of ['public.ndjson','schema.sql','catalog.json','storage.json']) files.push({file,sha256:await hashFile(path.join(source,file))});
    await writeFile(path.join(source,'manifest.json'),JSON.stringify({version:1,restore_version:2,comercio_id:null,storage_files:0,files}));
    const tar=path.join(dir,'package.tar'); await backupCommand('tar',['-cf',tar,'-C',source,'.']);
    const enc=path.join(dir,'package.enc'); await encryptArchive(tar,enc,'ab'.repeat(32));
    const work=path.join(dir,'work'); await mkdir(work);
    const pack=await loadRestorePackage(enc,work,'ab'.repeat(32));
    assert.equal(pack.snapshot.rows[0].data.nombre_comercio,'Prueba');
    await writeFile(path.join(pack.dir,'public.ndjson'),'alterado');
    const {verifyExtracted}=await import('./verify-admin-backup.mjs');
    await assert.rejects(verifyExtracted(pack.dir),/Checksum/);
    const header=Buffer.alloc(512);header.write('../escape');header.write('00000000000\0',124);header[156]=48;header.fill(32,148,156);
    const checksum=[...header].reduce((a,b)=>a+b,0).toString(8).padStart(6,'0');header.write(checksum+'\0 ',148);
    const badTar=path.join(dir,'bad.tar');await writeFile(badTar,Buffer.concat([header,Buffer.alloc(1024)]));
    await assert.rejects(extractBackupTar(badTar,path.join(dir,'bad')),/no permitida/);
  } finally {
    assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('vortex-backup-test-'));
    await rm(dir,{recursive:true,force:true});
  }
});

test('Lectura rechaza tablas inválidas y conteos duplicados y conserva enteros grandes',()=>{
  const manifest=JSON.stringify({kind:'manifest',version:1,comercio_id:null})+'\n';
  assert.throws(()=>parseBackupRows(manifest+JSON.stringify({kind:'table',table:'x;drop',rows:0})),/Tabla/);
  const table=JSON.stringify({kind:'table',table:'ventas',rows:0});
  assert.throws(()=>parseBackupRows(manifest+table+'\n'+table),/duplicada/);
  const snapshot=parseBackupRows(manifest+'{"kind":"row","table":"ventas","data":{"id":9007199254740993}}\n'+JSON.stringify({kind:'table',table:'ventas',rows:1}));
  assert.equal(stringifyBackupJson(snapshot.rows[0].data),'{"id":9007199254740993}');
});

test('JSON PostgreSQL conserva numeric, bigint y JSON anidado sin reinterpretar objetos',()=>{
  const raw='{"id":9007199254740993,"total":123.1234567890123456789,"json":{"n":1e1000,"fake":{"raw":"9007199254740997"},"string":"12.34567890123456789"},"__proto__":{"polluted":true},"array":[-0,1.00,true,null]}';
  const parsed=parseBackupJson(raw);
  assert.equal(stringifyBackupJson(parsed),raw);
  assert.equal({}.polluted,undefined);
  assert.equal(backupValuesKey([parseBackupJson('1.00')]),backupValuesKey([1]));
  assert.equal(backupValuesKey([parseBackupJson('{"b":2.00,"a":1}')]),backupValuesKey([parseBackupJson('{"a":1.0,"b":2}')]));
  assert.notEqual(backupValuesKey([parseBackupJson('9007199254740993')]),backupValuesKey(['9007199254740993']));
  for(const invalid of ['[1,]','{"x":1,"x":2}','01','truex','{"x":NaN}'])assert.throws(()=>parseBackupJson(invalid));
});

test('Exportador rechaza identificadores y nombres de tabla inyectados', () => {
  assert.throws(() => tenantExportSql("'; DROP TABLE public.comercio; --"));
  assert.throws(() => tenantExportSql('12345678-1234-1234-1234-123456789abc', ['x;select']));
  assert.throws(() => tenantExportSql('12345678-1234-1234-1234-123456789abc', [], [], [], { pagos: ['comercio_id'] }));
  assert.throws(() => tenantExportSql('12345678-1234-1234-1234-123456789abc', [], [], [], { "x';select": ['receptor_id'] }));
});

test('Recuperación prepara SQL literal y rechaza filas de otro tenant o conteos incompletos', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vortex-backup-test-'));
  const tenant = '12345678-1234-1234-1234-123456789abc';
  try {
    const records = [
      { kind: 'manifest', version: 1, comercio_id: tenant },
      { kind: 'row', table: 'comercio', data: { id: tenant, nombre_comercio: "O'Brien; SELECT 1;" } },
      { kind: 'table', table: 'comercio', rows: 1 },
    ];
    const input = path.join(dir, 'tenant.ndjson');
    await writeFile(input, records.map((r) => JSON.stringify(r)).join('\n'));
    const output = path.join(dir, 'recovery.sql');
    await prepareRecovery(input, output);
    const sql = await readFile(output, 'utf8');
    assert.ok(sql.includes("O''Brien; SELECT 1;"));
    assert.ok(sql.includes('vortex.recovery_isolated'));
    assert.ok(sql.endsWith('COMMIT;\n'));
    await assert.rejects(prepareRecovery(input, output));
    records[1].data.id = 'otro-comercio';
    await writeFile(input, records.map((r) => JSON.stringify(r)).join('\n'));
    await assert.rejects(prepareRecovery(input, path.join(dir, 'cross.sql')));
    records[1].data.id = tenant;
    records[2].rows = 2;
    await writeFile(input, records.map((r) => JSON.stringify(r)).join('\n'));
    await assert.rejects(prepareRecovery(input, path.join(dir, 'incomplete.sql')));
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('vortex-backup-test-'));
    await rm(dir, { recursive: true, force: true });
  }
});
