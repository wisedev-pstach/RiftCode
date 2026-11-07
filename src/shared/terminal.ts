export type TerminalProvider = 'claude' | 'opencode' | 'codex';
export type TerminalMode = 'review' | 'edit';
export interface TerminalState {
  id: string; provider: TerminalProvider; mode: TerminalMode; cwd: string;
  status: 'running' | 'exited'; exitCode?: number;
}
export interface TerminalRead { state: TerminalState | null; data: string; cursor: number; truncated: boolean }
export interface SourceLocation { path: string; line: number; column: number; endLine?: number }

export function assertTerminalProvider(provider: unknown): asserts provider is TerminalProvider {
  if (provider !== 'claude' && provider !== 'opencode' && provider !== 'codex') throw new Error('Unsupported terminal provider.');
}
export function validResumeSessionId(provider: TerminalProvider, id: unknown): id is string {
  return typeof id === 'string' && id.length <= 100 && (provider === 'opencode'
    ? /^ses_[a-zA-Z0-9]{20,40}$/.test(id)
    : /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id));
}
export function providerArgs(provider: TerminalProvider, mode: TerminalMode, resumeSessionId?: string): string[] {
  assertTerminalProvider(provider);
  if (resumeSessionId !== undefined && !validResumeSessionId(provider, resumeSessionId)) throw new Error('Invalid provider session ID.');
  const resume = resumeSessionId === undefined ? [] : [provider === 'claude' ? '--resume' : provider === 'opencode' ? '--session' : 'resume', resumeSessionId];
  if (mode !== 'review' && mode !== 'edit') throw new Error('Invalid terminal mode.');
  switch (provider) {
    case 'claude': return ['--permission-mode', mode === 'review' ? 'plan' : 'default', ...resume];
    case 'opencode': return ['--agent', mode === 'review' ? 'plan' : 'build', ...resume];
    case 'codex': return [...(mode === 'review' ? ['--sandbox', 'read-only'] : []), '--ask-for-approval', 'on-request', ...resume];
    default: throw new Error('Unsupported terminal provider.');
  }
}

export function openCodeInteractiveArgs(mode:TerminalMode,resumeSessionId:string|undefined,help:string):string[] {
  const args=providerArgs('opencode',mode,resumeSessionId);
  if(/--agent\b/.test(help))return args;
  if(/\bmini\b/.test(help))return ['mini',...args];
  throw new Error('Unsupported OpenCode interactive CLI: no agent/mini capability advertised by --help.');
}

export function contextPaste(text: string): string {
  if (typeof text !== 'string' || text.length > 32768) throw new Error('Context is too large (32 KiB maximum).');
  const clean = text.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
  return `\x1b[200~${clean}\x1b[201~`;
}
