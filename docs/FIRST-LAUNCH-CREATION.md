# First-launch repository creation — 0.9.1 candidate

This is the 0.9.1 source-candidate acceptance addendum for PR #7. The historical 0.9.0 factory acceptance report is unchanged. No merge, signed release or installer upload is included.

## Behavior

- Outside a usable Git checkout, the production welcome offers **Create repository** alongside **Choose repository**. An older bridge without the optional creation method retains its Open-only welcome.
- Create reveals an inline **Project name** field. **Choose parent and create** opens a native parent-directory picker titled with that exact project name. The renderer never supplies a parent path.
- The literal name is validated in both renderer and trusted main: a bounded single portable filename component, without traversal, separators, control characters, malformed Unicode, Windows device names or leading/trailing spaces and trailing dots. Invalid names are rejected, not trimmed or renamed.
- Main resolves the native-selected parent, checks directory identity, and exclusively creates one new child using non-recursive `mkdir`. Existing directories, files and symlinks are collisions, including an empty existing directory. They are never reused, removed or overwritten.
- Git initializes only that new directory with fixed argv: `--initial-branch=main --template=`. There is no shell interpolation. Inherited `GIT_*` variables are removed; global/system Git configuration is suppressed for the operation; hooks and fsmonitor are disabled. The main Git reader uses the same clean environment, with explicit hooks/fsmonitor suppression, so inherited redirects cannot change the newly opened root.
- No remote, login, scaffold, README, `.gitignore` or initial commit is created. A genuinely empty/unborn repository opens using the production `loadRepository`, with its working-tree comparison based on the empty tree. Staged and untracked files in an unborn repository remain reviewable.
- Successful creation enters **Creation** directly, not Home or Review. Loading its saved state is allowed; creation itself does not Save, Generate, Approve, Start, submit terminal input or execute a provider.
- Cancelling the native picker returns `null`, makes no filesystem/Git writes, and keeps the form/name. Collisions and initialization failures keep the name and offer explicit retry. Once allocated, a failed/stale creation keeps the folder and reports recovery via Open; no automatic cleanup deletes user contents.
- Native authorization captures renderer/frame/window, creation operation, repository generation and factory generation before the first await. It rechecks after async boundaries and before mkdir, Git, opening and snapshot publication. The own opening operation rebases only its synchronous generation increments and awaits the actual FactoryManager close before root replacement. A newer repository/renderer cannot be hijacked by an obsolete picker or Git completion.
- Renderer completion is separately fenced by operation, repository/view generation and component lifetime, including view switch-away-and-back. Obsolete results/errors cannot enter Creation, replace a newer root, or clear a newer request's spinner/error.
- Existing valid-repository startup remains the Creation/Review workflow choice. Notes / Agent / Review rail, retained terminal hosts, xterm identity, docking and factory execution contracts are unchanged.

These path/identity checks are not an OS filesystem sandbox: another process with the same OS-user privileges can race or modify filesystem contents. Already-dispatched Git work cannot be recalled. Stale completion never silently deletes the allocated directory or opens it over a newer repository.

## Verified scope

Evidence directory: `/opt/data/output/riftcode/first-launch-creation/`.

| Gate | Result |
| --- | --- |
| Focused native/helper/Git, actual-source IPC/preload/open lifecycle, version and source-safety regressions | 51 passed, 0 failed |
| macOS installer/deployer fixtures, including exact 0.9.1 plus unchanged 0.9.0 cases | 33 passed, 0 failed |
| Actual App first-launch Playwright suite | 20 passed, 0 failed |
| Selected existing retained-terminal/factory-entry and legacy-welcome functional regressions | 9 passed, 0 failed |
| Renderer TypeScript, main TypeScript and Angular template compiler | Passed |
| Isolated production renderer build | Passed; `.local/first-launch-renderer`, port 4177 |

Genuine RED/GREEN evidence includes the missing creation API, actual unborn Git log failure, invalid names and lifecycle escapes, missing native IPC/preload surface, switch-away-and-back renderer race, exact version mismatch, inherited Git redirect during real loading, extended portable-name cases, and overlong diagnostics obscuring the retry action. Individual logs retain their original output; later green logs are separately named.

Native tests use real scratch files and Git. Electron dialogs/OS boundaries are substituted. Actual production main handlers/open functions and the production preload are transpiled/executed in VM fixtures, not copied into tests. One browser test runs the actual App action through the real creation helper and real Git loader against a scratch unborn checkout, substituting only native parent selection and the browser bridge; factory state is a labeled fixture, not a provider run. The retained regression exercises real harmless scratch PTYs and exact xterm/host identity.

Screenshots are explicitly labeled synthetic browser bridges. Dark/light at 940×900 and 1440×900 cover welcome, name form, pending picker, collision and successful Creation entry:

```
synthetic-{dark,light}-{940,1440}-{welcome,form,picker-pending,collision,creation}.png
```

Visual inspection confirmed legible themes, name preservation, disabled duplicate-submit controls and reachable actions. Long-error usability is also checked at 940×480. Screenshots do not establish actual Finder/Explorer/native-dialog rendering or native Windows/macOS behavior.

## Reproduction

All fixture writes for these runs use `TMPDIR=/opt/data/cache/scratch`; no actual user repository is created. Commands are run from the checkout, serially on CPU 0. The local test configs are intentionally untracked `.local` additions; do not clean/delete that pre-existing directory.

```sh
TMPDIR=/opt/data/cache/scratch taskset -c 0 node --import tsx --test \
  tests/repository-creation.test.ts tests/repository-creation-ipc.test.ts \
  tests/version.test.ts tests/factory-main-lifecycle.test.ts \
  tests/factory-bridge.test.ts tests/source-security.test.ts
TMPDIR=/opt/data/cache/scratch taskset -c 0 node --test tests/mac-preview-installer.test.cjs

taskset -c 0 node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
taskset -c 0 node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json
taskset -c 0 node node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js \
  -p src/renderer/tsconfig.app.json --noEmit

taskset -c 0 node node_modules/vite/bin/vite.js build --config .local/first-launch.vite.ts
TMPDIR=/opt/data/cache/scratch \
CHROMIUM_EXECUTABLE=/opt/hermes/tools/chromium-1248/chrome-linux64/chrome \
taskset -c 0 node node_modules/@playwright/test/cli.js test \
  --config .local/first-launch.playwright.ts
TMPDIR=/opt/data/cache/scratch \
CHROMIUM_EXECUTABLE=/opt/hermes/tools/chromium-1248/chrome-linux64/chrome \
taskset -c 0 node node_modules/@playwright/test/cli.js test \
  --config .local/first-launch-regression.playwright.ts \
  --grep-invert 'hierarchy|neutral welcome|short-height|drag-safe'
```

## Final parent acceptance

- Independent review passed with no blocking security or logic findings; 48 focused tests and five independent real-filesystem/Git challenges passed.
- Full frozen-source core suite: **332 passed**, zero failed/cancelled/skipped.
- Installer fixtures: **33 passed**. Canonical build, TypeScript/Angular checks and staged whitespace check passed.
- Complete production App browser suite: **204 passed**, zero skipped/unexpected/flaky results. This includes the 20 new first-launch cases and existing retained-workspace/welcome regressions.
- Four fresh 0.9.1 cross-packages were built/read back for macOS x64/arm64 and Windows x64/arm64. Final main/preload/renderer bytes, native architectures, helper permissions, pinned native dependency resolution and all five bundled skills match.
- Source hashes stayed unchanged across execution gates and package generation. This final documentation-only acceptance update was added afterward.

Evidence: `final/gates.json`, `final/app-ui.json`, `final/source-hashes.json` and `final/packages/verification-manifest.json` beneath the evidence directory above. The first package-readback attempt incorrectly compared node-pty's resolved node-addon-api dependency (7.1.1) to an unrelated root development dependency (6.1.0). The verifier was corrected to follow the native consumer's module resolution and pinned lock; its failed output was preserved separately before all four targets were regenerated and verified. No dependency or application source changed for that correction.

No authenticated provider, actual macOS/Windows native dialog, developer-signed installer or native platform acceptance is claimed. Upstream Electron ARM64 binaries may contain embedded signatures; this is not developer signing of this candidate. The runtime used Node 26.12.1; its tsx/Playwright loader emits the existing Node `DEP0205` warning. An initial isolated web-server config used the wrong cwd; corrected local configs were exercised successfully. There are no unsettled test processes from these runs.
