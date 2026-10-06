// Compara TypeScript con HEAD sin editar archivos ni generar artefactos.
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const config = ts.readConfigFile('tsconfig.app.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const changed = ['src/App.tsx', 'src/components/AppSidebar.tsx', 'src/config/parametrizacion.ts', 'src/config/moduleHelp.ts', 'src/types/cuenta-corriente.ts', 'src/components/FacturaImpresion.tsx', 'src/hooks/useClientes.ts'];
const normalize = f => path.resolve(f).replaceAll('\\', '/');
const originals = new Map(changed.map(file => [normalize(file), execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' })]));
const added = new Set(['src/pages/Distribucion.tsx', 'src/hooks/useDistribucion.ts', 'src/types/distribucion.ts', 'src/utils/distribucion.ts', 'src/utils/distribucionPdf.ts', 'src/utils/documentoPrint.ts', 'src/components/HojaRepartoImpresion.tsx', 'src/components/DistribucionRemitos.tsx', 'src/utils/remitoDistribucionPrint.ts', 'src/components/DistribucionHojaRuta.tsx', 'src/components/HojaRutaImpresion.tsx', 'src/hooks/useDistribucionMapa.ts', 'src/utils/distribucionRuta.ts'].map(normalize));
function diagnostics(baseline) {
  const host = ts.createCompilerHost(parsed.options);
  const read = host.readFile;
  if (baseline) host.readFile = file => originals.get(normalize(file)) ?? read(file);
  const program = ts.createProgram(parsed.fileNames.filter(f => !baseline || !added.has(normalize(f))), { ...parsed.options, noEmit: true, incremental: false }, host);
  return ts.getPreEmitDiagnostics(program).map(d => ({ file: d.file ? normalize(d.file.fileName) : '', code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, '\n') }));
}
const before = diagnostics(true), after = diagnostics(false);
const previous = new Set(before.map(d => JSON.stringify(d)));
const introduced = after.filter(d => !previous.has(JSON.stringify(d)));
console.log(`TypeScript app: ${before.length} diagnósticos en HEAD; ${after.length} actuales; ${introduced.length} nuevos.`);
if (introduced.length) { console.error(introduced); process.exitCode = 1; }
