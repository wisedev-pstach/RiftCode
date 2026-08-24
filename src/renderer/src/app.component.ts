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
import type { AgentId, AgentOption, AgentRunResult, ChangedFile, FilePatch, RepositorySnapshot } from "../../shared/contracts";

type DiffKind = "header" | "hunk" | "context" | "addition" | "deletion" | "meta";
type DiffMode = "unified" | "split";

interface DetectedLanguage {
  id: string;
  label: string;
}

const PLAIN_TEXT: DetectedLanguage = { id: "plaintext", label: "Plain text" };
const AGENT_STORAGE_KEY = "rift:last-agent";
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

interface ToolsMenu {
  x: number;
  y: number;
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
  readonly noteComposerOpen = signal(false);
  readonly questionComposerOpen = signal(false);
  readonly questionDraft = signal("");
  readonly noteDraft = signal("");
  readonly notes = signal<ReviewNote[]>([]);
  readonly agents = signal<AgentOption[]>([]);
  readonly selectedAgent = signal<AgentId | null>(null);
  readonly agentRunning = signal(false);
  readonly agentResult = signal<AgentRunResult | null>(null);
  readonly agentError = signal<string | null>(null);
  readonly agentModalOpen = signal(false);
  readonly activeQuestion = signal("");
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

  private removeRepositoryListener?: () => void;
  private refreshing = false;
  private refreshDirty = false;
  private selecting = false;
  private patchRequest = 0;
  private repositoryRequest = 0;
  private highlightRequest = 0;
  private agentRequest = 0;
  private readonly highlightWorker = new Worker(new URL("./highlight.worker.ts", import.meta.url), { type: "module" });

  ngOnInit(): void {
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
    void window.rift.listAgents().then((agents) => {
      this.agents.set(agents);
      const preferred = localStorage.getItem(AGENT_STORAGE_KEY);
      this.selectedAgent.set(agents.find((agent) => agent.id === preferred)?.id ?? agents[0]?.id ?? null);
    }).catch((reason: Error) => {
      this.reviewMessage.set(reason.message);
    });
  }

  ngOnDestroy(): void {
    this.removeRepositoryListener?.();
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
      this.selectedAgent.set(id);
      try {
        localStorage.setItem(AGENT_STORAGE_KEY, id);
      } catch {
        this.reviewMessage.set("Could not remember the selected agent");
      }
    }
  }

  selectFile(path: string): void {
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
      x: Math.max(6, Math.min(x, window.innerWidth - 250)),
      y: Math.max(6, Math.min(y, window.innerHeight - 230))
    });
  }

  startNote(): void {
    this.questionComposerOpen.set(false);
    this.noteComposerOpen.set(true);
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
      x: Math.max(6, Math.min(bounds.right - 20, window.innerWidth - 250)),
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
    this.persistNotes();
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

  deleteNote(id: string): void {
    this.notes.update((notes) => notes.filter((note) => note.id !== id));
    this.persistNotes();
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
    this.noteComposerOpen.set(false);
    this.questionDraft.set("");
    this.questionComposerOpen.set(true);
  }

  async explainSelection(): Promise<void> {
    const context = this.selectedContext();
    const repository = this.repository();
    const agent = this.selectedAgent();
    if ((!context && !this.allChangesSelected()) || !repository || !agent || this.agentRunning()) return;
    const question = this.questionDraft().trim() || "Explain this";
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
    this.agentModalOpen.set(true);
    await this.sendToAgent(agent, prompt);
  }

  async sendNotesToAgent(): Promise<void> {
    const agent = this.selectedAgent();
    if (!agent || this.notes().length === 0 || this.agentRunning()) return;
    const prompt = [
      "You are in read-only review mode. Do not edit files or run mutating commands.",
      "Respond with analysis only.",
      "Review these code-anchored notes.",
      "Inspect the referenced code and respond with concrete recommendations for each note.",
      "",
      this.formatNotes()
    ].join("\n");
    this.activeQuestion.set(`Review ${this.notes().length} code note${this.notes().length === 1 ? "" : "s"}`);
    this.agentModalOpen.set(true);
    await this.sendToAgent(agent, prompt);
  }

  closeAgentModal(): void {
    if (this.agentRunning()) void this.cancelAgent();
    this.agentModalOpen.set(false);
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

  @HostListener("document:pointerdown", ["$event"])
  dismissTools(event: PointerEvent): void {
    if (!this.toolsMenu()) return;
    const target = event.target;
    if (target instanceof Element && !target.closest(".selection-tools")) this.toolsMenu.set(null);
  }

  @HostListener("document:keydown.escape")
  closeTools(): void {
    if (this.agentModalOpen()) this.closeAgentModal();
    else if (this.noteComposerOpen()) this.cancelNote();
    else if (this.questionComposerOpen()) this.questionComposerOpen.set(false);
    else this.toolsMenu.set(null);
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

  directory(path: string): string {
    return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";
  }

  private acceptRepository(repository: RepositorySnapshot, preserveSelection = false): void {
    const previousPath = this.selectedPath();
    const previousComparison = this.repository()?.comparisonId;
    const previousRoot = this.repository()?.root;
    this.repository.set(repository);
    if (previousRoot !== repository.root || previousComparison !== repository.comparisonId) this.loadNotes();
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

  private notesStorageKey(): string | null {
    const repository = this.repository();
    return repository ? `rift:notes:${repository.root}:${repository.comparisonId}` : null;
  }

  private loadNotes(): void {
    const key = this.notesStorageKey();
    if (!key) return;
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? "[]");
      this.notes.set(Array.isArray(stored) ? stored.filter(isReviewNote).slice(0, 500) : []);
    } catch {
      this.notes.set([]);
    }
  }

  private persistNotes(): void {
    const key = this.notesStorageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(this.notes()));
    } catch {
      this.reviewMessage.set("Could not persist review notes");
    }
  }

  private formatNotes(): string {
    const repository = this.repository()!;
    const sections = this.notes().map((note, index) => [
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

  private async sendToAgent(agent: AgentId, prompt: string): Promise<void> {
    const request = ++this.agentRequest;
    this.agentRunning.set(true);
    this.agentModalOpen.set(true);
    this.agentResult.set(null);
    this.agentError.set(null);
    this.reviewMessage.set(`Waiting for ${this.agents().find((option) => option.id === agent)?.label ?? agent}`);
    try {
      const result = await window.rift.runAgent(agent, prompt);
      if (request === this.agentRequest) {
        this.agentResult.set(result);
        this.reviewMessage.set("Explanation ready");
      }
    } catch (reason) {
      if (request === this.agentRequest) {
        this.agentError.set(reason instanceof Error ? reason.message : String(reason));
        this.reviewMessage.set("Agent request failed");
      }
    } finally {
      if (request === this.agentRequest) this.agentRunning.set(false);
    }
  }
}
