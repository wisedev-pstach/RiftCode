import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  signal,
  viewChild
} from "@angular/core";
import { marked } from "marked";
import type { AgentConversationHistory, AgentId, AgentOption, AgentRunResult, AgentSession, AgentStreamEvent, ChangedFile, FilePatch, RepositorySnapshot } from "../../shared/contracts";

type DiffKind = "header" | "hunk" | "context" | "addition" | "deletion" | "meta";
type DiffMode = "unified" | "split";

interface DetectedLanguage {
  id: string;
  label: string;
}

const PLAIN_TEXT: DetectedLanguage = { id: "plaintext", label: "Plain text" };
const AGENT_STORAGE_KEY = "rift:last-agent";
const MODEL_STORAGE_PREFIX = "rift:last-model:";
const CHAT_FONT_SIZE_KEY = "rift:chat-font-size";
const THEME_STORAGE_KEY = "rift:theme";
const LANGUAGES: Readonly<Record<string, DetectedLanguage>> = {
  bash: { id: "bash", label: "Shell" },
  c: { id: "c", label: "C" },
  cc: { id: "cpp", label: "C++" },
  cpp: { id: "cpp", label: "C++" },
  cs: { id: "csharp", label: "C#" },
  cshtml: { id: "xml", label: "Razor" },
  csproj: { id: "xml", label: "MSBuild" },
  css: { id: "css", label: "CSS" },
  go: { id: "go", label: "Go" },
  graphql: { id: "graphql", label: "GraphQL" },
  h: { id: "c", label: "C" },
  hpp: { id: "cpp", label: "C++" },
  html: { id: "xml", label: "HTML" },
  ini: { id: "ini", label: "INI" },
  java: { id: "java", label: "Java" },
  js: { id: "javascript", label: "JavaScript" },
  json: { id: "json", label: "JSON" },
  jsonc: { id: "json", label: "JSON with comments" },
  jsx: { id: "javascript", label: "JSX" },
  kt: { id: "kotlin", label: "Kotlin" },
  less: { id: "less", label: "Less" },
  lua: { id: "lua", label: "Lua" },
  md: { id: "markdown", label: "Markdown" },
  mjs: { id: "javascript", label: "JavaScript" },
  php: { id: "php", label: "PHP" },
  pl: { id: "perl", label: "Perl" },
  ps1: { id: "powershell", label: "PowerShell" },
  py: { id: "python", label: "Python" },
  r: { id: "r", label: "R" },
  rb: { id: "ruby", label: "Ruby" },
  rs: { id: "rust", label: "Rust" },
  scss: { id: "scss", label: "SCSS" },
  sh: { id: "bash", label: "Shell" },
  sql: { id: "sql", label: "SQL" },
  swift: { id: "swift", label: "Swift" },
  toml: { id: "ini", label: "TOML" },
  ts: { id: "typescript", label: "TypeScript" },
  tsx: { id: "typescript", label: "TSX" },
  vb: { id: "vbnet", label: "Visual Basic" },
  wasm: { id: "wasm", label: "WebAssembly" },
  xml: { id: "xml", label: "XML" },
  yaml: { id: "yaml", label: "YAML" },
  yml: { id: "yaml", label: "YAML" }
};

interface DiffRow {
  kind: DiffKind;
  content: string;
  highlighted?: string;
  oldHighlighted?: string;
  newHighlighted?: string;
  oldLine?: number;
  newLine?: number;
}

interface HighlightResponse {
  requestId: number;
  rows: DiffRow[];
}

interface SelectionRange {
  anchor: number;
  focus: number;
}

interface IndexedDiffRow {
  index: number;
  row: DiffRow;
}

interface SplitDiffRow {
  left?: IndexedDiffRow;
  right?: IndexedDiffRow;
  spanning?: IndexedDiffRow;
}

interface ReviewNote {
  id: string;
  comparisonId: string;
  filePath: string;
  startIndex: number;
  endIndex: number;
  startLine: number;
  endLine: number;
  content: string;
  diff: string;
  createdAt: number;
}

interface ReviewSessionData {
  version: 1 | 2;
  reviewedFiles: string[];
  notes: ReviewNote[];
  conversations?: Conversation[];
}

interface ToolsMenu {
  x: number;
  y: number;
}

interface FileToolsMenu extends ToolsMenu {
  path: string;
}

type ConversationStatus = "running" | "complete" | "error" | "cancelled";

interface Conversation {
  id: number;
  repositoryRoot: string;
  title?: string;
  agent: AgentId;
  model: string | null;
  question: string;
  context?: ConversationContext;
  status: ConversationStatus;
  result: AgentRunResult | null;
  error: string | null;
  history: ConversationTurn[];
  providerSessionId?: string;
}

interface ConversationTurn {
  question: string;
  context?: ConversationContext;
  result: AgentRunResult | null;
  error: string | null;
}

interface ConversationContext {
  filePath: string;
  startLine: number;
  endLine: number;
  diff: string;
}

interface PendingExplain {
  agent: AgentId;
  model: string | null;
  prompt: string;
  question: string;
  context?: ConversationContext;
  providerSessionId?: string;
}

interface RowAnnotations {
  notes: ReviewNote[];
  conversations: Conversation[];
}

function isReviewNote(value: unknown): value is ReviewNote {
  if (!value || typeof value !== "object") return false;
  const note = value as Record<string, unknown>;
  return typeof note.id === "string"
    && typeof note.comparisonId === "string"
    && typeof note.filePath === "string"
    && typeof note.content === "string"
    && note.content.length <= 20_000
    && typeof note.diff === "string"
    && note.diff.length <= 200_000
    && typeof note.startIndex === "number" && Number.isFinite(note.startIndex)
    && typeof note.endIndex === "number" && Number.isFinite(note.endIndex)
    && typeof note.startLine === "number" && Number.isFinite(note.startLine)
    && typeof note.endLine === "number" && Number.isFinite(note.endLine)
    && typeof note.createdAt === "number" && Number.isFinite(note.createdAt);
}

function isReviewSessionData(value: unknown): value is ReviewSessionData {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  return (session.version === 1 || session.version === 2)
    && Array.isArray(session.reviewedFiles)
    && session.reviewedFiles.every((path) => typeof path === "string" && path.length <= 10_000)
    && Array.isArray(session.notes)
    && (session.version === 1 || (Array.isArray(session.conversations) && session.conversations.every(isConversation)));
}

function isConversationContext(value: unknown): value is ConversationContext {
  if (!value || typeof value !== "object") return false;
  const context = value as Record<string, unknown>;
  return typeof context.filePath === "string" && context.filePath.length <= 10_000
    && typeof context.startLine === "number" && Number.isFinite(context.startLine)
    && typeof context.endLine === "number" && Number.isFinite(context.endLine)
    && typeof context.diff === "string" && context.diff.length <= 200_000;
}

function isAgentResult(value: unknown): value is AgentRunResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return typeof result.explanation === "string" && result.explanation.length <= 1_000_000
    && (result.sessionId === undefined || (typeof result.sessionId === "string" && result.sessionId.length <= 100))
    && Array.isArray(result.tools) && result.tools.length <= 2_000
    && result.tools.every((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const tool = entry as Record<string, unknown>;
      return typeof tool.id === "string" && typeof tool.name === "string"
        && (tool.status === "running" || tool.status === "completed" || tool.status === "failed")
        && (tool.detail === undefined || typeof tool.detail === "string");
    });
}

function isConversationTurn(value: unknown): value is ConversationTurn {
  if (!value || typeof value !== "object") return false;
  const turn = value as Record<string, unknown>;
  return typeof turn.question === "string" && turn.question.length <= 20_000
    && (turn.context === undefined || isConversationContext(turn.context))
    && (turn.result === null || isAgentResult(turn.result))
    && (turn.error === null || (typeof turn.error === "string" && turn.error.length <= 20_000));
}

function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== "object") return false;
  const conversation = value as Record<string, unknown>;
  return typeof conversation.id === "number" && Number.isSafeInteger(conversation.id) && conversation.id > 0
    && typeof conversation.repositoryRoot === "string" && conversation.repositoryRoot.length <= 10_000
    && (conversation.title === undefined || (typeof conversation.title === "string" && conversation.title.length <= 500))
    && (conversation.agent === "opencode" || conversation.agent === "claude")
    && (conversation.model === null || (typeof conversation.model === "string" && conversation.model.length <= 200))
    && typeof conversation.question === "string" && conversation.question.length <= 20_000
    && (conversation.context === undefined || isConversationContext(conversation.context))
    && (conversation.status === "running" || conversation.status === "complete" || conversation.status === "error" || conversation.status === "cancelled")
    && (conversation.result === null || isAgentResult(conversation.result))
    && (conversation.error === null || (typeof conversation.error === "string" && conversation.error.length <= 20_000))
    && Array.isArray(conversation.history) && conversation.history.length <= 500
    && conversation.history.every(isConversationTurn)
    && (conversation.providerSessionId === undefined || (typeof conversation.providerSessionId === "string" && conversation.providerSessionId.length <= 100));
}

function parsePatch(patch: string): DiffRow[] {
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  return patch.split("\n").map((line): DiffRow => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
    if (hunk) {
      inHunk = true;
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      const context = hunk[3].trim();
      return { kind: "hunk", content: context || `Changed lines ${oldLine} / ${newLine}` };
    }
    if (!inHunk && (line.startsWith("diff --git") || line.startsWith("index "))) {
      return { kind: "header", content: line };
    }
    if (!inHunk && (line.startsWith("--- ") || line.startsWith("+++ "))) {
      return { kind: "meta", content: line };
    }
    if (line.startsWith("+")) {
      const row = { kind: "addition" as const, content: line.slice(1), newLine };
      newLine += 1;
      return row;
    }
    if (line.startsWith("-")) {
      const row = { kind: "deletion" as const, content: line.slice(1), oldLine };
      oldLine += 1;
      return row;
    }
    if (line.startsWith(" ")) {
      const row = { kind: "context" as const, content: line.slice(1), oldLine, newLine };
      oldLine += 1;
      newLine += 1;
      return row;
    }
    return { kind: "meta", content: line };
  }).filter((row) => row.kind !== "header" && row.kind !== "meta");
}

function detectLanguage(path: string | null): DetectedLanguage {
  if (!path) return PLAIN_TEXT;
  const fileName = path.split("/").at(-1)?.toLowerCase() ?? "";
  if (fileName.endsWith(".component.html")) return { id: "xml", label: "Angular template" };
  if (fileName === "dockerfile") return { id: "bash", label: "Dockerfile" };
  if (fileName === "makefile") return { id: "makefile", label: "Makefile" };
  const extension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1) : "";
  return LANGUAGES[extension] ?? PLAIN_TEXT;
}

function pairSplitRows(rows: DiffRow[]): SplitDiffRow[] {
  const result: SplitDiffRow[] = [];
  let index = 0;

  while (index < rows.length) {
    const row = rows[index];
    if (row.kind === "deletion") {
      const deletions: IndexedDiffRow[] = [];
      const additions: IndexedDiffRow[] = [];
      while (rows[index]?.kind === "deletion") {
        deletions.push({ index, row: rows[index] });
        index += 1;
      }
      while (rows[index]?.kind === "addition") {
        additions.push({ index, row: rows[index] });
        index += 1;
      }
      for (let offset = 0; offset < Math.max(deletions.length, additions.length); offset += 1) {
        result.push({ left: deletions[offset], right: additions[offset] });
      }
      continue;
    }
    if (row.kind === "addition") {
      result.push({ right: { index, row } });
    } else if (row.kind === "context") {
      const indexed = { index, row };
      result.push({ left: indexed, right: indexed });
    } else {
      result.push({ spanning: { index, row } });
    }
    index += 1;
  }

  return result;
}

@Component({
  selector: "rift-root",
  standalone: true,
  templateUrl: "./app.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit, OnDestroy {
  readonly platform = window.rift.platform;
  readonly darkTheme = signal(this.loadDarkTheme());
  readonly repository = signal<RepositorySnapshot | null>(null);
  readonly selectedPath = signal<string | null>(null);
  readonly patch = signal<FilePatch | null>(null);
  readonly diffMode = signal<DiffMode>("unified");
  readonly selectedRange = signal<SelectionRange | null>(null);
  readonly allChangesSelected = signal(false);
  readonly loading = signal(true);
  readonly comparisonChanging = signal(false);
  readonly error = signal<string | null>(null);
  readonly reviewSidebarOpen = signal(false);
  readonly toolsMenu = signal<ToolsMenu | null>(null);
  readonly fileToolsMenu = signal<FileToolsMenu | null>(null);
  readonly noteComposerOpen = signal(false);
  readonly questionComposerOpen = signal(false);
  readonly questionDraft = signal("");
  readonly noteDraft = signal("");
  readonly notes = signal<ReviewNote[]>([]);
  readonly selectedNoteIds = signal<string[]>([]);
  readonly selectedNotes = computed(() => {
    const selected = new Set(this.selectedNoteIds());
    return this.notes().filter((note) => selected.has(note.id));
  });
  readonly allNotesSelected = computed(() => this.notes().length > 0 && this.selectedNotes().length === this.notes().length);
  readonly someNotesSelected = computed(() => this.selectedNotes().length > 0 && !this.allNotesSelected());
  readonly activeLinkedNoteId = signal<string | null>(null);
  readonly reviewedFiles = signal<string[]>([]);
  readonly reviewedFileCount = computed(() => {
    const paths = new Set(this.repository()?.files.map((file) => file.path) ?? []);
    return this.reviewedFiles().filter((path) => paths.has(path)).length;
  });
  readonly clearSessionArmed = signal(false);
  readonly agents = signal<AgentOption[]>([]);
  readonly selectedAgent = signal<AgentId | null>(null);
  readonly availableConversations = computed(() => {
    const agent = this.selectedAgent();
    return this.repositoryConversations().filter((conversation) => conversation.agent === agent && conversation.status !== "running");
  });
  readonly agentModels = signal<string[]>([]);
  readonly selectedModel = signal<string | null>(null);
  readonly modelSearch = signal("");
  readonly modelPickerOpen = signal(false);
  readonly modelsLoading = signal(false);
  readonly filteredAgentModels = computed(() => {
    const query = this.modelSearch().trim().toLowerCase();
    return (query
      ? this.agentModels().filter((model) => model.toLowerCase().includes(query))
      : this.agentModels()).slice(0, 100);
  });
  readonly agentRunning = signal(false);
  readonly agentResult = signal<AgentRunResult | null>(null);
  readonly agentError = signal<string | null>(null);
  readonly agentModalOpen = signal(false);
  readonly chatPageOpen = signal(false);
  readonly activeQuestion = signal("");
  readonly conversations = signal<Conversation[]>([]);
  readonly repositoryConversations = computed(() => {
    const root = this.repository()?.root;
    return root ? this.conversations().filter((conversation) => conversation.repositoryRoot === root) : [];
  });
  readonly activeConversationId = signal<number | null>(null);
  readonly activeConversation = computed(() => this.repositoryConversations().find((conversation) => conversation.id === this.activeConversationId()) ?? null);
  readonly activeConversationRunning = computed(() => this.activeConversation()?.status === "running");
  readonly conversationChoiceOpen = signal(false);
  readonly pendingExplain = signal<PendingExplain | null>(null);
  readonly continuingConversationId = signal<number | null>(null);
  readonly reviewMessage = signal<string | null>(null);
  readonly selectedFile = computed(() => this.repository()?.files.find((file) => file.path === this.selectedPath()));
  readonly selectedAgentOption = computed(() => this.agents().find((agent) => agent.id === this.selectedAgent()));
  readonly detectedLanguage = computed(() => detectLanguage(this.selectedPath()));
  readonly parsedRows = computed(() => parsePatch(this.patch()?.patch ?? ""));
  readonly highlightedRows = signal<DiffRow[] | null>(null);
  readonly rows = computed(() => this.highlightedRows() ?? this.parsedRows());
  readonly splitRows = computed(() => pairSplitRows(this.rows()));
  readonly diffScroll = viewChild<ElementRef<HTMLDivElement>>("diffScroll");
  readonly selectedLineCount = computed(() => {
    const range = this.selectedRange();
    if (!range) return 0;
    const start = Math.min(range.anchor, range.focus);
    const end = Math.max(range.anchor, range.focus);
    return this.rows().slice(start, end + 1).filter((row) => this.isSelectable(row)).length;
  });
  readonly selectionLabel = computed(() => {
    if (this.allChangesSelected()) return `${this.repository()?.files.length ?? 0} files selected`;
    const range = this.selectedRange();
    const count = this.selectedLineCount();
    if (!range || count === 0) return "Select one or more changed lines";
    if (count === 1) {
      const row = this.rows().slice(Math.min(range.anchor, range.focus), Math.max(range.anchor, range.focus) + 1)
        .find((entry) => this.isSelectable(entry));
      return `Line ${row ? this.lineFor(row) : ""}`;
    }
    return `${count} lines selected`;
  });
  readonly reviewSessionStarted = computed(() => this.notes().length > 0 || this.reviewedFiles().length > 0 || this.repositoryConversations().length > 0);
  readonly providerSessions = signal<AgentSession[]>([]);
  readonly providerSessionsAgent = signal<AgentId | null>(null);
  readonly providerSessionsLoading = signal(false);
  readonly providerSessionsError = signal<string | null>(null);
  readonly providerSessionOpeningId = signal<string | null>(null);
  readonly chatReplyDraft = signal("");
  readonly chatModelSearch = signal("");
  readonly chatModelPickerOpen = signal(false);
  readonly filteredChatModels = computed(() => {
    const query = this.chatModelSearch().trim().toLowerCase();
    return (query
      ? this.agentModels().filter((model) => model.toLowerCase().includes(query))
      : this.agentModels()).slice(0, 100);
  });
  readonly chatFontSize = signal(this.loadChatFontSize());
  readonly rowAnnotations = computed(() => {
    const annotations = new Map<number, RowAnnotations>();
    const path = this.selectedPath();
    if (!path) return annotations;
    for (const note of this.notes()) {
      if (note.filePath !== path) continue;
      const index = this.resolveAnchorIndex(note.startLine, note.diff);
      if (index < 0) continue;
      const annotation = annotations.get(index) ?? { notes: [], conversations: [] };
      annotation.notes.push(note);
      annotations.set(index, annotation);
    }
    for (const conversation of this.repositoryConversations()) {
      const context = conversation.context;
      if (!context || context.filePath !== path) continue;
      const index = this.resolveAnchorIndex(context.startLine, context.diff);
      if (index < 0) continue;
      const annotation = annotations.get(index) ?? { notes: [], conversations: [] };
      annotation.conversations.push(conversation);
      annotations.set(index, annotation);
    }
    return annotations;
  });

  private removeRepositoryListener?: () => void;
  private removeAgentListener?: () => void;
  private refreshing = false;
  private refreshDirty = false;
  private selecting = false;
  private patchRequest = 0;
  private repositoryRequest = 0;
  private highlightRequest = 0;
  private agentRequest = 0;
  private modelRequest = 0;
  private sessionListRequest = 0;
  private providerSessionRequest = 0;
  private modelsAgent: AgentId | null = null;
  private activeAgentConversationId: number | null = null;
  private conversationRequest = 0;
  private pendingProviderSessionId?: string;
  private readonly highlightWorker = new Worker(new URL("./highlight.worker.ts", import.meta.url), { type: "module" });

  ngOnInit(): void {
    this.applyTheme();
    this.highlightWorker.onmessage = ({ data }: MessageEvent<HighlightResponse>) => {
      if (data.requestId === this.highlightRequest) this.highlightedRows.set(data.rows);
    };
    const request = ++this.repositoryRequest;
    void window.rift.openRepository()
      .then((repository) => {
        if (request === this.repositoryRequest) this.acceptRepository(repository);
      })
      .catch((reason: Error) => {
        if (request === this.repositoryRequest) this.error.set(reason.message);
      })
      .finally(() => this.loading.set(false));

    this.removeRepositoryListener = window.rift.onRepositoryChanged(() => void this.refreshRepository());
    this.removeAgentListener = window.rift.onAgentEvent((event) => this.acceptAgentEvent(event));
    void window.rift.listAgents().then((agents) => {
      this.agents.set(agents);
      const preferred = localStorage.getItem(AGENT_STORAGE_KEY);
      const agent = agents.find((option) => option.id === preferred)?.id ?? agents[0]?.id ?? null;
      this.selectedAgent.set(agent);
      if (agent) void this.loadAgentModels(agent);
    }).catch((reason: Error) => {
      this.reviewMessage.set(reason.message);
    });
  }

  ngOnDestroy(): void {
    this.removeRepositoryListener?.();
    this.removeAgentListener?.();
    this.highlightWorker.terminate();
  }

  async chooseRepository(): Promise<void> {
    const request = ++this.repositoryRequest;
    try {
      const repository = await window.rift.chooseRepository();
      if (repository && request === this.repositoryRequest) this.acceptRepository(repository);
    } catch (reason) {
      if (request === this.repositoryRequest) {
        this.error.set(reason instanceof Error ? reason.message : String(reason));
      }
    }
  }

  async selectComparison(event: Event): Promise<void> {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const select = event.target;
    const request = ++this.repositoryRequest;
    this.comparisonChanging.set(true);
    this.selectedRange.set(null);
    this.allChangesSelected.set(false);
    try {
      const repository = await window.rift.selectComparison(select.value);
      if (request === this.repositoryRequest) this.acceptRepository(repository);
    } catch (reason) {
      if (request === this.repositoryRequest) {
        select.value = this.repository()?.comparisonId ?? "working-tree";
        this.error.set(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      this.comparisonChanging.set(false);
    }
  }

  selectDiffMode(event: Event): void {
    if (event.target instanceof HTMLSelectElement) {
      this.diffMode.set(event.target.value as DiffMode);
      this.resetHorizontalScroll();
    }
  }

  selectAgent(event: Event): void {
    if (event.target instanceof HTMLSelectElement) {
      const id = event.target.value as AgentId;
      if (id !== this.selectedAgent()) this.pendingProviderSessionId = undefined;
      if (id !== this.selectedAgent()) this.continuingConversationId.set(null);
      this.selectedAgent.set(id);
      this.selectedModel.set(null);
      this.modelSearch.set("");
      this.modelPickerOpen.set(false);
      this.modelsAgent = null;
      void this.loadAgentModels(id);
      if (this.chatPageOpen() && !this.activeConversation()) void this.loadProviderSessions(id);
      try {
        localStorage.setItem(AGENT_STORAGE_KEY, id);
      } catch {
        this.reviewMessage.set("Could not remember the selected agent");
      }
    }
  }

  updateChatFontSize(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    const size = Math.max(12, Math.min(20, Number(event.target.value)));
    this.chatFontSize.set(size);
    try {
      localStorage.setItem(CHAT_FONT_SIZE_KEY, String(size));
    } catch {
      this.reviewMessage.set("Could not remember the chat text size");
    }
  }

  toggleTheme(): void {
    this.darkTheme.update((dark) => !dark);
    this.applyTheme();
    try {
      localStorage.setItem(THEME_STORAGE_KEY, this.darkTheme() ? "dark" : "light");
    } catch {
      this.reviewMessage.set("Could not remember the selected theme");
    }
  }

  selectExplainConversation(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const id = Number(event.target.value);
    const conversation = Number.isSafeInteger(id) && id > 0
      ? this.availableConversations().find((entry) => entry.id === id)
      : undefined;
    this.continuingConversationId.set(conversation?.id ?? null);
    if (conversation) {
      this.modelRequest += 1;
      this.modelsLoading.set(false);
      this.selectedModel.set(conversation.model);
      this.modelSearch.set(conversation.model ?? "");
      this.modelPickerOpen.set(false);
    }
  }

  updateModelSearch(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.modelSearch.set(event.target.value);
    this.selectedModel.set(null);
    this.modelPickerOpen.set(true);
  }

  selectModel(model: string | null): void {
    this.selectedModel.set(model);
    this.modelSearch.set(model ?? "");
    this.modelPickerOpen.set(false);
    const agent = this.selectedAgent();
    if (!agent) return;
    try {
      if (model) localStorage.setItem(`${MODEL_STORAGE_PREFIX}${agent}`, model);
      else localStorage.removeItem(`${MODEL_STORAGE_PREFIX}${agent}`);
    } catch {
      this.reviewMessage.set("Could not remember the selected model");
    }
  }

  updateChatModelSearch(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.chatModelSearch.set(event.target.value);
  }

  toggleChatModelPicker(): void {
    this.chatModelPickerOpen.update((open) => !open);
    this.chatModelSearch.set("");
  }

  selectChatModel(model: string | null): void {
    const conversation = this.activeConversation();
    if (!conversation || conversation.question) return;
    this.conversations.update((conversations) => conversations.map((entry) => (
      entry.id === conversation.id ? { ...entry, model } : entry
    )));
    this.chatModelPickerOpen.set(false);
    this.chatModelSearch.set("");
    if (this.selectedAgent() === conversation.agent) {
      this.selectedModel.set(model);
      this.modelSearch.set(model ?? "");
    }
    try {
      if (model) localStorage.setItem(`${MODEL_STORAGE_PREFIX}${conversation.agent}`, model);
      else localStorage.removeItem(`${MODEL_STORAGE_PREFIX}${conversation.agent}`);
    } catch {
      this.reviewMessage.set("Could not remember the selected model");
    }
    this.persistReviewSession();
  }

  handleChatModelKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.stopPropagation();
      this.chatModelPickerOpen.set(false);
      return;
    }
    if (event.key !== "Enter") return;
    const model = this.agentModels().find((entry) => entry === this.chatModelSearch()) ?? this.filteredChatModels()[0];
    if (!model) return;
    event.preventDefault();
    event.stopPropagation();
    this.selectChatModel(model);
  }

  handleModelSearchKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.stopPropagation();
      this.modelPickerOpen.set(false);
      return;
    }
    if (event.key !== "Enter") return;
    const model = this.agentModels().find((entry) => entry === this.modelSearch()) ?? this.filteredAgentModels()[0];
    if (!model) return;
    event.preventDefault();
    event.stopPropagation();
    this.selectModel(model);
  }

  handleExplainKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing || this.modelsLoading()) return;
    event.preventDefault();
    void this.explainSelection();
  }

  selectFile(path: string): void {
    this.fileToolsMenu.set(null);
    this.chatPageOpen.set(false);
    if (path === this.selectedPath()) return;
    this.selectedPath.set(path);
    this.selectedRange.set(null);
    this.allChangesSelected.set(false);
    this.resetHorizontalScroll();
    void this.loadPatch(path);
  }

  beginSelection(index: number, row: DiffRow, event: PointerEvent): void {
    if (event.button !== 0 || !this.isSelectable(row)) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).focus({ preventScroll: true });
    if (event.detail > 1 && this.isRowSelected(index, row)) return;
    this.allChangesSelected.set(false);
    const current = this.selectedRange();
    const anchor = event.shiftKey && current ? current.anchor : index;
    this.selectedRange.set({ anchor, focus: index });
    this.selecting = true;
  }

  openTools(index: number, row: DiffRow, event: MouseEvent): void {
    if (!this.isSelectable(row)) return;
    event.preventDefault();
    this.showTools(index, row, event.clientX, event.clientY);
  }

  openToolsFromKeyboard(index: number, row: DiffRow, event: KeyboardEvent): void {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.showTools(index, row, bounds.left + 24, bounds.top + 18);
  }

  private showTools(index: number, row: DiffRow, x: number, y: number): void {
    if (!this.isSelectable(row)) return;
    if (!this.isRowSelected(index, row)) this.selectedRange.set({ anchor: index, focus: index });
    this.allChangesSelected.set(false);
    this.noteComposerOpen.set(false);
    this.questionComposerOpen.set(false);
    this.noteDraft.set("");
    this.toolsMenu.set({
      x: Math.max(6, Math.min(x, window.innerWidth - 490)),
      y: Math.max(6, Math.min(y, window.innerHeight - 430))
    });
  }

  startNote(): void {
    this.questionComposerOpen.set(false);
    this.noteComposerOpen.set(true);
    requestAnimationFrame(() => document.getElementById("review-note")?.focus());
  }

  openNoteForRow(index: number, row: DiffRow, event: MouseEvent): void {
    if (!this.isSelectable(row)) return;
    event.preventDefault();
    this.showTools(index, row, event.clientX, event.clientY);
    this.startNote();
  }

  handleNoteKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    this.saveNote();
  }

  toggleAllChanges(event: MouseEvent): void {
    const active = !this.allChangesSelected();
    this.allChangesSelected.set(active);
    this.selectedRange.set(null);
    this.noteComposerOpen.set(false);
    this.questionComposerOpen.set(false);
    if (!active) {
      this.toolsMenu.set(null);
      return;
    }
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.toolsMenu.set({
      x: Math.max(6, Math.min(bounds.right - 20, window.innerWidth - 490)),
      y: bounds.bottom + 7
    });
  }

  saveNote(): void {
    const repository = this.repository();
    const context = this.selectedContext();
    const content = this.noteDraft().trim();
    if (!repository || !context || !content) return;
    const note: ReviewNote = {
      id: crypto.randomUUID(),
      comparisonId: repository.comparisonId,
      filePath: this.selectedPath()!,
      startIndex: context.startIndex,
      endIndex: context.endIndex,
      startLine: context.startLine,
      endLine: context.endLine,
      content,
      diff: context.diff,
      createdAt: Date.now()
    };
    this.notes.update((notes) => [...notes, note]);
    this.selectedNoteIds.update((ids) => [...ids, note.id]);
    this.persistReviewSession();
    this.toolsMenu.set(null);
    this.noteComposerOpen.set(false);
    this.noteDraft.set("");
    this.reviewSidebarOpen.set(true);
    this.reviewMessage.set("Note added");
  }

  cancelNote(): void {
    this.noteComposerOpen.set(false);
    this.noteDraft.set("");
  }

  cancelQuestion(): void {
    this.questionComposerOpen.set(false);
    this.pendingProviderSessionId = undefined;
    this.continuingConversationId.set(null);
  }

  deleteNote(id: string): void {
    this.notes.update((notes) => notes.filter((note) => note.id !== id));
    this.selectedNoteIds.update((ids) => ids.filter((noteId) => noteId !== id));
    this.persistReviewSession();
  }

  isNoteSelected(id: string): boolean {
    return this.selectedNoteIds().includes(id);
  }

  toggleNoteSelection(id: string): void {
    this.selectedNoteIds.update((ids) => ids.includes(id)
      ? ids.filter((noteId) => noteId !== id)
      : [...ids, id]);
  }

  toggleAllNotes(): void {
    this.selectedNoteIds.set(this.allNotesSelected() ? [] : this.notes().map((note) => note.id));
  }

  isFileReviewed(path: string): boolean {
    return this.reviewedFiles().includes(path);
  }

  toggleSelectedFileReviewed(): void {
    const path = this.selectedPath();
    if (!path) return;
    this.toggleFileReviewed(path);
  }

  toggleFileReviewed(path: string): void {
    const reviewed = this.isFileReviewed(path);
    this.reviewedFiles.update((paths) => reviewed
      ? paths.filter((entry) => entry !== path)
      : [...paths, path]);
    this.persistReviewSession();
    this.reviewMessage.set(reviewed ? "File marked unreviewed" : "File marked reviewed");
    this.fileToolsMenu.set(null);
  }

  openFileTools(path: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.toolsMenu.set(null);
    this.fileToolsMenu.set({
      path,
      x: Math.max(6, Math.min(event.clientX, window.innerWidth - 210)),
      y: Math.max(6, Math.min(event.clientY, window.innerHeight - 90))
    });
  }

  clearReviewSession(): void {
    if (!this.clearSessionArmed()) {
      this.clearSessionArmed.set(true);
      this.reviewMessage.set("Click Clear session again to confirm");
      return;
    }
    const root = this.repository()?.root;
    this.notes.set([]);
    this.selectedNoteIds.set([]);
    this.reviewedFiles.set([]);
    this.conversations.update((conversations) => conversations.filter((conversation) => conversation.repositoryRoot !== root));
    this.activeConversationId.set(null);
    this.activeLinkedNoteId.set(null);
    this.activeQuestion.set("");
    this.agentResult.set(null);
    this.agentError.set(null);
    this.agentModalOpen.set(false);
    this.conversationChoiceOpen.set(false);
    this.pendingExplain.set(null);
    this.providerSessionRequest += 1;
    this.sessionListRequest += 1;
    this.providerSessionOpeningId.set(null);
    this.pendingProviderSessionId = undefined;
    this.continuingConversationId.set(null);
    this.chatPageOpen.set(false);
    this.toolsMenu.set(null);
    this.noteComposerOpen.set(false);
    this.questionComposerOpen.set(false);
    this.selectedRange.set(null);
    this.allChangesSelected.set(false);
    this.clearSessionArmed.set(false);
    const key = this.reviewSessionStorageKey();
    const legacyKey = this.legacyNotesStorageKey();
    try {
      if (key) localStorage.removeItem(key);
      if (legacyKey) localStorage.removeItem(legacyKey);
    } catch {
      this.reviewMessage.set("Session cleared, but persisted data could not be removed");
      return;
    }
    this.reviewMessage.set("Session cleared");
  }

  async navigateToNote(note: ReviewNote): Promise<void> {
    if (!this.repository()?.files.some((file) => file.path === note.filePath)) {
      this.reviewMessage.set("File is no longer in this comparison");
      return;
    }
    if (this.selectedPath() !== note.filePath) {
      this.selectedPath.set(note.filePath);
      await this.loadPatch(note.filePath);
    }
    const rows = this.rows();
    const firstDiffLine = note.diff.split("\n")[0] ?? "";
    const expectedKind = firstDiffLine.startsWith("+")
      ? "addition"
      : firstDiffLine.startsWith("-") ? "deletion" : "context";
    const expectedContent = firstDiffLine.slice(1);
    const resolvedStart = rows.findIndex((row) => (
      row.kind === expectedKind && this.lineFor(row) === note.startLine && row.content === expectedContent
    ));
    if (resolvedStart < 0) {
      this.selectedRange.set(null);
      this.reviewMessage.set("Note anchor is outdated");
      return;
    }
    const start = resolvedStart;
    let end = start;
    let cursor = start;
    for (const diffLine of note.diff.split("\n").slice(1)) {
      const kind = diffLine.startsWith("+") ? "addition" : diffLine.startsWith("-") ? "deletion" : "context";
      const next = rows.findIndex((row, index) => index > cursor && row.kind === kind && row.content === diffLine.slice(1));
      if (next < 0) break;
      cursor = next;
      end = next;
    }
    this.selectedRange.set({ anchor: start, focus: end });
    this.activeLinkedNoteId.set(note.id);
    requestAnimationFrame(() => {
      this.diffScroll()?.nativeElement.querySelector(".line-selected")?.scrollIntoView({ block: "center" });
    });
  }

  async copyNotes(): Promise<void> {
    if (this.notes().length === 0) return;
    try {
      await window.rift.copyText(this.formatNotes());
      this.reviewMessage.set("Copied agent-ready notes");
    } catch (reason) {
      this.reviewMessage.set(reason instanceof Error ? reason.message : String(reason));
    }
  }

  startExplain(): void {
    this.continuingConversationId.set(null);
    this.noteComposerOpen.set(false);
    this.questionDraft.set("");
    this.modelSearch.set(this.selectedModel() ?? "");
    this.modelPickerOpen.set(false);
    this.questionComposerOpen.set(true);
    const agent = this.selectedAgent();
    if (agent && this.modelsAgent !== agent && !this.modelsLoading()) void this.loadAgentModels(agent);
  }

  startSidebarExplain(): void {
    if (!this.selectedAgent() || this.agentRunning()) return;
    if (!this.selectedContext()) {
      this.selectedRange.set(null);
      this.allChangesSelected.set(true);
    }
    this.toolsMenu.set({
      x: Math.max(6, window.innerWidth - (this.reviewSidebarOpen() ? 710 : 444)),
      y: 86
    });
    this.startExplain();
  }

  openChats(): void {
    this.chatPageOpen.set(true);
    this.activeConversationId.set(null);
    const agent = this.selectedAgent();
    if (agent) void this.loadProviderSessions(agent);
  }

  showDiff(): void {
    this.chatPageOpen.set(false);
    this.activeConversationId.set(null);
    this.toolsMenu.set(null);
    this.fileToolsMenu.set(null);
    this.questionComposerOpen.set(false);
    this.pendingProviderSessionId = undefined;
  }

  openInlineNote(note: ReviewNote): void {
    this.activeLinkedNoteId.set(note.id);
    this.reviewSidebarOpen.set(true);
    requestAnimationFrame(() => {
      document.getElementById(`review-note-${note.id}`)?.scrollIntoView({ block: "center" });
    });
  }

  startNewChat(): void {
    const repository = this.repository();
    const agent = this.selectedAgent();
    if (!repository || !agent || this.agentRunning()) return;
    const conversation: Conversation = {
      id: ++this.conversationRequest,
      repositoryRoot: repository.root,
      agent,
      model: this.selectedModel(),
      question: "",
      status: "complete",
      result: null,
      error: null,
      history: []
    };
    this.pendingProviderSessionId = undefined;
    this.chatPageOpen.set(true);
    this.activeConversationId.set(conversation.id);
    this.continuingConversationId.set(null);
    this.selectedRange.set(null);
    this.allChangesSelected.set(false);
    this.toolsMenu.set(null);
    this.questionComposerOpen.set(false);
    this.activeQuestion.set("");
    this.agentResult.set(null);
    this.agentError.set(null);
    this.chatReplyDraft.set("");
    this.chatModelPickerOpen.set(false);
    this.chatModelSearch.set("");
    this.conversations.update((conversations) => [...conversations, conversation]);
    this.persistReviewSession();
    if (this.modelsAgent !== agent && !this.modelsLoading()) void this.loadAgentModels(agent, conversation.model);
  }

  async resumeProviderSession(session: AgentSession): Promise<void> {
    const agent = this.selectedAgent();
    const repository = this.repository();
    if (!agent || !repository || this.agentRunning() || this.providerSessionOpeningId()) return;
    const imported = this.repositoryConversations().find((conversation) => conversation.agent === agent && conversation.providerSessionId === session.id);
    if (imported) {
      this.openConversation(imported.id);
      return;
    }
    const request = ++this.providerSessionRequest;
    this.providerSessionOpeningId.set(session.id);
    this.providerSessionsError.set(null);
    try {
      const history = await window.rift.getAgentSession(agent, session.id);
      if (request !== this.providerSessionRequest || this.selectedAgent() !== agent || this.repository()?.root !== repository.root) return;
      const conversation = this.importProviderConversation(agent, history, repository.root);
      this.conversations.update((conversations) => [...conversations, conversation]);
      this.activeConversationId.set(conversation.id);
      this.activeQuestion.set(conversation.question);
      this.agentResult.set(conversation.result);
      this.agentError.set(null);
      this.chatReplyDraft.set("");
      this.persistReviewSession();
    } catch (reason) {
      if (request === this.providerSessionRequest && this.repository()?.root === repository.root) {
        this.providerSessionsError.set(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (request === this.providerSessionRequest) this.providerSessionOpeningId.set(null);
    }
  }

  leaveChatPage(): void {
    if (this.activeConversation()) this.openChats();
    else this.chatPageOpen.set(false);
  }

  async sendChatReply(): Promise<void> {
    const conversation = this.activeConversation();
    const question = this.chatReplyDraft().trim().slice(0, 20_000);
    if (!conversation || !question || this.agentRunning()) return;
    this.chatReplyDraft.set("");
    const pending: PendingExplain = {
      agent: conversation.agent,
      model: conversation.model,
      prompt: question,
      question,
      providerSessionId: conversation.providerSessionId
    };
    await this.startExplainRequest(pending, conversation.id);
  }

  handleChatReplyKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    void this.sendChatReply();
  }

  continueConversation(): void {
    const conversation = this.activeConversation();
    if (!conversation || conversation.status === "running") return;
    const agentChanged = this.selectedAgent() !== conversation.agent;
    this.selectedAgent.set(conversation.agent);
    this.selectedModel.set(conversation.model);
    if (agentChanged) void this.loadAgentModels(conversation.agent, conversation.model);
    this.selectedRange.set(null);
    this.allChangesSelected.set(true);
    this.toolsMenu.set({ x: Math.max(12, window.innerWidth / 2 - 195), y: 94 });
    this.startExplain();
    this.continuingConversationId.set(conversation.id);
  }

  async explainSelection(): Promise<void> {
    const context = this.selectedContext();
    const repository = this.repository();
    const agent = this.selectedAgent();
    if ((!context && !this.allChangesSelected()) || !repository || !agent || this.agentRunning()) return;
    const question = (this.questionDraft().trim() || "Explain this").slice(0, 20_000);
    const scope = this.allChangesSelected()
      ? [
          "Scope: the complete comparison.",
          `Start revision: ${repository.startRevision}`,
          `End revision: ${repository.endRevision ?? "working tree"}`,
          "Inspect the complete Git diff with read-only tools before answering.",
          "Changed files:",
          ...repository.files.map((file) => `- ${file.path}`)
        ]
      : [
          `Location: ${this.selectedPath()}:${context!.startLine}-${context!.endLine}`,
          "Selected diff:",
          "```diff",
          context!.diff,
          "```"
        ];
    const prompt = [
      "You are in read-only review mode. Do not edit files or run mutating commands.",
      "Respond with analysis only.",
      `Repository: ${repository.name}`,
      `Comparison: ${repository.comparisonLabel}`,
      ...scope,
      `Question: ${question}`,
      "Explain intent, behavior, and any non-obvious implications concisely."
    ].join("\n");
    this.toolsMenu.set(null);
    this.questionComposerOpen.set(false);
    this.activeQuestion.set(question);
    const conversationContext = context ? {
      filePath: this.selectedPath()!,
      startLine: context.startLine,
      endLine: context.endLine,
      diff: context.diff
    } : undefined;
    const pending: PendingExplain = {
      agent,
      model: this.selectedModel(),
      prompt,
      question,
      context: conversationContext,
      providerSessionId: this.pendingProviderSessionId
    };
    this.pendingProviderSessionId = undefined;
    this.pendingExplain.set(pending);
    this.chatPageOpen.set(true);
    const conversationId = this.continuingConversationId();
    this.continuingConversationId.set(null);
    await this.startExplainRequest(pending, conversationId ?? undefined);
  }

  async startExplainRequest(pending = this.pendingExplain(), conversationId?: number): Promise<void> {
    if (!pending) return;
    const existing = conversationId === undefined
      ? null
      : this.repositoryConversations().find((conversation) => conversation.id === conversationId);
    const agent = existing?.agent ?? pending.agent;
    const model = existing?.model ?? pending.model;
    const previousTurns = existing?.question
      ? [...existing.history, {
          question: existing.question,
          context: existing.context,
          result: existing.result,
          error: existing.error
        }]
      : [];
    const prompt = existing?.result && !existing.providerSessionId
      ? [
          pending.prompt,
          "Continue the existing review conversation.",
          "Conversation so far:",
          ...previousTurns.slice(-10).flatMap((turn, index) => [
            `Question ${index + 1}: ${turn.question.slice(0, 1_000)}`,
            `Response ${index + 1}: ${(turn.result?.explanation ?? turn.error ?? "No response").slice(0, 6_000)}`
          ])
        ].join("\n\n")
      : pending.prompt;
    this.conversationChoiceOpen.set(false);
    this.pendingExplain.set(null);
    this.pendingProviderSessionId = undefined;
    this.activeQuestion.set(pending.question);
    this.chatPageOpen.set(true);
    this.selectedAgent.set(agent);
    await this.sendToAgent(agent, model, prompt, pending.context, conversationId, existing?.providerSessionId ?? pending.providerSessionId);
  }

  cancelConversationChoice(): void {
    this.conversationChoiceOpen.set(false);
    this.pendingExplain.set(null);
  }

  sendNotesToAgent(): void {
    const agent = this.selectedAgent();
    const notes = this.selectedNotes();
    if (!agent || notes.length === 0 || this.agentRunning()) return;
    const prompt = [
      "You are in read-only review mode. Do not edit files or run mutating commands.",
      "Respond with analysis only.",
      "Review these code-anchored notes.",
      "Inspect the referenced code and respond with concrete recommendations for each note.",
      "",
      this.formatNotes(notes)
    ].join("\n");
    const question = `Review ${notes.length} code note${notes.length === 1 ? "" : "s"}`;
    this.pendingExplain.set({ agent, model: this.selectedModel(), prompt, question });
    this.conversationChoiceOpen.set(true);
  }

  closeAgentModal(): void {
    this.agentModalOpen.set(false);
  }

  openConversation(id?: number): void {
    const conversation = this.conversations().find((entry) => entry.id === (id ?? this.activeConversationId()));
    if (!conversation) return;
    this.activeConversationId.set(conversation.id);
    this.activeQuestion.set(conversation.question);
    this.agentResult.set(conversation.result);
    this.agentError.set(conversation.error);
    this.chatReplyDraft.set("");
    this.chatModelPickerOpen.set(false);
    this.chatModelSearch.set("");
    this.chatPageOpen.set(true);
  }

  closeConversation(id: number): void {
    const conversations = this.repositoryConversations();
    const index = conversations.findIndex((conversation) => conversation.id === id);
    if (index < 0) return;
    const closing = conversations[index];
    const remaining = conversations.filter((conversation) => conversation.id !== id);
    if (closing.status === "running") void this.cancelAgent();
    this.conversations.update((entries) => entries.filter((conversation) => conversation.id !== id));
    if (this.activeConversationId() === id) {
      const next = remaining[Math.min(index, remaining.length - 1)];
      if (next) this.openConversation(next.id);
      else this.openChats();
    }
    this.persistReviewSession();
  }

  async cancelAgent(): Promise<void> {
    if (!this.agentRunning()) return;
    this.reviewMessage.set("Cancelling agent request");
    try {
      await window.rift.cancelAgent();
    } catch (reason) {
      this.reviewMessage.set(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async jumpToConversationContext(context: ConversationContext): Promise<void> {
    const repository = this.repository();
    if (!repository?.files.some((file) => file.path === context.filePath)) {
      this.reviewMessage.set("Conversation context is no longer in this comparison");
      return;
    }
    if (this.selectedPath() !== context.filePath) {
      this.selectedPath.set(context.filePath);
      await this.loadPatch(context.filePath);
    }
    const firstDiffLine = context.diff.split("\n")[0] ?? "";
    const expectedKind = firstDiffLine.startsWith("+")
      ? "addition"
      : firstDiffLine.startsWith("-") ? "deletion" : "context";
    const expectedContent = firstDiffLine.slice(1);
    const start = this.rows().findIndex((row) => (
      row.kind === expectedKind && this.lineFor(row) === context.startLine && row.content === expectedContent
    ));
    if (start < 0) {
      this.reviewMessage.set("Conversation context is outdated");
      return;
    }
    const lastDiffLine = context.diff.split("\n").at(-1) ?? firstDiffLine;
    const end = context.endLine === context.startLine
      ? start
      : this.rows().findIndex((row, index) => (
        index >= start && this.lineFor(row) === context.endLine && row.content === lastDiffLine.slice(1)
      ));
    this.selectedRange.set({ anchor: start, focus: end >= start ? end : start });
    requestAnimationFrame(() => {
      this.diffScroll()?.nativeElement.querySelector(".line-selected")?.scrollIntoView({ block: "center" });
    });
    this.agentModalOpen.set(false);
    this.chatPageOpen.set(false);
  }

  @HostListener("document:pointerdown", ["$event"])
  dismissTools(event: PointerEvent): void {
    if (!this.toolsMenu() && !this.fileToolsMenu()) return;
    const target = event.target;
    if (target instanceof Element && !target.closest(".selection-tools") && !target.closest(".file-tools")) {
      this.toolsMenu.set(null);
      this.fileToolsMenu.set(null);
      this.noteComposerOpen.set(false);
      this.questionComposerOpen.set(false);
      this.pendingProviderSessionId = undefined;
      this.continuingConversationId.set(null);
    }
  }

  @HostListener("document:keydown.escape")
  closeTools(): void {
    if (this.agentModalOpen()) this.closeAgentModal();
    else if (this.noteComposerOpen()) this.cancelNote();
    else if (this.questionComposerOpen()) {
      this.questionComposerOpen.set(false);
      this.pendingProviderSessionId = undefined;
    }
    else {
      this.toolsMenu.set(null);
      this.fileToolsMenu.set(null);
    }
  }

  extendSelection(index: number, event: PointerEvent): void {
    if ((event.buttons & 1) === 0) {
      this.selecting = false;
      return;
    }
    const current = this.selectedRange();
    if (this.selecting && current) this.selectedRange.set({ ...current, focus: index });
  }

  @HostListener("document:pointerup")
  finishSelection(): void {
    this.selecting = false;
  }

  isRowSelected(index: number, row: DiffRow): boolean {
    const range = this.selectedRange();
    if (!range || !this.isSelectable(row)) return false;
    return index >= Math.min(range.anchor, range.focus) && index <= Math.max(range.anchor, range.focus);
  }

  selectWithKeyboard(index: number, row: DiffRow, event: KeyboardEvent): void {
    if (!this.isSelectable(row) || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    this.allChangesSelected.set(false);
    const current = this.selectedRange();
    this.selectedRange.set({
      anchor: event.shiftKey && current ? current.anchor : index,
      focus: index
    });
  }

  handleRowKeydown(index: number, row: DiffRow, event: KeyboardEvent): void {
    this.selectWithKeyboard(index, row, event);
    this.openToolsFromKeyboard(index, row, event);
  }

  isSelectable(row: DiffRow): boolean {
    return row.kind === "addition" || row.kind === "deletion" || row.kind === "context";
  }

  lineFor(row: DiffRow): number | undefined {
    return row.newLine ?? row.oldLine;
  }

  statusLabel(file: ChangedFile): string {
    return { added: "A", modified: "M", deleted: "D", renamed: "R", untracked: "U" }[file.status];
  }

  shortName(path: string): string {
    return path.split("/").at(-1) || path;
  }

  agentLabel(id: AgentId): string {
    return this.agents().find((agent) => agent.id === id)?.label ?? id;
  }

  isAgentAuthError(error: string): boolean {
    return error.includes("Authentication required.");
  }

  sessionUpdatedLabel(updatedAt: number): string {
    const elapsed = Math.max(0, Date.now() - updatedAt);
    if (elapsed < 60_000) return "Just now";
    if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
    if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
    return `${Math.floor(elapsed / 86_400_000)}d ago`;
  }

  isProviderSessionImported(session: AgentSession): boolean {
    const agent = this.selectedAgent();
    return this.repositoryConversations().some((conversation) => conversation.agent === agent && conversation.providerSessionId === session.id);
  }

  directory(path: string): string {
    return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";
  }

  renderMarkdown(markdown: string): string {
    const escaped = markdown.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    return marked.parse(escaped, { async: false, breaks: true });
  }

  private resolveAnchorIndex(startLine: number, diff: string): number {
    const firstDiffLine = diff.split("\n", 1)[0] ?? "";
    const expectedKind = firstDiffLine.startsWith("+")
      ? "addition"
      : firstDiffLine.startsWith("-") ? "deletion" : "context";
    const expectedContent = firstDiffLine.slice(1);
    return this.rows().findIndex((row) => (
      row.kind === expectedKind && this.lineFor(row) === startLine && row.content === expectedContent
    ));
  }

  private acceptRepository(repository: RepositorySnapshot, preserveSelection = false): void {
    const previousPath = this.selectedPath();
    const previousComparison = this.repository()?.comparisonId;
    const previousRoot = this.repository()?.root;
    const previousBranch = this.repository()?.branch;
    this.repository.set(repository);
    if (previousRoot !== repository.root) {
      this.sessionListRequest += 1;
      this.providerSessionRequest += 1;
      this.activeConversationId.set(null);
      this.agentModalOpen.set(false);
      this.conversationChoiceOpen.set(false);
      this.pendingExplain.set(null);
      this.chatPageOpen.set(false);
      this.providerSessions.set([]);
      this.providerSessionsAgent.set(null);
      this.providerSessionsLoading.set(false);
      this.providerSessionOpeningId.set(null);
      this.providerSessionsError.set(null);
    }
    if (
      previousRoot !== repository.root
      || previousBranch !== repository.branch
      || previousComparison !== repository.comparisonId
    ) this.loadReviewSession();
    this.error.set(null);
    const current = this.selectedPath();
    const nextPath = repository.files.some((file) => file.path === current) ? current : repository.files[0]?.path ?? null;
    const keepSelection = preserveSelection
      && previousComparison === repository.comparisonId
      && previousPath === nextPath;
    if (!keepSelection) this.selectedRange.set(null);
    if (!keepSelection) this.allChangesSelected.set(false);
    this.selectedPath.set(nextPath);
    if (nextPath) void this.loadPatch(nextPath, keepSelection);
    else {
      this.patch.set(null);
      this.selectedRange.set(null);
    }
  }

  private async refreshRepository(): Promise<void> {
    if (this.refreshing) {
      this.refreshDirty = true;
      return;
    }
    this.refreshing = true;
    const request = ++this.repositoryRequest;
    try {
      const repository = await window.rift.refreshRepository();
      if (request === this.repositoryRequest) this.acceptRepository(repository, true);
    } catch (reason) {
      if (request === this.repositoryRequest) {
        this.error.set(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      this.refreshing = false;
      if (this.refreshDirty) {
        this.refreshDirty = false;
        void this.refreshRepository();
      }
    }
  }

  private async loadPatch(path: string, preserveSelection = false): Promise<void> {
    const request = ++this.patchRequest;
    this.highlightRequest += 1;
    const previousPatch = this.patch();
    if (!preserveSelection) {
      this.patch.set(null);
      this.highlightedRows.set(null);
      this.resetHorizontalScroll();
    }
    try {
      const patch = await window.rift.getFilePatch(path);
      if (request === this.patchRequest) {
        if (
          previousPatch?.path === patch.path
          && previousPatch.patch === patch.patch
          && previousPatch.binary === patch.binary
        ) return;
        if (preserveSelection && previousPatch?.patch !== patch.patch) this.selectedRange.set(null);
        this.patch.set(patch);
        this.requestHighlighting();
      }
    } catch (reason) {
      if (request === this.patchRequest) this.error.set(reason instanceof Error ? reason.message : String(reason));
    }
  }

  private requestHighlighting(): void {
    const rows = this.parsedRows();
    const language = this.detectedLanguage();
    const characterCount = rows.reduce((total, row) => total + row.content.length, 0);
    const requestId = ++this.highlightRequest;
    this.highlightedRows.set(null);
    if (
      language.id === "plaintext"
      || rows.length > 120
      || characterCount > 30_000
      || rows.some((row) => row.content.length > 10_000)
    ) return;
    this.highlightWorker.postMessage({ requestId, rows, languageId: language.id });
  }

  private resetHorizontalScroll(): void {
    requestAnimationFrame(() => {
      const element = this.diffScroll()?.nativeElement;
      if (element) element.scrollLeft = 0;
    });
  }

  private selectedContext(): {
    startIndex: number;
    endIndex: number;
    startLine: number;
    endLine: number;
    diff: string;
  } | null {
    const range = this.selectedRange();
    if (!range) return null;
    const startIndex = Math.min(range.anchor, range.focus);
    const endIndex = Math.max(range.anchor, range.focus);
    const selectedRows = this.rows().slice(startIndex, endIndex + 1).filter((row) => this.isSelectable(row));
    const lines = selectedRows.map((row) => this.lineFor(row)).filter((line): line is number => line !== undefined);
    if (selectedRows.length === 0 || lines.length === 0) return null;
    return {
      startIndex,
      endIndex,
      startLine: Math.min(...lines),
      endLine: Math.max(...lines),
      diff: selectedRows.map((row) => {
        const prefix = row.kind === "addition" ? "+" : row.kind === "deletion" ? "-" : " ";
        return `${prefix}${row.content}`;
      }).join("\n")
    };
  }

  private reviewSessionStorageKey(): string | null {
    const repository = this.repository();
    return repository
      ? `rift:review-session:${repository.root}:${repository.branch}:${repository.comparisonId}`
      : null;
  }

  private legacyNotesStorageKey(): string | null {
    const repository = this.repository();
    return repository ? `rift:notes:${repository.root}:${repository.comparisonId}` : null;
  }

  private loadReviewSession(): void {
    const key = this.reviewSessionStorageKey();
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const stored: unknown = JSON.parse(raw);
        if (!isReviewSessionData(stored)) throw new Error("Invalid review session");
        const notes = stored.notes.filter(isReviewNote).slice(0, 500);
        this.notes.set(notes);
        this.selectedNoteIds.set(notes.map((note) => note.id));
        this.reviewedFiles.set([...new Set(stored.reviewedFiles)].slice(0, 5_000));
        const root = this.repository()!.root;
        const restored = (stored.conversations ?? []).filter(isConversation).slice(-100).map((conversation) => (
          conversation.status === "running"
            ? { ...conversation, status: "cancelled" as const, error: "The request was interrupted when Rift closed." }
            : conversation
        ));
        this.conversations.update((conversations) => [
          ...conversations.filter((conversation) => conversation.repositoryRoot !== root),
          ...restored
        ]);
        this.conversationRequest = Math.max(this.conversationRequest, ...restored.map((conversation) => conversation.id), 0);
        this.clearSessionArmed.set(false);
        return;
      }
      const legacyKey = this.legacyNotesStorageKey();
      const legacy: unknown = JSON.parse(legacyKey ? localStorage.getItem(legacyKey) ?? "[]" : "[]");
      const notes = Array.isArray(legacy) ? legacy.filter(isReviewNote).slice(0, 500) : [];
      this.notes.set(notes);
      this.selectedNoteIds.set(notes.map((note) => note.id));
      this.reviewedFiles.set([]);
      const root = this.repository()!.root;
      this.conversations.update((conversations) => conversations.filter((conversation) => conversation.repositoryRoot !== root));
      this.clearSessionArmed.set(false);
      if (this.notes().length > 0) {
        this.persistReviewSession();
        if (legacyKey) localStorage.removeItem(legacyKey);
      }
    } catch {
      this.notes.set([]);
      this.selectedNoteIds.set([]);
      this.reviewedFiles.set([]);
      const root = this.repository()?.root;
      this.conversations.update((conversations) => conversations.filter((conversation) => conversation.repositoryRoot !== root));
      this.clearSessionArmed.set(false);
    }
  }

  private persistReviewSession(): void {
    const key = this.reviewSessionStorageKey();
    if (!key) return;
    try {
      const session: ReviewSessionData = {
        version: 2,
        reviewedFiles: this.reviewedFiles(),
        notes: this.notes(),
        conversations: this.repositoryConversations().slice(-100)
      };
      localStorage.setItem(key, JSON.stringify(session));
    } catch {
      this.reviewMessage.set("Could not persist review session");
    }
  }

  private formatNotes(notes = this.notes()): string {
    const repository = this.repository()!;
    const sections = notes.map((note, index) => [
      `## ${index + 1}. ${note.filePath}:${note.startLine}-${note.endLine}`,
      note.content,
      "",
      "Selected diff:",
      "```diff",
      note.diff,
      "```"
    ].join("\n"));
    return [
      "# Rift review notes",
      `Repository: ${repository.name}`,
      `Comparison: ${repository.comparisonLabel}`,
      "",
      ...sections
    ].join("\n\n");
  }

  private async loadAgentModels(agent: AgentId, preferredModel: string | null = null): Promise<void> {
    const request = ++this.modelRequest;
    this.modelsLoading.set(true);
    this.agentModels.set([]);
    this.modelsAgent = null;
    try {
      const models = await window.rift.listAgentModels(agent);
      if (request !== this.modelRequest || this.selectedAgent() !== agent) return;
      this.agentModels.set(models);
      this.modelsAgent = agent;
      const saved = preferredModel ?? localStorage.getItem(`${MODEL_STORAGE_PREFIX}${agent}`);
      this.selectedModel.set(saved && models.includes(saved) ? saved : null);
      this.modelSearch.set(this.selectedModel() ?? "");
    } catch (reason) {
      if (request === this.modelRequest && this.selectedAgent() === agent) {
        this.selectedModel.set(null);
        this.reviewMessage.set(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (request === this.modelRequest && this.selectedAgent() === agent) this.modelsLoading.set(false);
    }
  }

  private async loadProviderSessions(agent: AgentId): Promise<void> {
    const request = ++this.sessionListRequest;
    this.providerSessionsLoading.set(true);
    this.providerSessionsError.set(null);
    this.providerSessions.set([]);
    this.providerSessionsAgent.set(null);
    try {
      const sessions = await window.rift.listAgentSessions(agent);
      if (request === this.sessionListRequest && this.selectedAgent() === agent) {
        this.providerSessions.set(sessions);
        this.providerSessionsAgent.set(agent);
      }
    } catch (reason) {
      if (request === this.sessionListRequest && this.selectedAgent() === agent) {
        this.providerSessionsError.set(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (request === this.sessionListRequest && this.selectedAgent() === agent) this.providerSessionsLoading.set(false);
    }
  }

  private loadChatFontSize(): number {
    try {
      const stored = Number(localStorage.getItem(CHAT_FONT_SIZE_KEY));
      return stored >= 12 && stored <= 20 ? stored : 14;
    } catch {
      return 14;
    }
  }

  private loadDarkTheme(): boolean {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "dark" || stored === "light") return stored === "dark";
    } catch {
      // Fall back to the operating system preference.
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  private applyTheme(): void {
    const theme = this.darkTheme() ? "dark" : "light";
    document.documentElement.dataset["theme"] = theme;
    document.documentElement.style.colorScheme = theme;
    void window.rift.setTheme(theme).catch(() => {
      this.reviewMessage.set("Could not update the window theme");
    });
  }

  private importProviderConversation(agent: AgentId, history: AgentConversationHistory, repositoryRoot: string): Conversation {
    const exchanges: Array<{ question: string; result: AgentRunResult | null }> = [];
    for (const message of history.messages) {
      if (message.role === "user") {
        exchanges.push({ question: message.content.slice(0, 20_000), result: null });
      } else if (exchanges.length > 0) {
        const exchange = exchanges.at(-1)!;
        exchange.result = {
          tools: [],
          explanation: [exchange.result?.explanation, message.content].filter(Boolean).join("\n\n").slice(0, 1_000_000)
        };
      }
    }
    if (exchanges.length === 0) exchanges.push({ question: history.title.slice(0, 20_000), result: null });
    const retainedExchanges = exchanges.slice(-500);
    const current = retainedExchanges.at(-1)!;
    return {
      id: ++this.conversationRequest,
      repositoryRoot,
      title: history.title.slice(0, 500),
      agent,
      model: history.model?.slice(0, 200) ?? null,
      question: current.question,
      status: "complete",
      result: current.result,
      error: null,
      history: retainedExchanges.slice(0, -1).map((exchange) => ({
        question: exchange.question,
        result: exchange.result,
        error: null
      })),
      providerSessionId: history.id
    };
  }

  private acceptAgentEvent(event: AgentStreamEvent): void {
    if (event.runId !== String(this.agentRequest)) return;
    const conversationId = this.activeAgentConversationId;
    if (this.activeConversationId() === conversationId) {
      this.agentResult.update((result) => this.mergeAgentResult(result, event.result));
    }
    this.conversations.update((conversations) => conversations.map((conversation) => (
      conversation.id === conversationId
        ? {
            ...conversation,
            result: this.mergeAgentResult(conversation.result, event.result),
            providerSessionId: conversation.providerSessionId ?? event.result.sessionId
          }
        : conversation
    )));
  }

  private mergeAgentResult(current: AgentRunResult | null, update: AgentRunResult): AgentRunResult {
    const tools = new Map((current?.tools ?? []).map((tool) => [tool.id, tool]));
    for (const tool of update.tools) {
      const existing = tools.get(tool.id);
      tools.set(tool.id, {
        ...existing,
        ...tool,
        name: tool.name || existing?.name || "Tool",
        detail: tool.detail ?? existing?.detail
      });
    }
    return {
      tools: [...tools.values()].slice(0, 2_000),
      explanation: `${current?.explanation ?? ""}${update.explanation}`.slice(0, 1_000_000),
      sessionId: update.sessionId ?? current?.sessionId
    };
  }

  private async sendToAgent(agent: AgentId, model: string | null, prompt: string, context?: ConversationContext, existingConversationId?: number, providerSessionId?: string): Promise<void> {
    const repository = this.repository();
    if (!repository) return;
    const request = ++this.agentRequest;
    const conversationId = existingConversationId ?? ++this.conversationRequest;
    this.activeAgentConversationId = conversationId;
    const question = this.activeQuestion();
    this.conversations.update((conversations) => existingConversationId
      ? conversations.map((conversation) => conversation.id === conversationId
        ? {
            ...conversation,
            agent,
            model,
            question,
            context,
            status: "running",
            result: null,
            error: null,
            providerSessionId,
            history: (conversation.question
              ? [...conversation.history, {
                  question: conversation.question,
                  context: conversation.context,
                  result: conversation.result,
                  error: conversation.error
                }]
              : conversation.history).slice(-500)
          }
        : conversation)
      : [...conversations, {
          id: conversationId,
          repositoryRoot: repository.root,
          agent,
          model,
          question,
          context,
          status: "running",
          result: null,
          error: null,
          history: [],
          providerSessionId
        }]);
    this.activeConversationId.set(conversationId);
    this.agentRunning.set(true);
    this.agentResult.set(null);
    this.agentError.set(null);
    this.reviewMessage.set(`Waiting for ${this.agents().find((option) => option.id === agent)?.label ?? agent}`);
    try {
      const agentResult = await window.rift.runAgent(String(request), agent, model, prompt, providerSessionId);
      const result = this.mergeAgentResult(null, agentResult);
      if (request === this.agentRequest) {
        if (this.activeConversationId() === conversationId) this.agentResult.set(result);
        this.conversations.update((conversations) => conversations.map((conversation) => (
          conversation.id === conversationId ? {
            ...conversation,
            status: "complete",
            result,
            error: null,
            providerSessionId: conversation.providerSessionId ?? result.sessionId
          } : conversation
        )));
        this.reviewMessage.set("Explanation ready");
      }
    } catch (reason) {
      if (request === this.agentRequest) {
        const rawError = reason instanceof Error ? reason.message : String(reason);
        const authenticationStart = rawError.indexOf("Authentication required.");
        const error = authenticationStart >= 0 ? rawError.slice(authenticationStart) : rawError;
        const authenticationError = this.isAgentAuthError(error);
        if (this.activeConversationId() === conversationId) {
          this.agentError.set(error);
          if (authenticationError) this.agentResult.set(null);
        }
        this.conversations.update((conversations) => conversations.map((conversation) => (
          conversation.id === conversationId
            ? { ...conversation, status: error.toLowerCase().includes("cancel") ? "cancelled" : "error", result: authenticationError ? null : conversation.result, error }
            : conversation
        )));
        this.reviewMessage.set(authenticationError
          ? `${this.agentLabel(agent)} sign-in required`
          : error.toLowerCase().includes("cancel") ? "Agent request cancelled" : "Agent request failed");
      }
    } finally {
      if (request === this.agentRequest) {
        this.agentRunning.set(false);
        this.persistReviewSession();
      }
    }
  }
}
