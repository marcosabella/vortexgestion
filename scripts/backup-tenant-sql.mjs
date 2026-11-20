// Solo SQL local del worker. Nunca se expone como RPC ni acepta SQL del navegador.
export function tenantExportSql(comercioId, excluded = [], shared = [], referenced = [], externalComercioReferences = {}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(comercioId)) throw new Error('Comercio inválido');
  const list = (values) => {
    if (values.some((v) => !/^[a-z_][a-z0-9_]*$/.test(v))) throw new Error('Tabla inválida en la política');
    return `ARRAY[${values.map((v) => `'${v}'`).join(',')}]::text[]`;
  };
  for (const [table, columns] of Object.entries(externalComercioReferences)) {
    if (!/^[a-z_][a-z0-9_]*$/.test(table) || !Array.isArray(columns) || columns.some((c) => !/^[a-z_][a-z0-9_]*$/.test(c) || c === 'comercio_id')) throw new Error('Referencia externa inválida');
  }
  return `
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL statement_timeout = '30min';
CREATE TEMP TABLE backup_selected (tbl oid, row_tid tid, PRIMARY KEY(tbl,row_tid));
CREATE TEMP TABLE backup_scoped (tbl oid PRIMARY KEY);
CREATE FUNCTION pg_temp.export_tenant() RETURNS SETOF jsonb LANGUAGE plpgsql AS $backup$
DECLARE t record; f record; n bigint; changed bigint; predicate text; missing boolean;
  excluded text[] := ${list(['app_admins', 'admin_backups', 'admin_backup_worker', 'admin_backup_restores', 'admin_backup_restore_lock', ...excluded])};
  shared text[] := ${list(shared)};
  referenced text[] := ${list(referenced)};
  external_rules jsonb := '${JSON.stringify(externalComercioReferences)}'::jsonb;
  tenant uuid := '${comercioId}';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='p') THEN
    RAISE EXCEPTION 'Tablas particionadas: requieren política de exportación específica';
  END IF;
  IF EXISTS (
    WITH RECURSIVE operational(tbl) AS (
      SELECT c.oid FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND (c.relname='comercio' OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=c.oid AND attname='comercio_id' AND NOT attisdropped))
      UNION SELECT c.conrelid FROM pg_constraint c JOIN operational o ON o.tbl=c.confrelid WHERE c.contype='f'
    ) SELECT 1 FROM operational o JOIN pg_class c ON c.oid=o.tbl WHERE c.relname=ANY(shared) OR (c.relname=ANY(excluded) AND c.relname NOT IN ('admin_backups','admin_backup_restores','admin_backup_restore_lock'))
  ) THEN RAISE EXCEPTION 'La política intenta compartir u omitir una tabla operativa'; END IF;
  -- Bloquea cambios de esquema durante la selección, sin bloquear ventas/altas.
  FOR t IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relispartition ORDER BY c.oid LOOP
    EXECUTE format('LOCK TABLE public.%I IN ACCESS SHARE MODE',t.relname);
    IF t.relname='comercio' OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=t.oid AND attname='comercio_id' AND NOT attisdropped) THEN
      IF t.relname = ANY(shared) OR (t.relname = ANY(excluded) AND t.relname NOT IN ('admin_backups','admin_backup_restores','admin_backup_restore_lock')) THEN RAISE EXCEPTION 'Una tabla de comercio no puede ser global/excluida: %',t.relname; END IF;
      IF t.relname = ANY(excluded) THEN CONTINUE; END IF;
      INSERT INTO backup_scoped VALUES(t.oid);
      EXECUTE format('INSERT INTO backup_selected SELECT %s,ctid FROM public.%I WHERE %I=$1',t.oid,t.relname,CASE WHEN t.relname='comercio' THEN 'id' ELSE 'comercio_id' END) USING tenant;
    ELSIF t.relname = ANY(shared) THEN
      EXECUTE format('INSERT INTO backup_selected SELECT %s,ctid FROM public.%I',t.oid,t.relname);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM backup_selected WHERE tbl='public.comercio'::regclass) THEN RAISE EXCEPTION 'Comercio inexistente'; END IF;
  -- Clasificación estructural de detalles, también si hoy no tienen filas.
  LOOP
    INSERT INTO backup_scoped SELECT DISTINCT c.conrelid FROM pg_constraint c JOIN backup_scoped s ON s.tbl=c.confrelid JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace WHERE c.contype='f' AND ns.nspname='public' AND NOT cl.relname=ANY(excluded) AND NOT cl.relname=ANY(shared) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n=ROW_COUNT; EXIT WHEN n=0;
  END LOOP;
  LOOP
    changed:=0;
    -- Padres globales expresamente revisados: solo filas referenciadas por el tenant.
    FOR f IN SELECT c.*,child.relname child_name,parent.relname parent_name FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_class parent ON parent.oid=c.confrelid WHERE c.contype='f' AND child.relnamespace='public'::regnamespace AND parent.relnamespace='public'::regnamespace AND parent.relname=ANY(referenced) LOOP
      IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=f.confrelid AND attname='comercio_id' AND NOT attisdropped) OR f.parent_name='comercio' THEN RAISE EXCEPTION 'Padre referenciado con tenant explícito: %',f.parent_name; END IF;
      SELECT string_agg(format('ch.%I=pa.%I',ca.attname,pa.attname),' AND ') INTO predicate FROM unnest(f.conkey,f.confkey) k(a,b) JOIN pg_attribute ca ON ca.attrelid=f.conrelid AND ca.attnum=k.a JOIN pg_attribute pa ON pa.attrelid=f.confrelid AND pa.attnum=k.b;
      EXECUTE format('INSERT INTO backup_selected SELECT %s,pa.ctid FROM public.%I pa JOIN public.%I ch ON %s JOIN backup_selected s ON s.tbl=%s AND s.row_tid=ch.ctid ON CONFLICT DO NOTHING',f.confrelid,f.parent_name,f.child_name,predicate,f.conrelid);
      GET DIAGNOSTICS n=ROW_COUNT; changed:=changed+n;
    END LOOP;
    FOR f IN SELECT c.*,child.relname child_name,parent.relname parent_name FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_class parent ON parent.oid=c.confrelid JOIN backup_scoped s ON s.tbl=c.conrelid WHERE c.contype='f' AND child.relnamespace='public'::regnamespace AND parent.relnamespace='public'::regnamespace LOOP
      -- Tablas con tenant explícito ya se seleccionaron por comercio, nunca por otro vínculo.
      IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=f.conrelid AND attname='comercio_id' AND NOT attisdropped) OR f.child_name='comercio' THEN CONTINUE; END IF;
      SELECT string_agg(format('ch.%I=pa.%I',ca.attname,pa.attname),' AND ') INTO predicate FROM unnest(f.conkey,f.confkey) k(a,b) JOIN pg_attribute ca ON ca.attrelid=f.conrelid AND ca.attnum=k.a JOIN pg_attribute pa ON pa.attrelid=f.confrelid AND pa.attnum=k.b;
      EXECUTE format('INSERT INTO backup_selected SELECT %s,ch.ctid FROM public.%I ch JOIN public.%I pa ON %s JOIN backup_selected s ON s.tbl=%s AND s.row_tid=pa.ctid ON CONFLICT DO NOTHING',f.conrelid,f.child_name,f.parent_name,predicate,f.confrelid);
      GET DIAGNOSTICS n=ROW_COUNT; changed:=changed+n;
    END LOOP;
    EXIT WHEN changed=0;
  END LOOP;
  -- No declarar completo un respaldo que omite una tabla desconocida poblada.
  FOR t IN SELECT c.oid,c.relname FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p') AND NOT c.relispartition LOOP
    IF NOT EXISTS(SELECT 1 FROM backup_scoped WHERE tbl=t.oid) AND NOT t.relname=ANY(excluded) AND NOT t.relname=ANY(shared) AND NOT t.relname=ANY(referenced) THEN
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)',t.relname) INTO missing;
      IF missing THEN RAISE EXCEPTION 'Falta clasificar la tabla % en la política del respaldo',t.relname; END IF;
    END IF;
  END LOOP;
  -- Verifica todas las referencias públicas: falla ante vínculos a otro comercio o padres omitidos.
  FOR f IN SELECT c.*,child.relname child_name,parent.relname parent_name FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_class parent ON parent.oid=c.confrelid WHERE c.contype='f' AND child.relnamespace='public'::regnamespace AND parent.relnamespace='public'::regnamespace LOOP
    -- Vínculo administrativo revisado: guardar el UUID del receptor, sin copiar
    -- otra empresa. Su existencia se exigirá por FK al recuperar en el destino.
    IF f.parent_name='comercio' AND cardinality(f.conkey)=1 AND cardinality(f.confkey)=1
      AND EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=f.conrelid AND attname='comercio_id' AND NOT attisdropped)
      AND EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=f.conrelid AND attnum=f.conkey[1] AND attname<>'comercio_id' AND (external_rules->f.child_name) ? attname)
      AND EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=f.confrelid AND attnum=f.confkey[1] AND attname='id') THEN CONTINUE; END IF;
    SELECT string_agg(format('ch.%I=pa.%I',ca.attname,pa.attname),' AND ') INTO predicate FROM unnest(f.conkey,f.confkey) k(a,b) JOIN pg_attribute ca ON ca.attrelid=f.conrelid AND ca.attnum=k.a JOIN pg_attribute pa ON pa.attrelid=f.confrelid AND pa.attnum=k.b;
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I ch JOIN backup_selected cs ON cs.tbl=%s AND cs.row_tid=ch.ctid JOIN public.%I pa ON %s LEFT JOIN backup_selected ps ON ps.tbl=%s AND ps.row_tid=pa.ctid WHERE ps.tbl IS NULL)',f.child_name,f.conrelid,f.parent_name,predicate,f.confrelid) INTO missing;
    IF missing THEN RAISE EXCEPTION 'Referencia fuera del respaldo: % -> %',f.child_name,f.parent_name; END IF;
  END LOOP;
  RETURN NEXT jsonb_build_object('kind','manifest','version',1,'comercio_id',tenant,'snapshot_at',transaction_timestamp(),'excluded_tables',excluded,'shared_tables',shared,'referenced_tables',referenced,'external_comercio_references',external_rules,'auth','Identidades compartidas fuera del respaldo individual; usar respaldo general');
  FOR t IN SELECT c.oid,c.relname FROM pg_class c WHERE c.oid IN (SELECT tbl FROM backup_scoped UNION SELECT tbl FROM backup_selected) ORDER BY c.relname LOOP
    RETURN QUERY EXECUTE format('SELECT jsonb_build_object(''kind'',''row'',''table'',%L,''data'',to_jsonb(t)) FROM public.%I t JOIN backup_selected s ON s.tbl=%s AND s.row_tid=t.ctid',t.relname,t.relname,t.oid);
    RETURN NEXT jsonb_build_object('kind','table','table',t.relname,'rows',(SELECT count(*) FROM backup_selected WHERE tbl=t.oid));
  END LOOP;
END $backup$;
SELECT * FROM pg_temp.export_tenant();
ROLLBACK;
`;
}
