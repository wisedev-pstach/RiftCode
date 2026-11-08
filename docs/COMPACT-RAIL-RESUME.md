# Compact rail and native conversation metadata — 0.8.0

This continuation on `feat/terminal-ai-workspace` supersedes conflicting navigation, metadata and current-evidence descriptions in the earlier visual refresh. Delivery remains existing PR #4 only: no merge, release, default-branch push or RiftCode schedules. The user rejected the broad Code/AI navigation replacement and asked to retain the familiar small Notes/Review rail.

## Delivered behavior

- Restored a compact right-hand **Notes / Terminal / Review** rail. Notes opens the existing drawer; Terminal and Review share one retained genuine xterm/node-pty session, not legacy JSON chat/review cards. A compact Code return does not stop the process.
- Review prepares comparison/revision/file context and selects Review / plan only when no session is active. It never starts a provider, submits a prompt or silently changes an active Edit session's permission policy. An explicit notice explains that an active Edit session remains Edit; Stop and an explicit new/resumed review launch are required to change that policy.
- Claude Code, OpenCode and Codex all support explicit New/Resume and review/edit intent through the terminal. Server-side membership validation and fixed native resume argv remain mandatory. Codex is not merely a dropdown addition: native metadata, rename selection, timestamps and both resume intents have real PTY-fixture coverage.
- Resume rows display actual native-schema names, local date/time and exact ISO update-time tooltips instead of provider-generic labels or UUIDs. Claude prefers custom names over generated names/summaries and bounded first-user-prompt previews. Codex joins its append-only native rename index only to verified current-repository rollout metadata, falling back to a bounded native first-user-message preview. OpenCode preserves native names and the newest duplicate metadata record.
- Start/Resume is outside the scrollable options region. It remains visible and unobstructed at 1024px even when review context is prepared. Pending context stays visible/editable for explicit insertion; no automatic Enter.
- Existing branch search stays inside its selection popover. Notes/history, literal context insertion, source jumps, permission prompts and lifecycle-generation guards remain intact.

## Scope and limits

This is bounded native-schema discovery, not an exhaustive clone of every provider's native history screen. Claude reads bounded head/tail windows; Codex reads bounded rollout prefixes and the bounded tail of its rename index. Historical titles outside those windows can be missed. Missing usable names are shown as **Untitled conversation**, not invented. Current-repository results are capped at 100; scan/output/time budgets remain enforced. Custom homes, archived/remote stores and all provider release-channel schemas are not claimed.

No real-home conversations, credentials or authenticated model calls were used. Browser screenshots use the actual built Angular/xterm renderer with an explicitly labeled synthetic bridge and metadata produced from scratch native-schema inputs. Local unsigned foreign-platform packaging does not establish native GUI, Gatekeeper, Windows ConPTY or authenticated provider acceptance.

Native field references checked during implementation/review:
- [Anthropic session metadata reader](https://github.com/anthropics/claude-agent-sdk-python/blob/main/src/claude_agent_sdk/_internal/sessions.py)
- [Codex append-only session-name index](https://github.com/openai/codex/blob/main/codex-rs/rollout/src/session_index.rs)
- [Codex rollout listing](https://github.com/openai/codex/blob/main/codex-rs/rollout/src/list.rs)
- [OpenCode native session-list serializer](https://github.com/anomalyco/opencode/blob/dev/packages/cli/src/commands/handlers/session/list.ts)

## Observed regressions and fixes

- Native metadata fixtures cover Claude rename records after 64 KiB, title priority, prompt fallback excluding assistant/tool/system content, Codex last-indexed renames joined only to repository members, OpenCode duplicate/update ordering, invalid timestamps and missing names.
- Independent review reproduced a FIFO hang at the optional Codex index: read-only open could wait for a writer before descriptor validation. The new isolated subprocess test first timed out at 2.5 seconds. The fix checks regular-file/hardlink metadata before open, uses nonblocking/no-follow flags where supported, and rechecks the descriptor. The parent rerun completed the FIFO regression in approximately 205 ms. Symlink/hardlink and bounded-scan negatives remain passing.
- Narrow Review initially hid its primary action below a scrollable launcher while context occupied the lower pane. The failing regression checked clipping and obstruction rather than CSS visibility alone. Start/Resume now passes viewport/launcher bounds and actual hit testing for all three providers in both themes at 1024/1440.

## Final parent execution

- `npm test`: **55 core + 30 installer passed**, no skips.
- `CHROMIUM_EXECUTABLE=/opt/hermes/tools/chromium-1208/chrome-linux64/chrome npm run test:ui`: **61 passed**, including production build, TypeScript and Angular template checks.
- `ELECTRON_RUN_AS_NODE=1 LD_LIBRARY_PATH=/opt/data/cache/scratch/rift-native-libs/root/usr/lib/x86_64-linux-gnu node_modules/electron/dist/electron --import tsx --test tests/terminal-service.test.ts`: **13 passed**, including all three providers in review/edit resume modes with harmless real PTY executable fixtures.
- `git diff --check`: passed.
- Four macOS/Windows x64/arm64 packages rebuilt after the fixes. Parent readback verified all six current runtime assets per package, production dependencies, exact native addon/helper architecture and macOS executable helper modes.
- Current renderer `index-Col-8fLk.js`, SHA-256 `bc6beb92fa600cfa151b925a0231d81655b23cd22370f690e8092b32ffcad884`. Main SHA-256 `74606d64664a17d47522230d921843bf92b36d508a4bd96a8437cba1a31ea86e`; CSS `index-DQJB-leM.css`. Machine-readable package evidence: `/opt/data/cache/scratch/rift-package-verification.json`.

## Screenshot evidence

Parent verified **36 native-fixture screenshots**: three providers × two themes × two widths × New/Resume/Review. Each file is hashed in `/opt/data/output/riftcode/compact-rail/verified-native-manifest.json`.

Pattern: `/opt/data/output/riftcode/compact-rail/native-{claude,opencode,codex}-{dark,light}-{1024,1440}-{new,resume,review}.png`.

Inspected full-size Codex dark 1440 resume and Claude light 1024 review, including the fixed visible Resume action, readable name/date/time, compact rail and retained context. Additional general-workspace captures are available in the same directory; the old visual-refresh gallery is historical, not current acceptance evidence.

## Independent review

Review `deleg_34d8cc27` identified the FIFO blocker described above. After the dedicated fix and the parent's full rerun, read-only re-review `deleg_37e83c3f` approved the changes with no remaining security or logic concerns. The re-review inspected the code, regression assertions and screenshots; it did not itself rerun tests. Parent execution results above are the final automated gate.

## Owner handoff

Use PR #4's current immutable Mac installer command, quit Rift before updating, and retain space for prior-app backups. Test an already authenticated installed provider against a disposable repository: open Notes, switch Terminal/Review, inspect real conversation names/date/times, resume deliberately, check ordinary trust prompts, insert a synthetic note without Enter, follow a source reference, return to Code, resize, Stop. Native platforms and account-specific metadata remain owner acceptance.
