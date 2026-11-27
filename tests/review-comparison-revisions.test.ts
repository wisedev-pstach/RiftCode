import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRepository, loadFilePatch } from '../src/main/git';
import { buildTerminalReview } from '../src/shared/review-request';

for (const format of ['sha1', 'sha256']) test(`large working-tree review keeps its captured ${format} start after HEAD advances`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'rift-review-revisions-'));
  const git = (...args: string[]) => execFileSync('git', [
    '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Synthetic Fixture',
    '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args
  ], { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } }).trim();
  try {
    git('init', '--template=', '--initial-branch=fixture', `--object-format=${format}`);
    const paths = Array.from({ length: 1000 }, (_, i) => `long-comparison-fixture-pending-file-${i}.txt`);
    await Promise.all(paths.map(path => writeFile(join(root, path), 'before\n')));
    git('add', '--', '.'); git('commit', '-m', 'initial fixture');
    const original = git('rev-parse', 'HEAD');
    await Promise.all(paths.map(path => writeFile(join(root, path), 'pending\n')));
    const snapshot = await loadRepository(root, 'working-tree');
    assert.equal(snapshot.files.length, paths.length);
    const context = {
      repository: snapshot.name, comparison: snapshot.comparisonLabel,
      startRevision: snapshot.startRevision, endRevision: snapshot.endRevision,
      files: snapshot.files.map(file => file.path), currentPath: paths[0], notes: '', projectContext: ''
    };
    const brief = buildTerminalReview(context, 'comparison', '', 'professional');
    git('add', '--', '.'); git('commit', '-m', 'advance HEAD after snapshot');
    assert.equal(git('diff', 'HEAD', '--', paths[0]), '');
    assert.match(git('diff', original, '--', paths[0]), /\+pending/);
    assert.equal(snapshot.startRevision, original);
    assert.match(brief, /without a file filter/);
    assert.ok(brief.includes(`Start revision: ${original}\n`));
    assert.match(brief, /End revision: working tree/);
    assert.doesNotMatch(brief, /HEAD|long-comparison-fixture-pending-file-/);
    assert.ok(Buffer.byteLength(brief) <= 32768);
    assert.match((await loadFilePatch(snapshot, paths[0], false)).patch, /\+pending/);

    // Commit endpoints must stay fixed and exclude unrelated live working-tree edits.
    const committed = await loadRepository(root, `commit:${git('rev-parse', 'HEAD')}`);
    assert.equal(committed.startRevision, original);
    assert.equal(committed.endRevision, git('rev-parse', 'HEAD'));
    const fixedBrief = buildTerminalReview({ ...context, startRevision: committed.startRevision, endRevision: committed.endRevision }, 'comparison', '', 'professional');
    assert.ok(fixedBrief.includes(`End revision: ${committed.endRevision}\n`));
    await writeFile(join(root, paths[0]), 'unrelated live edit\n');
    assert.doesNotMatch((await loadFilePatch(committed, paths[0], false)).patch, /unrelated live edit/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
