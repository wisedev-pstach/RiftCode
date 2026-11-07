const {existsSync,chmodSync} = require('node:fs');
const {join} = require('node:path');
const rebuildDefaults = new WeakMap();
module.exports = async function beforePack(context) {
  const config=context.packager.config;
  if(!rebuildDefaults.has(config)) rebuildDefaults.set(config,config.npmRebuild);
  config.npmRebuild=rebuildDefaults.get(config);
  const platform=context.electronPlatformName;
  if (!['darwin','win32'].includes(platform)) return;
  const arch=({0:'ia32',1:'x64',3:'arm64'})[context.arch];
  if(!['x64','arm64'].includes(arch)) throw new Error('node-pty prebuild is unavailable for this target architecture.');
  const root=join(context.packager.info.appDir,'node_modules/node-pty/prebuilds',`${platform}-${arch}`);
  const addon=join(root,'pty.node');
  if(!existsSync(addon)) throw new Error(`Missing pinned node-pty prebuild: ${addon}. Run npm ci --ignore-scripts to preserve supplied prebuilds.`);
  if(platform==='darwin') {
    const helper=join(root,'spawn-helper');
    if(!existsSync(helper))throw new Error('Missing node-pty spawn-helper');
    chmodSync(helper,0o755);
  } else {
    for(const file of ['conpty.node','conpty_console_list.node']) if(!existsSync(join(root,file)))throw new Error(`Missing node-pty helper ${file}`);
  }
  // Keep builder's dependency collector. beforeBuild=false would omit dependencies in builder 26.
  context.packager.config.npmRebuild=false;
};
