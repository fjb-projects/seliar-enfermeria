import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const baseline = path.join(root, '.tmp/efa-service-flow-qa/baseline');
const config = ts.readConfigFile(path.join(baseline,'tsconfig.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, baseline);
// Keep original resolution root and installed dependencies, overlay only tracked baseline sources/config.
const options = {...parsed.options, paths: {'@/*':['./src/*']}, pathsBasePath: root};
const host = ts.createCompilerHost(options);
const originalRead = host.readFile.bind(host), originalExists = host.fileExists.bind(host);
function overlay(file) {
 const rel = path.relative(root,file);
 if (rel.startsWith('src'+path.sep) || ['vite.config.ts','eslint.config.js'].includes(rel)) return path.join(baseline,rel);
 return file;
}
host.readFile = file => originalRead(overlay(file));
host.fileExists = file => originalExists(overlay(file));
const files = parsed.fileNames.map(file => path.join(root,path.relative(baseline,file)));
const program = ts.createProgram(files,options,host);
const diagnostics = ts.getPreEmitDiagnostics(program);
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
console.log('BASELINE_DIAGNOSTICS='+diagnostics.length);
process.exitCode=diagnostics.length?1:0;
