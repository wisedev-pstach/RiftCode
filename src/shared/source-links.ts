import type { SourceLocation } from './terminal';
export interface SourceLink extends SourceLocation { start: number; end: number }
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** Parse already-rendered terminal cells, never raw VT/HTML. Known paths prevent ambiguous guesses. */
export function sourceLinks(text: string, paths: readonly string[], root: string): SourceLink[] {
  if (text.length > 16384 || /[\x00-\x1f\x7f-\x9f]/.test(text)) return [];
  const links: SourceLink[]=[];
  const windows = /^[A-Za-z]:[\\/]/.test(root);
  for (const path of paths) {
    if (!path || /[\r\n\x1b]/.test(path) || path.split(/[\\/]/).includes('..')) continue;
    const variants = new Set([path, ...(windows ? [path.replaceAll('/','\\')] : [])]);
    for (const relative of variants) {
      const separator=windows ? '\\' : '/';
      const absolute=root.replace(/[\\/]$/,'')+separator+relative;
      const pattern=new RegExp(`(?:${escape(absolute)}|${escape(relative)})(?::(\\d+)(?::(\\d+))?|#L(\\d+)(?:-L?(\\d+))?)`,'g');
      for (const match of text.matchAll(pattern)) {
        const start=match.index!; const end=start+match[0].length;
        const before=text.slice(0,start); const after=text.slice(end);
        // No path suffixes, URL protocols, traversal, or partial numeric/identifier locations.
        if (before && !/[\s\x60'"([{,;]$/.test(before)) continue;
        const token=before.match(/[^\s\x60'"([{,;]*$/)?.[0] ?? '';
        if (token.includes('://') || /^[\w/:.\\-]+$/.test(token) && token.length>0) continue;
        if (/^[\w:#/\\-]/.test(after)) continue;
        const line=Number(match[1]||match[3]); const column=Number(match[2]||1); const endLine=match[4]?Number(match[4]):undefined;
        if (![line,column,endLine??line].every(n=>Number.isSafeInteger(n)&&n>0&&n<=10000000) || (endLine!==undefined && endLine<line)) continue;
        if (!links.some(link=>link.start<end&&link.end>start)) links.push({path,line,column,endLine,start,end});
      }
    }
  }
  return links.sort((a,b)=>a.start-b.start);
}
