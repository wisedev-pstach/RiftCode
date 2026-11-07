import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('feature version is 0.8.0 across package, lock and display manifest',()=>{
 const read=(path:string)=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
 assert.equal(read('package.json').version,'0.8.0');
 assert.equal(read('package-lock.json').version,'0.8.0');
 assert.equal(read('package-lock.json').packages[''].version,'0.8.0');
 assert.equal(read('version.json').version,'0.8.0');
});
