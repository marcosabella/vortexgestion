import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const code = ts.transpileModule(readFileSync('src/utils/fetchMasterRecords.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports });
const { fetchMasterRecords } = exports;
for (const total of [0,500,1003,21260]) {
  const rows = Array.from({length:total},(_,id)=>({id}));let calls=0;
  const loaded = await fetchMasterRecords((from,to)=>{calls++;return Promise.resolve({data:rows.slice(from,to+1),count:total,error:null});});
  assert.equal(loaded.length,total);assert.equal(new Set(loaded.map(r=>r.id)).size,total);assert.equal(calls,Math.max(1,Math.ceil(total/500)));
}
await assert.rejects(fetchMasterRecords((from)=>Promise.resolve({data:Array(500).fill({}),count:from?1002:1003,error:null})));
await assert.rejects(fetchMasterRecords(()=>Promise.resolve({data:[],count:1003,error:null})));
await assert.rejects(fetchMasterRecords(()=>Promise.resolve({data:null,count:null,error:new Error('fallo de red')})));
console.log('OK maestros: 21.260 filas completas, paginas exactas/vacias, rechazo de cambios, truncamiento y errores');
