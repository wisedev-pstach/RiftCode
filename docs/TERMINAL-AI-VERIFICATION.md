# Unified AI terminal verification — 0.8.0

> **Latest continuation:** [SLIM-DOCK.md](SLIM-DOCK.md): one 32px dock toolbar, 24px direct controls, visible 4px button / 8px group gaps and actual 11px dock / 13px normal xterm font. Clean full browser run **122 passed**, including the prior Unpin scroll-anchor failure; four strengthened actual-options/cell-metric cases also passed (cell height 15→13→15px). At the same 480px dock, both native surfaces gain 36px over the prior two-row version. Normal screenshots match baseline. The linked report records fresh core/native/package evidence and unchanged native owner gates.

> **Prior continuation:** [COMPACT-DOCK.md](COMPACT-DOCK.md): dock-only 68px chrome, 28px directly accessible controls, real xterm font 13→12px while docked/restored on Unpin. At the same 480px dock, measured native area gains 107px Agent / 65px Review across dark/light and 1024/1440. Complete **120 browser UI** run passed; parent independently passed 9 compact cases and **89 core + 30 installer + 89 actual Electron-runtime tests**, plus four fresh unsigned package readbacks (six exact runtime assets each). Current renderer `/app-out/renderer/assets/index-ClLL0oMI.js`, SHA-256 `1c8cf1df041420e5acaaa0783c3ba402467caec631e0071fdd62a0a942ad74b5`. Retained sessions, scroll anchors and normal layout/font unchanged. Native owner acceptance remains outstanding.

> **Prior continuation:** [AGENT-LABEL.md](AGENT-LABEL.md): ordinary user-facing pane is now **>_ Agent**, rail Notes / Agent / Review; Dock agent tooltip and matching accessible/context copy. Selection-menu and notes-drawer insertion labels name **Review only when `terminalOpen() && reviewWorkbenchOpen()`**, otherwise **Agent**, matching unchanged insertion routing. Strict destination-label RED→GREEN, **89 core + 30 installer + 111 complete isolated Chromium UI tests** passed; twelve gallery screenshots refreshed after the final build. First complete UI attempt exposed an existing late-stop fixture race (`window.finishStart is not a function`); fresh complete rerun passed all 111 without unrelated changes. Templates only; no runtime/permission/layout changes. Current renderer `index-COh7CSMW.js`, SHA-256 `93235d1935cea77f38780e4f9e737656d0d3435fb2533c66a09456c7b31f82b7`. Parent's earlier **109 UI + 89 actual Electron-runtime tests** and four package readbacks were before this copy correction (renderer `index-BCCthYT7.js`, SHA-256 `0f5f6be7c9476c30132dc698b94f384d1b0a9ae92489beafe1b9a4ca95dfe1cf`); that earlier package evidence is superseded. Parent final serial retry passed **89 actual Electron-runtime tests** and verified all four freshly generated unsigned packages with six exact current runtime assets each plus native dependencies/architectures. Parent also passed all 9 Agent/destination/screenshot browser cases; its complete UI attempt was tool-deadline interrupted, not a full pass. Native owner acceptance remains outstanding.

> **Prior continuation:** [TERMINAL-DOCKING.md](TERMINAL-DOCKING.md) supersedes prior renderer counts/hashes: retained bottom docking for Terminal and Review, accessible resizing and original-placement return without remount/Stop. Parent passed **89 core + 30 installer + 102 Chromium UI + 89 actual Electron-runtime tests** and regenerated/read back all four unsigned cross-platform packages. Current renderer `index-BZBqNhMb.js`, SHA-256 `75e0b06a45c0a9cf6958c4babc13283e2e3d0dc6d77f6d3605b2c3d36406bbcb`. Native macOS/Windows/provider acceptance is outstanding.

> **Prior milestone:** [WINDOWS-TERMINAL-FIX.md](WINDOWS-TERMINAL-FIX.md) supersedes prior runtime counts/hashes: reproduced startup geometry correction, trusted xterm Windows metadata, ordinary Edit default, two-phase explicit review submission and immediate dispatch compaction. Verified **89 core + 30 installer + 93 Chromium UI + 36 actual Electron-runtime tests**, build and four fresh packages with six current byte-exact assets each. Renderer `index-DRl9Z_LC.js`, SHA-256 `987d6c7cacc9d5c24619101d15b3f3be16c37b52454d004330169414ea81cce2`. Independent review approved. Native Windows screenshot cause/authenticated-provider acceptance remain unconfirmed; prior milestone descriptions below are historical.

> **Previous continuation:** [PROMPT-CHANGES.md](PROMPT-CHANGES.md) supersedes earlier verification counts and runtime hashes: per-prompt working-tree checkpoints, compact explicit Send & track, exact snapshot review jumps, 68 core + 30 installer + 68 Chromium UI tests, and 26 actual Electron Node-runtime tests (15 PTY/session + 11 checkpoint filesystem cases). All four macOS/Windows x64/arm64 packages were rebuilt after the final renderer build and each has six byte-exact current runtime assets. Current renderer `index--JJ2eSjO.js`, SHA-256 `8a1ea39ba3d70641532f332dd3d1ef07dad7243bc0593308de0c3637fbd755dc`; main SHA-256 `c16a7a9723fc9218e379e8d073945b7d96a4c887687505f2bd9c85684e65994e`. Work remains uncommitted over `3455e71539f752bbe3fe362941431de3d8e8ecf5`; no commit/push/release was performed. The remainder below and [COMPACT-RAIL-RESUME.md](COMPACT-RAIL-RESUME.md) are prior milestones; native-provider/platform acceptance limits still apply.

Verified the saved, uncommitted `feat/terminal-ai-workspace` working tree over published HEAD `1c7845d1256e8c2e0dfda6ff4ffb1ff4767b80b9`. No commit, push, merge, schedule or release was performed. Installer sources and version 0.8.0 are unchanged in this continuation.

## Executed checks

- `npm test`: **33 core + 30 installer passed**, no skips. Core tests include genuine local PTY execution, literal multiline bracketed-paste bytes, resize, retained output, PID/descendant cleanup, repository/provider membership rejection before resume, validated native resume arguments and cancellation during metadata/capability resolution.
- `CHROMIUM_EXECUTABLE=/opt/hermes/tools/chromium-1208/chrome-linux64/chrome npm run test:ui`: **32 passed**. This reran TypeScript, Angular template checks and the complete production build.
- `ELECTRON_RUN_AS_NODE=1 LD_LIBRARY_PATH=/opt/data/cache/scratch/rift-native-libs/root/usr/lib/x86_64-linux-gnu node_modules/electron/dist/electron --import tsx --test tests/terminal-service.test.ts`: **8 passed** with Electron 43.4.1's actual Node runtime and native node-pty. This is not native Electron GUI/provider acceptance.
- `git diff --check`: passed.

Latest logs: `/opt/data/cache/scratch/rift-lifecycle-{tests,ui,native}.log`. The six added core renderer tests execute the real component class with substituted Angular/DOM/xterm boundaries to cover destroyed components, changed session identity and still-current IPC failures; they are not native GUI acceptance. The four added input/resize browser cases use real Angular/xterm with deferred substitute IPC, exercising repository changes and Stop/Start replacements that deliberately reuse a session ID. They assert running status, retained readiness and no connection error after rejecting obsolete requests. Two additional browser cases cover obsolete source-navigation errors after repository changes and newer same-root navigation.

### Observed RED → GREEN corrections

- Resume membership tests first demonstrated that arbitrary well-formed IDs were accepted and metadata listing was never awaited. Start now re-lists the current canonical repository/provider, rejects missing membership, preserves native permission flags and rechecks lifecycle generation after asynchronous prerequisites.
- Resume UI first failed because no Session choice existed. The same actual Angular/xterm renderer now supports New/Resume, a visible provider-session list, selected permission intent, explicit loading/error/empty/retry states and no automatic start. Tests cover late resolve/reject after both provider and repository changes.
- Review changes first failed because no integrated workflow existed. It now prepares comparison label, exact start/end revisions and changed-file context in the terminal; no provider starts and no Enter is sent. Pending context remains available for explicit later insertion.
- Saved explanation annotations first opened the removed chat route instead of a visible terminal. They now retain historical context without invoking the legacy JSON protocol or clearing saved history.
- Late Stop and insertion completions first cleared newer repository/session/context state. Both now check generation/session identity before updating the renderer. Existing pending-start late resolve/reject coverage remains passing.
- Raw terminal input and resize failures previously disconnected replacement sessions when obsolete IPC rejected. Both rejection handlers now require a live component, matching request generation and the same session ID. Six component-class tests cover destroyed/current/replacement identities; four Chromium tests cover repository changes and Stop/Start replacements, including deliberate session-ID reuse. Source-navigation rejection also uses the existing root/request guard, with two browser regressions; selected resume sessions expose their full title/ID in a tooltip.
- Retained native sessions first displayed Claude/review controls even when main reported Codex/edit. Provider/intent now reflect the actual retained state without respawning.
- Searchable branch controls initially dropped the selected nonmatching target/commit. The shared selection surface now preserves current selection plus default pinned comparisons. Search, Arrow/Home/End/Enter, Escape, outside dismissal, focus return, clear/no-results and selection dispatch are exercised without Git checkout. A test timing issue was corrected by awaiting the rendered active-descendant attribute rather than reading it before Angular's frame update.
- Keyboard branch choices had no visible highlight. Computed-style tests failed before the dark/light active/hover styling was added.
- The selection label initially had insufficient width; its corrected icon/text/shortcut columns and wider surface now keep the full action horizontal. The redundant Ask agent action and vertical Notes/Chats/Review rails are removed.
- Screenshot inspection caught dark pending-context backgrounds with dark inherited text in light mode. A failing light-theme style assertion now guards the corrected readable context surface/buttons/warning.
- Official current OpenCode source inspection found that v2 removed root `--agent`, while `mini` retains it. A bounded installed-CLI `--help` capability check selects the full v1 CLI or genuine v2 mini terminal without dropping plan/build intent. Harmless PTY fixtures prove argument application and cancellation during capability lookup; no actual provider/model was called.

RED logs remain under `/opt/data/cache/scratch/rift-{resume,ui-resume,review,history,scope,insert-scope,branch-active,branch-selected,retained-provider,capability,light-context}-red.log` where generated. They are development evidence, not native provider acceptance.

## UI evidence

Real Chromium, the actual production Angular renderer and real xterm.js, with an **explicit substitute native bridge** and synthetic repository/notes/session metadata. No provider credentials or model requests were used.

The final **20-image matrix** is regenerated under ignored `test-results/`:

```text
unified-{dark,light}-{1024,1440}-closed.png
unified-{dark,light}-{1024,1440}-branch-open.png
unified-{dark,light}-{1024,1440}-resume.png
unified-{dark,light}-{1024,1440}-review.png
unified-{dark,light}-{1024,1440}-selection.png
```

All five states were inspected across both themes/widths using contact sheets and full-size examples. The light review screenshots were inspected again after the contrast fix. The compact primary toolbar wraps into two short rows at 1024px; secondary copy/paste/safety details are grouped in Context & info. Notes is a horizontal toolbar action, not a vertical letter stack. Resume displays actual selectable fixture session titles/IDs; branch search exists only inside its opened popover. Selection menu labels stay horizontal in both widths.

Additional fresh screenshots include `terminal-notes.png`, `source-jump.png`, `terminal-disconnected.png` and `terminal-repository-switch-{resolve,reject}.png`. Source navigation uses a wrapped ANSI-styled reference to an unchanged file; the actual source viewer highlights line 14 and shows column 2. UI runs emit a nonblocking missing-resource 404 and Node's module.register deprecation warning.

## Current cross-platform package artifacts

After the final renderer/main/preload changes, both real commands completed successfully:

```sh
npx electron-builder --mac --x64 --arm64 --dir -c.directories.output=/opt/data/cache/scratch/rift-final-package-mac
npx electron-builder --win --x64 --arm64 --dir -c.directories.output=/opt/data/cache/scratch/rift-final-package-win
node /opt/data/cache/scratch/rift-verify-packages.cjs
```

All four actual `app.asar` archives were inspected. They contain version 0.8.0, node-pty, node-addon-api and byte-identical final main, preload, renderer JS/CSS/HTML and highlighting worker: **six runtime assets compared per package**, with SHA-256 recorded. Final renderer: `index-CuwI5CW6.js`, SHA-256 `e2b393010345e377f76bd92dd8104e04bcca275c8693c63729afb7c53ffa3389`. Earlier package evidence is superseded, not reused. The parent regenerated all four packages after the final input/resize and source-navigation rejection guards, then ran the archive assertion script again; all six current runtime assets match per package.

| Target | Native addon bytes | Additional verified assets |
| --- | ---: | --- |
| macOS x64 | pty.node 52,864 | spawn-helper 9,248 bytes, mode 0755 |
| macOS arm64 | pty.node 85,496 | spawn-helper 50,480 bytes, mode 0755 |
| Windows x64 | pty.node 303,104; conpty.node 312,320 | conpty_console_list.node, exact-arch OpenConsole.exe and conpty.dll |
| Windows arm64 | pty.node 293,376; conpty.node 302,592 | conpty_console_list.node, exact-arch OpenConsole.exe and conpty.dll |

Architecture was checked from actual Mach-O/PE headers, not directory labels; required addons/helpers are outside asar. Existing beforePack dependency collection and native-prebuild handling are preserved. Packaging logs: `/opt/data/cache/scratch/rift-unified-package-{mac,win}.log`. Fresh machine-readable readback: `/opt/data/cache/scratch/rift-package-verification.json`; assertion log: `/opt/data/cache/scratch/rift-unified-package-verification.log`. These are local unsigned cross-packages, not releases.

## Acceptance boundary

The previously diagnosed Linux Electron GUI attempt exited 139 with DBus/GSettings/SIGSEGV diagnostics; it was not retried in a loop. Electron Node-runtime/PTY tests and Chromium substitute-bridge tests do not establish a native BrowserWindow/provider run. Cross-packaging does not establish macOS launch/signing/Gatekeeper, Windows ConPTY/cmd behavior, or owner-installed provider compatibility/authentication. Those remain owner tests.

Resume supports default local Claude/Codex metadata stores and validated OpenCode CLI JSON list output. Custom provider homes, remote sessions and alternate release-channel metadata are not claimed. Current OpenCode may start/connect its own shared service to list metadata. No provider login, actual authenticated TUI session, real-home session scan or billed model request was performed during verification. The renderer substitute bridge is not native resume acceptance.

Owner test: use a disposable repository, start each installed provider in review/edit intent, resume an existing conversation from the same repository, answer normal permission prompts, prepare Review changes and insert a synthetic multiline note without Enter, navigate a source reference, resize/switch views, Stop and verify the CLI exits. The parent owns review/push/readback of the same PR and the updated revision-pinned installer handoff.
