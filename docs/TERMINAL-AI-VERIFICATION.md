# Unified AI terminal verification — 0.8.0

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
