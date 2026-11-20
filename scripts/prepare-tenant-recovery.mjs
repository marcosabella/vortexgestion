// Genera SQL para un Supabase AISLADO. Nunca conecta ni ejecuta SQL.
import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBackupJson, stringifyBackupJson } from './backup-json.mjs';

const literal = (value) => `'${value.replaceAll("'", "''")}'`;
export async function prepareRecovery(input, output) {
  const writer = createWriteStream(output, { flags: 'wx', mode: 0o600 });
  let outputError;
  writer.on('error', (error) => { outputError = error; });
  async function write(value) {
    if (outputError) throw outputError;
    if (!writer.write(value)) await once(writer, 'drain');
  }
  try {
    await write(`\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL standard_conforming_strings=on;
DO $$ BEGIN
 IF current_setting('vortex.recovery_isolated',true) IS DISTINCT FROM 'yes' THEN RAISE EXCEPTION 'Confirmar entorno aislado con PGOPTIONS=-c vortex.recovery_isolated=yes'; END IF;
 IF EXISTS(SELECT 1 FROM public.comercio) THEN RAISE EXCEPTION 'Destino con comercios existentes: restauración cancelada'; END IF;
END $$;
CREATE TEMP TABLE recovery_rows(table_name text NOT NULL, data jsonb NOT NULL);
`);
    let manifest;
    const counts = new Map();
    const expected = new Map();
    for await (const line of createInterface({ input: createReadStream(input), crlfDelay: Infinity })) {
      if (!line.trim()) continue;
      const record = parseBackupJson(line);
      if (record.kind === 'manifest') {
        if (manifest || record.version !== 1) throw new Error('Manifiesto inválido');
        manifest = record;
      } else if (record.kind === 'row') {
        if (!/^[a-z_][a-z0-9_]*$/.test(record.table) || !record.data || typeof record.data !== 'object' || Array.isArray(record.data)) throw new Error('Fila inválida');
        if (Object.hasOwn(record.data, 'comercio_id') && record.data.comercio_id !== manifest?.comercio_id) throw new Error('Fila de otro comercio');
        if (record.table === 'comercio' && record.data.id !== manifest?.comercio_id) throw new Error('Comercio incorrecto');
        counts.set(record.table, (counts.get(record.table) || 0) + 1);
        await write(`INSERT INTO recovery_rows VALUES (${literal(record.table)},${literal(stringifyBackupJson(record.data))}::jsonb);\n`);
      } else if (record.kind === 'table') expected.set(record.table, record.rows);
      else throw new Error('Registro desconocido');
    }
    if (!manifest || counts.get('comercio') !== 1) throw new Error('No contiene un comercio completo');
    for (const [table, count] of counts) if (expected.get(table) !== count) throw new Error(`Conteo inconsistente: ${table}`);
    for (const [table, count] of expected) if ((counts.get(table) || 0) !== count) throw new Error(`Faltan filas: ${table}`);
    await write(`
-- Requiere privilegios de recuperación en el destino aislado.
-- Se omiten triggers operativos para preservar el historial y evitar recalcular stock/saldos.
SET LOCAL session_replication_role=replica;
DO $restore$
DECLARE t record; cols text; populated boolean;
BEGIN
 FOR t IN SELECT DISTINCT table_name FROM recovery_rows ORDER BY table_name LOOP
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)',t.table_name) INTO populated;
   IF populated THEN RAISE EXCEPTION 'Tabla destino no vacía: %',t.table_name; END IF;
   SELECT string_agg(format('%I',attname),',' ORDER BY attnum) INTO cols FROM pg_attribute WHERE attrelid=to_regclass(format('public.%I',t.table_name)) AND attnum>0 AND NOT attisdropped AND attgenerated='';
   IF cols IS NULL THEN RAISE EXCEPTION 'Tabla incompatible: %',t.table_name; END IF;
   EXECUTE format('INSERT INTO public.%I (%s) OVERRIDING SYSTEM VALUE SELECT %s FROM recovery_rows r CROSS JOIN LATERAL jsonb_populate_record(NULL::public.%I,r.data) d WHERE r.table_name=%L',t.table_name,cols,(SELECT string_agg('d.'||quote_ident(attname),',' ORDER BY attnum) FROM pg_attribute WHERE attrelid=to_regclass(format('public.%I',t.table_name)) AND attnum>0 AND NOT attisdropped AND attgenerated=''),t.table_name,t.table_name);
 END LOOP;
END $restore$;
SET LOCAL session_replication_role=origin;
-- Las FK también se validan contra auth. No se ignoran identidades ausentes.
DO $validate$
DECLARE f record; predicate text; nonnull text; anynull text; bad boolean;
BEGIN
 FOR f IN SELECT c.* FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid WHERE c.contype='f' AND cl.relnamespace='public'::regnamespace AND cl.relname IN (SELECT table_name FROM recovery_rows) LOOP
   SELECT string_agg(format('ch.%I=pa.%I',a.attname,b.attname),' AND '),string_agg(format('ch.%I IS NOT NULL',a.attname),' AND '),string_agg(format('ch.%I IS NULL',a.attname),' OR ') INTO predicate,nonnull,anynull FROM unnest(f.conkey,f.confkey) k(a,b) JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=k.a JOIN pg_attribute b ON b.attrelid=f.confrelid AND b.attnum=k.b;
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s ch WHERE (%s) AND NOT EXISTS(SELECT 1 FROM %s pa WHERE %s))',f.conrelid::regclass,nonnull,f.confrelid::regclass,predicate) INTO bad;
   IF bad THEN RAISE EXCEPTION 'FK sin padre: %',f.conname; END IF;
   IF f.confmatchtype='f' THEN
     EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s ch WHERE (%s) AND NOT (%s))',f.conrelid::regclass,anynull,replace(nonnull,'IS NOT NULL','IS NULL')) INTO bad;
     IF bad THEN RAISE EXCEPTION 'FK MATCH FULL inválida: %',f.conname; END IF;
   END IF;
 END LOOP;
END $validate$;
-- Reposicionar secuencias serial/identity de las tablas importadas.
DO $sequences$
DECLARE c record; seq text; maximum bigint;
BEGIN
 FOR c IN SELECT cl.relname,a.attname FROM pg_attribute a JOIN pg_class cl ON cl.oid=a.attrelid WHERE cl.relnamespace='public'::regnamespace AND cl.relname IN (SELECT table_name FROM recovery_rows) AND a.attnum>0 AND NOT a.attisdropped LOOP
   seq:=pg_get_serial_sequence(format('public.%I',c.relname),c.attname);
   IF seq IS NOT NULL THEN
     EXECUTE format('SELECT max(%I)::bigint FROM public.%I',c.attname,c.relname) INTO maximum;
     IF maximum IS NOT NULL THEN PERFORM setval(seq::regclass,maximum,true); END IF;
   END IF;
 END LOOP;
END $sequences$;
COMMIT;
`);
    const finished = once(writer, 'finish');
    writer.end();
    await finished;
  } catch (error) {
    writer.destroy();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) { console.error('Uso: node scripts/prepare-tenant-recovery.mjs tenant.ndjson recuperacion.sql'); process.exitCode = 1; }
  else prepareRecovery(input, output).then(() => console.log('SQL preparado para revisión y ejecución en Supabase aislado.')).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
