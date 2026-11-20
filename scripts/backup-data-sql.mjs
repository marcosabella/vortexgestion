import { parseBackupJson } from './backup-json.mjs';

export function publicExportSql() {
  return `BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND (relkind='p' OR relispartition)) THEN RAISE EXCEPTION 'Tablas particionadas requieren recuperación técnica'; END IF; END $$;
CREATE FUNCTION pg_temp.export_public() RETURNS SETOF jsonb LANGUAGE plpgsql AS $$
DECLARE t record; n bigint;
BEGIN
 RETURN NEXT jsonb_build_object('kind','manifest','version',1,'comercio_id',null,'snapshot_at',transaction_timestamp());
 FOR t IN SELECT c.relname FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND NOT c.relispartition ORDER BY c.relname LOOP
  RETURN QUERY EXECUTE format('SELECT jsonb_build_object(''kind'',''row'',''table'',%L,''data'',to_jsonb(t)) FROM public.%I t',t.relname,t.relname);
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN NEXT jsonb_build_object('kind','table','table',t.relname,'rows',n);
 END LOOP;
END $$;
SELECT * FROM pg_temp.export_public(); ROLLBACK;`;
}

export function parseBackupRows(text) {
  let manifest;
  const rows = [];
  const counts = new Map();
  const expected = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const item = parseBackupJson(line);
    if (item.kind === 'manifest') {
      if (manifest || item.version !== 1 || (item.comercio_id !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.comercio_id || ''))) throw new Error('Manifiesto inválido');
      manifest = item;
    } else if (item.kind === 'row') {
      if (!manifest || !/^[a-z_][a-z0-9_]*$/.test(item.table) || !item.data || typeof item.data !== 'object' || Array.isArray(item.data)) throw new Error('Datos inválidos');
      if (manifest.comercio_id && Object.hasOwn(item.data, 'comercio_id') && item.data.comercio_id !== manifest.comercio_id) throw new Error('Datos de otro comercio');
      if (manifest.comercio_id && item.table === 'comercio' && item.data.id !== manifest.comercio_id) throw new Error('Comercio incorrecto');
      rows.push(item); counts.set(item.table, (counts.get(item.table) || 0) + 1);
    } else if (item.kind === 'table') {
      if (!manifest || !/^[a-z_][a-z0-9_]*$/.test(item.table) || !Number.isSafeInteger(item.rows) || item.rows < 0 || expected.has(item.table)) throw new Error('Tabla inválida o duplicada');
      expected.set(item.table, item.rows);
    } else throw new Error('Registro desconocido');
  }
  if (!manifest || (manifest.comercio_id && counts.get('comercio') !== 1)) throw new Error('Respaldo incompleto');
  for (const [table, count] of counts) if (expected.get(table) !== count) throw new Error('Conteo inválido');
  for (const [table, count] of expected) if ((counts.get(table) || 0) !== count) throw new Error('Faltan registros');
  return { manifest, rows, tables: [...expected.keys()] };
}

export const normalizeSchema = (text) => text.replace(/^\\(?:un)?restrict .*$/gm, '').replace(/\r\n/g, '\n');
