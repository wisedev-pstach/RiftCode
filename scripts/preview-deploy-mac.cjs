'use strict';
// Only CLI execution is production. Tests import deploy with explicit adapters;
// no environment variable enables test commands, alternate destinations or moves.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {createRequire} = require('node:module');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');

function command(file, args) {
  const r = spawnSync(file, args, {encoding:'utf8', timeout:15000, maxBuffer:1024*1024});
  if (r.error || r.signal || r.status !== 0) throw new Error(`${path.basename(file)} failed: ${r.error?.message || r.stderr || r.signal || r.status}`);
  return r.stdout;
}
const RENAME_SCRIPT = `ObjC.import('Foundation');
ObjC.bindFunction('renamex_np', ['int', ['string', 'string', 'unsigned int']]);
function run(argv) {
  if (argv.length !== 2) throw new Error('Expected two literal paths');
  if ($.renamex_np(argv[0], argv[1], 0x00000004) !== 0) throw new Error('Exclusive rename refused; destination may already exist');
}`;
function nativeMove(from, to) {
  command('/usr/bin/osascript', ['-l','JavaScript','-e',RENAME_SCRIPT,'--',from,to]);
}
function running() {
  const r = spawnSync('/usr/bin/pgrep',['-x','Rift'],{encoding:'utf8',timeout:10000,maxBuffer:65536});
  if (r.error || r.signal || ![0,1].includes(r.status)) throw new Error('Cannot safely check whether Rift is running');
  return r.status === 0;
}
function noLinks(target) {
  if (!path.isAbsolute(target)) throw new Error('Expected absolute path');
  let current=path.parse(target).root;
  for (const part of target.slice(current.length).split(path.sep).filter(Boolean)) {
    current=path.join(current,part);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Symlink refused: ${current}`); }
    catch(e) { if(e.code !== 'ENOENT') throw e; }
  }
}
function regular(file, executable=false) {
  noLinks(file);
  const s=fs.lstatSync(file);
  if(!s.isFile() || !s.size || (executable && !(s.mode & 0o111))) throw new Error(`Invalid regular file: ${file}`);
}
function inspect(app, tools, preview=false) {
  noLinks(app);
  if(!fs.lstatSync(app).isDirectory()) throw new Error('Bundle must be a directory');
  const info=path.join(app,'Contents/Info.plist');
  const archive=path.join(app,'Contents/Resources/app.asar');
  regular(info); regular(archive); regular(path.join(app,'Contents/MacOS/Rift'),true);
  const native=tools.plist.parse(fs.readFileSync(info,'utf8'));
  if(native.CFBundleIdentifier !== 'dev.wise.rift' || native.CFBundleExecutable !== 'Rift') throw new Error('Unrecognized native Rift identity');
  tools.asar.uncache?.(archive);
  const meta=tools.asar.statFile(archive,'package.json',false);
  if(meta.link || meta.unpacked || !Number.isSafeInteger(meta.size) || meta.size <= 0 || meta.size > 1024*1024) throw new Error('Invalid archive manifest');
  const pkg=JSON.parse(tools.asar.extractFile(archive,'package.json').toString('utf8'));
  if(pkg.name !== 'rift' || pkg.main !== 'app-out/main/index.js' ||
      (pkg.build?.appId !== undefined && pkg.build.appId !== 'dev.wise.rift') ||
      (pkg.appId !== undefined && pkg.appId !== 'dev.wise.rift')) throw new Error('Unrecognized archive Rift identity');
  if(preview && !/^0\.8\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(pkg.version)) throw new Error('Expected a Rift 0.8 preview bundle');
  return pkg;
}
// Include the whole bundle, not only its manifest: another valid Rift build
// must not silently become the authorized replacement target during staging.
function snapshot(app) {
  const hash=createHash('sha256');
  function walk(file,relative) {
    const s=fs.lstatSync(file);
    hash.update(JSON.stringify([relative,s.dev,s.ino,s.mode,s.size,s.mtimeMs,s.ctimeMs]));
    if(s.isSymbolicLink()) hash.update(fs.readlinkSync(file));
    else if(s.isDirectory()) for(const name of fs.readdirSync(file).sort()) walk(path.join(file,name),path.join(relative,name));
    else if(s.isFile()) {
      const fd=fs.openSync(file,'r');
      try {const buffer=Buffer.alloc(1024*1024);let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))hash.update(buffer.subarray(0,n));}
      finally {fs.closeSync(fd);}
    } else throw new Error(`Unsupported bundle entry: ${file}`);
  }
  walk(app,'');return hash.digest('hex');
}
function deploy(source, home, adapters={}) {
  const tools={platform:process.platform,move:nativeMove,running,log:console.log,...adapters};
  if(tools.platform !== 'darwin') throw new Error('This preview installer requires macOS');
  source=fs.realpathSync(source); // Only the freshly owned build root may be canonicalized.
  const sourceRequire=createRequire(path.join(source,'package.json'));
  tools.asar ||= sourceRequire('@electron/asar');
  tools.plist ||= sourceRequire('plist');
  if(!path.isAbsolute(home) || path.resolve(home) !== home || home === path.parse(home).root) throw new Error('Unsafe HOME');
  noLinks(home);
  if(!fs.statSync(home).isDirectory()) throw new Error('HOME must be a directory');
  if(source===path.parse(source).root || source===home || source.startsWith(home+path.sep) || home.startsWith(source+path.sep)) throw new Error('Unsafe source/HOME overlap; use a temporary root outside HOME');
  const move=(from,to)=>{
    try {tools.move(from,to);} catch(error) {
      throw new Error(`${error.message}. Move outcome unconfirmed; inspect both paths: ${from} -> ${to}`);
    }
  };
  const applications=path.join(home,'Applications');
  noLinks(applications);
  fs.mkdirSync(applications,{recursive:true});
  const destination=path.join(applications,'Rift.app');
  noLinks(destination);
  const lock=path.join(applications,'.Rift-preview.lock');
  fs.mkdirSync(lock); // Never clear a pre-existing lock automatically.
  let stage; let backup; let moved=false;
  try {
    if(tools.running()) throw new Error('Quit Rift before installing; nothing was replaced');
    const candidates=fs.readdirSync(path.join(source,'release'),{withFileTypes:true})
      .filter(d=>d.isDirectory() && /^mac(?:-(?:arm64|x64|universal))?$/.test(d.name))
      .map(d=>path.join(source,'release',d.name,'Rift.app')).filter(p=>fs.existsSync(p));
    if(candidates.length !== 1) throw new Error('Expected exactly one packaged macOS Rift.app');
    inspect(candidates[0],tools,true);
    const existing=fs.existsSync(destination);
    if(existing) inspect(destination,tools);
    const original=existing ? snapshot(destination) : null;
    stage=fs.mkdtempSync(path.join(applications,'.Rift-preview-stage-'));
    const staged=path.join(stage,'Rift.app');
    fs.cpSync(candidates[0],staged,{recursive:true,verbatimSymlinks:true,errorOnExist:true,force:false,preserveTimestamps:true});
    inspect(staged,tools,true);
    if(tools.running()) throw new Error('Quit Rift before installing; nothing was replaced');
    noLinks(destination);
    if(existing) {
      inspect(destination,tools);
      if(snapshot(destination)!==original) throw new Error('Existing Rift changed during staging; nothing was replaced');
      backup=path.join(fs.mkdtempSync(path.join(applications,'.Rift.previous-')),'Rift.app');
      move(destination,backup); moved=true;
    }
    try { move(staged,destination); }
    catch(error) {
      if(moved) {
        try { move(backup,destination); moved=false; }
        catch(rollback) { throw new Error(`${error.message}. Rollback refused: ${rollback.message}. Previous Rift retained at ${backup}`); }
      }
      throw error;
    }
    inspect(destination,tools,true);
    tools.log(`Installed Rift 0.8 preview: ${destination}`);
    if(backup) tools.log(`Previous Rift retained: ${backup}`);
    tools.log('Your settings and CLI links were not changed. Open Rift yourself when ready.');
    return {destination,backup};
  } catch(error) {
    if(backup && fs.existsSync(backup)) throw new Error(`${error.message}. Previous Rift retained: ${backup}`);
    throw error;
  } finally {
    // Cleanup is best effort, but never silent and never replaces a rollback
    // diagnostic. Attempt each independently even if the preceding one fails.
    for(const [target,remove] of [[stage,()=>fs.rmSync(stage,{recursive:true,force:true})],[lock,()=>fs.rmdirSync(lock)]]) {
      if(!target) continue;
      try {remove();} catch(error) {
        try {tools.log(`Cleanup incomplete at ${target}: ${error.message}. Inspect before removing manually.`);} catch {}
      }
    }
  }
}
module.exports={deploy,inspect,nativeMove,RENAME_SCRIPT};
if(require.main === module) {
  try {
    if(process.argv.length !== 3) throw new Error('Expected the owned checkout path');
    deploy(process.argv[2],os.homedir());
  } catch(e) { console.error(`Preview installation stopped: ${e.message}`); process.exitCode=1; }
}
