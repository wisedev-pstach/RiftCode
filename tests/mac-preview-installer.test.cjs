'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const asar=require('@electron/asar');
const plist=require('plist');
const helper=path.resolve(__dirname,'../scripts/preview-deploy-mac.cjs');
const scratch=process.env.TMPDIR || os.tmpdir();
async function fixture(t) {
  const root=fs.mkdtempSync(path.join(scratch,'rift-preview-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const home=path.join(root,'Home with spaces; literal'); fs.mkdirSync(home);
  const source=path.join(root,'source'); fs.mkdirSync(source);
  fs.writeFileSync(path.join(source,'package.json'),JSON.stringify({name:'rift',version:'0.8.0'}));
  const app=path.join(source,'release/mac-arm64/Rift.app');
  await bundle(app,root,'0.8.0');
  return {root,home,source,app,destination:path.join(home,'Applications/Rift.app')};
}
async function bundle(app,root,version='0.7.0') {
  fs.mkdirSync(path.join(app,'Contents/MacOS'),{recursive:true});
  fs.mkdirSync(path.join(app,'Contents/Resources'),{recursive:true});
  fs.writeFileSync(path.join(app,'Contents/MacOS/Rift'),'fixture-not-executed',{mode:0o755});
  fs.writeFileSync(path.join(app,'Contents/Info.plist'),plist.build({CFBundleIdentifier:'dev.wise.rift',CFBundleExecutable:'Rift'}));
  const payload=fs.mkdtempSync(path.join(root,'payload-'));
  const manifest=path.join(payload,'package.json');
  // Historical identity-bearing fields from ec48372 (0.7.3); builder strips build.
  fs.writeFileSync(manifest,JSON.stringify({name:'rift',main:'app-out/main/index.js',version,build:{appId:'dev.wise.rift',productName:'Rift'},scripts:{build:'unused'},devDependencies:{electron:'^43.4.1'}}));
  const transform=require('app-builder-lib/out/fileTransformer').createTransformer(payload,{},null);
  fs.writeFileSync(manifest,await transform(manifest));
  const packed=JSON.parse(fs.readFileSync(manifest,'utf8'));
  assert.equal(packed.build,undefined); assert.equal(packed.devDependencies,undefined);
  await asar.createPackage(payload,path.join(app,'Contents/Resources/app.asar'));
  const framework=path.join(app,'Contents/Frameworks/Example.framework');
  fs.mkdirSync(path.join(framework,'Versions/A/Resources'),{recursive:true});
  fs.writeFileSync(path.join(framework,'Versions/A/Example'),'framework');
  fs.writeFileSync(path.join(framework,'Versions/A/Resources/value'),'resource');
  fs.symlinkSync('A',path.join(framework,'Versions/Current'));
  fs.symlinkSync('Versions/Current/Example',path.join(framework,'Example'));
  fs.symlinkSync('Versions/Current/Resources',path.join(framework,'Resources'));
}
function runtime(extra={}) {
  return {asar,plist,platform:'darwin',running:()=>false,log:()=>{},move:(from,to)=>{
    const result=spawnSync('/usr/bin/mv',['--no-copy','--no-clobber','--no-target-directory',from,to],{encoding:'utf8'});
    if(result.status!==0 || fs.existsSync(from)) throw new Error('exclusive fixture move refused');
  },...extra};
}
test('fresh preview installs real ASAR bundle and preserves relative framework links after source cleanup',async t=>{
  const f=await fixture(t);
  assert.ok(fs.existsSync(helper),'standalone deployment helper must exist');
  const result=require(helper).deploy(f.source,f.home,runtime());
  assert.equal(result.destination,f.destination);
  fs.rmSync(f.source,{recursive:true});
  const framework=path.join(f.destination,'Contents/Frameworks/Example.framework');
  assert.equal(fs.readlinkSync(path.join(framework,'Versions/Current')),'A');
  assert.equal(fs.readlinkSync(path.join(framework,'Example')),'Versions/Current/Example');
  assert.equal(fs.readFileSync(path.join(framework,'Resources/value'),'utf8'),'resource');
});

function executable(file,text) { fs.writeFileSync(file,text,{mode:0o755}); }
function checked(file,args,options={}) {
  const r=spawnSync(file,args,{encoding:'utf8',...options});
  assert.equal(r.status,0,r.stderr); return r.stdout.trim();
}
async function bootstrapFixture(t) {
  const f=await fixture(t);
  const bin=path.join(f.root,'bin'); fs.mkdirSync(bin);
  const repo=path.join(f.root,'repo'); fs.mkdirSync(repo);
  fs.mkdirSync(path.join(repo,'scripts')); fs.mkdirSync(path.join(repo,'build'));
  fs.copyFileSync(helper,path.join(repo,'scripts/preview-deploy-mac.cjs'));
  fs.writeFileSync(path.join(repo,'build/before-pack.cjs'),'');
  fs.writeFileSync(path.join(repo,'package.json'),JSON.stringify({name:'rift',version:'0.8.0',build:{beforePack:'build/before-pack.cjs'}}));
  checked('/usr/bin/git',['init','-q',repo]);
  checked('/usr/bin/git',['-C',repo,'add','.']);
  checked('/usr/bin/git',['-C',repo,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture']);
  checked('/usr/bin/git',['-C',repo,'branch','feat/terminal-ai-workspace']);
  const sha=checked('/usr/bin/git',['-C',repo,'rev-parse','HEAD']);
  const trace=path.join(f.root,'trace');
  const common=`const fs=require('node:fs'); const {spawnSync}=require('node:child_process'); const args=process.argv.slice(2); fs.appendFileSync(${JSON.stringify(trace)},JSON.stringify([require('node:path').basename(process.argv[1]),...args])+'\\n');\n`;
  const shebang=`#!${process.execPath}\n`;
  executable(path.join(bin,'uname'),"#!/bin/sh\nprintf '%s\\n' Darwin\n");
  executable(path.join(bin,'git'),shebang+common+`if(args.at(-1)==='https://github.com/wisedev-pstach/RiftCode.git') args[args.length-1]=${JSON.stringify(repo)}; const r=spawnSync('/usr/bin/git',args,{stdio:'inherit'}); process.exit(r.status ?? 1);`);
  executable(path.join(bin,'npm'),shebang+common+`if(args[0]==='run') {if(process.env.FIXTURE_BUILD_FAIL)process.exit(31); fs.mkdirSync('release/mac-arm64',{recursive:true}); fs.cpSync(${JSON.stringify(f.app)},'release/mac-arm64/Rift.app',{recursive:true,verbatimSymlinks:true});}`);
  executable(path.join(bin,'node'),shebang+common+`if(args[0]==='node_modules/electron/install.js')process.exit(0); if(args[0]==='scripts/preview-deploy-mac.cjs') {require(require('node:path').resolve(args[0])).deploy(args[1],process.env.HOME,{platform:'darwin',asar:require(${JSON.stringify(require.resolve('@electron/asar'))}),plist:require(${JSON.stringify(require.resolve('plist'))}),running:()=>false,move:(from,to)=>{const r=spawnSync('/usr/bin/mv',['--no-copy','--no-clobber','--no-target-directory',from,to]);if(r.status!==0||fs.existsSync(from))throw Error('fixture move refused');}}); process.exit(0);} const r=spawnSync(${JSON.stringify(process.execPath)},args,{stdio:'inherit'});process.exit(r.status ?? 1);`);
  const tmp=path.join(f.root,'temp with spaces'); fs.mkdirSync(tmp);
  const env={...process.env,HOME:f.home,TMPDIR:tmp,PATH:bin+':'+process.env.PATH};
  return {...f,bin,repo,sha,trace,tmp,env};
}
// Adapters are restricted to imports in this test process or fixture PATH commands.
const script=path.resolve(__dirname,'../scripts/install-preview-mac.sh');
test('bootstrap checks out exact requested commit, builds safely, installs and cleans owned checkout',async t=>{
  const f=await bootstrapFixture(t);
  const r=spawnSync('/bin/bash',[script,'--ref',f.sha],{encoding:'utf8',env:f.env});
  assert.equal(r.status,0,r.stderr);
  assert.ok(fs.existsSync(f.destination));
  assert.deepEqual(fs.readdirSync(f.tmp),[],'owned checkout must be removed');
  const calls=fs.readFileSync(f.trace,'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(calls.some(a=>a.includes('https://github.com/wisedev-pstach/RiftCode.git')));
  assert.ok(calls.some(a=>a.includes('fetch') && a.at(-1)===f.sha));
  assert.ok(calls.some(a=>JSON.stringify(a)===JSON.stringify(['npm','ci','--ignore-scripts','--no-audit','--no-fund'])));
  assert.ok(calls.some(a=>a[0]==='node' && a[1]==='node_modules/electron/install.js'));
  assert.ok(!calls.some(a=>a.includes('main')));
});

test('deployment resolves ASAR and plist from the actual installed hoisted dependency tree',async t=>{
  const f=await fixture(t);
  fs.symlinkSync(path.resolve(__dirname,'../node_modules'),path.join(f.source,'node_modules'),'dir');
  const adapters=runtime();delete adapters.asar;delete adapters.plist;
  require(helper).deploy(f.source,f.home,adapters);
  assert.ok(fs.existsSync(f.destination));
});

test('streamable bootstrap exists and rejects non-macOS before cloning',t=>{
  const script=path.resolve(__dirname,'../scripts/install-preview-mac.sh');
  assert.ok(fs.existsSync(script),'standalone bootstrap must exist');
  const r=spawnSync('/bin/bash',[script],{encoding:'utf8',env:{...process.env,PATH:'/usr/bin:/bin'}});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/macOS/);
});

test('recognized stripped legacy bundle updates twice, keeps each previous backup and leaves settings/CLI untouched',async t=>{
  const f=await fixture(t); await bundle(f.destination,f.root);
  const settings=path.join(f.home,'Library/Application Support/Rift/settings.json');
  fs.mkdirSync(path.dirname(settings),{recursive:true}); fs.writeFileSync(settings,'private settings');
  const cli=path.join(f.home,'.local/bin/rift'); fs.mkdirSync(path.dirname(cli),{recursive:true}); fs.symlinkSync(f.destination,cli);
  const oldArchive=fs.readFileSync(path.join(f.destination,'Contents/Resources/app.asar'));
  const first=require(helper).deploy(f.source,f.home,runtime());
  assert.deepEqual(fs.readFileSync(path.join(first.backup,'Contents/Resources/app.asar')),oldArchive);
  const second=require(helper).deploy(f.source,f.home,runtime());
  assert.notEqual(second.backup,first.backup);
  assert.ok(fs.existsSync(first.backup)); assert.ok(fs.existsSync(second.backup));
  assert.equal(fs.readFileSync(settings,'utf8'),'private settings');
  assert.equal(fs.readlinkSync(cli),f.destination);
});

for(const failure of ['native identity','archive identity','executable symlink','destination symlink','ancestor symlink','running','existing lock','fresh wrong version','ambiguous build']) {
  test(`${failure} refuses replacement and leaves unrelated files unchanged`,async t=>{
    const f=await fixture(t); await bundle(f.destination,f.root);
    const marker=path.join(f.destination,'do-not-change'); fs.writeFileSync(marker,'original');
    let adapters={};
    if(failure==='native identity') fs.writeFileSync(path.join(f.destination,'Contents/Info.plist'),plist.build({CFBundleIdentifier:'other.app',CFBundleExecutable:'Rift'}));
    if(failure==='archive identity') {
      const payload=path.join(f.root,'wrong-payload'); fs.mkdirSync(payload);
      fs.writeFileSync(path.join(payload,'package.json'),JSON.stringify({name:'rift',main:'app-out/main/index.js',build:{appId:'unrelated.app'}}));
      await asar.createPackage(payload,path.join(f.destination,'Contents/Resources/app.asar'));
    }
    if(failure==='executable symlink') {
      fs.unlinkSync(path.join(f.destination,'Contents/MacOS/Rift'));
      fs.symlinkSync(marker,path.join(f.destination,'Contents/MacOS/Rift'));
    }
    let saved=f.destination;
    if(failure==='destination symlink') {saved=path.join(f.root,'unrelated.app');fs.renameSync(f.destination,saved);fs.symlinkSync(saved,f.destination);}
    if(failure==='ancestor symlink') {const apps=path.dirname(f.destination);const moved=path.join(f.root,'unrelated-applications');fs.renameSync(apps,moved);fs.symlinkSync(moved,apps);saved=path.join(moved,'Rift.app');}
    if(failure==='running') adapters={running:()=>true};
    if(failure==='existing lock') fs.mkdirSync(path.join(f.home,'Applications/.Rift-preview.lock'));
    if(failure==='fresh wrong version') {fs.rmSync(f.app,{recursive:true});await bundle(f.app,f.root,'0.7.0');}
    if(failure==='ambiguous build') await bundle(path.join(f.source,'release/mac/Rift.app'),f.root,'0.8.0');
    assert.throws(()=>require(helper).deploy(f.source,f.home,runtime(adapters)));
    assert.equal(fs.readFileSync(path.join(saved,'do-not-change'),'utf8'),'original');
    assert.equal(fs.readdirSync(path.join(f.home,'Applications')).filter(n=>n.startsWith('.Rift.previous-')).length,0);
  });
}

test('promotion failure rolls the intact old bundle back without deleting its owned backup directory',async t=>{
  const f=await fixture(t); await bundle(f.destination,f.root);
  fs.writeFileSync(path.join(f.destination,'old'),'original');
  const base=runtime(); let count=0;
  assert.throws(()=>require(helper).deploy(f.source,f.home,runtime({move:(from,to)=>{if(++count===2)throw Error('injected promotion failure');base.move(from,to);}})),/injected promotion failure/);
  assert.equal(fs.readFileSync(path.join(f.destination,'old'),'utf8'),'original');
  assert.equal(fs.readdirSync(path.dirname(f.destination)).filter(n=>n.startsWith('.Rift.previous-')).length,1);
  assert.ok(!fs.readdirSync(path.dirname(f.destination)).some(n=>n.startsWith('.Rift-preview-stage-')));
});

for(const populated of [false,true]) test(`late ${populated?'populated':'empty'} target is not overwritten by promotion or rollback`,async t=>{
  const f=await fixture(t); await bundle(f.destination,f.root);
  fs.writeFileSync(path.join(f.destination,'old'),'previous');
  const base=runtime();let count=0;let inode;let backup;
  assert.throws(()=>require(helper).deploy(f.source,f.home,runtime({move:(from,to)=>{
    if(++count===1)backup=to;
    if(count===2){fs.mkdirSync(f.destination);if(populated)fs.writeFileSync(path.join(f.destination,'unrelated'),'unrelated');inode=fs.statSync(f.destination).ino;}
    base.move(from,to);
  }})),/Rollback refused.*Previous Rift retained/);
  assert.equal(fs.statSync(f.destination).ino,inode);
  assert.equal(fs.readFileSync(path.join(backup,'old'),'utf8'),'previous');
  assert.deepEqual(fs.readdirSync(f.destination),populated?['unrelated']:[]);
  assert.ok(!fs.existsSync(path.join(path.dirname(f.destination),'.Rift-preview.lock')));
});

test('a target appearing only during rollback is never overwritten',async t=>{
  const f=await fixture(t);await bundle(f.destination,f.root);
  const base=runtime();let count=0;let inode;let backup;
  assert.throws(()=>require(helper).deploy(f.source,f.home,runtime({move:(from,to)=>{
    ++count;if(count===1)backup=to;
    if(count===2)throw Error('promotion failed');
    if(count===3){fs.mkdirSync(f.destination);inode=fs.statSync(f.destination).ino;}
    base.move(from,to);
  }})),/Rollback refused/);
  assert.equal(fs.statSync(f.destination).ino,inode);assert.ok(fs.existsSync(backup));
});

test('build failure leaves the existing application intact and cleans only the owned checkout',async t=>{
  const f=await bootstrapFixture(t);await bundle(f.destination,f.root);
  const original=fs.readFileSync(path.join(f.destination,'Contents/Resources/app.asar'));
  const r=spawnSync('/bin/bash',[script],{encoding:'utf8',env:{...f.env,FIXTURE_BUILD_FAIL:'1'}});
  assert.equal(r.status,31,r.stderr);
  assert.deepEqual(fs.readFileSync(path.join(f.destination,'Contents/Resources/app.asar')),original);
  assert.deepEqual(fs.readdirSync(f.tmp),[]);
});

test('default bootstrap fetches the feature branch, never main',async t=>{
  const f=await bootstrapFixture(t);
  const r=spawnSync('/bin/bash',[script],{encoding:'utf8',env:f.env});
  assert.equal(r.status,0,r.stderr);
  const calls=fs.readFileSync(f.trace,'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(calls.some(a=>a.includes('fetch')&&a.at(-1)==='feat/terminal-ai-workspace'));
});

test('malformed or unrelated refs are refused without any git/build operations',async t=>{
  const f=await bootstrapFixture(t);
  for(const ref of ['main','HEAD','abc123','A'.repeat(40),'--upload-pack=evil','a; touch marker']) {
    const r=spawnSync('/bin/bash',[script,'--ref',ref],{encoding:'utf8',env:f.env});
    assert.notEqual(r.status,0);assert.match(r.stderr,/Ref must be/);
  }
  assert.ok(!fs.existsSync(f.trace));assert.ok(!fs.existsSync(f.destination));
});

test('deployment verifies the exact installed bundle before reporting success',async t=>{
  const f=await fixture(t);await bundle(f.destination,f.root);
  const base=runtime();const messages=[];
  assert.throws(()=>require(helper).deploy(f.source,f.home,runtime({log:m=>messages.push(m),move:(from,to)=>{
    base.move(from,to);
    if(to===f.destination)fs.writeFileSync(path.join(to,'Contents/Info.plist'),plist.build({CFBundleIdentifier:'corrupted',CFBundleExecutable:'Rift'}));
  }})),/identity.*Previous Rift retained/);
  assert.equal(messages.length,0);
});

test('changed valid destination content during staging is refused before backup',async t=>{
  const f=await fixture(t);await bundle(f.destination,f.root);
  const marker=path.join(f.destination,'keep');fs.writeFileSync(marker,'old');
  let probes=0;
  assert.throws(()=>require(helper).deploy(f.source,f.home,runtime({running:()=>{
    if(++probes===2)fs.writeFileSync(marker,'new');return false;
  }})),/changed/);
  assert.equal(fs.readFileSync(marker,'utf8'),'new');
  assert.ok(!fs.readdirSync(path.dirname(f.destination)).some(n=>n.startsWith('.Rift.previous-')));
});

test('a different valid Rift arriving during staging is not replaced',async t=>{
  const f=await fixture(t);await bundle(f.destination,f.root);
  const replacement=path.join(f.root,'new-valid.app');await bundle(replacement,f.root,'0.8.1');
  const displaced=path.join(f.root,'displaced.app');let probes=0;const inode=fs.statSync(replacement).ino;
  assert.throws(()=>require(helper).deploy(f.source,f.home,runtime({running:()=>{
    if(++probes===2){fs.renameSync(f.destination,displaced);fs.renameSync(replacement,f.destination);}return false;
  }})),/changed/);
  assert.equal(fs.statSync(f.destination).ino,inode);
  assert.equal(require(helper).inspect(f.destination,{asar,plist}).version,'0.8.1');
  assert.ok(fs.existsSync(displaced));
});

test('cleanup failures preserve original diagnostic and still attempt lock cleanup',async t=>{
  const f=await fixture(t);await bundle(f.destination,f.root);
  const originalRm=fs.rmSync;const originalRmdir=fs.rmdirSync;let lockAttempt=false;const warnings=[];
  t.after(()=>{fs.rmSync=originalRm;fs.rmdirSync=originalRmdir;});
  fs.rmSync=(p,...args)=>{if(String(p).includes('.Rift-preview-stage-'))throw Error('stage cleanup denied');return originalRm(p,...args);};
  fs.rmdirSync=(p,...args)=>{if(String(p).endsWith('.Rift-preview.lock')){lockAttempt=true;throw Error('lock cleanup denied');}return originalRmdir(p,...args);};
  let probes=0;
  assert.throws(()=>require(helper).deploy(f.source,f.home,runtime({log:m=>warnings.push(m),running:()=>++probes===2})),/Quit Rift/);
  assert.ok(lockAttempt,'lock cleanup must run even when stage cleanup fails');
  assert.ok(warnings.some(m=>/stage cleanup denied/.test(m)));
  assert.ok(warnings.some(m=>/lock cleanup denied/.test(m)));
});

test('archive manifest symlinks are refused even when they point to valid identity',async t=>{
  const f=await fixture(t);const payload=path.join(f.root,'linked-payload');fs.mkdirSync(payload);
  fs.writeFileSync(path.join(payload,'identity.json'),JSON.stringify({name:'rift',main:'app-out/main/index.js',version:'0.8.0'}));
  fs.symlinkSync('identity.json',path.join(payload,'package.json'));
  const archive=path.join(f.app,'Contents/Resources/app.asar');await asar.createPackage(payload,archive);asar.uncache(archive);
  assert.throws(()=>require(helper).deploy(f.source,f.home,runtime()),/manifest/);
  assert.ok(!fs.existsSync(f.destination));
});

test('unpacked archive manifest is refused rather than following an external identity file',async t=>{
  const f=await fixture(t);const payload=path.join(f.root,'unpacked-payload');fs.mkdirSync(payload);
  fs.writeFileSync(path.join(payload,'package.json'),JSON.stringify({name:'rift',main:'app-out/main/index.js',version:'0.8.0'}));
  const archive=path.join(f.app,'Contents/Resources/app.asar');await asar.createPackageWithOptions(payload,archive,{unpack:'package.json'});asar.uncache(archive);
  assert.equal(asar.statFile(archive,'package.json',false).unpacked,true);
  assert.throws(()=>require(helper).deploy(f.source,f.home,runtime()),/manifest/);
  assert.ok(!fs.existsSync(f.destination));
});

test('source and home overlap is refused before creating Applications',async t=>{
  const f=await fixture(t);const nested=path.join(f.home,'source');fs.renameSync(f.source,nested);
  assert.throws(()=>require(helper).deploy(nested,f.home,runtime()),/overlap/);
  assert.ok(!fs.existsSync(path.dirname(f.destination)));
});

test('ambiguous backup move reports both original and backup paths without deleting either',async t=>{
  const f=await fixture(t);await bundle(f.destination,f.root);let backup;
  const base=runtime();let diagnostic;
  assert.throws(()=>require(helper).deploy(f.source,f.home,runtime({move:(from,to)=>{
    backup=to;base.move(from,to);throw Error('bridge acknowledgement lost');
  }})),error=>{diagnostic=error.message;return /bridge acknowledgement lost/.test(diagnostic);});
  assert.ok(diagnostic.includes(f.destination));assert.ok(diagnostic.includes(backup));
  assert.ok(fs.existsSync(backup));
});

test('documented one-liner is download-first, propagates curl failures and executes exact feature script on success',async t=>{
  const doc=path.resolve(__dirname,'../docs/MAC-PREVIEW.md');
  assert.ok(fs.existsSync(doc),'preview handoff documentation must exist');
  const text=fs.readFileSync(doc,'utf8');
  const line=text.match(/```bash\n([^\n]+)\n```/)[1];
  assert.match(line,/raw\.githubusercontent\.com\/wisedev-pstach\/RiftCode\/feat\/terminal-ai-workspace\/scripts\/install-preview-mac\.sh/);
  const f=await bootstrapFixture(t);
  executable(path.join(f.bin,'curl'),`#!/bin/sh\ncat ${JSON.stringify(script)}\nexit 22\n`);
  let r=spawnSync('/bin/bash',['-c',line],{encoding:'utf8',env:f.env});
  assert.equal(r.status,22,r.stderr);assert.ok(!fs.existsSync(f.trace));assert.ok(!fs.existsSync(f.destination));
  executable(path.join(f.bin,'curl'),`#!/bin/sh\ncat ${JSON.stringify(script)}\n`);
  r=spawnSync('/bin/bash',['-c',line],{encoding:'utf8',env:f.env});
  assert.equal(r.status,0,r.stderr);assert.ok(fs.existsSync(f.destination));assert.deepEqual(fs.readdirSync(f.tmp),[]);
});
