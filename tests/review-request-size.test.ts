import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildTerminalReview,type ReviewContext} from '../src/shared/review-request';
const context:ReviewContext={repository:'synthetic',comparison:'captured comparison',startRevision:'a'.repeat(40),endRevision:'b'.repeat(40),files:Array.from({length:5000},(_,i)=>`src/long/path/file-${i}.ts`),currentPath:'src/odd\n"$(touch nope).ts',notes:'',projectContext:''};
test('large complete comparison uses exact endpoints instead of enumerating paths',()=>{
 for(const endRevision of [context.endRevision,null]){
  const text=buildTerminalReview({...context,endRevision},'comparison','Check all changes','professional');
  assert.ok(Buffer.byteLength(text)<=32768);assert.ok(text.includes(context.startRevision));assert.ok(text.includes(endRevision??'working tree'));
  assert.match(text,/complete comparison/);assert.doesNotMatch(text,/file-4999/);
  if(endRevision===null){assert.match(text,/index/);assert.match(text,/untracked/);assert.match(text,/working.tree/);}
  else assert.ok(text.includes(endRevision));
  assert.doesNotMatch(text,/HEAD/);
 }
});
test('oversized comparisons reject unresolved revisions instead of claiming an exact captured scope',()=>{
 for(const revision of ['HEAD','main','origin/main','abc123','a'.repeat(39),'a'.repeat(41),'b'.repeat(63),'b'.repeat(65)]){
  for(const endpoints of [{startRevision:revision,endRevision:null},{startRevision:context.startRevision,endRevision:revision}]){
   assert.throws(()=>buildTerminalReview({...context,...endpoints},'comparison','','professional'),/immutable.*revision.*reload/i);
  }
 }
 for(const length of [40,64]){
  const startRevision='a'.repeat(length),endRevision='b'.repeat(length);
  const request=buildTerminalReview({...context,startRevision,endRevision},'comparison','','professional');
  assert.ok(request.includes(`Start revision: ${startRevision}\n`));assert.ok(request.includes(`End revision: ${endRevision}\n`));
 }
 // Legacy small/file/notes briefs retain explicit scope rather than reconstructing it.
 const legacy={...context,startRevision:'HEAD',endRevision:'abc123',files:['src/only.ts'],notes:'selected note'};
 assert.match(buildTerminalReview(legacy,'comparison','','professional'),/- src\/only.ts/);
 assert.doesNotThrow(()=>buildTerminalReview(legacy,'file','x'.repeat(33000),'professional'));
 assert.doesNotThrow(()=>buildTerminalReview(legacy,'notes','x'.repeat(33000),'professional'));
});
test('control-code filename data survives ordinary PTY sanitization without changing scope',()=>{
 const path='src/a\u0085b.ts';const request=buildTerminalReview({...context,currentPath:path},'file','','professional');assert.ok(request.includes('"src/a\\u0085b.ts"'));assert.doesNotMatch(request,/\u0085/);
});
test('file paths are quoted as literal data; notes scope never becomes complete comparison',()=>{
 const text=buildTerminalReview(context,'file','','professional');assert.ok(text.includes(JSON.stringify(context.currentPath)));assert.doesNotMatch(text,/file-4999|complete comparison/);
 const notes='src/only.ts:12 — selected only';const result=buildTerminalReview({...context,notes},'notes','','professional');assert.ok(result.includes(notes));assert.doesNotMatch(result,/file-4999|complete comparison/);
});
