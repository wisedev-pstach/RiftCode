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
import hljs from "highlight.js/lib/common";
import powershell from "highlight.js/lib/languages/powershell";
import type { ChangedFile, FilePatch, RepositorySnapshot } from "../../shared/contracts";

type DiffKind = "header" | "hunk" | "context" | "addition" | "deletion" | "meta";
type DiffMode = "unified" | "split";

hljs.registerLanguage("powershell", powershell);

interface DetectedLanguage {
  id: string;
  label: string;
}

const PLAIN_TEXT: DetectedLanguage = { id: "plaintext", label: "Plain text" };
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

function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  const openSpans: string[] = [];
  let current = "";

  for (const token of html.split(/(<span class="[^"]+">|<\/span>|\n)/)) {
    if (token === "\n") {
      current += "</span>".repeat(openSpans.length);
      lines.push(current);
      current = openSpans.join("");
    } else if (token.startsWith("<span ")) {
      openSpans.push(token);
      current += token;
    } else if (token === "</span>") {
      openSpans.pop();
      current += token;
    } else {
      current += token;
    }
  }
  lines.push(current);
  return lines;
}

function highlightRows(rows: DiffRow[], language: DetectedLanguage): DiffRow[] {
  if (!hljs.getLanguage(language.id) || rows.length > 5000) return rows;
  const highlighted = rows.map((row) => ({ ...row }));

  function applyHighlighting(indexes: number[], side: "oldHighlighted" | "newHighlighted"): void {
    if (indexes.length === 0) return;
    try {
      const code = indexes.map((index) => rows[index].content).join("\n");
      const lines = splitHighlightedLines(
        hljs.highlight(code, { language: language.id, ignoreIllegals: true }).value
      );
      indexes.forEach((rowIndex, lineIndex) => {
        highlighted[rowIndex][side] = lines[lineIndex];
      });
    } catch {
      // Plain text interpolation remains available if a grammar rejects the input.
    }
  }

  let segmentStart = 0;
  for (let index = 0; index <= rows.length; index += 1) {
    if (index < rows.length && rows[index].kind !== "hunk") continue;
    const indexes = Array.from({ length: index - segmentStart }, (_, offset) => segmentStart + offset);
    applyHighlighting(indexes.filter((rowIndex) => rows[rowIndex].kind !== "addition"), "oldHighlighted");
    applyHighlighting(indexes.filter((rowIndex) => rows[rowIndex].kind !== "deletion"), "newHighlighted");
    segmentStart = index + 1;
  }

  return highlighted.map((row) => ({
    ...row,
    highlighted: row.kind === "deletion" ? row.oldHighlighted : row.newHighlighted
  }));
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
  readonly loading = signal(true);
  readonly comparisonChanging = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedFile = computed(() => this.repository()?.files.find((file) => file.path === this.selectedPath()));
  readonly detectedLanguage = computed(() => detectLanguage(this.selectedPath()));
  readonly rows = computed(() => highlightRows(parsePatch(this.patch()?.patch ?? ""), this.detectedLanguage()));
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

  ngOnInit(): void {
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
  }

  ngOnDestroy(): void {
    this.removeRepositoryListener?.();
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

  selectFile(path: string): void {
    if (path === this.selectedPath()) return;
    this.selectedPath.set(path);
    this.selectedRange.set(null);
    this.resetHorizontalScroll();
    void this.loadPatch(path);
  }

  beginSelection(index: number, row: DiffRow, event: PointerEvent): void {
    if (event.button !== 0 || !this.isSelectable(row)) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).focus({ preventScroll: true });
    const current = this.selectedRange();
    const anchor = event.shiftKey && current ? current.anchor : index;
    this.selectedRange.set({ anchor, focus: index });
    this.selecting = true;
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
    const current = this.selectedRange();
    this.selectedRange.set({
      anchor: event.shiftKey && current ? current.anchor : index,
      focus: index
    });
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
    this.repository.set(repository);
    this.error.set(null);
    const current = this.selectedPath();
    const nextPath = repository.files.some((file) => file.path === current) ? current : repository.files[0]?.path ?? null;
    const keepSelection = preserveSelection
      && previousComparison === repository.comparisonId
      && previousPath === nextPath;
    if (!keepSelection) this.selectedRange.set(null);
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
    const previousPatch = this.patch();
    if (!preserveSelection) {
      this.patch.set(null);
      this.resetHorizontalScroll();
    }
    try {
      const patch = await window.rift.getFilePatch(path);
      if (request === this.patchRequest) {
        if (preserveSelection && previousPatch?.patch !== patch.patch) this.selectedRange.set(null);
        this.patch.set(patch);
      }
    } catch (reason) {
      if (request === this.patchRequest) this.error.set(reason instanceof Error ? reason.message : String(reason));
    }
  }

  private resetHorizontalScroll(): void {
    requestAnimationFrame(() => {
      const element = this.diffScroll()?.nativeElement;
      if (element) element.scrollLeft = 0;
    });
  }
}
