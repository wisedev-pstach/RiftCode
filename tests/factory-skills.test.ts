import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtemp, mkdir, writeFile, symlink, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {loadFactorySkill, resolveFactorySkillPath, parseFactorySkill, buildFactoryPrompt, MAX_FACTORY_PROMPT_BYTES, FACTORY_SKILLS} from '../src/main/factory/skills';
const resourcesRoot=fileURLToPath(new URL('../resources',import.meta.url));
test('all five canonical bundled skills have portable validated frontmatter',async()=>{
  assert.equal(FACTORY_SKILLS.length,5);
  for(const entry of FACTORY_SKILLS){
    const skill=await loadFactorySkill(resourcesRoot,entry.id);
    assert.equal(skill.id,entry.id);
    assert.match(skill.body,/permission|consent/i);
    assert.doesNotMatch(skill.body,/Hermes|~\/|\/opt\/|allowedTools|skip-permissions|\.claude\/|\.codex\//i);
    assert.match(skill.body,/Blocked/);
  }
});

test('resolver rejects traversal, unknown IDs and relative roots',async()=>{
  for(const id of ['../factory-requirements','factory-requirements/../../x','/etc/passwd','factory-unknown'])await assert.rejects(resolveFactorySkillPath(resourcesRoot,id),/Unknown/);
  await assert.rejects(resolveFactorySkillPath('resources','factory-requirements'),/absolute/);
});
test('resolver rejects symlink escape from packaged resources',async()=>{
  const scratch=await mkdtemp(join(tmpdir(),'factory-skills-'));
  try{
    const root=join(scratch,'assets');await mkdir(join(root,'factory-skills','factory-requirements'),{recursive:true});
    const outside=join(scratch,'outside.md');await writeFile(outside,'not bundled');
    await symlink(outside,join(root,'factory-skills','factory-requirements','SKILL.md'));
    await assert.rejects(resolveFactorySkillPath(root,'factory-requirements'),/escapes/);
  }finally{await rm(scratch,{recursive:true,force:true});}
});
test('frontmatter rejects identity mismatch, extra metadata and oversized body',()=>{
  for(const text of ['# no frontmatter','---\nname: wrong\ndescription: Wrong\n---\nbody','---\nname: factory-requirements\ndescription: Okay\ntools: all\n---\nbody','x'.repeat(32769)])assert.throws(()=>parseFactorySkill('factory-requirements',text));
});
test('fallback prompt always includes canonical skill and every bounded context section',async()=>{
  const skill=await loadFactorySkill(resourcesRoot,'factory-implement-task');
  const context={acceptedRequirements:'accepted requirements v1',plan:'approved plan v2',taskSpec:{id:'task-1',allowedPaths:['src/example.ts']},dependencySummaries:[{id:'prerequisite',status:'passed'}],testReceipts:[{id:'fixture-receipt',synthetic:true}]};
  const prompt=buildFactoryPrompt(skill,context);
  assert.ok(prompt.includes(skill.body));assert.ok(prompt.includes(JSON.stringify(context)));
  assert.match(prompt,/not permission/);assert.throws(()=>buildFactoryPrompt(skill,{...context,plan:'x'.repeat(MAX_FACTORY_PROMPT_BYTES)}),/bounded/);
  assert.throws(()=>buildFactoryPrompt(skill,{...context,testReceipts:undefined} as never),/Incomplete/);
});

test('loader rejects even in-root symlink skill files before reading',async()=>{
 const scratch=await mkdtemp(join(process.env.TMPDIR??tmpdir(),'factory-skills-'));
 try{
  const directory=join(scratch,'factory-skills','factory-requirements');await mkdir(directory,{recursive:true});
  await writeFile(join(scratch,'real.md'),'---\nname: factory-requirements\ndescription: Fixture\n---\nbody');
  await symlink(join(scratch,'real.md'),join(directory,'SKILL.md'));
  await assert.rejects(loadFactorySkill(scratch,'factory-requirements'),/regular|symlink|linked/);
 }finally{await rm(scratch,{recursive:true,force:true});}
});

test('loader bounds skill bytes and rejects non-regular FIFO without blocking',async()=>{
 const scratch=await mkdtemp(join(process.env.TMPDIR??tmpdir(),'factory-skills-'));
 try{
  const directory=join(scratch,'factory-skills','factory-requirements');await mkdir(directory,{recursive:true});const file=join(directory,'SKILL.md');
  const header='---\nname: factory-requirements\ndescription: Fixture\n---\n';
  await writeFile(file,header+'x'.repeat(32768-Buffer.byteLength(header)));assert.ok((await loadFactorySkill(scratch,'factory-requirements')).body);
  await writeFile(file,header+'x'.repeat(32769-Buffer.byteLength(header)));await assert.rejects(loadFactorySkill(scratch,'factory-requirements'),/too large/);
  await rm(file);execFileSync('mkfifo',[file]);await assert.rejects(loadFactorySkill(scratch,'factory-requirements'),/regular/);
 }finally{await rm(scratch,{recursive:true,force:true});}
});
