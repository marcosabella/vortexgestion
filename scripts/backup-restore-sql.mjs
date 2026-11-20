import { adminTables, UUID } from './backup-selection.mjs';
import { stringifyBackupJson } from './backup-json.mjs';
const lit = (s) => `'${String(s).replaceAll("'", "''")}'`;

// Compara el estado completo bajo bloqueo antes y después. No ejecuta schema.sql
// ni ninguna sentencia proveniente del archivo importado.
export function restoreDataSql(before, after, restoreId) {
  if (!UUID.test(restoreId)) throw new Error('Restauración inválida');
  const tables = before.tables.filter((t) => !adminTables.includes(t));
  if (tables.some((t) => !/^[a-z_][a-z0-9_]*$/.test(t)) || after.tables.filter((t) => !adminTables.includes(t)).some((t) => !tables.includes(t))) throw new Error('Tablas incompatibles');
  let sql = `\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL standard_conforming_strings=on;
SET LOCAL lock_timeout='20s'; SET LOCAL statement_timeout='8min';
UPDATE public.admin_backup_restore_lock SET backend_pid=pg_backend_pid() WHERE id=true AND restore_id=${lit(restoreId)}::uuid;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.admin_backup_restore_lock WHERE restore_id=${lit(restoreId)}::uuid AND backend_pid=pg_backend_pid()) THEN RAISE EXCEPTION 'Restauración sin bloqueo'; END IF; END $$;
CREATE TEMP TABLE restore_before(name text,data jsonb);
CREATE TEMP TABLE restore_after(name text,data jsonb);
CREATE TEMP TABLE restore_tables(name text PRIMARY KEY);
`;
  for (const table of tables) sql += `INSERT INTO restore_tables VALUES(${lit(table)});\n`;
  for (const [name, snapshot] of [['restore_before', before], ['restore_after', after]]) for (const row of snapshot.rows) {
    if (!tables.includes(row.table)) continue;
    sql += `INSERT INTO ${name} VALUES(${lit(row.table)},${lit(stringifyBackupJson(row.data))}::jsonb);\n`;
  }
  sql += `
DO $$ DECLARE t record; changed boolean; BEGIN
 FOR t IN SELECT name FROM restore_tables ORDER BY name LOOP EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',t.name); END LOOP;
 FOR t IN SELECT name FROM restore_tables LOOP
  EXECUTE format('SELECT EXISTS((SELECT to_jsonb(t) FROM public.%I t EXCEPT ALL SELECT data FROM restore_before WHERE name=%L) UNION ALL (SELECT data FROM restore_before WHERE name=%L EXCEPT ALL SELECT to_jsonb(t) FROM public.%I t))',t.name,t.name,t.name,t.name) INTO changed;
  IF changed THEN RAISE EXCEPTION 'Los datos cambiaron antes de restaurar: %',t.name; END IF;
 END LOOP;
END $$;
CREATE TEMP TABLE restore_constraints AS SELECT c.conrelid,c.conname,c.condeferrable,c.condeferred FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid WHERE c.contype='f' AND cl.relnamespace='public'::regnamespace AND cl.relname IN(SELECT name FROM restore_tables);
CREATE TEMP TABLE restore_triggers AS SELECT t.tgrelid,t.tgname,t.tgenabled FROM pg_trigger t JOIN pg_class cl ON cl.oid=t.tgrelid WHERE NOT t.tgisinternal AND cl.relnamespace='public'::regnamespace AND cl.relname IN(SELECT name FROM restore_tables);
DO $$ DECLARE c record;t record; BEGIN
 FOR c IN SELECT * FROM restore_constraints LOOP EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY DEFERRED',c.conrelid::regclass,c.conname); END LOOP;
 FOR t IN SELECT * FROM restore_triggers LOOP EXECUTE format('ALTER TABLE %s DISABLE TRIGGER %I',t.tgrelid::regclass,t.tgname); END LOOP;
END $$;
SET CONSTRAINTS ALL DEFERRED;
-- Si la general retira un comercio creado después del respaldo, conservar
-- el tenant original en la auditoría sin impedir su baja por una FK histórica.
UPDATE public.admin_backups b SET resumen=coalesce(b.resumen,'{}'::jsonb)||jsonb_build_object('comercio_original_id',b.comercio_id),comercio_id=NULL
 WHERE b.comercio_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM restore_after r WHERE r.name='comercio' AND r.data->>'id'=b.comercio_id::text);
UPDATE public.admin_backup_restores b SET resumen=coalesce(b.resumen,'{}'::jsonb)||jsonb_build_object('comercio_original_id',b.comercio_id),comercio_id=NULL
 WHERE b.comercio_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM restore_after r WHERE r.name='comercio' AND r.data->>'id'=b.comercio_id::text);
DO $apply$ DECLARE t record; pk text; predicate text; cols text; selects text; updates text; BEGIN
 -- Sólo se borran filas ausentes del estado final. Se conservan los padres
 -- existentes para no disparar cascadas al actualizar un comercio.
 FOR t IN WITH RECURSIVE ancestry(root,parent,depth,seen) AS (
  SELECT c.oid,c.oid,0,ARRAY[c.oid] FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname IN(SELECT name FROM restore_tables)
  UNION ALL SELECT a.root,f.confrelid,a.depth+1,a.seen||f.confrelid FROM ancestry a JOIN pg_constraint f ON f.conrelid=a.parent AND f.contype='f' WHERE NOT f.confrelid=ANY(a.seen) AND a.depth<32
 ) SELECT c.relname,max(a.depth) depth FROM ancestry a JOIN pg_class c ON c.oid=a.root GROUP BY c.relname ORDER BY depth DESC,c.relname LOOP
  SELECT string_agg(format('to_jsonb(t)->%L IS NOT DISTINCT FROM r.data->%L',a.attname,a.attname),' AND ') INTO predicate FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) k(num) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num WHERE i.indrelid=to_regclass(format('public.%I',t.relname)) AND i.indisprimary;
  IF predicate IS NULL THEN RAISE EXCEPTION 'Tabla sin clave primaria: %',t.relname; END IF;
  EXECUTE format('DELETE FROM public.%I t WHERE NOT EXISTS(SELECT 1 FROM restore_after r WHERE r.name=%L AND %s)',t.relname,t.relname,predicate);
 END LOOP;
 FOR t IN SELECT name FROM restore_tables ORDER BY name LOOP
  SELECT string_agg(quote_ident(a.attname),',' ORDER BY a.attnum),string_agg('d.'||quote_ident(a.attname),',' ORDER BY a.attnum),string_agg(format('%I=EXCLUDED.%I',a.attname,a.attname),',' ORDER BY a.attnum) FILTER(WHERE a.attidentity='' AND NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=a.attrelid AND i.indisprimary AND a.attnum=ANY(i.indkey::smallint[]))) INTO cols,selects,updates FROM pg_attribute a WHERE a.attrelid=to_regclass(format('public.%I',t.name)) AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='';
  SELECT string_agg(quote_ident(a.attname),',' ORDER BY k.ord) INTO pk FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num WHERE i.indrelid=to_regclass(format('public.%I',t.name)) AND i.indisprimary;
  EXECUTE format('INSERT INTO public.%I (%s) OVERRIDING SYSTEM VALUE SELECT %s FROM restore_after r CROSS JOIN LATERAL jsonb_populate_record(NULL::public.%I,r.data) d WHERE r.name=%L ON CONFLICT (%s) %s',t.name,cols,selects,t.name,t.name,pk,CASE WHEN updates IS NULL THEN 'DO NOTHING' ELSE 'DO UPDATE SET '||updates END);
 END LOOP;
END $apply$;
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ DECLARE t record;changed boolean; BEGIN
 FOR t IN SELECT name FROM restore_tables LOOP
  EXECUTE format('SELECT EXISTS((SELECT to_jsonb(t) FROM public.%I t EXCEPT ALL SELECT data FROM restore_after WHERE name=%L) UNION ALL (SELECT data FROM restore_after WHERE name=%L EXCEPT ALL SELECT to_jsonb(t) FROM public.%I t))',t.name,t.name,t.name,t.name) INTO changed;
  IF changed THEN RAISE EXCEPTION 'El resultado no coincide con el alcance autorizado: %',t.name; END IF;
 END LOOP;
END $$;
DO $$ DECLARE c record;t record; BEGIN
 FOR c IN SELECT * FROM restore_constraints LOOP EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I %s',c.conrelid::regclass,c.conname,CASE WHEN c.condeferrable THEN 'DEFERRABLE INITIALLY '||CASE WHEN c.condeferred THEN 'DEFERRED' ELSE 'IMMEDIATE' END ELSE 'NOT DEFERRABLE' END); END LOOP;
 FOR t IN SELECT * FROM restore_triggers LOOP EXECUTE format('ALTER TABLE %s %s TRIGGER %I',t.tgrelid::regclass,CASE t.tgenabled WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,t.tgname); END LOOP;
END $$;
-- Nunca retroceder secuencias: podría colisionar con IDs de otros comercios.
DO $$ DECLARE c record;seq text;maximum bigint;last_value bigint; BEGIN
 FOR c IN SELECT cl.relname,a.attname FROM pg_attribute a JOIN pg_class cl ON cl.oid=a.attrelid WHERE cl.relnamespace='public'::regnamespace AND cl.relname IN(SELECT name FROM restore_tables) AND a.attnum>0 AND NOT a.attisdropped LOOP
  seq:=pg_get_serial_sequence(format('public.%I',c.relname),c.attname);
  IF seq IS NOT NULL THEN
   EXECUTE format('SELECT max(%I)::bigint FROM public.%I',c.attname,c.relname) INTO maximum;
   EXECUTE format('SELECT last_value FROM %s',seq::regclass) INTO last_value;
   IF maximum>last_value THEN PERFORM setval(seq::regclass,maximum,true); END IF;
  END IF;
 END LOOP;
END $$;
UPDATE public.admin_backup_restore_lock SET backend_pid=NULL WHERE restore_id=${lit(restoreId)}::uuid;
COMMIT;
`;
  return sql;
}
