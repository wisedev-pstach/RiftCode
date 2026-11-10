import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=(path:string)=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
test('official version is 0.8.1 across package, lock and display manifest',()=>{
 assert.equal(read('package.json').version,'0.8.1');
 assert.equal(read('package-lock.json').version,'0.8.1');
 assert.equal(read('package-lock.json').packages[''].version,'0.8.1');
 assert.equal(read('version.json').version,'0.8.1');
});
test('production updater recognizes the official version above old release and preview',()=>{
 const source=readFileSync(new URL('../src/main/index.ts',import.meta.url),'utf8');
 const ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
 const names=['versionParts','isNewerVersion'];
 const functions=ast.statements.filter((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&!!node.name&&names.includes(node.name.text));
 assert.equal(functions.length,2);
 const compiled=ts.transpileModule(functions.map(node=>node.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const newer=vm.runInNewContext(compiled+'\nisNewerVersion') as (candidate:string,current:string)=>boolean;
 const version=read('version.json').version;
 assert.equal(newer(version,'0.7.3'),true);
 assert.equal(newer(version,'0.8.0'),true);
 assert.equal(newer(version,version),false);
 assert.equal(newer('0.7.3',version),false);
 assert.ok(source.includes('https://raw.githubusercontent.com/wisedev-pstach/RiftCode/main/version.json'));
 assert.ok(source.includes('https://raw.githubusercontent.com/wisedev-pstach/RiftCode/main/install.ps1'));
 assert.ok(source.includes('https://raw.githubusercontent.com/wisedev-pstach/RiftCode/main/install.sh'));
});
