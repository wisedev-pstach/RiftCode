# Terminal-first AI workspace

## Authorization
User message `1568349860841656424` requests immediate work on RiftCode, delivered as a PR only. No schedules, no direct push or merge to main/master, no auto-merge, no release/update publication. Repository default branch is `main`; baseline `ec48372d2c1d2aeaa3e82bdb1b49413687a22cbb`. Work branch: `feat/terminal-ai-workspace`.

## Scope
- Make AI interaction an understandable raw terminal experience for Claude Code, OpenCode and Codex, preserving existing useful review/navigation functionality.
- Provide clear provider/session/start/stop states and an actual interactive PTY terminal, not a chat renderer made to resemble one.
- Add handy notes and selection actions: copy notes, insert selected notes and selected code/diff context into the AI terminal, with clear focus and no accidental execution of pasted text.
- Recognize file/line references in review output and navigate directly to that source position in RiftCode, including unchanged files when possible.
- Preserve review/edit intent, existing task data and provider credentials. Do not silently auto-approve tools, expand access or execute provider login flows.
- User messages `1568661562863124481` / `1568661588825874634` correct the RiftCode branch-search presentation: search belongs INSIDE each opened branch selection dropdown, not in separate inputs above it. Replace the external search/select pairs with compact accessible searchable popovers/comboboxes for current/comparison and target. Closed controls show the selected branch; opening reveals a focused search field and filtered options in one selection surface. Preserve keyboard navigation, Escape/outside dismissal, selected/default options and existing comparison semantics; typing never selects or checks out a branch.

## Version
User message `1568350573626138668` explicitly requests a version bump. Keep package.json, package-lock.json root metadata and version.json synchronized; use the feature-appropriate bump (baseline 0.7.3 → 0.8.0), with concise release notes in the existing manifest format. This is source metadata in the PR only, not authorization to tag/publish a release or update main.

## Additional user requirements
- Include the feature version bump to **0.8.0**, synchronized across package, lockfile, manifest and display.
- Add searchable current/comparison and target selectors; filtering must not change Git comparison semantics or execute checkout.
- Provide a branch-only Mac owner-test handoff without publishing or merging. Installer work is delegated separately; terminal implementation includes `--rift-preview` isolated user data and disabled in-preview updater.

## Unified AI workspace correction
User message `1568662589158858813` and three attached screenshots supersede the earlier decision to keep Chats/Review as separate tabs. The terminal must replace both workflows, not remain an additional tab. Preserve stored notes/history without destructive migration, but remove duplicate Chats/Review navigation and the Legacy chats button. Route review requests and selection questions through the terminal; include an explicit Review changes workflow alongside provider review/edit intent. Add new/resume session selection using existing provider sessions for Claude Code, OpenCode and Codex, with trusted repository scoping and validated resume IDs. Compact the terminal header into a clear primary flow; move secondary context/copy actions and explanatory text into an accessible context/menu area. Fix the selection menu's vertical wrapped “Insert selection in AI terminal” label and redundant Ask-agent chat route. Keep notes accessible without the confusing vertical N/O/T/E/S and C/H/A/T/S controls. Verify dark/light and narrower widths with current screenshots. No default-branch merge or schedules.

## Continuation status
Saved partial work was completed on the same uncommitted branch over published HEAD `1c7845d1256e8c2e0dfda6ff4ffb1ff4767b80b9`. Unified terminal navigation, repository-scoped native resume wiring, integrated Review changes context, compact toolbar/Notes drawer, in-dropdown branch search and horizontal selection actions are implemented. Verified: 27 core + 30 installer tests, 26 Chromium substitute-bridge UI tests, 8 actual Electron Node-runtime/PTY tests, typecheck/full build, and all four fresh macOS/Windows x64/arm64 packages with exact current main/preload/renderer byte checks. See `TERMINAL-AI-VERIFICATION.md` for evidence and native-owner limits. No commit/push/merge/release or schedule was performed; parent owns independent review and same-PR handoff.

## Quality and safety
- Strict vertical RED/GREEN tests for terminal lifecycle, context actions and source-link parsing/navigation; typecheck and production build; independent review before feature-branch push and PR creation.
- Main owns validated repository-scoped PTY sessions and bounded buffers; narrow IPC/preload, sender validation, lifecycle cancellation and teardown. Retain sessions across view switches without orphaned processes; no automatic shell fallback after an AI exits.
- Treat terminal output as untrusted: no HTML or arbitrary URL/command execution, repository-bound file resolution, traversal/symlink escape rejection and finite line/column parsing. Paste context literally using appropriate bracketed paste/control sanitization; require explicit user submission.
- Never claim review mode is a strong OS sandbox if it is only a provider planning/permission mode. No automatic external provider calls, real credentials or billed runs in tests; use isolated executable fixtures and label them.
- Exercise actual terminal service/PTY with harmless local fixtures. Capture and inspect current UI screenshots; distinguish browser substitute bridge from actual Electron/native provider acceptance.
- Deliver a ready PR with exact branch/SHA, concise feature summary, copy-ready local test commands and honest Mac/Windows/provider acceptance gaps. No merge.
