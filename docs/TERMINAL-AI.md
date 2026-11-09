# Terminal-first AI workspace (0.8.0)

## Dock beside file review

Use **Dock ↓** in Agent or Review to keep it below the file/diff viewer. Drag the divider or focus it and use Arrow Up/Down, Home or End. Switch Terminal/Review in the dock header; both sessions remain independent. **Unpin ×** (Close dock) returns the selected pane to its original rail placement without Stop, restart or submission. File links, Explorer and checkpoint changes open above the dock. The same terminal/xterm, scrollback, draft and process are retained. See [TERMINAL-DOCKING.md](TERMINAL-DOCKING.md).

## Use

New Agent sessions default to **Edit**; the independent Review workbench stays **Review / plan**. Run review submits the prepared scoped/default/custom request and collapses the brief immediately while dispatch is pending; it does not wait for model completion. See [WINDOWS-TERMINAL-FIX.md](WINDOWS-TERMINAL-FIX.md) for the Windows redraw investigation, transport workaround and remaining native acceptance checks.

1. Install and authenticate Claude Code (`claude`), OpenCode (`opencode`) or Codex (`codex`) yourself in a system terminal. Rift discovers the executable on PATH; it does not install providers, sign in, or purchase inference. A missing executable produces an actionable error when Start is pressed.
2. Use the compact **Notes / Terminal / Review** rail on the right. **Terminal** opens the retained AI session workspace; choose Claude Code, OpenCode or Codex, **New session** or **Resume existing**, and **Review / plan** or **Edit · confirmations kept**, then Start/Resume. Resume lists named provider conversations in the current repository with local dates/times and an exact ISO update-time tooltip. Provider and intent stay fixed for that session. Use Stop before changing them; restarting is always explicit.
3. Type directly into the genuine xterm.js terminal. Native node-pty lives in Electron main; no shell is substituted after a CLI exits. Native provider trust/permission dialogs remain yours to answer.
4. **Notes** opens the notes drawer alongside the original upright-lettered rail. **Notes**, **Insert selected notes (count)**, **Copy notes** and **Insert selection** are directly visible in Terminal and Review, without opening Context. Copy works without an AI; select notes in the drawer before insertion, or right-click changed lines and choose **Insert selection in AI terminal**. These actions paste context, focus the terminal, and never append Enter. Native insertion waits until the CLI enables bracketed paste; context actions remain available to prepare unsent text before that. Unavailable-session context is retained visibly for explicit later insertion/copy/discard.
5. Ctrl/Cmd-click a known repository `file:line[:column]` or `file#Lstart-Lend` reference to open a full source preview, highlight the requested line/range and show the column. Unchanged files work too. Wrapped terminal lines and ANSI styling are handled as rendered terminal cells. Arbitrary URLs and OSC hyperlinks are not opened.
6. Open either **current/comparison** or **target** selection button to search **inside its dropdown**. The closed button shows the selected value, without an external search field. Search is case-insensitive; × clears, Arrow/Home/End moves the visible highlight, Enter selects, Escape dismisses and restores focus, and outside click/Tab dismisses. Search does not select a branch, change the comparison or check out Git. The current selection and default working-tree/current-branch comparisons remain in the dropdown even when they do not match. No-results messages do not replace that selection.

**Review** opens its own native review workbench and retained review/plan session, leaving the ordinary Terminal process and its checkpoints intact. Choose complete-comparison/current-file/selected-notes scope, tone and instructions; explicitly Start/Resume, answer native trust/login prompts, then **Run review** at an empty CLI prompt. This submits one prepared request. After acceptance the brief compacts; **Edit review brief** reopens it, **Rerun review** explicitly submits the current brief, and **Send follow-up** continues the same review session. **Last sent request** remains inspectable and immutable. Navigation alone never starts, submits or stops either process. The large Edit warning is removed; actual provider/mode remains in compact status. **← Code** returns to source without stopping either session. Existing notes/history are preserved. See [REVIEW-WORKBENCH.md](REVIEW-WORKBENCH.md).

### Per-prompt change review

Use **Context → Track a prompt → Send & track** at an empty native CLI prompt to checkpoint the actual dirty/untracked working tree before one explicit submission. **Refresh changes** updates that prompt's workspace file/text-line summary; its **Review changes** opens the exact captured diff, not a Git HEAD approximation. Each subsequent tracked prompt freezes the preceding interval separately. Context → Finish checkpoint freezes without stopping the CLI; Stop preserves the final summary while ending the session. Direct CLI prompts remain untracked, and notes/selection Insert still never appends Enter. Checkpoints are local, bounded, in-memory and not proof of agent authorship/completion. See [PROMPT-CHANGES.md](PROMPT-CHANGES.md) for limits, lifecycle, review-token semantics and verification boundaries.

### Native resume metadata

- Claude: bounded head/tail reads of `~/.claude/projects/<encoded-current-root>/<UUID>.jsonl`, requiring matching session ID and canonical cwd. Native custom titles take precedence over generated titles/summaries; a bounded first-user-prompt preview is the fallback, excluding assistant/tool/system boilerplate.
- Codex: bounded `~/.codex/sessions/YYYY/MM/DD/rollout-…-<UUID>.jsonl` metadata, requiring `session_meta`, matching filename ID, valid timestamp and canonical cwd. Native rename entries from the bounded tail of `~/.codex/session_index.jsonl` are joined only to verified repository sessions; index entries alone never authorize resume. The first native user-message preview is the fallback when no indexed title is available.
- OpenCode: the discovered installed CLI runs only `session list --format json`, from the trusted repository directory, with a 5-second/1-MiB output bound. Its JSON metadata supports SQLite-backed versions without guessing database schema. Directory, ID and updated timestamp are validated. Current OpenCode may start/connect its own shared background service for this metadata command; Rift does not send a model prompt or perform login. Unsupported versions/errors are shown explicitly, not silently treated as successful resume. The older JSON-cache reader is fixture-covered but not the production OpenCode route.
- Lists are bounded to 100 entries, newest first. Titles are control-sanitized and bounded. File scanning rejects symlink/hardlink metadata escapes; no provider credentials or full transcripts are returned to the renderer. Default local metadata locations are supported, not custom `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, remote sessions or alternate release-channel stores.
- Discovery is deliberately bounded, not an exhaustive clone of every native `/resume` screen: head/tail windows can miss historical rename or prompt records outside those windows. A missing usable title is shown honestly as **Untitled conversation**. Results remain current-repository scoped; custom homes, remote/archived stores and every provider release are not claimed. Authenticated provider resume remains an owner test.
- Start re-lists and validates membership server-side, not just the renderer-selected ID. Native flags are `claude … --resume <UUID>`, `opencode … --session <ses_ID>`, and `codex … resume <UUID>`, preserving the chosen plan/edit flags and confirmation policy. No transcript is automatically replayed and no provider prompt is submitted. Changing root or Stop invalidates pending starts; late list/start/stop/insertion completions cannot overwrite newer scope state.

## Safety and lifecycle

- Claude review: `--permission-mode plan`; edit: `--permission-mode default`.
- OpenCode review: `--agent plan`; edit: `--agent build`. Start first reads the installed CLI's bounded `--help`. Versions advertising a root `--agent` use the full interactive CLI; newer versions advertising `mini` use `opencode mini --agent …`, because current v2's full TUI removed root `--agent`. Both are genuine interactive provider terminals, not JSON chat. Unsupported capability output fails visibly. The capability await is cancellation-guarded before spawn.
- Codex review: `--sandbox read-only --ask-for-approval on-request`; edit: `--ask-for-approval on-request` (keeps the provider's configured sandbox).
- These are provider-level intents, **not an OS sandbox or a guarantee against writes**. Provider configuration, plugins, hooks, credentials and permissions still apply. CLIs run as your OS user and can access your files and their saved credentials. Rift does not automatically answer trust/permission dialogs. No bypass, yolo, auto or auto-accept flags are added.
- The PTY environment retains OS/PATH/home variables but does not pass inherited service/API tokens or `NODE_OPTIONS`. Configure provider authentication on disk; users relying solely on API-key environment variables must configure their provider separately.
- Exactly two bounded slots: ordinary Terminal and independent Review. Each retains its process across view switches; Stop affects only that slot. Repository opening, renderer loss/reload/window close and application quit cancel pending starts and terminate both owned PTYs. POSIX cleanup kills its process group, including foreground descendants. Intentionally detached external services started by a provider are not containment-guaranteed.
- Session exit is visible with its exit code; it does not spawn a shell. Stop clears the terminal session/output, not review notes/chat history. The existing explicit Clear review-session action is separate.
- Main holds at most 256 KiB recent output; reads are at most 64 KiB, raw/context input at most 32 KiB per call, and input is rate-limited. xterm retains 3,000 scrollback lines. Context paste removes ESC/C0/C1 controls except tab/newline and uses one bracketed-paste frame, without submission.
- Source links use exact known Git repository paths. Main validates listed file identity and realpaths again, rejecting traversal, outside paths and symlink escapes. Output is never evaluated as HTML, a command, or an external navigation request.
- A connection error stops polling and disables insertion until an explicit Stop/Start recovery. No automatic replacement process is created.

## Development and verification

Node 24+ and Git are prerequisites. On supported macOS/Windows x64/arm64 targets, pinned `node-pty@1.1.0` ships N-API prebuilds, including native helpers. Preserve them; do not force a compiler rebuild or require Visual Studio for these targets:

```sh
npm ci --ignore-scripts
node node_modules/electron/install.js
npm test
npm run build
npm run package:mac  # run on macOS; npm run package:win on Windows
```

`beforePack` verifies exact-platform prebuilds, makes macOS spawn-helper executable, and skips native rebuilding only on supported prebuilt targets while retaining electron-builder's dependency collector. Native assets are unpacked from asar. Linux has no shipped node-pty prebuild and needs a compiler/toolchain; after script-free install, run `npm exec -- node-gyp rebuild --directory node_modules/node-pty` before tests.

UI verification uses real Chromium and real xterm with an **explicit substitute preload bridge**, synthetic repository/notes and no model requests:

```sh
npx playwright install chromium  # once, if a browser is not already available
npm run test:ui
# An existing Chromium can be selected with CHROMIUM_EXECUTABLE=/path/to/chrome.
```

The POSIX native tests use only temporary Node executable fixtures, verify TTY, literal multiline context bytes, resize, retention, PID termination (including a stubborn CLI), natural exit/descendant cleanup and final-await cancellation. They run under Node and Electron's actual Node runtime. The POSIX-only fixture and symlink checks are explicitly skipped on Windows, not counted as native ConPTY acceptance.

### Isolated owner preview

`--rift-preview` selects **Rift Preview** user data under Electron's appData directory, separately from ordinary Rift's browser storage, notes and sessions; it also disables automatic update installation. Do not launch an unfinished feature build over an existing installation. The branch-only Mac installer/handoff is maintained separately from this terminal implementation. Preview isolation does **not** isolate provider accounts/credentials or the repository working tree: select a disposable repository for owner tests.

### Remaining native acceptance

Linux execution cannot establish macOS app launch, Gatekeeper/signing, Windows ConPTY/cmd launch, or actual authenticated Claude/OpenCode/Codex TUI behavior. Cross-packaging verifies artifact contents only. Owner testing should start each installed provider, answer its normal trust prompts, type a harmless request, insert a synthetic multiline note without Enter, Ctrl/Cmd-click a source link, switch views, resize, Stop and confirm the CLI exits. No real provider prompt or credential was used by automated tests.

OpenCode compatibility was checked against its official [command specification](https://github.com/anomalyco/opencode/blob/dev/packages/cli/src/commands/commands.ts) and [current session-list serializer](https://github.com/anomalyco/opencode/blob/dev/packages/cli/src/commands/handlers/session/list.ts); compatibility tests use synthetic help/metadata and harmless executables, not the owner's installed CLI.

Interactive flag references: [Claude CLI](https://code.claude.com/docs/en/cli-reference), [OpenCode CLI](https://opencode.ai/docs/cli/), [Codex CLI](https://developers.openai.com/codex/cli/reference). Provider versions can change; an unsupported flag remains visible in the native CLI output instead of being silently replaced with a shell.
