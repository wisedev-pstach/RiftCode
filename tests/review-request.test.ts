import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildTerminalReview,type ReviewContext} from '../src/shared/review-request';
const context:ReviewContext={repository:'fixture',comparison:'feature → main',startRevision:'abc123',endRevision:'def456',files:['src/a.ts','src/b.ts'],currentPath:'src/b.ts',notes:'src/a.ts:12 — check boundary',projectContext:'Do not change public APIs'};
test('review requests capture actual comparison, chosen scope, notes and instructions without fabricating results',()=>{
 const request=buildTerminalReview(context,'file','Check errors','professional');
 assert.match(request,/abc123/);assert.match(request,/def456/);assert.match(request,/feature → main/);assert.match(request,/Scope: current file/);
 assert.match(request,/- src\/b.ts/);assert.doesNotMatch(request,/- src\/a.ts/);assert.match(request,/Check errors/);assert.match(request,/Do not change public APIs/);assert.match(request,/Do not edit files/);assert.match(request,/file:line/);
 const notes=buildTerminalReview(context,'notes','','honest');assert.match(notes,/src\/a.ts:12 — check boundary/);assert.match(notes,/Scope: selected notes/);
 assert.throws(()=>buildTerminalReview({...context,notes:''},'notes','','professional'),/Select notes/);
 assert.throws(()=>buildTerminalReview({...context,currentPath:''},'file','','professional'),/Select a file/);
 assert.throws(()=>buildTerminalReview(context,'comparison','x'.repeat(33000),'professional'),/32 KiB/);
});
