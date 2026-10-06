// Compara la deuda de lint actual con HEAD para los archivos de este módulo.
import { ESLint } from 'eslint';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const changed = ['src/App.tsx', 'src/components/AppSidebar.tsx', 'src/config/parametrizacion.ts', 'src/config/moduleHelp.ts', 'src/types/cuenta-corriente.ts', 'src/components/FacturaImpresion.tsx', 'src/hooks/useClientes.ts'];
const added = ['src/pages/Distribucion.tsx', 'src/hooks/useDistribucion.ts', 'src/types/distribucion.ts', 'src/utils/distribucion.ts', 'src/utils/distribucionPdf.ts', 'src/utils/documentoPrint.ts', 'src/components/HojaRepartoImpresion.tsx', 'src/components/DistribucionRemitos.tsx', 'src/utils/remitoDistribucionPrint.ts', 'src/components/DistribucionHojaRuta.tsx', 'src/components/HojaRutaImpresion.tsx', 'src/hooks/useDistribucionMapa.ts', 'src/utils/distribucionRuta.ts'];
const eslint = new ESLint();
const results = await eslint.lintFiles('.');
const counts = rows => rows.reduce((a, r) => ({ errors: a.errors + r.errorCount, warnings: a.warnings + r.warningCount }), { errors: 0, warnings: 0 });
const current = counts(results);
const own = results.filter(r => [...changed, ...added].some(f => path.resolve(f) === r.filePath));
const original = [];
for (const file of changed) original.push(...await eslint.lintText(execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' }), { filePath: file }));
const previousOwn = counts(original), nowOwn = counts(own);
console.log(JSON.stringify({ current, head: { errors: current.errors - nowOwn.errors + previousOwn.errors, warnings: current.warnings - nowOwn.warnings + previousOwn.warnings }, changedFiles: nowOwn }, null, 2));
if (nowOwn.errors > previousOwn.errors || nowOwn.warnings > previousOwn.warnings) process.exitCode = 1;
