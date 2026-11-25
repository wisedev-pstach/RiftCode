/** A literal, portable single filename component; never normalize user intent. */
export function repositoryNameError(name:unknown):string|null {
 if(typeof name!=='string'||name.length===0||name.length>128||new TextEncoder().encode(name).length>240
  ||name!==name.trim()||/[\uD800-\uDFFF]/u.test(name)||name==='.'||name==='..'||/[<>:"/\\|?*\x00-\x1f\x7f]/.test(name)||/[. ]$/.test(name)
  ||/^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³]) *(?:\.|$)/i.test(name))
  return 'Use a project name of 1–128 characters without path separators, reserved names, or leading/trailing spaces and dots.';
 return null;
}
export function assertRepositoryName(name:unknown):asserts name is string {
 const error=repositoryNameError(name);if(error)throw new Error(error);
}
