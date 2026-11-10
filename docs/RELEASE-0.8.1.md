# Rift 0.8.1 official update handoff

The user authorized official publication and PR #4 merge. This release candidate changes only version/release metadata and release regression tests after the reviewed final Agent/Review workspace.

## Update activation

- `package.json`, lockfile root and root package metadata, and `version.json` are synchronized to **0.8.1**.
- Production updater comparator tests run the actual functions extracted from main: 0.8.1 is newer than 0.7.3 and 0.8.0, equal is not an update, and downgrade is rejected. Both tests were observed RED on 0.8.0 metadata, then GREEN after the synchronized bump.
- Normal installations fetch `main/version.json` and invoke existing `main/install.sh` or `main/install.ps1`; reaching main activates the update. No alternative update infrastructure is introduced.
- `--rift-preview` intentionally disables update installation and keeps its existing separate profile. Launch without that flag for normal update checks; this does not migrate or delete preview notes/settings.
- GitHub's main rules require an approving/code-owner review. Do not bypass rules or publish a release tag before the reviewed change reaches main.

## Executed verification

- **90 core + 30 installer tests passed**, with unchanged CPU-affinity execution; no failed/skipped cases.
- **90 actual Electron-runtime tests passed** serially with affinity, including the production updater/version regressions.
- TypeScript/Angular checks and production build passed.
- Four regenerated unsigned macOS/Windows x64/arm64 packages: version 0.8.1, six byte-exact current runtime assets each, production dependencies and native architecture/helper modes verified. Windows cross-packaging skips executable decoration/signing; macOS signing is unavailable on Linux.
- Prior completed browser evidence is **122 passed** plus **four actual-font/cell-metric tests**, on the identical application behavior at c90208a before this version-only bump. No new full-browser pass is claimed for metadata edits.
- Logs: `/opt/data/cache/scratch/rift-081-{core,build,native,package-mac,package-win}.log`; archive receipt: `rift-081-package-verification.json`.

Current renderer: `/app-out/renderer/assets/index-Bx0MXbms.js`, SHA-256 `02294f721d2ea0bd0b779f463637e920d65686380474ce712808c2166444a30b`.

## Publication boundary

Verify normal merge, main manifest/installer/source bytes and tag/release target before calling the release available. Native Windows/macOS install/GUI, signing and authenticated-provider acceptance remain owner checks; source builds and cross-package checks are not signed native acceptance. No hosted CI checks are configured for this branch. Existing repository startup may require an explicit repository path; packaged CLI launchers already pass `--repository`.
