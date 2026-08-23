import { ChangeDetectionStrategy, Component, computed, OnDestroy, OnInit, signal } from "@angular/core";
import type { ChangedFile, FilePatch, RepositorySnapshot } from "../../shared/contracts";

type DiffKind = "header" | "hunk" | "context" | "addition" | "deletion" | "meta";

interface DiffRow {
  kind: DiffKind;
  content: string;
  oldLine?: number;
  newLine?: number;
}

function parsePatch(patch: string): DiffRow[] {
  let oldLine = 0;
  let newLine = 0;

  return patch.split("\n").map((line) => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      return { kind: "hunk", content: `@@${hunk[3]}` };
    }
    if (line.startsWith("diff --git") || line.startsWith("index ")) return { kind: "header", content: line };
    if (line.startsWith("---") || line.startsWith("+++")) return { kind: "meta", content: line };
    if (line.startsWith("+") && !line.startsWith("+++")) {
      const row = { kind: "addition" as const, content: line.slice(1), newLine };
      newLine += 1;
      return row;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
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
  });
}

@Component({
  selector: "rift-root",
  standalone: true,
  templateUrl: "./app.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit, OnDestroy {
  readonly repository = signal<RepositorySnapshot | null>(null);
  readonly selectedPath = signal<string | null>(null);
  readonly patch = signal<FilePatch | null>(null);
  readonly selectedLine = signal<number | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly cliMessage = signal<string | null>(null);
  readonly selectedFile = computed(() => this.repository()?.files.find((file) => file.path === this.selectedPath()));
  readonly rows = computed(() => parsePatch(this.patch()?.patch ?? ""));

  private removeRepositoryListener?: () => void;
  private refreshing = false;
  private patchRequest = 0;

  ngOnInit(): void {
    void window.rift.openRepository()
      .then((repository) => this.acceptRepository(repository))
      .catch((reason: Error) => this.error.set(reason.message))
      .finally(() => this.loading.set(false));

    this.removeRepositoryListener = window.rift.onRepositoryChanged(() => void this.refreshRepository());
  }

  ngOnDestroy(): void {
    this.removeRepositoryListener?.();
  }

  async chooseRepository(): Promise<void> {
    const repository = await window.rift.chooseRepository();
    if (repository) this.acceptRepository(repository);
  }

  async installCli(): Promise<void> {
    try {
      const path = await window.rift.installCli();
      this.cliMessage.set(`Installed at ${path}`);
    } catch (reason) {
      this.cliMessage.set(reason instanceof Error ? reason.message : String(reason));
    }
  }

  selectFile(path: string): void {
    if (path === this.selectedPath()) return;
    this.selectedPath.set(path);
    this.selectedLine.set(null);
    void this.loadPatch(path);
  }

  selectLine(row: DiffRow): void {
    if (!this.isSelectable(row)) return;
    this.selectedLine.set(row.newLine ?? row.oldLine ?? null);
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

  private acceptRepository(repository: RepositorySnapshot): void {
    this.repository.set(repository);
    this.error.set(null);
    const current = this.selectedPath();
    const nextPath = repository.files.some((file) => file.path === current) ? current : repository.files[0]?.path ?? null;
    this.selectedPath.set(nextPath);
    if (nextPath) void this.loadPatch(nextPath);
    else this.patch.set(null);
  }

  private async refreshRepository(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      this.acceptRepository(await window.rift.refreshRepository());
    } catch (reason) {
      this.error.set(reason instanceof Error ? reason.message : String(reason));
    } finally {
      this.refreshing = false;
    }
  }

  private async loadPatch(path: string): Promise<void> {
    const request = ++this.patchRequest;
    this.patch.set(null);
    try {
      const patch = await window.rift.getFilePatch(path);
      if (request === this.patchRequest) this.patch.set(patch);
    } catch (reason) {
      if (request === this.patchRequest) this.error.set(reason instanceof Error ? reason.message : String(reason));
    }
  }
}
