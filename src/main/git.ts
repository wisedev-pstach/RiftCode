import { execFile } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import type {
  ChangedFile,
  ChangeStatus,
  ComparisonOption,
  FilePatch,
  RepositoryFileView,
  RepositorySearchResponse,
  RepositorySearchResult,
  RepositorySnapshot
} from "../shared/contracts";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const FULL_FILE_CONTEXT_LINES = 2_147_483_647;
const SEARCH_FILE_LIMIT = 512 * 1024;
const SEARCH_RESULT_LIMIT = 80;
const VIEW_FILE_LIMIT = 2 * 1024 * 1024;
const VIEW_LINE_LIMIT = 10_000;

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

async function safeRepositoryFile(root: string, path: string): Promise<string> {
  if (!path || path.includes("\0") || isAbsolute(path)) throw new Error("Invalid repository file path.");
  const canonicalRoot = await realpath(root);
  const candidate = resolve(canonicalRoot, path);
  const lexicalRelative = relative(canonicalRoot, candidate);
  if (!lexicalRelative || lexicalRelative.startsWith(`..${sep}`) || lexicalRelative === ".." || isAbsolute(lexicalRelative)) {
    throw new Error("The file is outside the repository.");
  }
  const canonicalFile = await realpath(candidate);
  const canonicalRelative = relative(canonicalRoot, canonicalFile);
  if (!canonicalRelative || canonicalRelative.startsWith(`..${sep}`) || canonicalRelative === ".." || isAbsolute(canonicalRelative)) {
    throw new Error("The file is outside the repository.");
  }
  return canonicalFile;
}

async function searchableText(root: string, path: string, limit = SEARCH_FILE_LIMIT): Promise<string | null> {
  try {
    const file = await safeRepositoryFile(root, path);
    const info = await stat(file);
    if (!info.isFile() || info.size > limit) return null;
    const content = await readFile(file);
    if (content.includes(0)) return null;
    return content.toString("utf8");
  } catch {
    return null;
  }
}

function searchResult(path: string, text: string | null, query: string): RepositorySearchResult | null {
  const lowerQuery = query.toLocaleLowerCase();
  const nameMatch = path.toLocaleLowerCase().includes(lowerQuery);
  if (text === null) return nameMatch ? { path, nameMatch, matches: [], preview: "Preview unavailable", previewStartLine: 1 } : null;
  const lines = text.split(/\r?\n/);
  const matchingLines: number[] = [];
  for (let index = 0; index < lines.length && matchingLines.length < 3; index += 1) {
    if (lines[index].toLocaleLowerCase().includes(lowerQuery)) matchingLines.push(index);
  }
  if (!nameMatch && matchingLines.length === 0) return null;
  const previewStart = Math.max(0, (matchingLines[0] ?? 5) - 5);
  return {
    path,
    nameMatch,
    matches: matchingLines.map((line) => ({ line: line + 1, text: lines[line].slice(0, 500) })),
    preview: lines.slice(previewStart, previewStart + 16).join("\n").slice(0, 12_000),
    previewStartLine: previewStart + 1
  };
}

export async function searchRepository(root: string, query: string): Promise<RepositorySearchResponse> {
  const [allResult, contentMatchesResult] = await Promise.all([
    git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]),
    git(root, ["grep", "--untracked", "-l", "-I", "-F", "-i", "-z", "-e", query, "--"], [0, 1])
  ]);
  const lowerQuery = query.toLocaleLowerCase();
  const allPaths = allResult.stdout.split("\0").filter(Boolean);
  const candidates = new Set([
    ...allPaths.filter((path) => path.toLocaleLowerCase().includes(lowerQuery)),
    ...contentMatchesResult.stdout.split("\0").filter(Boolean)
  ]);

  const ordered = [...candidates].sort((left, right) => {
    const leftName = left.toLocaleLowerCase().includes(lowerQuery);
    const rightName = right.toLocaleLowerCase().includes(lowerQuery);
    return Number(rightName) - Number(leftName) || left.localeCompare(right);
  });
  const results: RepositorySearchResult[] = [];
  for (const path of ordered.slice(0, SEARCH_RESULT_LIMIT)) {
    const result = searchResult(path, await searchableText(root, path), query);
    if (result) results.push(result);
  }
  return { results, limited: ordered.length > SEARCH_RESULT_LIMIT };
}

export async function readRepositoryViewFile(root: string, path: string): Promise<RepositoryFileView> {
  const listed = await git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", path]);
  if (!listed.stdout.split("\0").includes(path)) throw new Error("The file is not tracked or available in the repository.");
  const file = await safeRepositoryFile(root, path);
  const info = await stat(file);
  if (!info.isFile()) throw new Error("The selected path is not a file.");
  const content = await readFile(file);
  if (content.includes(0)) return { path, content: "", binary: true, truncated: false };
  const sizeTruncated = content.length > VIEW_FILE_LIMIT;
  const text = content.subarray(0, VIEW_FILE_LIMIT).toString("utf8");
  const lines = text.split(/\r?\n/);
  const lineTruncated = lines.length > VIEW_LINE_LIMIT;
  return {
    path,
    content: lines.slice(0, VIEW_LINE_LIMIT).join("\n"),
    binary: false,
    truncated: sizeTruncated || lineTruncated
  };
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
