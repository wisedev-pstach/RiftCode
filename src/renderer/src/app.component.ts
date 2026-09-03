import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  afterRenderEffect,
  HostListener,
  OnDestroy,
  OnInit,
  signal,
  viewChild
} from "@angular/core";
import { marked } from "marked";
import type { AgentConversationHistory, AgentId, AgentMode, AgentOption, AgentRunResult, AgentSession, AgentStreamEvent, AgentToolEvent, ChangedFile, ContextResourcePath, FilePatch, RepositoryFileView, RepositorySearchResult, RepositorySnapshot, UpdateStatus } from "../../shared/contracts";
import versionManifest from "../../../version.json";

type DiffKind = "header" | "hunk" | "context" | "addition" | "deletion" | "meta";
type DiffMode = "unified" | "split";
type ReviewTone = "professional" | "honest";

interface DetectedLanguage {
  id: string;
  label: string;
}

const PLAIN_TEXT: DetectedLanguage = { id: "plaintext", label: "Plain text" };
const AGENT_STORAGE_KEY = "rift:last-agent";
const AGENT_MODEL_STORAGE_KEY = "rift:last-agent-model";
const MODEL_STORAGE_PREFIX = "rift:last-model:";
const CONVERSATION_STORAGE_PREFIX = "rift:last-conversation:";
const PREFERENCE_SCHEMA_KEY = "rift:preference-schema";
const PREFERENCE_SCHEMA_VERSION = "3";
const CHAT_FONT_SIZE_KEY = "rift:chat-font-size";
const THEME_STORAGE_KEY = "rift:theme";
const FULL_FILE_SESSION_KEY = "rift:full-file";
const FILE_FILTER_SESSION_KEY = "rift:file-filter";
const CHANGES_WIDTH_SESSION_KEY = "rift:changes-width";
const HIDE_REVIEWED_SESSION_KEY = "rift:hide-reviewed";
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

interface DiffOverviewMarker {
  index: number;
  position: number;
  size: number;
  kind: "addition" | "deletion" | "change";
  label: string;
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
  done: boolean;
}

interface ReviewSessionData {
  version: 1 | 2 | 3 | 4;
  reviewedFiles: string[];
  notes: ReviewNote[];
  conversations?: Conversation[];
  workspaceContext?: WorkspaceContext;
  review?: PersistedReview;
}

interface PersistedReview {
  question: string;
  result: AgentRunResult | null;
  error: string | null;
  tone: ReviewTone;
}

interface WorkspaceContext {
  details: string;
  links: string[];
  resources: ContextResourcePath[];
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
  mode?: AgentMode;
  model: string | null;
  question: string;
  context?: ConversationContext;
  status: ConversationStatus;
  result: AgentRunResult | null;
  error: string | null;
  history: ConversationTurn[];
  attachedReview?: string;
  providerSessionId?: string;
  updatedAt?: number;
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
  mode: AgentMode;
  model: string | null;
  prompt: string;
  attachmentPaths?: string[];
  question: string;
  context?: ConversationContext;
  providerSessionId?: string;
}

interface RowAnnotations {
  notes: ReviewNote[];
  conversations: Conversation[];
}

interface ImageAttachment {
  id: string;
  name: string;
  path: string;
  previewUrl: string;
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
    && typeof note.createdAt === "number" && Number.isFinite(note.createdAt)
    && (note.done === undefined || typeof note.done === "boolean");
}

function isReviewSessionData(value: unknown): value is ReviewSessionData {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  return (session.version === 1 || session.version === 2 || session.version === 3 || session.version === 4)
    && Array.isArray(session.reviewedFiles)
    && session.reviewedFiles.every((path) => typeof path === "string" && path.length <= 10_000)
    && Array.isArray(session.notes)
    && (session.version === 1 || (Array.isArray(session.conversations) && session.conversations.every(isConversation)))
    && (session.version < 3 || isWorkspaceContext(session.workspaceContext))
    && (session.version !== 4 || isPersistedReview(session.review));
}

function isPersistedReview(value: unknown): value is PersistedReview {
  if (!value || typeof value !== "object") return false;
  const review = value as Record<string, unknown>;
  return typeof review.question === "string" && review.question.length <= 20_000
    && (review.result === null || isAgentResult(review.result))
    && (review.error === null || (typeof review.error === "string" && review.error.length <= 20_000))
    && (review.tone === "professional" || review.tone === "honest");
}

function isWorkspaceContext(value: unknown): value is WorkspaceContext {
  if (!value || typeof value !== "object") return false;
  const context = value as Record<string, unknown>;
  return typeof context.details === "string" && context.details.length <= 40_000
    && Array.isArray(context.links) && context.links.length <= 30
    && context.links.every((link) => typeof link === "string" && link.length <= 2_000)
    && Array.isArray(context.resources) && context.resources.length <= 20
    && context.resources.every((resource) => {
      if (!resource || typeof resource !== "object") return false;
      const entry = resource as Record<string, unknown>;
      return typeof entry.path === "string" && entry.path.length <= 10_000
        && (entry.kind === "file" || entry.kind === "directory")
        && (entry.label === undefined || (typeof entry.label === "string" && entry.label.length <= 255));
    });
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
    && (conversation.mode === undefined || conversation.mode === "review" || conversation.mode === "edit")
    && (conversation.model === null || (typeof conversation.model === "string" && conversation.model.length <= 200))
    && typeof conversation.question === "string" && conversation.question.length <= 20_000
    && (conversation.context === undefined || isConversationContext(conversation.context))
    && (conversation.status === "running" || conversation.status === "complete" || conversation.status === "error" || conversation.status === "cancelled")
    && (conversation.result === null || isAgentResult(conversation.result))
    && (conversation.error === null || (typeof conversation.error === "string" && conversation.error.length <= 20_000))
    && Array.isArray(conversation.history) && conversation.history.length <= 500
    && conversation.history.every(isConversationTurn)
    && (conversation.attachedReview === undefined || (typeof conversation.attachedReview === "string" && conversation.attachedReview.length <= 1_000_000))
    && (conversation.providerSessionId === undefined || (typeof conversation.providerSessionId === "string" && conversation.providerSessionId.length <= 100))
    && (conversation.updatedAt === undefined || (typeof conversation.updatedAt === "number" && Number.isFinite(conversation.updatedAt)));
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

function wildcardExpression(pattern: string): RegExp {
  const expression = pattern.replace(/\*+/g, "*")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
    .replaceAll("?", ".");
  return new RegExp(`^${expression}$`, "i");
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
  readonly appVersion = versionManifest.version;
  readonly updateStatus = signal<UpdateStatus | null>(null);
  readonly updateInstalling = signal(false);
  readonly releaseNotesTitle = computed(() => {
    const status = this.updateStatus();
    if (!status?.updateAvailable || !status.latestVersion) return "";
    return [`What's new in Rift ${status.latestVersion}`, "", ...status.releaseNotes.map((note) => `- ${note}`)].join("\n");
  });
  readonly darkTheme = signal(this.loadDarkTheme());
  readonly repository = signal<RepositorySnapshot | null>(null);
  readonly selectedPath = signal<string | null>(null);
  readonly patch = signal<FilePatch | null>(null);
  readonly repositoryFileView = signal<RepositoryFileView | null>(null);
  readonly repositoryFileLoading = signal(false);
  readonly repositoryFileError = signal<string | null>(null);
  readonly repositoryFileLines = computed(() => this.repositoryFileView()?.content.split("\n") ?? []);
  readonly repositorySearchOpen = signal(false);
  readonly repositorySearchQuery = signal("");
  readonly repositorySearchResults = signal<RepositorySearchResult[]>([]);
  readonly repositorySearchLoading = signal(false);
  readonly repositorySearchError = signal<string | null>(null);
  readonly repositorySearchLimited = signal(false);
  readonly activeSearchResult = signal(0);
  readonly searchPreview = computed(() => this.repositorySearchResults()[this.activeSearchResult()] ?? null);
  readonly diffMode = signal<DiffMode>("unified");
  readonly fullFile = signal(this.loadFullFile());
  readonly fileFilter = signal(this.loadFileFilter());
  readonly hideReviewed = signal(this.loadHideReviewed());
  readonly changesPanelWidth = signal(this.loadChangesPanelWidth());
  readonly changesPanelResizing = signal(false);
  readonly viewportWidth = signal(window.innerWidth);
  readonly selectedRange = signal<SelectionRange | null>(null);
  readonly allChangesSelected = signal(false);
  readonly loading = signal(true);
  readonly comparisonChanging = signal(false);
  readonly error = signal<string | null>(null);
  readonly reviewSidebarOpen = signal(false);
  readonly reviewPageOpen = signal(false);
  readonly toolsMenu = signal<ToolsMenu | null>(null);
  readonly fileToolsMenu = signal<FileToolsMenu | null>(null);
  readonly noteComposerOpen = signal(false);
  readonly questionComposerOpen = signal(false);
  readonly questionDraft = signal("");
  readonly questionImageAttachments = signal<ImageAttachment[]>([]);
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
      : this.agentModels());
  });
  readonly agentRunning = signal(false);
  readonly activityExpanded = signal(false);
  readonly selectedToolCall = signal<AgentToolEvent | null>(null);
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
  readonly reviewTone = signal<ReviewTone>("professional");
  readonly reviewDraft = signal("");
  readonly reviewQuestion = signal("");
  readonly reviewResult = signal<AgentRunResult | null>(null);
  readonly reviewError = signal<string | null>(null);
  readonly reconsiderDraft = signal("");
  readonly contextDialogOpen = signal(false);
  readonly workspaceContext = signal<WorkspaceContext>({ details: "", links: [], resources: [] });
  readonly contextDetailsDraft = signal("");
  readonly contextLinksDraft = signal("");
  readonly contextResourcesDraft = signal<ContextResourcePath[]>([]);
  readonly contextItemCount = computed(() => {
    const context = this.workspaceContext();
    return (context.details.trim() ? 1 : 0) + context.links.length + context.resources.length;
  });
  readonly selectedFile = computed(() => this.repository()?.files.find((file) => file.path === this.selectedPath()));
  readonly filteredFiles = computed(() => {
    const patterns = this.fileFilter().split(",").map((pattern) => pattern.trim()).filter(Boolean).map(wildcardExpression);
    const files = this.repository()?.files ?? [];
    const reviewed = new Set(this.reviewedFiles());
    return files.filter((file) => (
      (!this.hideReviewed() || !reviewed.has(file.path))
      && !patterns.some((pattern) => pattern.test(file.path))
    ));
  });
  readonly effectiveChangesPanelWidth = computed(() => {
    const reviewWidth = this.reviewSidebarOpen() ? (this.viewportWidth() <= 1_050 ? 250 : 310) : (this.viewportWidth() <= 1_050 ? 88 : 44);
    return Math.max(220, Math.min(this.changesPanelWidth(), this.viewportWidth() - 460 - reviewWidth));
  });
  readonly selectedAgentOption = computed(() => this.agents().find((agent) => agent.id === this.selectedAgent()));
  readonly detectedLanguage = computed(() => detectLanguage(this.selectedPath()));
  readonly parsedRows = computed(() => parsePatch(this.patch()?.patch ?? ""));
  readonly highlightedRows = signal<DiffRow[] | null>(null);
  readonly rows = computed(() => this.highlightedRows() ?? this.parsedRows());
  readonly splitRows = computed(() => pairSplitRows(this.rows()));
  readonly diffOverviewMarkers = computed(() => {
    const rows = this.rows();
    const overviewRows = this.diffMode() === "unified"
      ? rows.map((row, index) => ({
          index,
          addition: row.kind === "addition",
          deletion: row.kind === "deletion"
        }))
      : this.splitRows().map((pair) => {
          const entries = [pair.left, pair.right, pair.spanning].filter((entry): entry is IndexedDiffRow => !!entry);
          return {
            index: entries.find((entry) => entry.row.kind === "deletion" || entry.row.kind === "addition")?.index ?? entries[0]?.index ?? 0,
            addition: entries.some((entry) => entry.row.kind === "addition"),
            deletion: entries.some((entry) => entry.row.kind === "deletion")
          };
        });
    const markers: DiffOverviewMarker[] = [];
    let index = 0;
    while (index < overviewRows.length) {
      if (!overviewRows[index].addition && !overviewRows[index].deletion) {
        index += 1;
        continue;
      }
      const start = index;
      let additions = false;
      let deletions = false;
      while (overviewRows[index]?.addition || overviewRows[index]?.deletion) {
        additions ||= overviewRows[index].addition;
        deletions ||= overviewRows[index].deletion;
        index += 1;
      }
      const targetIndex = overviewRows[start].index;
      const line = this.lineFor(rows[targetIndex]);
      markers.push({
        index: targetIndex,
        position: overviewRows.length > 0 ? start / overviewRows.length * 100 : 0,
        size: overviewRows.length > 0 ? (index - start) / overviewRows.length * 100 : 0,
        kind: additions && deletions ? "change" : additions ? "addition" : "deletion",
        label: line ? `Jump to changed region near line ${line}` : "Jump to changed region"
      });
    }
    return markers;
  });
  readonly diffScroll = viewChild<ElementRef<HTMLDivElement>>("diffScroll");
  readonly repositorySearchInput = viewChild<ElementRef<HTMLInputElement>>("repositorySearchInput");
  readonly chatThread = viewChild<ElementRef<HTMLDivElement>>("chatThread");
  readonly chatContent = viewChild<ElementRef<HTMLDivElement>>("chatContent");
  readonly chatBottom = viewChild<ElementRef<HTMLDivElement>>("chatBottom");
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
  readonly reviewSessionStarted = computed(() => this.notes().length > 0 || this.reviewedFiles().length > 0 || this.repositoryConversations().length > 0 || this.contextItemCount() > 0 || !!this.reviewResult() || !!this.reviewError());
  readonly providerSessions = signal<AgentSession[]>([]);
  readonly providerSessionsAgent = signal<AgentId | null>(null);
  readonly providerSessionsLoading = signal(false);
  readonly providerSessionsError = signal<string | null>(null);
  readonly providerSessionOpeningId = signal<string | null>(null);
  readonly chatReplyDraft = signal("");
  readonly chatImageAttachments = signal<ImageAttachment[]>([]);
  readonly chatModelSearch = signal("");
  readonly chatModelPickerOpen = signal(false);
  readonly filteredChatModels = computed(() => {
    const query = this.chatModelSearch().trim().toLowerCase();
    return (query
      ? this.agentModels().filter((model) => model.toLowerCase().includes(query))
      : this.agentModels());
  });
  readonly chatFontSize = signal(this.loadChatFontSize());
  readonly editMode = signal(false);
  readonly fileContents = signal<ReadonlyMap<string, string>>(new Map());
  readonly fileEdits = signal<ReadonlyMap<string, ReadonlyMap<number, string>>>(new Map());
  readonly fileSaving = signal(false);
  readonly selectedFileHasEdits = computed(() => {
    const path = this.selectedPath();
    return path ? (this.fileEdits().get(path)?.size ?? 0) > 0 : false;
  });
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
  private readonly loadingStartedAt = performance.now();
  private refreshing = false;
  private refreshDirty = false;
  private selecting = false;
  private patchRequest = 0;
  private repositoryRequest = 0;
  private repositorySearchRequest = 0;
  private repositoryViewRequest = 0;
  private repositorySearchTimer: ReturnType<typeof setTimeout> | undefined;
  private highlightRequest = 0;
  private agentRequest = 0;
  private modelRequest = 0;
  private sessionListRequest = 0;
  private providerSessionRequest = 0;
  private modelsAgent: AgentId | null = null;
  private activeAgentConversationId: number | null = null;
  private reviewRunActive = false;
  private conversationRequest = 0;
  private pendingProviderSessionId?: string;
  private chatFollowTimer: ReturnType<typeof setTimeout> | undefined;
  private chatFollowUntil = 0;
  private chatAutoFollow = true;
  private chatPointerActive = false;
  private observedChatContent: HTMLDivElement | null = null;
  private readonly chatResizeObserver = new ResizeObserver(() => {
    if (this.chatAutoFollow) this.pinChatToBottom();
  });
  private readonly keepChatAtBottom = afterRenderEffect(() => {
    const chatOpen = this.chatPageOpen();
    const conversation = this.activeConversation();
    const content = chatOpen && conversation ? this.chatContent()?.nativeElement ?? null : null;
    if (content !== this.observedChatContent) {
      this.chatResizeObserver.disconnect();
      this.observedChatContent = content;
      if (content) this.chatResizeObserver.observe(content);
    }
    if (!chatOpen || !conversation) return;
    conversation.history.length;
    conversation.question;
    conversation.status;
    conversation.result?.explanation;
    conversation.result?.tools.length;
    conversation.error;
    if (this.chatAutoFollow) this.pinChatToBottom();
  });
  private readonly highlightWorker = new Worker(new URL("./highlight.worker.ts", import.meta.url), { type: "module" });

  ngOnInit(): void {
    this.migratePreferences();
    this.applyTheme();
    void window.rift.checkForUpdate().then((status) => this.updateStatus.set(status));
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
      .finally(() => {
        const remaining = Math.max(0, 2_000 - (performance.now() - this.loadingStartedAt));
        setTimeout(() => this.loading.set(false), remaining);
      });

    this.removeRepositoryListener = window.rift.onRepositoryChanged(() => void this.refreshRepository());
    this.removeAgentListener = window.rift.onAgentEvent((event) => this.acceptAgentEvent(event));
    void window.rift.listAgents().then((agents) => {
      this.agents.set(agents);
      const preferred = this.loadSavedSelection().agent;
      const agent = agents.find((option) => option.id === preferred)?.id ?? agents[0]?.id ?? null;
      this.selectedAgent.set(agent);
      if (agent) void this.loadAgentModels(agent);
    }).catch((reason: Error) => {
      this.reviewMessage.set(reason.message);
    });
  }

  async installAvailableUpdate(): Promise<void> {
    if (this.updateInstalling()) return;
    this.updateInstalling.set(true);
    try {
      const started = await window.rift.installUpdate();
      if (!started) this.updateInstalling.set(false);
    } catch (reason) {
      this.updateInstalling.set(false);
      this.updateStatus.update((status) => status ? { ...status, error: reason instanceof Error ? reason.message : String(reason) } : status);
    }
  }

  ngOnDestroy(): void {
    this.removeRepositoryListener?.();
    this.removeAgentListener?.();
    if (this.chatFollowTimer) clearTimeout(this.chatFollowTimer);
    if (this.repositorySearchTimer) clearTimeout(this.repositorySearchTimer);
    this.chatResizeObserver.disconnect();
    this.highlightWorker.terminate();
    this.revokeImagePreviews(this.questionImageAttachments());
    this.revokeImagePreviews(this.chatImageAttachments());
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

  scrollToDiffRegion(position: number): void {
    const scroller = this.diffScroll()?.nativeElement;
    if (!scroller) return;
    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    scroller.scrollTop = Math.round(maxScroll * Math.max(0, Math.min(100, position)) / 100);
  }

  scrollFromDiffOverview(event: PointerEvent): void {
    if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.height <= 0) return;
    this.scrollToDiffRegion((event.clientY - bounds.top) / bounds.height * 100);
  }

  updateFileFilter(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.fileFilter.set(event.target.value.slice(0, 1_000));
    this.storeSessionSetting(FILE_FILTER_SESSION_KEY, this.fileFilter());
    this.reconcileFilteredSelection();
  }

  clearFileFilter(): void {
    this.fileFilter.set("");
    this.storeSessionSetting(FILE_FILTER_SESSION_KEY, "");
    this.reconcileFilteredSelection();
  }

  toggleHideReviewed(): void {
    this.hideReviewed.update((hidden) => !hidden);
    this.storeSessionSetting(HIDE_REVIEWED_SESSION_KEY, String(this.hideReviewed()));
    this.reconcileFilteredSelection();
  }

  beginChangesResize(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    if (event.currentTarget instanceof HTMLElement) event.currentTarget.setPointerCapture(event.pointerId);
    this.changesPanelResizing.set(true);
  }

  resizeChangesPanelWithKeyboard(event: KeyboardEvent): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    this.setChangesPanelWidth(this.effectiveChangesPanelWidth() + (event.key === "ArrowLeft" ? -20 : 20));
    this.storeSessionSetting(CHANGES_WIDTH_SESSION_KEY, String(this.changesPanelWidth()));
  }

  selectAgent(event: Event): void {
    if (event.target instanceof HTMLSelectElement) {
      const id = event.target.value as AgentId;
      if (id !== this.selectedAgent()) this.pendingProviderSessionId = undefined;
      this.selectedAgent.set(id);
      this.useExplainConversation(this.preferredConversation(id), false);
      this.selectedModel.set(null);
      this.modelSearch.set("");
      this.saveAgentModelSelection(id, null);
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
    if (event.target.value.startsWith("provider:")) {
      const sessionId = event.target.value.slice("provider:".length);
      const session = this.providerSessions().find((entry) => entry.id === sessionId);
      if (session) void this.selectProviderExplainConversation(session);
      return;
    }
    const id = Number(event.target.value);
    const conversation = Number.isSafeInteger(id) && id > 0
      ? this.availableConversations().find((entry) => entry.id === id)
      : undefined;
    this.useExplainConversation(conversation);
  }

  private async selectProviderExplainConversation(session: AgentSession): Promise<void> {
    const conversation = await this.loadProviderConversation(session);
    if (conversation) this.useExplainConversation(conversation);
  }

  private useExplainConversation(conversation?: Conversation, applyModel = true): void {
    this.continuingConversationId.set(conversation?.id ?? null);
    this.rememberConversation(conversation?.id ?? null);
    if (!conversation || !applyModel) return;
    this.selectModel(conversation.model);
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
      this.saveAgentModelSelection(agent, model);
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
    this.reviewPageOpen.set(false);
    const wasRepositoryView = this.repositoryFileView() !== null;
    this.repositoryViewRequest += 1;
    this.repositoryFileView.set(null);
    this.repositoryFileLoading.set(false);
    this.repositoryFileError.set(null);
    if (path === this.selectedPath() && !wasRepositoryView) return;
    this.selectedPath.set(path);
    this.selectedRange.set(null);
    this.allChangesSelected.set(false);
    this.resetHorizontalScroll();
    void this.loadPatch(path);
    void this.loadEditableFile(path);
  }

  toggleEditMode(): void {
    const active = !this.editMode();
    this.editMode.set(active);
    const path = this.selectedPath();
    if (active && path && !this.fileContents().has(path)) void this.loadEditableFile(path, true);
  }

  canEditRow(row: DiffRow): boolean {
    const path = this.selectedPath();
    return this.editMode() && !!path && this.fileContents().has(path) && row.newLine !== undefined && row.kind !== "deletion";
  }

  editableLineContent(row: DiffRow): string {
    const path = this.selectedPath();
    if (!path || row.newLine === undefined) return row.content;
    return this.fileEdits().get(path)?.get(row.newLine) ?? row.content;
  }

  beginLineEdit(row: DiffRow, event: PointerEvent): void {
    if (this.canEditRow(row)) event.stopPropagation();
  }

  handleLineEditKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === "Escape" && !event.isComposing) {
      event.preventDefault();
      this.editMode.set(false);
      if (event.currentTarget instanceof HTMLElement) event.currentTarget.blur();
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
    event.preventDefault();
    void this.saveCurrentFile();
  }

  updateEditedLine(row: DiffRow, event: Event): void {
    const path = this.selectedPath();
    if (!path || row.newLine === undefined || !(event.currentTarget instanceof HTMLElement)) return;
    const element = event.currentTarget;
    const selection = window.getSelection();
    let caretOffset: number | null = null;
    if (selection?.rangeCount && selection.anchorNode && element.contains(selection.anchorNode)) {
      const caretRange = document.createRange();
      caretRange.selectNodeContents(element);
      caretRange.setEnd(selection.anchorNode, selection.anchorOffset);
      caretOffset = caretRange.toString().length;
    }
    const content = element.innerText.replace(/\n$/, "");
    const pathEdits = new Map(this.fileEdits().get(path) ?? []);
    if (content === row.content) pathEdits.delete(row.newLine);
    else pathEdits.set(row.newLine, content);
    const edits = new Map(this.fileEdits());
    if (pathEdits.size > 0) edits.set(path, pathEdits);
    else edits.delete(path);
    this.fileEdits.set(edits);
    if (caretOffset !== null) requestAnimationFrame(() => this.restoreCaret(element, caretOffset!));
  }

  private restoreCaret(element: HTMLElement, offset: number): void {
    if (!element.isConnected) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let node = walker.nextNode();
    while (node) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) {
        range.setStart(node, remaining);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        element.focus({ preventScroll: true });
        return;
      }
      remaining -= length;
      node = walker.nextNode();
    }
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    element.focus({ preventScroll: true });
  }

  @HostListener("document:keydown", ["$event"])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      this.openRepositorySearch();
      return;
    }
    if (event.key.toLowerCase() === "e") {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      const file = this.selectedFile();
      if (this.chatPageOpen() || this.reviewPageOpen() || !file || file.status === "deleted" || this.patch()?.binary) return;
      event.preventDefault();
      if (!this.editMode()) this.toggleEditMode();
      return;
    }
    if (event.key.toLowerCase() === "s" && this.selectedFileHasEdits()) {
      event.preventDefault();
      void this.saveCurrentFile();
    }
  }

  openRepositorySearch(): void {
    this.repositorySearchOpen.set(true);
    this.repositorySearchError.set(null);
    requestAnimationFrame(() => {
      const input = this.repositorySearchInput()?.nativeElement;
      input?.focus();
      input?.select();
    });
  }

  closeRepositorySearch(): void {
    this.repositorySearchOpen.set(false);
    this.repositorySearchRequest += 1;
    this.repositorySearchLoading.set(false);
    if (this.repositorySearchTimer) clearTimeout(this.repositorySearchTimer);
    this.repositorySearchTimer = undefined;
  }

  updateRepositorySearch(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    const query = event.target.value.slice(0, 200);
    this.repositorySearchQuery.set(query);
    this.repositorySearchError.set(null);
    if (this.repositorySearchTimer) clearTimeout(this.repositorySearchTimer);
    const request = ++this.repositorySearchRequest;
    if (!query.trim()) {
      this.repositorySearchResults.set([]);
      this.repositorySearchLimited.set(false);
      this.repositorySearchLoading.set(false);
      this.activeSearchResult.set(0);
      return;
    }
    this.repositorySearchLoading.set(true);
    this.repositorySearchTimer = setTimeout(() => void this.runRepositorySearch(query.trim(), request), 180);
  }

  handleRepositorySearchKeydown(event: KeyboardEvent): void {
    const results = this.repositorySearchResults();
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.closeRepositorySearch();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length === 0) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      this.activeSearchResult.set((this.activeSearchResult() + direction + results.length) % results.length);
      requestAnimationFrame(() => document.querySelector(".repository-search-result.active")?.scrollIntoView({ block: "nearest" }));
      return;
    }
    if (event.key === "Enter" && !event.isComposing) {
      const result = results[this.activeSearchResult()];
      if (result) {
        event.preventDefault();
        void this.openSearchResult(result);
      }
    }
  }

  async openSearchResult(result: RepositorySearchResult): Promise<void> {
    this.closeRepositorySearch();
    if (this.repository()?.files.some((file) => file.path === result.path)) {
      this.selectFile(result.path);
      return;
    }
    const request = ++this.repositoryViewRequest;
    this.chatPageOpen.set(false);
    this.reviewPageOpen.set(false);
    this.editMode.set(false);
    this.selectedPath.set(result.path);
    this.selectedRange.set(null);
    this.allChangesSelected.set(false);
    this.patchRequest += 1;
    this.patch.set(null);
    this.highlightedRows.set(null);
    this.repositoryFileView.set(null);
    this.repositoryFileError.set(null);
    this.repositoryFileLoading.set(true);
    this.resetHorizontalScroll();
    try {
      const file = await window.rift.readRepositoryViewFile(result.path);
      if (request === this.repositoryViewRequest && this.selectedPath() === result.path) this.repositoryFileView.set(file);
    } catch (reason) {
      if (request === this.repositoryViewRequest) this.repositoryFileError.set(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (request === this.repositoryViewRequest) this.repositoryFileLoading.set(false);
    }
  }

  private async runRepositorySearch(query: string, request: number): Promise<void> {
    try {
      const response = await window.rift.searchRepository(query);
      if (request !== this.repositorySearchRequest || !this.repositorySearchOpen()) return;
      this.repositorySearchResults.set(response.results);
      this.repositorySearchLimited.set(response.limited);
      this.activeSearchResult.set(0);
    } catch (reason) {
      if (request === this.repositorySearchRequest) {
        this.repositorySearchResults.set([]);
        this.repositorySearchError.set(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (request === this.repositorySearchRequest) this.repositorySearchLoading.set(false);
    }
  }

  async saveCurrentFile(): Promise<void> {
    const path = this.selectedPath();
    const original = path ? this.fileContents().get(path) : undefined;
    const edits = path ? this.fileEdits().get(path) : undefined;
    if (!path || original === undefined || !edits || edits.size === 0 || this.fileSaving()) return;
    const eol = original.includes("\r\n") ? "\r\n" : "\n";
    const lines = original.split(/\r?\n/);
    for (const [line, content] of [...edits.entries()].sort(([left], [right]) => right - left)) {
      lines.splice(line - 1, 1, ...content.split(/\r?\n/));
    }
    const updated = lines.join(eol);
    this.fileSaving.set(true);
    try {
      await window.rift.writeRepositoryFile(path, updated);
      this.fileContents.update((contents) => new Map(contents).set(path, updated));
      this.fileEdits.update((current) => {
        const next = new Map(current);
        next.delete(path);
        return next;
      });
      this.reviewMessage.set("File saved");
      await this.refreshRepository();
    } catch (reason) {
      this.reviewMessage.set(reason instanceof Error ? reason.message : String(reason));
    } finally {
      this.fileSaving.set(false);
    }
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
      createdAt: Date.now(),
      done: false
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
    this.clearImageAttachments("question");
    this.pendingProviderSessionId = undefined;
  }

  toggleFullFile(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.fullFile.set(event.target.checked);
    this.selectedRange.set(null);
    this.allChangesSelected.set(false);
    try {
      sessionStorage.setItem(FULL_FILE_SESSION_KEY, String(event.target.checked));
    } catch {
      // The setting still applies for the current page when session storage is unavailable.
    }
    const path = this.selectedPath();
    if (path) void this.loadPatch(path);
  }

  deleteNote(id: string): void {
    this.notes.update((notes) => notes.filter((note) => note.id !== id));
    this.selectedNoteIds.update((ids) => ids.filter((noteId) => noteId !== id));
    this.persistReviewSession();
  }

  toggleNoteDone(id: string): void {
    let done = false;
    this.notes.update((notes) => notes.map((note) => {
      if (note.id !== id) return note;
      done = !note.done;
      return { ...note, done };
    }));
    this.persistReviewSession();
    this.reviewMessage.set(done ? "Note marked done" : "Note marked active");
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
    if (this.hideReviewed()) this.reconcileFilteredSelection();
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
    if (this.hideReviewed()) this.reconcileFilteredSelection();
    this.workspaceContext.set({ details: "", links: [], resources: [] });
    this.conversations.update((conversations) => conversations.filter((conversation) => conversation.repositoryRoot !== root));
    this.activeConversationId.set(null);
    this.activeLinkedNoteId.set(null);
    this.activeQuestion.set("");
    this.agentResult.set(null);
    this.agentError.set(null);
    this.reviewQuestion.set("");
    this.reviewResult.set(null);
    this.reviewError.set(null);
    this.reconsiderDraft.set("");
    this.agentModalOpen.set(false);
    this.conversationChoiceOpen.set(false);
    this.pendingExplain.set(null);
    this.providerSessionRequest += 1;
    this.sessionListRequest += 1;
    this.providerSessionOpeningId.set(null);
    this.pendingProviderSessionId = undefined;
    this.continuingConversationId.set(null);
    this.chatPageOpen.set(false);
    this.reviewPageOpen.set(false);
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
    this.chatPageOpen.set(false);
    this.reviewPageOpen.set(false);
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

  startExplain(useLatestConversation = true): void {
    const savedSelection = this.loadSavedSelection();
    const agent = this.agents().some((option) => option.id === savedSelection.agent) ? savedSelection.agent : this.selectedAgent();
    if (agent) {
      this.selectedAgent.set(agent);
      const savedModel = savedSelection.agent === agent ? savedSelection.model : this.loadSavedModel(agent);
      const model = savedModel && this.modelsAgent === agent && this.agentModels().includes(savedModel)
        ? savedModel
        : null;
      this.selectedModel.set(model);
      this.modelSearch.set(model ?? "");
    }
    if (useLatestConversation) this.useExplainConversation(this.preferredConversation(agent), false);
    this.noteComposerOpen.set(false);
    this.questionDraft.set("");
    this.clearImageAttachments("question");
    this.modelSearch.set(this.selectedModel() ?? "");
    this.modelPickerOpen.set(false);
    this.questionComposerOpen.set(true);
    if (agent) {
      if (this.modelsAgent !== agent) void this.loadAgentModels(agent);
      void this.loadProviderSessions(agent);
    }
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
    this.reviewPageOpen.set(false);
    this.chatPageOpen.set(true);
    this.activeConversationId.set(null);
    const agent = this.selectedAgent();
    if (agent) void this.loadProviderSessions(agent);
  }

  openReviewPage(): void {
    this.reviewSidebarOpen.set(false);
    this.chatPageOpen.set(false);
    this.reviewPageOpen.set(true);
    this.activeConversationId.set(null);
    const agent = this.selectedAgent();
    if (agent && this.modelsAgent !== agent && !this.modelsLoading()) void this.loadAgentModels(agent);
  }

  selectReviewModel(event: Event): void {
    if (event.target instanceof HTMLSelectElement) this.selectModel(event.target.value || null);
  }

  openContextDialog(): void {
    const context = this.workspaceContext();
    this.contextDetailsDraft.set(context.details);
    this.contextLinksDraft.set(context.links.join("\n"));
    this.contextResourcesDraft.set([...context.resources]);
    this.contextDialogOpen.set(true);
  }

  closeContextDialog(): void {
    this.contextDialogOpen.set(false);
  }

  async addContextResources(kind: "files" | "directory"): Promise<void> {
    try {
      const selected = await window.rift.chooseContextResources(kind);
      this.contextResourcesDraft.update((resources) => {
        const byPath = new Map(resources.map((resource) => [resource.path, resource]));
        for (const resource of selected) byPath.set(resource.path, resource);
        return [...byPath.values()].slice(0, 20);
      });
    } catch (reason) {
      this.reviewMessage.set(reason instanceof Error ? reason.message : String(reason));
    }
  }

  removeContextResource(path: string): void {
    this.contextResourcesDraft.update((resources) => resources.filter((resource) => resource.path !== path));
  }

  async pasteContextResources(event: ClipboardEvent): Promise<void> {
    const itemFiles = [...(event.clipboardData?.items ?? [])]
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    const files = [...new Set([...itemFiles, ...(event.clipboardData?.files ?? [])])]
      .filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) return;
    event.preventDefault();
    const remaining = Math.max(0, 20 - this.contextResourcesDraft().length);
    if (remaining === 0) {
      this.reviewMessage.set("Context can include up to 20 files and directories");
      return;
    }
    for (const file of files.slice(0, remaining)) {
      try {
        const path = await window.rift.saveImageAttachment(file.name || "pasted-context-image", file.type, new Uint8Array(await file.arrayBuffer()));
        this.contextResourcesDraft.update((resources) => [...resources, {
          path,
          kind: "file",
          label: file.name || "Pasted image"
        }]);
      } catch (reason) {
        this.reviewMessage.set(reason instanceof Error ? reason.message : String(reason));
      }
    }
  }

  async pasteContextImage(): Promise<void> {
    if (this.contextResourcesDraft().length >= 20) {
      this.reviewMessage.set("Context can include up to 20 files and directories");
      return;
    }
    try {
      const path = await window.rift.saveClipboardImage();
      if (!path) {
        this.reviewMessage.set("The clipboard does not contain an image");
        return;
      }
      this.contextResourcesDraft.update((resources) => [...resources, { path, kind: "file", label: "Pasted image" }]);
      this.reviewMessage.set("Clipboard image added to context");
    } catch (reason) {
      this.reviewMessage.set(reason instanceof Error ? reason.message : String(reason));
    }
  }

  saveWorkspaceContext(): void {
    const links = [...new Set(this.contextLinksDraft().split(/\r?\n/).map((link) => link.trim()).filter(Boolean))].slice(0, 30);
    this.workspaceContext.set({
      details: this.contextDetailsDraft().trim().slice(0, 40_000),
      links: links.map((link) => link.slice(0, 2_000)),
      resources: this.contextResourcesDraft().slice(0, 20)
    });
    this.contextDialogOpen.set(false);
    this.persistReviewSession();
    this.reviewMessage.set(this.contextItemCount() > 0 ? "Project context saved" : "Project context cleared");
  }

  async startReview(): Promise<void> {
    const agent = this.selectedAgent();
    if (!this.repository() || !agent || this.agentRunning()) return;
    const request = this.reviewDraft().trim().slice(0, 20_000) || "Review the complete comparison and report the findings that matter.";
    this.reviewDraft.set("");
    await this.runReview(this.buildReviewPrompt(request), request);
  }

  async reconsiderReview(): Promise<void> {
    const previous = this.reviewResult()?.explanation;
    if (!previous || this.agentRunning()) return;
    await this.refreshRepository();
    const request = this.reconsiderDraft().trim().slice(0, 20_000) || "Reconsider the review after the latest code changes.";
    this.reconsiderDraft.set("");
    await this.runReview(this.buildReviewPrompt(request, previous), request);
  }

  resetReview(): void {
    if (this.agentRunning()) return;
    this.reviewQuestion.set("");
    this.reviewResult.set(null);
    this.reviewError.set(null);
    this.reconsiderDraft.set("");
    this.persistReviewSession();
  }

  async saveReviewMarkdown(): Promise<void> {
    const repository = this.repository();
    const result = this.reviewResult();
    if (!repository || !result?.explanation) return;
    try {
      const saved = await window.rift.saveMarkdown(`${repository.name}-${repository.branch}-review.md`, result.explanation);
      this.reviewMessage.set(saved ? "Review saved as Markdown" : "Save cancelled");
    } catch (reason) {
      this.reviewMessage.set(reason instanceof Error ? reason.message : String(reason));
    }
  }

  private buildReviewPrompt(request: string, previousReview?: string): string {
    const repository = this.repository()!;
    const style = this.reviewTone() === "honest"
      ? [
          "# Honest review",
          "This is the roast. Be blunt, biting, and memorable. Do not cushion bad code with diplomatic language or drift into a standard professional-review voice.",
          "Call out weak reasoning, needless complexity, fragile code, fake abstractions, cargo-cult patterns, and avoidable mistakes with dry irony and sharp sarcasm. Roast the code and engineering decisions, never the author.",
          "Every punchline must be earned by a real technical finding. Pair it with specific evidence, the consequence, and a concrete fix; humor never replaces analysis.",
          "Do not manufacture issues or exaggerate severity for entertainment. Briefly acknowledge genuinely strong work, but do not dilute valid criticism with praise sandwiches."
        ]
      : [
          "# Professional review",
          "Act as a senior code reviewer. Be objective, respectful, specific, and evidence-led.",
          "Prioritize correctness, security, regressions, maintainability, and missing tests. Order findings by severity, include file and line references where possible, and propose practical fixes."
        ];
    const prompt = [
      ...this.workspaceContextSection([
        `Repository: ${repository.name}`,
        `Comparison: ${repository.comparisonLabel}`,
        `Start revision: ${repository.startRevision}`,
        `End revision: ${repository.endRevision ?? "working tree"}`,
        "Inspect the complete Git diff and relevant surrounding code.",
        "Changed files:",
        ...repository.files.map((file) => `- ${file.path}`)
      ]),
      "",
      ...style,
      "",
      "# User said",
      request,
      ...(previousReview ? [
        "",
        "# Previous review to reconsider",
        previousReview.slice(0, 30_000),
        "",
        "Re-read the current diff and surrounding code from scratch. Identify which prior findings were fixed, which remain, and any new issues introduced. Do not repeat resolved findings as current problems."
      ] : []),
      "",
      "Return analysis only. Do not edit files. Lead with findings; do not bury them under a summary."
    ].join("\n");
    return prompt;
  }

  private async runReview(prompt: string, question: string): Promise<void> {
    const agent = this.selectedAgent();
    if (!agent || this.agentRunning()) return;
    const request = ++this.agentRequest;
    this.activeAgentConversationId = null;
    this.reviewRunActive = true;
    this.reviewQuestion.set(question);
    this.reviewResult.set(null);
    this.reviewError.set(null);
    this.reviewPageOpen.set(true);
    this.chatPageOpen.set(false);
    this.agentRunning.set(true);
    this.reviewMessage.set(`Waiting for ${this.agentLabel(agent)}`);
    try {
      const resources = this.workspaceContext().resources.map((resource) => resource.path).slice(0, 28);
      const result = await window.rift.runAgent(String(request), agent, this.selectedModel(), "review", this.withWorkspaceContext(prompt), resources);
      if (request === this.agentRequest) {
        this.reviewResult.set(this.mergeAgentResult(null, result));
        this.reviewMessage.set("Review ready");
      }
    } catch (reason) {
      if (request === this.agentRequest) {
        const rawError = reason instanceof Error ? reason.message : String(reason);
        const authenticationStart = rawError.indexOf("Authentication required.");
        this.reviewError.set(authenticationStart >= 0 ? rawError.slice(authenticationStart) : rawError);
        this.reviewMessage.set(rawError.toLowerCase().includes("cancel") ? "Review cancelled" : "Review failed");
      }
    } finally {
      if (request === this.agentRequest) {
        this.reviewRunActive = false;
        this.agentRunning.set(false);
        this.persistReviewSession();
      }
    }
  }

  showDiff(): void {
    this.chatPageOpen.set(false);
    this.reviewPageOpen.set(false);
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

  startNewChat(attachedReview?: string): void {
    const repository = this.repository();
    const agent = this.selectedAgent();
    if (!repository || !agent || this.agentRunning()) return;
    const conversation: Conversation = {
      id: ++this.conversationRequest,
      repositoryRoot: repository.root,
      title: attachedReview ? "Review follow-up" : undefined,
      agent,
      mode: "edit",
      model: this.selectedModel(),
      question: "",
      status: "complete",
      result: null,
      error: null,
      history: [],
      attachedReview: attachedReview?.slice(0, 1_000_000),
      updatedAt: Date.now()
    };
    this.pendingProviderSessionId = undefined;
    this.reviewPageOpen.set(false);
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
    this.clearImageAttachments("chat");
    this.chatModelPickerOpen.set(false);
    this.chatModelSearch.set("");
    this.conversations.update((conversations) => [...conversations, conversation]);
    this.persistReviewSession();
    if (this.modelsAgent !== agent && !this.modelsLoading()) void this.loadAgentModels(agent, conversation.model);
  }

  async resumeProviderSession(session: AgentSession): Promise<void> {
    const conversation = await this.loadProviderConversation(session);
    if (conversation) this.openConversation(conversation.id);
  }

  async continuePendingProviderSession(pending: PendingExplain, session: AgentSession): Promise<void> {
    const conversation = await this.loadProviderConversation(session);
    if (conversation) await this.startExplainRequest(pending, conversation.id);
  }

  private async loadProviderConversation(session: AgentSession): Promise<Conversation | null> {
    const agent = this.selectedAgent();
    const repository = this.repository();
    if (!agent || !repository || this.agentRunning() || this.providerSessionOpeningId()) return null;
    const imported = this.repositoryConversations().find((conversation) => conversation.agent === agent && conversation.providerSessionId === session.id);
    if (imported) return imported;
    const request = ++this.providerSessionRequest;
    this.providerSessionOpeningId.set(session.id);
    this.providerSessionsError.set(null);
    try {
      const history = await window.rift.getAgentSession(agent, session.id);
      if (request !== this.providerSessionRequest || this.selectedAgent() !== agent || this.repository()?.root !== repository.root) return null;
      const conversation = this.importProviderConversation(agent, history, repository.root, session.updatedAt);
      this.conversations.update((conversations) => [...conversations, conversation]);
      this.persistReviewSession();
      return conversation;
    } catch (reason) {
      if (request === this.providerSessionRequest && this.repository()?.root === repository.root) {
        this.providerSessionsError.set(reason instanceof Error ? reason.message : String(reason));
      }
      return null;
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
    const attachments = this.chatImageAttachments();
    const text = this.chatReplyDraft().trim().slice(0, 20_000);
    const question = text || (attachments.length === 1 ? "Review the attached image" : "Review the attached images");
    if (!conversation || (!text && attachments.length === 0) || this.agentRunning()) return;
    this.chatReplyDraft.set("");
    this.clearImageAttachments("chat");
    const prompt = conversation.attachedReview && !conversation.question
      ? [
          "Use the attached code review as context for the user's instructions.",
          "Apply only the findings the user asks to fix. Leave excluded findings unchanged.",
          "Inspect the current repository before editing and verify any changes you make.",
          "",
          "# Attached review",
          conversation.attachedReview.slice(0, 30_000),
          "",
          "# User instructions",
          question
        ].join("\n")
      : question;
    const pending: PendingExplain = {
      agent: conversation.agent,
      mode: conversation.mode ?? "edit",
      model: conversation.model,
      prompt: this.withImageAttachments(prompt, attachments),
      attachmentPaths: attachments.map((attachment) => attachment.path),
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

  handleChatScroll(): void {
    const element = this.chatThread()?.nativeElement;
    if (!element) return;
    if (element.scrollHeight - element.clientHeight - element.scrollTop <= 48) {
      this.chatAutoFollow = true;
      return;
    }
    if (this.chatPointerActive) this.pauseChatAutoFollow();
  }

  handleChatWheel(event: WheelEvent): void {
    if (event.deltaY < 0) this.pauseChatAutoFollow();
  }

  handleChatScrollKeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowUp" || event.key === "PageUp" || event.key === "Home") this.pauseChatAutoFollow();
  }

  beginChatScrollTakeover(): void {
    this.chatPointerActive = true;
  }

  @HostListener("document:pointerup")
  @HostListener("document:pointercancel")
  endChatScrollTakeover(): void {
    this.chatPointerActive = false;
  }

  private pauseChatAutoFollow(): void {
    this.chatAutoFollow = false;
    if (!this.chatFollowTimer) return;
    clearTimeout(this.chatFollowTimer);
    this.chatFollowTimer = undefined;
    this.chatFollowUntil = 0;
  }

  async pasteImages(event: ClipboardEvent, destination: "chat" | "question"): Promise<void> {
    const files = [...(event.clipboardData?.items ?? [])]
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (files.length === 0) return;
    event.preventDefault();
    const target = destination === "chat" ? this.chatImageAttachments : this.questionImageAttachments;
    const remaining = Math.max(0, 8 - target().length);
    if (remaining === 0) {
      this.reviewMessage.set("A message can include up to 8 images");
      return;
    }
    for (const file of files.slice(0, remaining)) {
      try {
        const data = new Uint8Array(await file.arrayBuffer());
        const path = await window.rift.saveImageAttachment(file.name || "pasted-image", file.type, data);
        target.update((attachments) => [...attachments, {
          id: crypto.randomUUID(),
          name: file.name || "Pasted image",
          path,
          previewUrl: URL.createObjectURL(file)
        }]);
      } catch (reason) {
        this.reviewMessage.set(reason instanceof Error ? reason.message : String(reason));
      }
    }
  }

  removeImageAttachment(id: string, destination: "chat" | "question"): void {
    const target = destination === "chat" ? this.chatImageAttachments : this.questionImageAttachments;
    const attachment = target().find((entry) => entry.id === id);
    if (attachment) URL.revokeObjectURL(attachment.previewUrl);
    target.update((attachments) => attachments.filter((entry) => entry.id !== id));
  }

  continueConversation(): void {
    const conversation = this.activeConversation();
    if (!conversation || conversation.status === "running") return;
    const agentChanged = this.selectedAgent() !== conversation.agent;
    this.selectedAgent.set(conversation.agent);
    this.selectModel(conversation.model);
    this.rememberAgent(conversation.agent);
    if (agentChanged) void this.loadAgentModels(conversation.agent, conversation.model);
    this.selectedRange.set(null);
    this.allChangesSelected.set(true);
    this.toolsMenu.set({ x: Math.max(12, window.innerWidth / 2 - 195), y: 94 });
    this.startExplain(false);
    this.continuingConversationId.set(conversation.id);
  }

  async explainSelection(): Promise<void> {
    const context = this.selectedContext();
    const repository = this.repository();
    const agent = this.selectedAgent();
    if ((!context && !this.allChangesSelected()) || !repository || !agent || this.agentRunning()) return;
    const attachments = this.questionImageAttachments();
    const question = (this.questionDraft().trim() || (attachments.length > 0 ? "Review the attached image" : "Explain this")).slice(0, 20_000);
    const scope = this.allChangesSelected()
      ? [
          "Scope: the complete comparison.",
          `Start revision: ${repository.startRevision}`,
          `End revision: ${repository.endRevision ?? "working tree"}`,
          "Inspect the complete Git diff before answering.",
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
    const prompt = this.withImageAttachments([
      "Follow the user's request for this selection.",
      "If changes are requested, edit the files directly and verify them. Otherwise, respond with analysis only.",
      `Repository: ${repository.name}`,
      `Comparison: ${repository.comparisonLabel}`,
      ...scope,
      `Question: ${question}`,
      "Be concise and focus on the requested outcome."
    ].join("\n"), attachments);
    this.toolsMenu.set(null);
    this.questionComposerOpen.set(false);
    this.clearImageAttachments("question");
    this.activeQuestion.set(question);
    const conversationContext = context ? {
      filePath: this.selectedPath()!,
      startLine: context.startLine,
      endLine: context.endLine,
      diff: context.diff
    } : undefined;
    const model = this.resolveModelSearch();
    const pending: PendingExplain = {
      agent,
      mode: "edit",
      model,
      prompt,
      attachmentPaths: attachments.map((attachment) => attachment.path),
      question,
      context: conversationContext,
      providerSessionId: this.pendingProviderSessionId
    };
    this.pendingProviderSessionId = undefined;
    this.pendingExplain.set(pending);
    this.reviewPageOpen.set(false);
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
    const model = pending.model;
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
    this.reviewPageOpen.set(false);
    this.chatPageOpen.set(true);
    this.selectedAgent.set(agent);
    this.selectModel(model);
    this.rememberAgent(agent);
    this.scrollChatToBottom(true);
    await this.sendToAgent(agent, model, pending.mode, prompt, pending.attachmentPaths ?? [], pending.context, conversationId, existing?.providerSessionId ?? pending.providerSessionId);
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
      "Apply the fixes described in these code-anchored notes.",
      "Inspect the referenced code, edit the files directly, and verify the changes.",
      "Keep the changes focused on the selected notes.",
      "",
      this.formatNotes(notes)
    ].join("\n");
    const question = `Process ${notes.length} note${notes.length === 1 ? "" : "s"}`;
    this.pendingExplain.set({ agent, mode: "edit", model: this.selectedModel(), prompt, question });
    this.conversationChoiceOpen.set(true);
    void this.loadProviderSessions(agent);
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
    this.clearImageAttachments("chat");
    this.activityExpanded.set(false);
    this.selectedToolCall.set(null);
    this.chatModelPickerOpen.set(false);
    this.chatModelSearch.set("");
    this.chatPageOpen.set(true);
    this.scrollChatToBottom(true);
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
    this.reviewPageOpen.set(false);
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
      this.clearImageAttachments("question");
      this.pendingProviderSessionId = undefined;
      this.continuingConversationId.set(null);
    }
  }

  @HostListener("document:keydown.escape")
  closeTools(): void {
    if (this.repositorySearchOpen()) this.closeRepositorySearch();
    else if (this.selectedToolCall()) this.closeToolCall();
    else if (this.agentModalOpen()) this.closeAgentModal();
    else if (this.noteComposerOpen()) this.cancelNote();
    else if (this.questionComposerOpen()) {
      this.questionComposerOpen.set(false);
      this.pendingProviderSessionId = undefined;
    }
    else if (this.editMode()) {
      this.editMode.set(false);
      this.toolsMenu.set(null);
      this.fileToolsMenu.set(null);
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
  @HostListener("document:pointercancel")
  finishSelection(): void {
    this.selecting = false;
    if (this.changesPanelResizing()) {
      this.changesPanelResizing.set(false);
      this.storeSessionSetting(CHANGES_WIDTH_SESSION_KEY, String(this.changesPanelWidth()));
    }
  }

  @HostListener("document:pointermove", ["$event"])
  resizeChangesPanel(event: PointerEvent): void {
    if (this.changesPanelResizing()) this.setChangesPanelWidth(event.clientX);
  }

  @HostListener("window:resize")
  updateViewportWidth(): void {
    this.viewportWidth.set(window.innerWidth);
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

  isChangedFile(path: string): boolean {
    return this.repository()?.files.some((file) => file.path === path) ?? false;
  }

  agentLabel(id: AgentId): string {
    return this.agents().find((agent) => agent.id === id)?.label ?? id;
  }

  isAgentAuthError(error: string): boolean {
    return error.includes("Authentication required.");
  }

  openToolCall(tool: AgentToolEvent): void {
    this.selectedToolCall.set(tool);
  }

  closeToolCall(): void {
    this.selectedToolCall.set(null);
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

  renderReviewMarkdown(markdown: string): string {
    let linked = markdown;
    const replacements: Array<[string, string]> = [];
    const paths = [...(this.repository()?.files.map((file) => file.path) ?? [])].sort((left, right) => right.length - left.length);
    for (const [index, path] of paths.entries()) {
      if (!linked.includes(path)) continue;
      const token = `RIFTFILETOKEN${index}X`;
      linked = linked.split(path).join(token);
      replacements.push([token, `[${path}](rift-file:${encodeURIComponent(path)})`]);
    }
    linked = linked.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    for (const [token, link] of replacements) linked = linked.replaceAll(token, link);
    return marked.parse(linked, { async: false, breaks: true });
  }

  openReviewFile(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>("a[href^='rift-file:']");
    if (!link) return;
    event.preventDefault();
    const path = decodeURIComponent(link.getAttribute("href")!.slice("rift-file:".length));
    if (!this.repository()?.files.some((file) => file.path === path)) return;
    this.selectFile(path);
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
      this.repositoryViewRequest += 1;
      this.repositoryFileView.set(null);
      this.repositoryFileLoading.set(false);
      this.repositoryFileError.set(null);
      this.closeRepositorySearch();
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
    ) {
      this.reviewQuestion.set("");
      this.reviewResult.set(null);
      this.reviewError.set(null);
      this.reconsiderDraft.set("");
      this.loadReviewSession();
    }
    this.error.set(null);
    if (preserveSelection && previousRoot === repository.root && this.repositoryFileView()?.path === previousPath) {
      if (previousPath && repository.files.some((file) => file.path === previousPath)) this.selectFile(previousPath);
      return;
    }
    if (preserveSelection && previousRoot === repository.root && this.repositoryFileLoading() && this.selectedPath() === previousPath) return;
    const current = this.selectedPath();
    const visibleFiles = this.filteredFiles();
    const nextPath = visibleFiles.some((file) => file.path === current) ? current : visibleFiles[0]?.path ?? null;
    const keepSelection = preserveSelection
      && previousComparison === repository.comparisonId
      && previousPath === nextPath;
    if (!keepSelection) this.selectedRange.set(null);
    if (!keepSelection) this.allChangesSelected.set(false);
    this.selectedPath.set(nextPath);
    if (nextPath) {
      void this.loadPatch(nextPath, keepSelection);
      if (!this.fileEdits().has(nextPath)) void this.loadEditableFile(nextPath);
    }
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
      const patch = await window.rift.getFilePatch(path, this.fullFile());
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
        const notes = stored.notes.filter(isReviewNote).slice(0, 500).map((note) => ({ ...note, done: note.done ?? false }));
        this.notes.set(notes);
        this.selectedNoteIds.set(notes.map((note) => note.id));
        this.reviewedFiles.set([...new Set(stored.reviewedFiles)].slice(0, 5_000));
        this.workspaceContext.set(stored.workspaceContext && isWorkspaceContext(stored.workspaceContext)
          ? stored.workspaceContext
          : { details: "", links: [], resources: [] });
        if (stored.review && isPersistedReview(stored.review)) {
          this.reviewQuestion.set(stored.review.question);
          this.reviewResult.set(stored.review.result);
          this.reviewError.set(stored.review.error);
          this.reviewTone.set(stored.review.tone);
        }
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
      const notes = Array.isArray(legacy) ? legacy.filter(isReviewNote).slice(0, 500).map((note) => ({ ...note, done: note.done ?? false })) : [];
      this.notes.set(notes);
      this.selectedNoteIds.set(notes.map((note) => note.id));
      this.reviewedFiles.set([]);
      this.workspaceContext.set({ details: "", links: [], resources: [] });
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
      this.workspaceContext.set({ details: "", links: [], resources: [] });
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
        version: 4,
        reviewedFiles: this.reviewedFiles(),
        notes: this.notes(),
        conversations: this.repositoryConversations().slice(-100),
        workspaceContext: this.workspaceContext(),
        review: {
          question: this.reviewQuestion(),
          result: this.reviewResult(),
          error: this.reviewError(),
          tone: this.reviewTone()
        }
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
      `Repository: ${repository.name}`,
      `Comparison: ${repository.comparisonLabel}`,
      "",
      ...sections
    ].join("\n\n");
  }

  conversationUpdatedLabel(conversation: Conversation): string {
    return conversation.updatedAt ? this.sessionUpdatedLabel(conversation.updatedAt) : "Earlier";
  }

  private async loadEditableFile(path: string, reportError = false): Promise<void> {
    try {
      const content = await window.rift.readRepositoryFile(path);
      if (this.selectedPath() !== path || this.fileEdits().has(path)) return;
      this.fileContents.update((contents) => new Map(contents).set(path, content));
    } catch (reason) {
      this.fileContents.update((contents) => {
        const next = new Map(contents);
        next.delete(path);
        return next;
      });
      if (reportError) this.reviewMessage.set(reason instanceof Error ? reason.message : String(reason));
    }
  }

  private withImageAttachments(prompt: string, attachments: ImageAttachment[]): string {
    if (attachments.length === 0) return prompt;
    return [
      prompt,
      "",
      "Attached images (use the Read tool to inspect each image):",
      ...attachments.map((attachment, index) => `${index + 1}. ${attachment.path}`)
    ].join("\n");
  }

  private workspaceContextSection(additional: string[] = []): string[] {
    const context = this.workspaceContext();
    return [
      "# Context",
      ...additional,
      ...(context.details ? ["", "Project details:", context.details] : []),
      ...(context.links.length > 0 ? ["", "Reference links:", ...context.links.map((link) => `- ${link}`)] : []),
      ...(context.resources.length > 0 ? ["", "Reference files and directories (inspect these paths when relevant):", ...context.resources.map((resource) => `- ${resource.kind}: ${resource.path}`)] : [])
    ];
  }

  private withWorkspaceContext(prompt: string): string {
    if (this.contextItemCount() === 0 || prompt.startsWith("# Context\n")) return prompt;
    return [...this.workspaceContextSection(), "", prompt].join("\n");
  }

  private clearImageAttachments(destination: "chat" | "question"): void {
    const target = destination === "chat" ? this.chatImageAttachments : this.questionImageAttachments;
    this.revokeImagePreviews(target());
    target.set([]);
  }

  private revokeImagePreviews(attachments: ImageAttachment[]): void {
    for (const attachment of attachments) URL.revokeObjectURL(attachment.previewUrl);
  }

  private async loadAgentModels(agent: AgentId, preferredModel: string | null = null): Promise<void> {
    const request = ++this.modelRequest;
    this.modelsLoading.set(true);
    this.modelsAgent = null;
    try {
      const discoveredModels = await window.rift.listAgentModels(agent);
      if (request !== this.modelRequest || this.selectedAgent() !== agent) return;
      const models = [...new Set(discoveredModels.map((model) => model.trim()).filter(Boolean))];
      this.agentModels.set(models);
      this.modelsAgent = agent;
      const saved = preferredModel ?? this.loadSavedModel(agent);
      const model = saved && models.includes(saved) ? saved : null;
      if (saved && !model) {
        try {
          localStorage.removeItem(`${MODEL_STORAGE_PREFIX}${agent}`);
        } catch {
          this.reviewMessage.set("Could not clear an unavailable saved model");
        }
      }
      this.selectedModel.set(model);
      this.modelSearch.set(this.selectedModel() ?? "");
      this.saveAgentModelSelection(agent, model);
    } catch (reason) {
      if (request === this.modelRequest && this.selectedAgent() === agent) {
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

  private importProviderConversation(agent: AgentId, history: AgentConversationHistory, repositoryRoot: string, updatedAt: number): Conversation {
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
      providerSessionId: history.id,
      updatedAt
    };
  }

  private acceptAgentEvent(event: AgentStreamEvent): void {
    if (event.runId !== String(this.agentRequest)) return;
    if (this.reviewRunActive) {
      this.reviewResult.update((result) => this.mergeAgentResult(result, event.result));
      return;
    }
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
    this.scrollChatToBottom();
  }

  private scrollChatToBottom(force = false): void {
    if (force) this.chatAutoFollow = true;
    if (!this.chatAutoFollow) return;
    this.chatFollowUntil = performance.now() + 750;
    if (this.chatFollowTimer) return;
    const follow = (): void => {
      this.chatFollowTimer = undefined;
      requestAnimationFrame(() => this.pinChatToBottom());
      if (this.activeConversationRunning() || performance.now() < this.chatFollowUntil) {
        this.chatFollowTimer = setTimeout(follow, 80);
      }
    };
    follow();
  }

  private loadFullFile(): boolean {
    try {
      return sessionStorage.getItem(FULL_FILE_SESSION_KEY) === "true";
    } catch {
      return false;
    }
  }

  private loadFileFilter(): string {
    try {
      return (sessionStorage.getItem(FILE_FILTER_SESSION_KEY) ?? "").slice(0, 1_000);
    } catch {
      return "";
    }
  }

  private loadHideReviewed(): boolean {
    try {
      return sessionStorage.getItem(HIDE_REVIEWED_SESSION_KEY) === "true";
    } catch {
      return false;
    }
  }

  private loadChangesPanelWidth(): number {
    const fallback = window.innerWidth <= 1_050 ? 220 : 255;
    try {
      const stored = Number(sessionStorage.getItem(CHANGES_WIDTH_SESSION_KEY));
      return Number.isFinite(stored) && stored >= 220 && stored <= 600 ? stored : fallback;
    } catch {
      return fallback;
    }
  }

  private setChangesPanelWidth(width: number): void {
    this.changesPanelWidth.set(Math.round(Math.max(220, Math.min(600, width))));
  }

  private reconcileFilteredSelection(): void {
    const files = this.filteredFiles();
    const current = this.selectedPath();
    if (current && (this.repositoryFileView()?.path === current || this.repositoryFileLoading())) return;
    if (current && files.some((file) => file.path === current)) return;
    const next = files[0]?.path;
    if (next) {
      this.selectFile(next);
      return;
    }
    this.patchRequest += 1;
    this.selectedPath.set(null);
    this.patch.set(null);
    this.highlightedRows.set(null);
    this.selectedRange.set(null);
    this.allChangesSelected.set(false);
  }

  private storeSessionSetting(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // The setting still applies for the current page when session storage is unavailable.
    }
  }

  private pinChatToBottom(): void {
    const element = this.chatThread()?.nativeElement;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    this.chatBottom()?.nativeElement.scrollIntoView({ block: "end", inline: "nearest" });
  }

  private resolveModelSearch(): string | null {
    const selected = this.selectedModel();
    if (selected) return selected;
    const query = this.modelSearch().trim();
    if (!query) return null;
    const model = this.agentModels().find((entry) => entry === query) ?? null;
    if (model) this.selectModel(model);
    return model;
  }

  private loadSavedSelection(): { agent: AgentId | null; model: string | null } {
    try {
      const raw = localStorage.getItem(AGENT_MODEL_STORAGE_KEY);
      if (raw) {
        const saved: unknown = JSON.parse(raw);
        if (saved && typeof saved === "object") {
          const selection = saved as Record<string, unknown>;
          const agent = selection["agent"];
          const model = selection["model"];
          if ((agent === "opencode" || agent === "claude") && (typeof model === "string" || model === null)) {
            return { agent, model };
          }
        }
      }
      const savedAgent = localStorage.getItem(AGENT_STORAGE_KEY);
      const agent = savedAgent === "opencode" || savedAgent === "claude" ? savedAgent : null;
      return { agent, model: agent ? this.loadSavedModel(agent) : null };
    } catch {
      return { agent: null, model: null };
    }
  }

  takeReviewToChat(): void {
    const review = this.reviewResult()?.explanation;
    if (!review || this.agentRunning()) return;
    this.startNewChat(review);
    requestAnimationFrame(() => document.getElementById("chat-reply")?.focus());
  }

  private saveAgentModelSelection(agent: AgentId, model: string | null): void {
    try {
      localStorage.setItem(AGENT_MODEL_STORAGE_KEY, JSON.stringify({ agent, model }));
    } catch {
      this.reviewMessage.set("Could not remember the selected provider and model");
    }
  }

  private migratePreferences(): void {
    try {
      if (localStorage.getItem(PREFERENCE_SCHEMA_KEY) === PREFERENCE_SCHEMA_VERSION) return;
      localStorage.removeItem(AGENT_STORAGE_KEY);
      localStorage.removeItem(AGENT_MODEL_STORAGE_KEY);
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(MODEL_STORAGE_PREFIX) || key?.startsWith(CONVERSATION_STORAGE_PREFIX)) {
          localStorage.removeItem(key);
        }
      }
      localStorage.setItem(PREFERENCE_SCHEMA_KEY, PREFERENCE_SCHEMA_VERSION);
    } catch {
      this.reviewMessage.set("Could not migrate saved agent preferences");
    }
  }

  private rememberAgent(agent: AgentId): void {
    try {
      localStorage.setItem(AGENT_STORAGE_KEY, agent);
      this.saveAgentModelSelection(agent, this.selectedModel());
    } catch {
      this.reviewMessage.set("Could not remember the selected agent");
    }
  }

  private loadSavedModel(agent: AgentId): string | null {
    try {
      return localStorage.getItem(`${MODEL_STORAGE_PREFIX}${agent}`);
    } catch {
      return null;
    }
  }

  private preferredConversation(agent: AgentId | null): Conversation | undefined {
    if (!agent) return undefined;
    const conversations = this.repositoryConversations().filter((conversation) => conversation.agent === agent && conversation.status !== "running");
    const key = this.conversationStorageKey(agent);
    let saved: string | null = null;
    let savedId = NaN;
    try {
      saved = key ? localStorage.getItem(key) : null;
      savedId = saved ? Number(saved) : NaN;
    } catch {
      // Fall back to the latest conversation when storage is unavailable.
    }
    if (saved === "new") return undefined;
    return conversations.find((conversation) => conversation.id === savedId)
      ?? [...conversations].sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0) || right.id - left.id)[0];
  }

  private rememberConversation(id: number | null): void {
    const agent = this.selectedAgent();
    const key = agent ? this.conversationStorageKey(agent) : null;
    if (!key) return;
    try {
      if (id) localStorage.setItem(key, String(id));
      else localStorage.setItem(key, "new");
    } catch {
      this.reviewMessage.set("Could not remember the selected conversation");
    }
  }

  private conversationStorageKey(agent: AgentId): string | null {
    const sessionKey = this.reviewSessionStorageKey();
    return sessionKey ? `${CONVERSATION_STORAGE_PREFIX}${agent}:${sessionKey}` : null;
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
      explanation: this.mergeAgentText(current?.explanation ?? "", update.explanation).slice(0, 1_000_000),
      sessionId: update.sessionId ?? current?.sessionId
    };
  }

  private mergeAgentText(current: string, update: string): string {
    if (!current) return update;
    if (!update) return current;
    const separator = /[.!?)]$/.test(current) && /^[A-Z][a-z]/.test(update) ? "\n\n" : "";
    return `${current}${separator}${update}`;
  }

  private async sendToAgent(agent: AgentId, model: string | null, mode: AgentMode, prompt: string, attachmentPaths: string[], context?: ConversationContext, existingConversationId?: number, providerSessionId?: string): Promise<void> {
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
            mode,
            model,
            question,
            context,
            status: "running",
            result: null,
            error: null,
            providerSessionId,
            updatedAt: Date.now(),
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
          mode,
          model,
          question,
          context,
          status: "running",
          result: null,
          error: null,
          history: [],
          providerSessionId,
           updatedAt: Date.now()
         }]);
    this.activeConversationId.set(conversationId);
    this.rememberConversation(conversationId);
    this.scrollChatToBottom(true);
    this.activityExpanded.set(false);
    this.selectedToolCall.set(null);
    this.agentRunning.set(true);
    this.agentResult.set(null);
    this.agentError.set(null);
    this.reviewMessage.set(`Waiting for ${this.agents().find((option) => option.id === agent)?.label ?? agent}`);
    try {
      const resourcePaths = [...new Set([...attachmentPaths, ...this.workspaceContext().resources.map((resource) => resource.path)])].slice(0, 28);
      const agentResult = await window.rift.runAgent(String(request), agent, model, mode, this.withWorkspaceContext(prompt), resourcePaths, providerSessionId);
      const result = this.mergeAgentResult(null, agentResult);
      if (request === this.agentRequest) {
        if (this.activeConversationId() === conversationId) this.agentResult.set(result);
        this.conversations.update((conversations) => conversations.map((conversation) => (
          conversation.id === conversationId ? {
            ...conversation,
            status: "complete",
            result,
            error: null,
            updatedAt: Date.now(),
             providerSessionId: conversation.providerSessionId ?? result.sessionId
           } : conversation
         )));
         this.scrollChatToBottom();
         this.reviewMessage.set("Explanation ready");
        if (mode === "edit") {
          try {
            await this.refreshRepository();
          } catch (reason) {
            this.reviewMessage.set(`Changes applied, but the diff could not be refreshed: ${reason instanceof Error ? reason.message : String(reason)}`);
          }
        }
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
        this.scrollChatToBottom();
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
