/** Git must operate on the explicit cwd, not inherited repository/config redirects. */
export function repositoryGitEnvironment():NodeJS.ProcessEnv {
 const env:NodeJS.ProcessEnv={};
 for(const [key,value] of Object.entries(process.env))if(!/^GIT_/i.test(key))env[key]=value;
 return {...env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_ATTR_NOSYSTEM:'1'};
}
