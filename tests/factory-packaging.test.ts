import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {FACTORY_SKILLS,loadFactorySkill} from '../src/main/factory/skills';

test('every canonical portable factory skill is included in native packaged resources',async()=>{
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 assert.ok(pkg.build.extraResources?.some((entry:{from:string;to:string})=>entry.from==='resources/factory-skills'&&entry.to==='factory-skills'),'Native packages must include portable skills outside app.asar at process.resourcesPath/factory-skills');
 for(const skill of FACTORY_SKILLS){const loaded=await loadFactorySkill(join(process.cwd(),'resources'),skill.id);assert.equal(loaded.id,skill.id);assert.ok(loaded.body.length>100);}
});
