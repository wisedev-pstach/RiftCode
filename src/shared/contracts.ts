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

export interface AgentOption {
  id: AgentId;
  label: string;
}

export interface AgentToolEvent {
  id: string;
  name: string;
  status: "completed" | "failed";
  detail?: string;
}

export interface AgentRunResult {
  tools: AgentToolEvent[];
  explanation: string;
}

export interface RiftApi {
  platform: "darwin" | "linux" | "win32";
  openRepository(path?: string): Promise<RepositorySnapshot>;
  refreshRepository(): Promise<RepositorySnapshot>;
  getFilePatch(path: string): Promise<FilePatch>;
  chooseRepository(): Promise<RepositorySnapshot | null>;
  selectComparison(id: string): Promise<RepositorySnapshot>;
  listAgents(): Promise<AgentOption[]>;
  runAgent(id: AgentId, prompt: string): Promise<AgentRunResult>;
  cancelAgent(): Promise<void>;
  copyText(text: string): Promise<void>;
  onRepositoryChanged(listener: () => void): () => void;
}
