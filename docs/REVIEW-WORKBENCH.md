# Dedicated terminal review workbench — Rift 0.8.0

This is the latest UI/runtime verification for the `feat/terminal-ai-workspace` continuation over `e41763d5b7fd21bf76e767cbe25c48e7dc5f6ca4`. It supersedes earlier shared-Terminal/Review and horizontal-rail descriptions in `TERMINAL-AI-VERIFICATION.md`, `COMPACT-RAIL-RESUME.md` and `PROMPT-CHANGES.md`. Delivery remains existing PR #4 only; no merge, release, tag, provider model call or RiftCode schedule is authorized.

## Working flow

- The familiar right rail remains Notes / Terminal / Review. Labels intentionally use upright uppercase letters, `writing-mode: vertical-rl` and `text-orientation: upright`, based on original main `ec48372`; they are not accidentally wrapped horizontal labels. Notes remains a drawer and the rail stays reachable while it is open.
- Terminal and Review both expose **Notes**, **Insert selected notes (count)**, **Copy notes**, and **Insert selection** directly beside the native surface. Selection/notes actions retain file/line context. Copy notes copies all notes; insertion uses only the selected notes. Unavailable selections are disabled.
- Insert never sends Enter. If a session/input is unavailable, context remains in an editable preview with explicit later Insert / Copy / Discard. Start does not send it automatically. **Send & track** remains a separate explicit Terminal action under Context, with the existing per-prompt checkpoints and exact diff review intact.
- Review opens a dedicated workbench, not the ordinary Terminal with a comparison pasted into a textarea. Pick **Complete comparison**, **Current file**, or **Selected notes**, choose Professional/Honest tone, and add optional instructions. Missing file/note scope choices are disabled.
- Pick Claude Code, OpenCode or Codex, then New or Resume with repository-scoped native names and local dates/times. **Start review session / Resume review session** launches the native CLI with review/plan settings, but sends no request. Handle native login/trust prompts yourself.
- Once native bracketed-paste readiness is observed, use **Run review** at an empty CLI prompt. This deliberately sends one sanitized bracketed paste plus one Enter. The bounded request captures the current comparison/revisions, scope/files, selected note file/line context, project context, tone and instructions; it asks for prioritized evidence-led file:line findings and a summary, not JSON cards. No timer auto-submits and readiness is not authentication or permission approval.
- **Last sent request** exposes the exact accepted request snapshot; changing the brief does not rewrite it. After an accepted **Run/Rerun**, the brief automatically compacts to scope/tone, **Edit review brief** (`aria-expanded`) and an always-visible **Rerun review**. Reopen to change scope/tone/instructions; **Collapse review brief** only changes layout and never submits or steals native input focus. Setup stays expanded through Start/Resume and failed/uncertain Run. **Send follow-up** sends the typed question in the same native review session. A failed/uncertain write preserves the draft and never retries automatically.
- The left Changes/Explorer header uses two deliberate rows only when its container is at most 250px wide: full view labels above file options / All / reviewed count. Wider headers retain 56px alignment. No action is removed; dark/light share the same geometry.
- Output and provider tool/permission interaction remain real xterm/PTY. Ctrl/Cmd-click known repository file:line references to inspect source; the existing changed-file list/reviewed markers and notes remain available. No findings or provider output are fabricated.
- The large “still in Edit mode” notice and marketing-style launcher headings are removed. A compact session identity reports the actual provider and Review/Edit intent. Review uses its own native review/plan process rather than relabeling the ongoing Edit process.

## Session and trust boundaries

`TerminalWorkspace` owns exactly two `TerminalService` instances: `terminal` and `review`. Unknown slot values are rejected. The review instance rejects Edit mode in trusted main before any asynchronous lookup/spawn. Existing bridge callers omitting a slot retain Terminal behavior. Each service owns an independent nonce, generation, bounded output, input, resize, stop and native process; review submission IPC can address only the review service.

Navigation never spawns, submits, stops or replaces either process. Stop Review does not stop Terminal. Repository changes, renderer loss/navigation/destruction, window closure and app quit reset both services. Review is lazily mounted on first use and retained thereafter. Main still validates native resume membership/capabilities and renderer callbacks retain root/generation/session guards. Raw input/resize rejection tests now cover both slots. Review has no Send & track UI and never resets or reads Terminal's checkpoint history.

Provider review/plan policy is **not an OS sandbox guarantee**. CLIs run as the OS user with their configured permissions. No credential/config/hook files are changed, no tool approval is automated and no shell fallback is introduced.

## TDD and executed verification

Observed RED before implementing the corresponding behavior:

1. Real native PTY test rejected unknown slots, then failed because review accepted Edit mode. Implemented the bounded review service and trusted mode gate; real PID/output/input/resize/independent Stop/full reset assertions passed.
2. Chromium computed-style test received `horizontal-tb` rather than `vertical-rl`. Restored deliberate upright rail typography and direct enabled/disabled context strip; the test passed.
3. Dedicated review interaction test failed because no Code review workbench region existed. Added the actual brief/start/run/follow-up flow and retained second session; the test passed without changing the running Edit session.
4. Request-builder tests first had no implementation; scoped requests then passed comparison/revision/path/notes/instructions/context/tone/bounds checks.
5. Last-request snapshot test failed because no snapshot control existed; the exact accepted request is now inspectable.
6. Narrow-header real Chromium Range/bounds/hit-test regression failed with `Changes` and `Explorer` text outside their button rectangles at 1024px with Notes open. The adaptive two-row header now passes across Terminal/Review/Code and dark/light, with file-options popover still operable.
7. Accepted-brief regression failed because **Edit review brief** did not exist. It now verifies expanded setup and preserved instructions after an uncertain Run, accepted-run compaction, actual native surface height at least 280px and gain over 140px, reachable Edit/Rerun/Send bounds/hit targets, explicit reopening/editing, immutable accepted snapshot and no submission on manual collapse.

Independent backend/workbench review `deleg_14e1fa44` approved the existing backend with no security/logic concerns (parent-reported: 29 focused Node tests, 28 actual Electron tests, typecheck and diff checks). That read-only approval predates the targeted frontend polish. The parent inspected its state transitions/CSS and the final 1024px screenshot, then independently passed both new narrow-sidebar/accepted-brief browser regressions, 76 core + 30 installer tests, 28 actual Electron-runtime tests and four-package current-asset readback. The complete 78-case isolated UI log was read back; the earlier timed-out parent/worker attempts are not counted as completed suites.

Final executed gates, no skips/failures:

- `npm test`: **76 core tests + 30 installer tests passed**.
- `npm run build` (typecheck + Angular compile + production build): passed after the final frontend changes.
- Full isolated `CHROMIUM_EXECUTABLE=/opt/hermes/tools/chromium-1208/chrome-linux64/chrome npx playwright test --timeout=90000 --reporter=line`: **78 Chromium UI tests passed** in 17.4 minutes; no failures/skips. Log: `/opt/data/cache/scratch/rift-polish-ui.log`. The first default `npm run test:ui` invocation exceeded the tool's 420-second execution window and produced no completed suite result; it is **not** counted as a pass. The complete generous-timeout rerun above exercised all tests, including the two new regressions and real POSIX PTY integration.
- `LD_LIBRARY_PATH=/opt/data/cache/scratch/rift-native-libs/root/usr/lib/x86_64-linux-gnu ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron --import tsx --test tests/terminal-service.test.ts tests/prompt-checkpoints.test.ts tests/review-workspace.test.ts tests/review-request.test.ts`: **28 tests passed** under actual Electron 43.4.1's Node runtime/native PTY.
- `git diff --check`: passed.

The UI suite preserves all earlier checkpoint/branch/source/resume/lifecycle tests. Only superseded shared-review/horizontal-rail expectations were updated. Generic retained-context lifecycle tests now prepare a real selected diff while input is unavailable, rather than relying on the removed generic Review preview.

New real integration: the production Angular/xterm renderer talks through an explicitly substituted browser bridge to a real harmless POSIX provider fixture using `TerminalWorkspace`. A scratch Git repository records the exact PTY bytes and proves zero input on navigation/start, one complete scoped request + Enter, one follow-up + Enter, and the ongoing Edit PTY surviving Review start/stop. This is **not an authenticated provider run or native Electron GUI acceptance**.

## Screenshots

Current evidence: **33 refreshed PNGs** in `/opt/data/output/riftcode/review-workbench/` (32 theme/width/state captures plus the real POSIX PTY fixture). The accepted-run captures now show the compact brief and expanded native output; setup/ready captures retain the complete editable brief. Full-size dark/light 1024 setup/ready/post-run and dark/light 1440 post-run images were visually inspected after the polish. Both sidebar labels are separate and unclipped; file actions remain on their second narrow-header row, while 1440 retains the original single-row header.

Post-run Notes-open screenshot SHA-256:
- `dark-1024-review-follow-up-notes.png`: `d803b1e7d148d863f51657159197125f6e7861ef5c606ee9a93b81e6e409fc02`
- `light-1024-review-follow-up-notes.png`: `4292a3d30696d601fc8136fc3119bdaad7899c9e63c913d179a45db89bd731c1`

For both `dark` / `light` at `1024` / `1440` pixels:

- `{theme}-{width}-terminal-closed.png`
- `{theme}-{width}-terminal-notes.png`
- `{theme}-{width}-terminal-running-notes.png`
- `{theme}-{width}-review-setup-notes.png`
- `{theme}-{width}-review-resume-notes.png`
- `{theme}-{width}-review-ready-notes.png`
- `{theme}-{width}-review-follow-up-notes.png`
- `{theme}-{width}-review-notes-closed.png`

Also `actual-posix-pty-browser.png` shows actual local PTY fixture output. Synthetic screenshots are labeled; they never represent provider-generated findings. Inspected full-size dark 1024, light 1024, light 1440 and dark 1440 captures: the upright rail, visible context actions, review controls, native stage and follow-up fit; primary Start/Resume/Run/Send controls were checked against viewport/pane geometry and center-point hit testing without click auto-scroll. The existing additional 1280px visual matrix also passed. UI runs still emit the pre-existing nonblocking missing-resource 404 and Node `module.register()` deprecation warning.

## Final cross-platform packages

Rebuilt after the final production main/preload/renderer changes:

```sh
npx electron-builder --mac --x64 --arm64 --dir -c.directories.output=/opt/data/cache/scratch/rift-final-package-mac
npx electron-builder --win --x64 --arm64 --dir -c.directories.output=/opt/data/cache/scratch/rift-final-package-win
node /opt/data/cache/scratch/rift-verify-packages.cjs
```

All four app.asar archives contain 0.8.0, production node-pty/node-addon-api, exact-target native addons/helpers, executable Mac spawn helpers, and **six byte-exact final runtime assets per archive**. Machine-readable report: `/opt/data/cache/scratch/rift-package-verification.json`.

| Asset | SHA-256 |
| --- | --- |
| Main `app-out/main/index.js` | `f1f2a8a0f2608f0476808782a2cf727ebd058ea126fd1722653a9da010562884` |
| Preload `app-out/preload/index.cjs` | `ae430dcc57264408cae9c7f3c990f7575064433821a5e8cfa5617ec7df64c019` |
| Renderer `index-BQesrX3-.js` | `33f355c86a6bbf60c693632662f961d096608cd0780e31a4cb1a8af6fe55988a` |
| Styles `index-LurC5g3Z.css` | `2327b6f6833413662eaf60f575072ea1c49550284245f9c79f91492e7692f5aa` |

Native macOS/Windows GUI, authenticated Claude/OpenCode/Codex new/resume/review acceptance, signing/notarization and owner installation remain unverified here. Foreign-target directory packaging and Linux Electron Node-runtime fixture tests do not establish those gates. The parent owns independent review, same-PR commit/push and a fresh pinned Mac owner handoff; none was performed by this worker.
