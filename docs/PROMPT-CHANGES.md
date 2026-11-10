# Per-prompt workspace checkpoints — 0.8.0

## Use

1. Start or resume your native Claude Code, OpenCode or Codex session as usual. Permissions and provider confirmations are unchanged.
2. At an **empty CLI prompt**, open **Context → Track a prompt**. This reveals a small optional composer inside the retained terminal, not a chat tab. Do not use it for login, trust or permission dialogs. Bracketed-paste mode is an input capability, not proof that authentication or an agent turn has finished.
3. Choose **Send & track** explicitly. Main captures the actual working-tree bytes before forwarding any of this prompt. Then it writes one sanitized bracketed-paste frame followed by one Enter to the same current PTY. Raw terminal input is paused during capture so it cannot interleave with this submission. Nothing starts automatically.
4. Use **Refresh changes** to update the open checkpoint's file and text-line counts. These are **workspace changes since that prompt**, including concurrent edits by you, other tools and direct CLI prompts; Rift does not infer authorship or completion from output silence. This version uses explicit refresh, not automatic filesystem polling for checkpoint summaries.
5. The summary's **Review changes** opens the existing diff viewer against that exact captured before/after pair. It works when a provider restores a dirty file to HEAD and the ordinary Git comparison has no change for that file. The banner identifies the prompt, the sidebar lists its files, and the normal repository comparison is not rewritten. **Repository comparison** restores the original comparison. Returning to Terminal retains the PTY.
6. Each next successful **Send & track** freezes the previous prompt's afterimage and uses that *same captured state* as the new prompt's beforeimage. Earlier frozen comparisons do not absorb later edits. **Context → Finish checkpoint** freezes without stopping the CLI. **Stop** terminates the PTY and attempts to freeze the last checkpoint; a freeze failure is reported separately and does not undo Stop.

The compact Notes / Terminal / Review rail is unchanged. The Review rail and terminal Context → Review changes still prepare AI review context without submitting it; only a checkpoint summary's Review changes button opens its snapshot comparison. Existing note/selection **Insert** actions still never append Enter.

**Direct terminal Enter is untracked.** Rift does not parse provider ANSI output or add native hooks to invent prompt boundaries. Direct CLI edits can consequently appear in a still-open checkpoint interval; finish that checkpoint first if you want to exclude subsequent untracked activity.

## Errors and lifecycle

- No active current PTY, no native bracketed-paste capability, invalid/oversized prompt or snapshot failure: retain the draft and send no tracked prompt bytes. Provider/session/root changes during capture are checked again in trusted main immediately before writing.
- A native write error is **uncertain submission**, not a safe automatic retry. Inspect the CLI before retrying; Rift keeps the draft and warns rather than sending twice.
- Summary counts and rendered patches come from the same stored patch artifacts. Each summary has an opaque main-owned view token. Refreshing an open checkpoint expires its previous view token; an obsolete request rejects with instructions to refresh/reopen instead of displaying newer bytes under old counts. Frozen views are reusable.
- Repository opening purges/fences the old checkpoint scope. Explicitly starting a new or resumed native session clears the previous session's ephemeral checkpoint history. Stop preserves its final history for review until a new session/repository is selected.
- Capture/refresh/patch operations are generation-scoped; an old completion cannot install another repository's files or overwrite a replacement draft/spinner. A failed next capture or failed write does not prematurely freeze the previous checkpoint.
- Checkpoint review is a read-only snapshot view with full captured context. Current-file editing and repository-level reviewed markers are disabled there; live source navigation and Repository comparison remain available. It does not stage, commit or restore files.

## Limits and privacy

- **Three recent prompts**, numbered within the native session; older entries are evicted.
- **5,000 Git-listed files**, **10,000 inspected directory entries**, **1 MiB per file**, **20 MiB actual file bytes per image**, **40 MiB total retained patch text**. Oversized/unsupported input fails explicitly rather than silently claiming complete counts. There are at most six distinct retained content images for three prompts (adjacent Send & track boundaries share an image; explicitly finished intervals can leave gaps), plus bounded transient captures/diff buffers. Capture, refresh and finish each permit only one concurrent operation of their kind.
- Tracked files and nonignored untracked files are enumerated with NUL-separated fixed-argument Git commands. Initial staged/unstaged/untracked bytes are captured directly; Git HEAD is not substituted for dirty working-tree content. Ordinary ignored paths are excluded. Git environment redirection is stripped, optional index locks are disabled, fsmonitor is disabled and comparison commands disable external diff/textconv. No checkout, stash, index mutation or repository hooks/config writes are used.
- File reads reject symlinks, linked files, special objects and submodule directories; parent paths, descriptor type/link identity and canonical confinement are checked. Descriptor reads are bounded, not merely their preceding stat. Non-UTF-8 path names reject capture; valid Unicode/spaces/newlines are preserved and safely quoted in diff headers. Ignored special objects are not opened. Legitimate hardlinked code therefore also requires an ordinary-copy workspace before tracking.
- Binary/invalid-UTF-8 content is compared byte-for-byte and counted as a changed **binary** file, without inventing line counts. Text line totals exclude binary files. Executable-mode-only changes, rename detection and ignored files are not included.
- Multi-file snapshots are **not atomic filesystem transactions**: concurrent edits can occur between reads. Checkpoints describe an observation interval, not proof of which agent changed what. Finish/refresh only when a stable view is useful.
- Checkpoint content and only a sanitized first-line prompt label (80 characters) are held in main memory. Full prompt history is not persisted by this feature. History is lost on app restart and is never uploaded. Git no-index comparison uses private owned scratch directories under the OS temporary directory/TMPDIR, with 0600 files, removed in `finally`; an abrupt process/OS crash may leave private scratch copies for normal OS cleanup. No snapshot is written into the user's worktree or `.git`.

## Executed checks

The `feat/terminal-ai-workspace` continuation over `3455e71539f752bbe3fe362941431de3d8e8ecf5` passed:

- `npm test`: **68 core + 30 installer tests**, no failures/skips.
- `CHROMIUM_EXECUTABLE=/opt/hermes/tools/chromium-1208/chrome-linux64/chrome npm run test:ui`: **68 UI tests**, including the production TypeScript/Angular checks and final build.
- `LD_LIBRARY_PATH=/opt/data/cache/scratch/rift-native-libs/root/usr/lib/x86_64-linux-gnu ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron --import tsx --test tests/terminal-service.test.ts tests/prompt-checkpoints.test.ts`: **26 tests** in Electron's actual Node runtime (15 native PTY/session cases and 11 checkpoint filesystem cases).
- `git diff --check`: passed.
- Fresh `electron-builder --mac --x64 --arm64 --dir` and `--win --x64 --arm64 --dir` builds: **four packages**, six byte-identical final runtime assets per archive, production node-pty dependencies and exact-architecture unpacked native helpers verified with `/opt/data/cache/scratch/rift-verify-packages.cjs`. Readback: `/opt/data/cache/scratch/rift-package-verification.json`.

Final renderer: `index-jfZ2GuPU.js`, SHA-256 `6c8804eebbbb4310015848e4696c95bc27dd55fc94be2b97b49035dd97fc678b`. Main SHA-256: `c16a7a9723fc9218e379e8d073945b7d96a4c887687505f2bd9c85684e65994e`. Package output roots are `/opt/data/cache/scratch/rift-final-package-mac` and `/opt/data/cache/scratch/rift-final-package-win`. These supersede earlier renderer/package hashes, not the native-platform acceptance boundary.

Observed RED → GREEN checks included the initially missing checkpoint service/Send & track method/composer, prefix-like added lines, stale view tokens, unsafe untracked FIFOs omitted by Git, invalid UTF-8 content/path handling, newline-path header injection, inherited Git redirection, individual prompt numbering, Stop-during-capture draft recovery, composer focus, separately reported Stop/freeze failure, and an obsolete checkpoint patch arriving after switching to an empty repository. The latter exposed a real request-counter-only race; patch success/error guards now also require matching root, selected path and checkpoint view token.

Current screenshot matrix: `{dark,light}-{1024,1440}-{composer,summary,review-exact-diff,two-prompts}.png` under `/opt/data/output/riftcode/prompt-changes/`. Inspected examples confirm the primary Send & track button is inside the pane, the compact rail remains intact, separate prompt counts remain readable, and the dirty-before/HEAD-after lines are actually rendered. Browser execution still reports the pre-existing nonblocking missing-resource 404 and Node module.register deprecation warning. Cross-packaging reports duplicate dependency references and cannot sign macOS applications on Linux.

Independent review `deleg_d45a7d5c` approved with no blocking security or logic issues and independently passed all 26 focused filesystem/PTY tests. The parent reran 68 core + 30 installer, 68 browser and 26 Electron-runtime tests plus package readback. The reviewer's singular-file-count suggestion received an observed failing browser assertion, a template-only correction, and another full 68-test browser/build pass; all four packages were regenerated again. Final UI log: `/opt/data/cache/scratch/rift-prompt-ui-final.log`. Native-platform acceptance remains outstanding.

## Verification boundary

`tests/prompt-checkpoints.test.ts` uses real scratch Git repositories and filesystem bytes: dirty/untracked initial state, two separately frozen prompts, add/delete/binary/HEAD-restoration diffs, exact count artifacts, expired view tokens, retention/numbering, scope cancellation, oversize/symlink/hardlink/FIFO rejection, unusual path names, and configured/inherited Git command hazards.

`tests/terminal-service.test.ts` exercises actual node-pty under both Node and Electron's Node runtime. A harmless local executable edits a fixture file only after receiving the tracked prompt's Enter; the resulting real checkpoint diff excludes its pre-existing dirty bytes. Tests also verify exact sanitized input bytes, readiness rejection, blocked interleaved input and Stop cancellation. No provider is authenticated or called.

The production Angular/xterm browser tests use an explicitly synthetic native bridge backed by the **real checkpoint service and scratch Git files**. They render the three-file +3/−2 summary, jump to exact added/deleted/dirty-to-HEAD patches, submit a second prompt (+1/−2 in a single file), reopen the first frozen diff, restore the original repository comparison and retain the PTY. Separate tests cover capture cancellation/draft retention, focus and Stop with failed freezing. Current screenshots are labeled as synthetic and live under `/opt/data/output/riftcode/prompt-changes/` for dark/light at 1024/1440, including composer, summary, exact review and two-prompt history.

Native macOS/Windows GUI, provider authentication and owner-installed Claude/OpenCode/Codex behavior remain owner acceptance tests. Local unsigned cross-packages and Electron Node-runtime tests do not establish those outcomes. No model call, real-home session scan, credential write or release was performed. Delivery is source-only through existing PR #4.
