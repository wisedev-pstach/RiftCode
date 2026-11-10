# macOS 0.8 feature preview

This preview stays on `feat/terminal-ai-workspace`; it does not require a merge to
`main`. The command becomes available after that branch and these files are
published. It is not the normal `install.sh`, which installs `main`.

## Install or update

Quit Rift first. Requires macOS, Git, Node.js **24 or newer** (24 LTS recommended),
npm and internet access. No sudo, compiler installation or credential entry.
Allow disk space for the dependency checkout, packaged build, staged copy and
each retained old app; repeated updates keep additional backups. If you override
`TMPDIR`, choose an existing temporary directory outside your home directory;
overlapping checkout/home roots are refused.

```bash
bash -o pipefail -c 'script=$(curl -fsSL https://raw.githubusercontent.com/wisedev-pstach/RiftCode/feat/terminal-ai-workspace/scripts/install-preview-mac.sh) && printf "%s\n" "$script" | bash'
```

The download completes successfully before any installer code executes. This
branch command follows the latest feature-branch commit; it never clones `main`.
For a reviewed, immutable handoff, replace **both** `REVIEWED_COMMIT_SHA` values
below with the same full 40-character lowercase Git commit ID (not runnable as-is):

```bash
bash -o pipefail -c 'script=$(curl -fsSL https://raw.githubusercontent.com/wisedev-pstach/RiftCode/REVIEWED_COMMIT_SHA/scripts/install-preview-mac.sh) && printf "%s\n" "$script" | bash -s -- --ref REVIEWED_COMMIT_SHA'
```

The installer prints the exact fetched commit. It builds only Rift 0.8 source in
an invocation-owned temporary checkout using `npm ci --ignore-scripts`, the
explicit Electron download, and `npm run package:mac`. The reviewed packaging
hook preserves node-pty's supplied native prebuilds instead of compiling them.

## What changes

- Installs only `~/Applications/Rift.app`. Does not launch Rift or kill processes.
- Builds and validates the new bundle before moving the existing one. Existing
  apps must have `dev.wise.rift` / `Rift` native bundle identity and ASAR package
  `name: rift`, `main: app-out/main/index.js`; stripped legacy manifests work.
  A whole-bundle content/identity snapshot is compared again immediately before
  backup; a changed valid Rift bundle is refused, not silently replaced. This
  detects changes during staging, not arbitrary hostile mutation at the final
  filesystem operation. Exclusive moves protect late destination arrivals.
- Retains each previous bundle at a unique
  `~/Applications/.Rift.previous-XXXXXX/Rift.app` path printed on success/error.
  Backups are never automatically pruned. A failed promotion attempts an
  exclusive rollback; if another destination appears, it is left untouched and
  the previous bundle stays at the reported backup path.
- Preserves framework-relative symlinks and executable modes. Refuses symlinks
  in destination ancestors and identity-bearing paths.
- Leaves settings, sessions, application data and CLI links untouched. Existing
  CLI links to this exact app path keep pointing to it; no new CLI is installed.
- Does not remove quarantine attributes, bypass Gatekeeper, or change signing.
  After success, launch `~/Applications/Rift.app` yourself.

A pre-existing `~/Applications/.Rift-preview.lock` blocks installation. It is
never automatically cleared; after an interrupted run, inspect the app/backup
and confirm no installer remains before manually removing an empty lock.
Never delete application data to troubleshoot this preview.

## Existing data or an isolated preview

A normal launch keeps the existing Rift profile: notes, settings and configured
providers remain available. The installer neither reads nor migrates those data
directories. For a separate preview profile instead, launch explicitly:

```bash
open -na "$HOME/Applications/Rift.app" --args --rift-preview
```

That flag opts into separate application user data; it is not an account sandbox.
External AI CLIs may still use their globally configured provider credentials.
Do not remove or reauthenticate those credentials just to test this preview.

If installation stops with an unconfirmed move, inspect both printed paths before
retrying. A failed native command acknowledgment can mean a move completed even
though the bridge reported failure. Cleanup warnings identify any owned staging
directory or lock left behind and never replace the primary error diagnostic.

## Verification scope

`node --test tests/mac-preview-installer.test.cjs` exercises real filesystem,
ASAR and electron-builder manifest-transformer fixtures, isolated local Git
fetches, shell streaming, rollback races, and framework links after checkout
cleanup. Linux fixtures inject build/process/platform adapters through test PATH
commands or direct module imports; they are **not** native macOS acceptance or a
real Electron/Angular package build. Production has no test environment switch
or GNU-mv fallback: publication/rollback use macOS `renamex_np(RENAME_EXCL)` via
fixed JXA with literal path arguments. Native macOS packaging, JXA bridge,
Gatekeeper behavior and a launch smoke test still require a Mac.
