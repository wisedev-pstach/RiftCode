import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceLinks } from '../src/shared/source-links.js';

test('exact known paths with spaces, columns, hashes and absolute in-repo paths', () => {
 const text='Review src/my file.ts:12:3 and src/a.ts#L4-L8; /repo/src/a.ts:9';
 const links=sourceLinks(text,['src/my file.ts','src/a.ts'],'/repo');
 assert.deepEqual(links.map(({path,line,column,endLine})=>({path,line,column,endLine})),[
  {path:'src/my file.ts',line:12,column:3,endLine:undefined},
  {path:'src/a.ts',line:4,column:1,endLine:8},
  {path:'src/a.ts',line:9,column:1,endLine:undefined}
 ]);
 assert.equal(text.slice(links[0].start,links[0].end),'src/my file.ts:12:3');
});
test('reject URLs, traversal, outside absolute paths, zero/huge locations and embedded false matches', () => {
 for (const text of ['https://host/src/a.ts:1','../src/a.ts:1','/outside/src/a.ts:1','xsrc/a.ts:1','src/a.ts:0','src/a.ts:999999999999999','src/a.ts:2:0','src/a.ts:2abc','src/a.ts\n:2']) {
  assert.deepEqual(sourceLinks(text,['src/a.ts'],'/repo'),[],text);
 }
});
test('same-OS Windows paths resolve without accepting foreign absolute paths', () => {
 assert.equal(sourceLinks('C:\\repo\\src\\a.ts:3:2',['src/a.ts'],'C:\\repo')[0]?.path,'src/a.ts');
 assert.deepEqual(sourceLinks('D:\\other\\src\\a.ts:3',['src/a.ts'],'C:\\repo'),[]);
});
