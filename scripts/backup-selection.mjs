// Selección por relaciones del catálogo PostgreSQL, nunca por nombres inferidos.
import { backupValuesKey } from './backup-json.mjs';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const adminTables = ['app_admins', 'admin_backups', 'admin_backup_worker', 'admin_backup_restores', 'admin_backup_restore_lock'];
export const catalogSql = `SELECT coalesce(jsonb_agg(jsonb_build_object(
 'name',c.relname,
 'columns',(SELECT jsonb_agg(a.attname ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'pk',(SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num WHERE i.indrelid=c.oid AND i.indisprimary),
 'foreignKeys',coalesce((SELECT jsonb_agg(jsonb_build_object('parent',p.relname,'schema',ns.nspname,'columns',(SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM unnest(f.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num),'parentColumns',(SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM unnest(f.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=p.oid AND a.attnum=k.num))) FROM pg_constraint f JOIN pg_class p ON p.oid=f.confrelid JOIN pg_namespace ns ON ns.oid=p.relnamespace WHERE f.contype='f' AND f.conrelid=c.oid),'[]'::jsonb)
 ) ORDER BY c.relname),'[]'::jsonb) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND NOT c.relispartition;`;

export function selectTenant(snapshot, tenant, catalog, policy, allowMissing = false) {
  if (!UUID.test(tenant) || (snapshot.manifest.comercio_id && snapshot.manifest.comercio_id !== tenant)) throw new Error('Comercio incompatible con la copia');
  const excluded = new Set([...adminTables, ...(policy.excludedTables || [])]);
  const shared = new Set(policy.sharedTables || []);
  const referenced = new Set(policy.referencedTables || []);
  const byTable = new Map(catalog.map((t) => [t.name, t]));
  const explicit = (name) => name === 'comercio' || byTable.get(name)?.columns.includes('comercio_id');
  const scoped = new Set(catalog.filter((t) => explicit(t.name) && !adminTables.includes(t.name)).map((t) => t.name));
  let changed = true;
  while (changed) {
    changed = false;
    for (const table of catalog) if (!scoped.has(table.name) && !adminTables.includes(table.name) && table.foreignKeys.some((f) => f.schema === 'public' && scoped.has(f.parent))) { scoped.add(table.name); changed = true; }
  }
  for (const name of scoped) if (excluded.has(name) || shared.has(name)) throw new Error(`Política insegura para ${name}`);
  for (const name of referenced) if (explicit(name)) throw new Error('Padre global con comercio explícito');
  const selected = new Set();
  const rows = snapshot.rows.filter((r) => !excluded.has(r.table));
  for (const row of rows) {
    if (!byTable.has(row.table)) throw new Error('Tabla desconocida');
    if (!scoped.has(row.table) && !shared.has(row.table) && !referenced.has(row.table)) throw new Error(`Falta clasificar ${row.table}`);
    if (row.table === 'comercio' ? row.data.id === tenant : explicit(row.table) ? row.data.comercio_id === tenant : shared.has(row.table)) selected.add(row);
  }
  const grouped = new Map(catalog.map((t) => [t.name, []]));
  for (const row of rows) grouped.get(row.table).push(row);
  const indexes = new Map();
  for (const table of catalog) for (const fk of table.foreignKeys.filter((f) => f.schema === 'public')) {
    const index = new Map();
    for (const parent of grouped.get(fk.parent) || []) index.set(backupValuesKey(fk.parentColumns.map((c) => parent.data[c])), parent);
    indexes.set(fk, index);
  }
  const parentOf = (row, fk) => fk.columns.some((c) => row.data[c] == null) ? undefined : indexes.get(fk)?.get(backupValuesKey(fk.columns.map((c) => row.data[c])));
  changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      for (const fk of byTable.get(row.table).foreignKeys.filter((f) => f.schema === 'public')) {
        const parent = parentOf(row, fk);
        if (parent) {
          if (selected.has(row) && referenced.has(parent.table) && !selected.has(parent)) { selected.add(parent); changed = true; }
          if (selected.has(parent) && scoped.has(row.table) && !explicit(row.table) && !selected.has(row)) { selected.add(row); changed = true; }
        }
      }
    }
  }
  if (!allowMissing && [...selected].filter((r) => r.table === 'comercio').length !== 1) throw new Error('El comercio no está en la copia');
  for (const row of selected) for (const fk of byTable.get(row.table).foreignKeys.filter((f) => f.schema === 'public')) {
    if (fk.columns.some((c) => row.data[c] == null)) continue;
    if (fk.parent === 'comercio' && fk.columns.length === 1 && fk.columns[0] !== 'comercio_id' && fk.parentColumns.length === 1 && fk.parentColumns[0] === 'id' && byTable.get(row.table).columns.includes('comercio_id') && policy.externalComercioReferences?.[row.table]?.includes(fk.columns[0])) continue;
    if (!selected.has(parentOf(row, fk))) throw new Error(`Referencia fuera del comercio: ${row.table}`);
  }
  return { manifest: { ...snapshot.manifest, comercio_id: tenant, shared_tables: [...shared], referenced_tables: [...referenced] }, rows: [...selected], tables: [...new Set([...scoped, ...shared, ...referenced])].filter((t) => byTable.has(t)) };
}

export function mergeRestore(current, selectedCurrent, selectedBackup, catalog) {
  const shared = new Set([...(selectedBackup.manifest.shared_tables || []), ...(selectedBackup.manifest.referenced_tables || [])]);
  const key = (row) => {
    const pk = catalog.find((t) => t.name === row.table)?.pk;
    if (!pk?.length) throw new Error(`Tabla sin clave primaria: ${row.table}`);
    if (pk.some((c) => row.data[c] == null)) throw new Error('Clave primaria incompleta');
    return JSON.stringify([row.table, backupValuesKey(pk.map((c) => row.data[c]))]);
  };
  const removed = new Set(selectedCurrent.rows.filter((r) => !shared.has(r.table)).map(key));
  const result = new Map(current.rows.filter((r) => !adminTables.includes(r.table) && !removed.has(key(r))).map((r) => [key(r), r]));
  for (const row of selectedBackup.rows) {
    if (adminTables.includes(row.table)) continue;
    const id = key(row);
    if (result.has(id)) {
      if (shared.has(row.table)) continue;
      throw new Error('La clave pertenece a datos fuera del alcance seleccionado');
    }
    result.set(id, row);
  }
  return { manifest: { ...current.manifest, comercio_id: null }, rows: [...result.values()], tables: current.tables.filter((t) => !adminTables.includes(t)) };
}
