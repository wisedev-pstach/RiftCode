import type {TerminalProvider} from './terminal';
export type FactoryProvider = TerminalProvider;
export type FactoryProviderConsent = 'provider-execution' | 'provider-config-execution' | 'claude-print-startup' | 'workspace-write' | 'opencode-private-server';
/** Set only after independently verifying the exact installed release/flags; never renderer claims. */
export interface FactoryCapabilityVerification {
  version:string;
  source:string;
  features:readonly ('codex-exec-json-stdin' | 'codex-workspace-write' | 'codex-approval-on-request' | 'codex-output-schema-file' | 'opencode-v2-standalone-json-stdin' | 'opencode-stop-reason')[];
}
/** The locator must verify native binaries or Node runtime/entrypoint provenance. No shell shims. */
export type FactoryExecutable = {kind:'native'; file:string} | {kind:'node-cli'; file:string; entrypoint:string; validatedEntrypoint:true};
export interface FactoryProviderLimits {timeoutMs:number; maxOutputBytes:number; maxRetries:number; maxTurns?:number}
export interface FactoryProviderPlanInput {
  provider:FactoryProvider;
  version:string;
  executable:FactoryExecutable | null;
  platform:'win32' | 'linux' | 'darwin';
  /** Canonical absolute task workspace, validated by caller against its approved workspace. */
  cwd:string;
  prompt:string;
  consents:readonly FactoryProviderConsent[];
  verification?:FactoryCapabilityVerification;
  limits:FactoryProviderLimits;
  /** A caller-vetted schema file inside the workspace, never inline JSON. */
  outputSchemaPath?:string;
}
export interface FactoryProviderCapability {
  provider:FactoryProvider;
  minimumVersion:string | null;
  requiredConsents:readonly FactoryProviderConsent[];
  preservesWorkspaceTrustDialog:boolean;
  mayExecuteProviderConfiguration:true;
  startsPrivateServer:boolean;
  requiresExactVersionVerification:boolean;
  autonomousCompletionGuaranteed:false;
}
export interface FactoryProviderCommandRequest {
  provider:FactoryProvider;
  file:string;
  args:string[];
  stdin:string;
  cwd:string;
  shell:false;
  /** Overlay only; caller builds a credential-safe environment, never app tokens. */
  env:Record<string,string>;
  limits:FactoryProviderLimits;
  protocol:'claude-stream-json' | 'codex-exec-jsonl' | 'opencode-v2-jsonl';
}
export type FactoryProviderPlan = {status:'ready'; request:FactoryProviderCommandRequest; capability:FactoryProviderCapability} |
  {status:'blocked'; reason:string; capability:FactoryProviderCapability};
export interface FactoryProviderCapture {
  stdout:string;
  stderr?:string;
  /** null means no confirmed normal process exit. */
  exitCode:number | null;
  truncated?:boolean;
  cancelled?:boolean;
  timedOut?:boolean;
}
export interface FactoryProviderEvent {
  kind:'session' | 'started' | 'message' | 'tool' | 'terminal' | 'blocked' | 'error' | 'progress';
  type:string;
  sessionId?:string;
}
export interface FactoryProviderOutput {
  status:'candidate' | 'blocked' | 'failed';
  reason:string;
  sessionId?:string;
  events:FactoryProviderEvent[];
  /** Untrusted provider output, not an independent test receipt or safe-to-log content. */
  text:string;
}
