export type ChangeStatus = "added" | "modified" | "deleted" | "renamed" | "untracked";
export type ComparisonKind = "working-tree" | "branch" | "commit";

export interface ComparisonOption {
  id: string;
  kind: ComparisonKind;
  label: string;
  detail: string;
}

export interface ChangedFile {
  path: string;
  previousPath?: string;
  status: ChangeStatus;
  additions: number;
  deletions: number;
}

export interface RepositorySnapshot {
  root: string;
  name: string;
  branch: string;
  baseBranch: string | null;
  comparisonId: string;
  comparisonLabel: string;
  startRevision: string;
  endRevision: string | null;
  includeUntracked: boolean;
  comparisons: ComparisonOption[];
  files: ChangedFile[];
  additions: number;
  deletions: number;
  updatedAt: number;
}

export interface FilePatch {
  path: string;
  patch: string;
  binary: boolean;
}

export type AgentId = "opencode" | "claude";
export type AgentMode = "review" | "edit";

export interface AgentOption {
  id: AgentId;
  label: string;
}

export interface AgentSession {
  id: string;
  title: string;
  updatedAt: number;
}

export interface AgentConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentConversationHistory {
  id: string;
  title: string;
  model: string | null;
  messages: AgentConversationMessage[];
}

export interface AgentToolEvent {
  id: string;
  name: string;
  status: "running" | "completed" | "failed";
  detail?: string;
}

export interface AgentRunResult {
  tools: AgentToolEvent[];
  explanation: string;
  sessionId?: string;
}

export interface ContextResourcePath {
  path: string;
  kind: "file" | "directory";
  label?: string;
}

export interface AgentStreamEvent {
  runId: string;
  result: AgentRunResult;
}

export interface RiftApi {
  platform: "darwin" | "linux" | "win32";
  setTheme(theme: "dark" | "light"): Promise<void>;
  saveImageAttachment(name: string, type: string, data: Uint8Array): Promise<string>;
  saveClipboardImage(): Promise<string | null>;
  saveMarkdown(name: string, content: string): Promise<boolean>;
  readRepositoryFile(path: string): Promise<string>;
  writeRepositoryFile(path: string, content: string): Promise<void>;
  openRepository(path?: string): Promise<RepositorySnapshot>;
  refreshRepository(): Promise<RepositorySnapshot>;
  getFilePatch(path: string): Promise<FilePatch>;
  chooseRepository(): Promise<RepositorySnapshot | null>;
  chooseContextResources(kind: "files" | "directory"): Promise<ContextResourcePath[]>;
  selectComparison(id: string): Promise<RepositorySnapshot>;
  listAgents(): Promise<AgentOption[]>;
  listAgentModels(id: AgentId): Promise<string[]>;
  listAgentSessions(id: AgentId): Promise<AgentSession[]>;
  getAgentSession(id: AgentId, sessionId: string): Promise<AgentConversationHistory>;
  runAgent(runId: string, id: AgentId, model: string | null, mode: AgentMode, prompt: string, resourcePaths: string[], sessionId?: string): Promise<AgentRunResult>;
  cancelAgent(): Promise<void>;
  copyText(text: string): Promise<void>;
  onRepositoryChanged(listener: () => void): () => void;
  onAgentEvent(listener: (event: AgentStreamEvent) => void): () => void;
}
