import { ESLint } from 'eslint';
import { execFileSync } from 'node:child_process';
const git=(args)=>execFileSync('git',args,{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const tracked=git(['diff','--name-only']),untracked=git(['ls-files','--others','--exclude-standard']);
const files=[...tracked,...untracked].filter(f=>/\.(tsx?|mjs)$/.test(f)&&!f.startsWith('supabase/functions/'));
const lint=new ESLint();let increases=0;
for(const file of files){
 const [current]=await lint.lintFiles([file]);let baseline={errorCount:0,warningCount:0};
 if(tracked.includes(file)){
  const original=execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'});
  [baseline]=await lint.lintText(original,{filePath:file});
 }
 if(current.errorCount>baseline.errorCount||current.warningCount>baseline.warningCount){
  increases++;console.error(file,{before:[baseline.errorCount,baseline.warningCount],after:[current.errorCount,current.warningCount]});
  for(const m of current.messages)console.error(m.line,m.ruleId,m.message);
 }
}
if(increases)process.exitCode=1;else console.log('OK lint: '+files.length+' archivos modificados/nuevos sin aumentar errores ni advertencias respecto de HEAD.');
