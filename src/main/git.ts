import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type {
  ChangedFile,
  ChangeStatus,
  ComparisonOption,
  FilePatch,
  RepositorySnapshot
} from "../shared/contracts";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const FULL_FILE_CONTEXT_LINES = 2_147_483_647;

interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}

interface ComparisonDefinition extends ComparisonOption {
  startRevision: string;
  endRevision: string | null;
  includeUntracked: boolean;
}

function run(
  command: string,
  args: string[],
  cwd: string,
  acceptedCodes = [0],
  signal?: AbortSignal
): Promise<GitResult> {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, { cwd, maxBuffer: 50 * 1024 * 1024, timeout: 30_000, signal }, (error, stdout, stderr) => {
      const code = error && "code" in error && typeof error.code === "number" ? error.code : 0;
      if (error && (typeof error.code !== "number" || !acceptedCodes.includes(code))) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }
      resolvePromise({ stdout, stderr, code });
    });
  });
}

function git(cwd: string, args: string[], acceptedCodes = [0], signal?: AbortSignal): Promise<GitResult> {
  return run("git", ["-c", "core.quotepath=false", ...args], cwd, acceptedCodes, signal);
}

async function refExists(root: string, ref: string): Promise<boolean> {
  const result = await git(root, ["rev-parse", "--verify", "--quiet", ref], [0, 1]);
  return result.code === 0;
}

async function detectBase(root: string, branch: string): Promise<{ label: string | null; ref: string }> {
  if (branch === "HEAD") return { label: null, ref: "HEAD" };

  const remoteHead = await git(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], [0, 1]);
  const candidates = [
    remoteHead.stdout.trim(),
    "origin/main",
    "origin/master",
    "main",
    "master"
  ].filter((candidate, index, all) => candidate && all.indexOf(candidate) === index);

  for (const candidate of candidates) {
    if (!(await refExists(root, candidate))) continue;
    const label = candidate.replace(/^origin\//, "");
    if (label === branch) return { label: null, ref: "HEAD" };
    return { label, ref: candidate };
  }

  return { label: null, ref: "HEAD" };
}

async function comparisonDefinitions(
  root: string,
  branch: string,
  base: { label: string | null; ref: string }
): Promise<ComparisonDefinition[]> {
  const comparisons: ComparisonDefinition[] = [
    {
      id: "working-tree",
      kind: "working-tree",
      label: "Uncommitted changes",
      detail: `Working tree against ${branch}`,
      startRevision: "HEAD",
      endRevision: null,
      includeUntracked: true
    }
  ];

  if (base.label) {
    const mergeBase = (await git(root, ["merge-base", "HEAD", base.ref])).stdout.trim();
    comparisons.push({
      id: "current-branch",
      kind: "branch",
      label: "Current branch changes",
      detail: `${branch} against ${base.label} and working tree`,
      startRevision: mergeBase,
      endRevision: null,
      includeUntracked: true
    });
  }

  const log = await git(root, ["log", "-40", "--format=%H%x09%h%x09%P%x09%s"]);
  for (const line of log.stdout.split("\n").filter(Boolean)) {
    const [sha, shortSha, parents, ...subjectParts] = line.split("\t");
    const subject = subjectParts.join(" ").trim() || "Untitled commit";
    comparisons.push({
      id: `commit:${sha}`,
      kind: "commit",
      label: `${shortSha} ${subject}`,
      detail: "Commit against its parent",
      startRevision: parents.split(" ")[0] || EMPTY_TREE,
      endRevision: sha,
      includeUntracked: false
    });
  }

  return comparisons;
}

function statusFromCode(code: string): ChangeStatus {
  if (code.startsWith("A")) return "added";
  if (code.startsWith("D")) return "deleted";
  if (code.startsWith("R")) return "renamed";
  return "modified";
}

function parseChangedFiles(output: string): ChangedFile[] {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [code, firstPath, secondPath] = line.split("\t");
      const renamed = code.startsWith("R");
      return {
        path: renamed ? secondPath : firstPath,
        previousPath: renamed ? firstPath : undefined,
        status: statusFromCode(code),
        additions: 0,
        deletions: 0
      };
    });
}

function applyStats(files: ChangedFile[], output: string): void {
  for (const line of output.split("\n").filter(Boolean)) {
    const [added, deleted, ...pathParts] = line.split("\t");
    const path = pathParts.at(-1);
    const file = files.find((entry) => entry.path === path);
    if (!file) continue;
    file.additions = added === "-" ? 0 : Number(added);
    file.deletions = deleted === "-" ? 0 : Number(deleted);
  }
}

async function untrackedStats(root: string, path: string): Promise<number> {
  try {
    const info = await stat(join(root, path));
    if (info.size > 2 * 1024 * 1024) return 0;
    const contents = await readFile(join(root, path));
    if (contents.includes(0)) return 0;
    return contents.toString("utf8").split("\n").length - 1 || 1;
  } catch {
    return 0;
  }
}

export async function loadRepository(requestedPath: string, comparisonId = "auto"): Promise<RepositorySnapshot> {
  const candidate = resolve(requestedPath);
  const rootResult = await git(candidate, ["rev-parse", "--show-toplevel"]);
  const root = rootResult.stdout.trim();
  const branchResult = await git(root, ["branch", "--show-current"]);
  const branch = branchResult.stdout.trim() || "HEAD";
  const base = await detectBase(root, branch);
  const comparisons = await comparisonDefinitions(root, branch, base);
  const requestedComparisonId = comparisonId === "auto"
    ? defaultComparisonId(comparisons)
    : comparisonId;
  const comparison = comparisons.find((entry) => entry.id === requestedComparisonId) ?? comparisons[0];
  const revisions = comparison.endRevision
    ? [comparison.startRevision, comparison.endRevision]
    : [comparison.startRevision];

  const [names, stats, untracked] = await Promise.all([
    git(root, ["diff", "--name-status", "--find-renames", ...revisions, "--"]),
    git(root, ["diff", "--numstat", "--find-renames", ...revisions, "--"]),
    comparison.includeUntracked
      ? git(root, ["ls-files", "--others", "--exclude-standard"])
      : Promise.resolve({ stdout: "", stderr: "", code: 0 })
  ]);

  const files = parseChangedFiles(names.stdout);
  applyStats(files, stats.stdout);

  for (const path of untracked.stdout.split("\n").filter(Boolean)) {
    files.push({
      path,
      status: "untracked",
      additions: await untrackedStats(root, path),
      deletions: 0
    });
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  const additions = files.reduce((total, file) => total + file.additions, 0);
  const deletions = files.reduce((total, file) => total + file.deletions, 0);

  return {
    root,
    name: basename(root),
    branch,
    baseBranch: base.label,
    comparisonId: comparison.id,
    comparisonLabel: comparison.detail,
    startRevision: comparison.startRevision,
    endRevision: comparison.endRevision,
    includeUntracked: comparison.includeUntracked,
    comparisons: comparisons.map(({ id, kind, label, detail }) => ({ id, kind, label, detail })),
    files,
    additions,
    deletions,
    updatedAt: Date.now()
  };
}

function defaultComparisonId(comparisons: ComparisonDefinition[]): string {
  return comparisons.some((option) => option.id === "current-branch")
    ? "current-branch"
    : "working-tree";
}

export async function loadFilePatch(snapshot: RepositorySnapshot, path: string, fullFile: boolean, signal?: AbortSignal): Promise<FilePatch> {
  const file = snapshot.files.find((entry) => entry.path === path);
  if (!file) throw new Error(`File is no longer part of the comparison: ${path}`);

  const contextLines = fullFile ? FULL_FILE_CONTEXT_LINES : 4;
  let result: GitResult;
  if (file.status === "untracked") {
    result = await git(
      snapshot.root,
      ["diff", "--no-index", "--no-color", `--unified=${contextLines}`, "--", "/dev/null", join(snapshot.root, path)],
      [0, 1],
      signal
    );
  } else {
    const revisions = snapshot.endRevision
      ? [snapshot.startRevision, snapshot.endRevision]
      : [snapshot.startRevision];
    const paths = file.status === "renamed" && file.previousPath
      ? [file.previousPath, path]
      : [path];
    result = await git(snapshot.root, [
      "diff",
      "--no-ext-diff",
      "--no-color",
      "--find-renames",
      `--unified=${contextLines}`,
      ...revisions,
      "--",
      ...paths
    ], [0], signal);
  }

  return {
    path,
    patch: result.stdout,
    binary: result.stdout.includes("Binary files") || result.stdout.includes("GIT binary patch")
  };
}
