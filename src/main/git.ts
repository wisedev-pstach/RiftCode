import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { ChangedFile, ChangeStatus, FilePatch, RepositorySnapshot } from "../shared/contracts";

interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}

function run(command: string, args: string[], cwd: string, acceptedCodes = [0]): Promise<GitResult> {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, { cwd, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error && "code" in error && typeof error.code === "number" ? error.code : 0;
      if (error && !acceptedCodes.includes(code)) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }
      resolvePromise({ stdout, stderr, code });
    });
  });
}

function git(cwd: string, args: string[], acceptedCodes = [0]): Promise<GitResult> {
  return run("git", ["-c", "core.quotepath=false", ...args], cwd, acceptedCodes);
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

export async function loadRepository(requestedPath: string): Promise<RepositorySnapshot> {
  const candidate = resolve(requestedPath);
  const rootResult = await git(candidate, ["rev-parse", "--show-toplevel"]);
  const root = rootResult.stdout.trim();
  const branchResult = await git(root, ["branch", "--show-current"]);
  const branch = branchResult.stdout.trim() || "HEAD";
  const base = await detectBase(root, branch);
  const mergeBase = base.label
    ? (await git(root, ["merge-base", "HEAD", base.ref])).stdout.trim()
    : "HEAD";

  const [names, stats, untracked] = await Promise.all([
    git(root, ["diff", "--name-status", "--find-renames", mergeBase, "--"]),
    git(root, ["diff", "--numstat", "--find-renames", mergeBase, "--"]),
    git(root, ["ls-files", "--others", "--exclude-standard"])
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
    comparisonLabel: base.label ? `${branch} → ${base.label}` : `Working tree → ${branch}`,
    startRevision: mergeBase,
    files,
    additions,
    deletions,
    updatedAt: Date.now()
  };
}

export async function loadFilePatch(snapshot: RepositorySnapshot, path: string): Promise<FilePatch> {
  const file = snapshot.files.find((entry) => entry.path === path);
  if (!file) throw new Error(`File is no longer part of the comparison: ${path}`);

  let result: GitResult;
  if (file.status === "untracked") {
    result = await git(
      snapshot.root,
      ["diff", "--no-index", "--no-color", "--unified=4", "--", "/dev/null", join(snapshot.root, path)],
      [0, 1]
    );
  } else {
    result = await git(snapshot.root, [
      "diff",
      "--no-ext-diff",
      "--no-color",
      "--find-renames",
      "--unified=4",
      snapshot.startRevision,
      "--",
      path
    ]);
  }

  return {
    path,
    patch: result.stdout,
    binary: result.stdout.includes("Binary files") || result.stdout.includes("GIT binary patch")
  };
}
