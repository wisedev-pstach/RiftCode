import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aggregateFolderStatuses} from '../src/renderer/src/folder-status';
import type {ChangedFile} from '../src/shared/contracts';
const file=(path:string,status:ChangedFile['status']):ChangedFile=>({path,status,additions:0,deletions:0});
test('aggregates actual added and modified descendants through every ancestor',()=>{
 const states=aggregateFolderStatuses([file('src/new.ts','added'),file('src/nested/edit.ts','modified'),file('new/only.ts','added'),file('edit/only.ts','modified')]);
 assert.deepEqual(states.get('src'),{label:'A/M',title:'Added and modified files'});
 assert.deepEqual(states.get('src/nested'),{label:'M',title:'Modified files'});
 assert.equal(states.get('new')?.label,'A');assert.equal(states.get('edit')?.label,'M');
 assert.equal(states.has('unchanged'),false);assert.equal(states.has('src/new.ts'),false);
});
test('preserves deleted renamed and untracked conventions without calling them modifications',()=>{
 const states=aggregateFolderStatuses([file('gone/a.ts','deleted'),file('move/a.ts','renamed'),file('untracked/a.ts','untracked'),file('mixed/a.ts','deleted'),file('mixed/b.ts','added')]);
 assert.deepEqual(states.get('gone'),{label:'D',title:'Deleted files'});
 assert.deepEqual(states.get('move'),{label:'R',title:'Renamed files'});
 assert.deepEqual(states.get('untracked'),{label:'U',title:'Untracked files'});
 assert.deepEqual(states.get('mixed'),{label:'A/D',title:'Added and deleted files'});
});
test('recomputing from matching files removes excluded and old comparison states',()=>{
 const files=[file('src/a.ts','added'),file('src/nested/m.ts','modified')];
 assert.equal(aggregateFolderStatuses(files.filter(f=>f.status==='added')).get('src')?.label,'A');
 assert.equal(aggregateFolderStatuses(files.slice(1)).get('src')?.label,'M');
 assert.equal(aggregateFolderStatuses([]).size,0);
});
