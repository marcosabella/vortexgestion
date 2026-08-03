import { ChangeEvent, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Buffer } from "buffer";
import process from "process";
import { AlertTriangle, CheckCircle2, Database, Eye, FileSearch, Loader2, LockKeyhole, Play, RotateCcw, UploadCloud } from "lucide-react";
import { useAdminComercios, useIsAppAdmin } from "@/hooks/useAdminComercios";
import { getMapping, inspectLegacySchema, LegacyCompatibility, previewClientRows, previewColumns, previewProductRows, previewProviderRows, previewRows, PreviewRow } from "@/utils/accessMigrationPreview";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AccessTableInfo = { name: string; rows: number; columns: string[] };
type AccessTable = {
  rowCount: number;
  getColumnNames: () => string[];
  getData: (options?: { rowOffset?: number; rowLimit?: number }) => Record<string, unknown>[];
};
type AccessReader = {
  getTableNames: (options?: { normalTables: boolean; systemTables: boolean; linkedTables: boolean }) => string[];
  getTable: (name: string) => AccessTable;
};
type ReaderState = { reader: AccessReader; tables: AccessTableInfo[] };
type SimulationSummary = { total: number; validos: number; omitidos: number; errores: number };
const PREVIEW_LIMIT = 20;
const STAGING_BATCH_SIZE = 400;

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function displayValue(value: unknown) {
  if (value == null || value === "") return "—";
  if (value instanceof Date) return value.toLocaleString("es-AR");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function AdminMigraciones() {
  const { data: isAdmin, isLoading: isAdminLoading } = useIsAppAdmin();
  const { comerciosQuery } = useAdminComercios(Boolean(isAdmin));
  const [comercioId, setComercioId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [readerState, setReaderState] = useState<ReaderState | null>(null);
  const [compatibility, setCompatibility] = useState<LegacyCompatibility | null>(null);
  const [selectedTable, setSelectedTable] = useState("");
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [migrationId, setMigrationId] = useState("");
  const [simulation, setSimulation] = useState<SimulationSummary | null>(null);
  const [migrationStatus, setMigrationStatus] = useState<"idle" | "staging" | "simulated" | "applying" | "applied" | "reverting" | "reverted">("idle");
  const [error, setError] = useState("");

  const comercio = useMemo(() => comerciosQuery.data?.find((item) => item.id === comercioId), [comercioId, comerciosQuery.data]);
  const selectedInfo = readerState?.tables.find((table) => table.name === selectedTable);
  const mapping = selectedTable ? getMapping(selectedTable) : undefined;
  const columns = previewColumns(preview);

  if (isAdminLoading) return <div className="p-8">Verificando permisos...</div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  const resetAnalysis = () => { setReaderState(null); setCompatibility(null); setSelectedTable(""); setPreview([]); setMigrationId(""); setSimulation(null); setMigrationStatus("idle"); setError(""); };
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    resetAnalysis();
    if (!selected) return setFile(null);
    if (!/\.(mdb|accdb)$/i.test(selected.name)) {
      setFile(null); setError("Seleccione una base Microsoft Access con extensión .mdb o .accdb."); event.target.value = ""; return;
    }
    setFile(selected);
  };
  const analyze = async () => {
    if (!file || !comercioId) return;
    setIsAnalyzing(true); resetAnalysis();
    try {
      (globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;
      (globalThis as typeof globalThis & { process: typeof process }).process = process;
      const { default: MDBReader } = await import("mdb-reader");
      const reader = new MDBReader(Buffer.from(await file.arrayBuffer())) as AccessReader;
      const tables = reader.getTableNames({ normalTables: true, systemTables: false, linkedTables: false }).map((name) => {
        const table = reader.getTable(name);
        return { name, rows: table.rowCount, columns: table.getColumnNames() };
      }).sort((a, b) => {
        const mappingA = getMapping(a.name);
        const mappingB = getMapping(b.name);
        const priorityA = mappingA?.transform ? 0 : mappingA ? 1 : 2;
        const priorityB = mappingB?.transform ? 0 : mappingB ? 1 : 2;
        return priorityA - priorityB || a.name.localeCompare(b.name);
      });
      setReaderState({ reader, tables });
      setCompatibility(inspectLegacySchema(tables));
    } catch (cause) {
      setError(cause instanceof Error ? `No se pudo leer la base: ${cause.message}` : "No se pudo leer la base Access.");
    } finally { setIsAnalyzing(false); }
  };
  const buildPreview = () => {
    if (!readerState || !selectedTable || !comercioId) return;
    try {
      const rows = readerState.reader.getTable(selectedTable).getData({ rowOffset: 0, rowLimit: PREVIEW_LIMIT });
      if (mapping?.sourceTable === "Clientes") {
        const addressTable = compatibility?.resolved.Domicilio_x_cliente;
        const localityTable = compatibility?.resolved.Localidades;
        const provinceTable = compatibility?.resolved.Provincias;
        const ivaTable = compatibility?.resolved.CondIva;
        setPreview(previewClientRows(
          rows,
          addressTable ? readerState.reader.getTable(addressTable).getData() : [],
          localityTable ? readerState.reader.getTable(localityTable).getData() : [],
          provinceTable ? readerState.reader.getTable(provinceTable).getData() : [],
          comercioId,
          ivaTable ? readerState.reader.getTable(ivaTable).getData() : [],
        ));
      } else if (mapping?.sourceTable === "Articulos") {
        const categoryTable = compatibility?.resolved.Rubro;
        const brandTable = compatibility?.resolved.Marca;
        const supplierTable = compatibility?.resolved.Proveedores;
        if (!categoryTable || !brandTable || !supplierTable) throw new Error("Faltan maestros relacionados para generar productos.");
        setPreview(previewProductRows(
          rows,
          readerState.reader.getTable(selectedTable).getData(),
          readerState.reader.getTable(categoryTable).getData(),
          readerState.reader.getTable(brandTable).getData(),
          readerState.reader.getTable(supplierTable).getData(),
          comercioId,
        ));
      } else {
        setPreview(previewRows(selectedTable, rows, comercioId));
      }
      setError("");
    } catch (cause) {
      setPreview([]); setError(cause instanceof Error ? cause.message : "No se pudo preparar la vista previa.");
    }
  };

  const tableData = (name: string) => {
    if (!readerState) throw new Error("Primero analice la base Access.");
    const actualName = compatibility?.resolved[name] || readerState.tables.find((table) => table.name.toLowerCase() === name.toLowerCase())?.name;
    if (!actualName) throw new Error(`Falta la tabla ${name} en la base Access.`);
    return readerState.reader.getTable(actualName).getData();
  };

  const optionalTableData = (name: string) => {
    const actualName = compatibility?.resolved[name];
    return readerState && actualName ? readerState.reader.getTable(actualName).getData() : [];
  };

  const rpc = async <T,>(name: string, args: Record<string, unknown>) => {
    const untypedClient = supabase as unknown as {
      rpc: (functionName: string, parameters: Record<string, unknown>) => PromiseLike<{
        data: unknown;
        error: { message?: string } | null;
      }>;
    };
    const { data, error: rpcError } = await untypedClient.rpc(name, args);
    if (rpcError) throw new Error(rpcError.message || `Fallo ${name}`);
    return data as T;
  };

  const prepareSimulation = async () => {
    if (!file || !readerState || !comercioId || !compatibility?.compatible) return;
    setMigrationStatus("staging"); setError(""); setSimulation(null);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const id = await rpc<string>("migracion_crear_maestros", { p_comercio_id: comercioId, p_archivo_nombre: file.name, p_archivo_hash: hash, p_archivo_tamano: file.size });
      setMigrationId(id);
      const iva = optionalTableData("CondIva");
      const articulos = tableData("Articulos");
      const masters: Record<string, PreviewRow[]> = {
        rubros: previewRows("Rubro", tableData("Rubro"), comercioId),
        marcas: previewRows("Marca", tableData("Marca"), comercioId),
        proveedores: previewProviderRows(tableData("Proveedores"), iva, comercioId),
        clientes: previewClientRows(tableData("Clientes"), optionalTableData("Domicilio_x_cliente"), optionalTableData("Localidades"), optionalTableData("Provincias"), comercioId, iva),
        productos: previewProductRows(articulos, articulos, tableData("Rubro"), tableData("Marca"), tableData("Proveedores"), comercioId),
      };
      for (const [module, rows] of Object.entries(masters)) {
        if (!rows.length) {
          await rpc("migracion_cargar_staging_maestros", { p_migracion_id: id, p_modulo: module, p_filas: [], p_reemplazar: true });
        }
        for (let offset = 0; offset < rows.length; offset += STAGING_BATCH_SIZE) {
          await rpc("migracion_cargar_staging_maestros", { p_migracion_id: id, p_modulo: module, p_filas: rows.slice(offset, offset + STAGING_BATCH_SIZE), p_reemplazar: offset === 0 });
        }
      }
      setSimulation(await rpc<SimulationSummary>("migracion_simular_maestros", { p_migracion_id: id }));
      setMigrationStatus("simulated");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo preparar la simulacion.");
      setMigrationStatus("idle");
    }
  };

  const applyMigration = async () => {
    if (!migrationId || !simulation || simulation.errores > 0) return;
    if (!window.confirm(`Se insertaran ${simulation.validos} registros en ${comercio?.nombre_comercio}. ¿Continuar?`)) return;
    setMigrationStatus("applying"); setError("");
    try {
      await rpc("migracion_aplicar_maestros", { p_migracion_id: migrationId });
      setMigrationStatus("applied");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo aplicar la migracion.");
      setMigrationStatus("simulated");
    }
  };

  const revertMigration = async () => {
    if (!migrationId || !window.confirm("Se eliminaran solamente los registros insertados por esta ejecucion. ¿Revertir?")) return;
    setMigrationStatus("reverting"); setError("");
    try {
      await rpc("migracion_revertir_maestros", { p_migracion_id: migrationId });
      setMigrationStatus("reverted");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo revertir la migracion.");
      setMigrationStatus("applied");
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-4 md:p-8">
      <div><h1 className="flex items-center gap-3 text-3xl font-bold"><Database className="h-8 w-8" /> Migraciones</h1><p className="mt-1 text-sm text-muted-foreground">Análisis, simulación y carga controlada de maestros desde Access.</p></div>
      <Alert><LockKeyhole className="h-4 w-4" /><AlertTitle>Solo administrador · archivo procesado localmente</AlertTitle><AlertDescription>El MDB no se almacena ni se sube. La simulación envía únicamente filas transformadas al staging privado y la aplicación requiere una confirmación explícita.</AlertDescription></Alert>

      <Card><CardHeader><CardTitle>1. Analizar base Access</CardTitle><CardDescription>Fije el comercio de destino para visualizar el comercio_id que tendría cada registro.</CardDescription></CardHeader><CardContent className="space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2"><Label>Comercio de destino</Label><Select value={comercioId} onValueChange={(value) => { setComercioId(value); resetAnalysis(); }}><SelectTrigger><SelectValue placeholder="Seleccionar comercio" /></SelectTrigger><SelectContent>{(comerciosQuery.data || []).map((item) => <SelectItem key={item.id} value={item.id}>{item.nombre_comercio} — {item.cuit}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="migration-file">Base Access</Label><Input id="migration-file" type="file" accept=".mdb,.accdb" onChange={handleFile} /><p className="text-xs text-muted-foreground">.mdb o .accdb · el archivo no se almacena</p></div>
        </div>
        {file && <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><UploadCloud className="h-6 w-6 text-primary" /><div><p className="font-medium">{file.name}</p><p className="text-xs text-muted-foreground">{formatSize(file.size)}</p></div></div><Button disabled={!comercioId || isAnalyzing} onClick={analyze}>{isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}{isAnalyzing ? "Leyendo..." : "Analizar tablas"}</Button></div>}
        {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error de análisis</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      </CardContent></Card>

      {compatibility && <Card><CardHeader><CardTitle>Compatibilidad del origen</CardTitle><CardDescription>Diagnóstico basado en la estructura del archivo seleccionado, no en una base de muestra.</CardDescription></CardHeader><CardContent className="space-y-3">
        <Alert variant={compatibility.compatible ? "default" : "destructive"}>{compatibility.compatible ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}<AlertTitle>{compatibility.compatible ? "Esquema compatible" : "Esquema incompatible"}</AlertTitle><AlertDescription>{compatibility.compatible ? "Las cinco tablas maestras y sus columnas esenciales fueron reconocidas." : "No se habilitará el staging hasta resolver las diferencias esenciales."}</AlertDescription></Alert>
        {compatibility.errors.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">{compatibility.errors.map((item) => <li key={item}>{item}</li>)}</ul>}
        {compatibility.warnings.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700">{compatibility.warnings.map((item) => <li key={item}>{item}</li>)}</ul>}
      </CardContent></Card>}

      {readerState && <Card><CardHeader><CardTitle>2. Elegir tabla</CardTitle><CardDescription>Se detectaron {readerState.tables.length} tablas reales en {file?.name}.</CardDescription></CardHeader><CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto]"><Select value={selectedTable} onValueChange={(value) => { setSelectedTable(value); setPreview([]); }}><SelectTrigger><SelectValue placeholder="Seleccionar tabla de Access" /></SelectTrigger><SelectContent>{readerState.tables.map((table) => { const item = getMapping(table.name); const label = item?.transform ? "Vista previa disponible" : item ? "Requiere definición" : "Auxiliar / sin mapeo"; return <SelectItem key={table.name} value={table.name}>{table.name} ({table.rows.toLocaleString("es-AR")}) · {label}</SelectItem>; })}</SelectContent></Select><Button disabled={!mapping?.transform} onClick={buildPreview}><Eye className="h-4 w-4" /> Generar vista previa</Button></div>
        <p className="text-xs text-muted-foreground">Clientes combina domicilios, localidades y provincias. Articulos combina rubros, marcas y proveedores. Ventas utiliza por ahora su cabecera; la integración con Detalle_Venta se incorporará después.</p>
        {selectedInfo && <div className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-3"><div><span className="text-muted-foreground">Registros:</span> <strong>{selectedInfo.rows.toLocaleString("es-AR")}</strong></div><div><span className="text-muted-foreground">Columnas:</span> <strong>{selectedInfo.columns.length}</strong></div><div><span className="text-muted-foreground">Destino:</span> <strong>{mapping?.targetTable || "No definido"}</strong></div></div>}
        {selectedTable && !mapping && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Tabla sin mapeo</AlertTitle><AlertDescription>La tabla fue detectada, pero todavía no tiene una transformación definida para el sistema nuevo.</AlertDescription></Alert>}
        {mapping && !mapping.transform && <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Requiere definición funcional</AlertTitle><AlertDescription>{mapping.module} fue identificado, pero su vista previa está bloqueada hasta definir las reglas de transformación.</AlertDescription></Alert>}
      </CardContent></Card>}

      {readerState && <Card><CardHeader><CardTitle>3. Simulación productiva de maestros</CardTitle><CardDescription>Carga staging aislado para el comercio seleccionado y valida el archivo completo.</CardDescription></CardHeader><CardContent className="space-y-4">
        <Alert><LockKeyhole className="h-4 w-4" /><AlertTitle>Destino bloqueado por ejecución</AlertTitle><AlertDescription>El servidor obtiene el comercio desde el migration_id. Los duplicados existentes se omiten y nunca se actualizan en esta versión.</AlertDescription></Alert>
        <Button disabled={migrationStatus !== "idle" || !compatibility?.compatible} onClick={prepareSimulation}>{migrationStatus === "staging" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{migrationStatus === "staging" ? "Cargando y simulando..." : "Preparar simulación completa"}</Button>
        {migrationId && <p className="break-all text-xs text-muted-foreground">Ejecución: {migrationId}</p>}
        {simulation && <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-bold">{simulation.total}</p></div>
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Listos</p><p className="text-2xl font-bold text-green-600">{simulation.validos}</p></div>
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Duplicados omitidos</p><p className="text-2xl font-bold text-amber-600">{simulation.omitidos}</p></div>
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Errores</p><p className="text-2xl font-bold text-destructive">{simulation.errores}</p></div>
        </div>}
        {simulation && <div className="flex flex-wrap justify-end gap-3">
          <Button disabled={simulation.errores > 0 || migrationStatus !== "simulated"} onClick={applyMigration}>{migrationStatus === "applying" && <Loader2 className="h-4 w-4 animate-spin" />}Aplicar maestros</Button>
          {migrationStatus === "applied" && <Button variant="destructive" onClick={revertMigration}><RotateCcw className="h-4 w-4" />Revertir ejecución</Button>}
        </div>}
        {migrationStatus === "applied" && <Alert><CheckCircle2 className="h-4 w-4" /><AlertTitle>Migración aplicada</AlertTitle><AlertDescription>Los maestros quedaron insertados. La reversión sigue disponible mientras no existan operaciones que los referencien.</AlertDescription></Alert>}
        {migrationStatus === "reverted" && <Alert><RotateCcw className="h-4 w-4" /><AlertTitle>Migración revertida</AlertTitle><AlertDescription>Se eliminaron los registros creados por esta ejecución; los datos anteriores del comercio no fueron modificados.</AlertDescription></Alert>}
      </CardContent></Card>}

      {preview.length > 0 && <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle>Vista previa: datos como quedarían en {mapping?.targetTable}</CardTitle><CardDescription>Primeros {preview.length} de {selectedInfo?.rows.toLocaleString("es-AR")} registros · destino: {comercio?.nombre_comercio}</CardDescription></div><Badge variant="outline" className="w-fit gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Solo vista previa</Badge></div></CardHeader><CardContent className="space-y-4">
        <Alert><Eye className="h-4 w-4" /><AlertTitle>Transformación en memoria</AlertTitle><AlertDescription>Los avisos muestran normalizaciones o datos incompletos detectados antes de preparar la simulación completa.</AlertDescription></Alert>
        <div className="max-h-[560px] overflow-auto rounded-md border"><Table><TableHeader><TableRow>{columns.map((column) => <TableHead key={column} className="whitespace-nowrap">{column}</TableHead>)}<TableHead>Avisos</TableHead></TableRow></TableHeader><TableBody>{preview.map((row, index) => <TableRow key={`${row.sourceId}-${index}`}>{columns.map((column) => <TableCell key={column} className="max-w-[260px] whitespace-nowrap text-xs">{displayValue(row.data[column])}</TableCell>)}<TableCell>{row.warnings.length ? <Popover><PopoverTrigger asChild><Button type="button" variant="destructive" size="sm" className="h-7 whitespace-nowrap px-2 text-xs"><AlertTriangle className="h-3.5 w-3.5" />{row.warnings.length} aviso(s)</Button></PopoverTrigger><PopoverContent align="end" className="w-80"><div className="space-y-3"><div><p className="font-semibold">Observaciones del registro</p><p className="text-xs text-muted-foreground">Origen Access: {row.sourceId}</p></div><ul className="space-y-2">{row.warnings.map((warning, warningIndex) => <li key={`${warning}-${warningIndex}`} className="flex items-start gap-2 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /><span>{warning}</span></li>)}</ul></div></PopoverContent></Popover> : <Badge variant="default">Válido</Badge>}</TableCell></TableRow>)}</TableBody></Table></div>
      </CardContent></Card>}
    </div>
  );
}
