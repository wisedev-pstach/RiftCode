# Factory provider command plans and portable skills

## Scope and exported integration seam

This module does **not** execute a provider, discover accounts, read provider homes, install native skills, grant permissions, or integrate IPC/UI. Existing `TerminalProvider`, `providerArgs` and `terminalLaunch` were inspected and left unchanged. In particular, the restrictive Windows `.cmd` argument regex remains intact.

- `src/shared/factory-provider.ts`: `FactoryProviderPlanInput`, `FactoryExecutable`, `FactoryCapabilityVerification`, `FactoryProviderCapability`, `FactoryProviderCommandRequest`, `FactoryProviderPlan`, `FactoryProviderCapture`, `FactoryProviderEvent`, `FactoryProviderOutput`, consent and limit types.
- `src/main/factory/providers.ts`: `factoryProviderCapability`, `locateFactoryExecutable` (injected locator only), `planFactoryProvider` (pure), `parseFactoryProviderOutput` (bounded closed JSONL capture).
- `src/main/factory/skills.ts`: `FACTORY_SKILLS`, `FactorySkillId`, `FactorySkill`, `FactoryPromptContext`, `MAX_FACTORY_PROMPT_BYTES`, `resolveFactorySkillPath`, `parseFactorySkill`, `loadFactorySkill`, `buildFactoryPrompt`.

Plans are a discriminated union: `ready` carries a shell-free executable/argv/stdin request and capability metadata; `blocked` carries a reason and metadata, never an execution request. Parsed output is `candidate | blocked | failed`, with recorded session ID where observed, normalized events and untrusted output text. A candidate is **not** Finished, accepted, or evidence that tests ran.

The future main-process service must validate the workspace and execution consent, supply trusted executable/version/capability metadata, build a credential-safe environment, execute with a generic bounded runner, close stdin, capture normal process close and cancellation/truncation, then parse the captured output. Do not accept capability verification or consent assertions from untrusted renderer/provider/repository content. Pin verification to the exact executable/version; reverify after an upgrade or executable change. The capability object is a caller trust boundary, not a cryptographic attestation or a promise that the installed CLI works.

No default verified Codex/OpenCode installation is shipped. Their plans are Blocked without exact-version feature evidence and required consent. Fixture versions in tests are synthetic, not installed-version discovery or live acceptance.

## Capability and safety matrix

| Provider | Command plan (prompt is stdin) | Gates and limitations |
| --- | --- | --- |
| Claude Code | `-p --verbose --output-format stream-json --permission-mode default --permission-prompts none`, optional `--max-turns N` | Stable 2.x >= 2.1.259. Explicit provider/config execution **and** `claude-print-startup` consent. Print skips workspace trust and per-server approval dialogs; project/user hooks and MCP may execute. `none` denies tool calls which would prompt, not a blanket authorization. Default permissions may still allow actions under existing native configuration. No broad allowed-tools whitelist, skip flags, or `--bare` OAuth fallback. |
| Codex | `--ask-for-approval on-request exec --json --sandbox workspace-write -` | Exact-version verification of exec JSON/stdin, workspace-write and approval support; explicit `workspace-write` consent. No invented numeric minimum: the verified release must support this command combination. Optional `--output-schema` takes a caller-vetted in-workspace `.json` **file**, never inline JSON. No `--full-auto`, trust persistence, skip-repository check, automatic review, or bypass flags. Native approval requests remain unresolved/Blocked when this transport cannot answer; no auto-answer. |
| OpenCode V2 | `run --standalone --format json --agent build` | Stable 2.x plus exact-version verification of standalone/stdin/JSON and stop-reason semantics. Explicit private-server and configuration-execution consent. Sets `PWD` to canonical cwd. `--standalone` starts a **private server**, not server-free execution. No shared-service attach/start/config edits, `--pure`, auto-approval, or skip flags. V1 is separately unsupported/Blocked. |

All transports require provider execution and provider configuration execution consent. None claims to preserve an interactive workspace trust dialog in headless mode, guarantee universal autonomy, or turn skill prose into approval. For any unverified capability, missing permission, account interaction or ambiguous completion, use Blocked/manual native terminal rather than fabricating successful execution. Native login flows must remain user-controlled; this module never probes auth or models.

Executable discovery is injected. The caller must verify native binary provenance or the Node executable plus CLI entrypoint. Paths must be absolute; a Node entrypoint must be explicitly validated and end in `.js`, `.cjs` or `.mjs`. Shell shims (`.cmd`, `.bat`, `.ps1`, `.sh`) are blocked. Windows requires `.exe` as runtime; structured `.cmd` support remains explicitly unverified. No change to existing terminal launcher behavior is needed.

## Protocol interpretation

Only a closed process capture with exit code zero can yield a candidate. Missing terminal/session data, malformed JSON, output truncation, cancellation, timeout or unresolved work cannot. Session IDs are bounded inert identifiers, never shell syntax or automatically resumed sessions. Conflicting session IDs block completion.

- Claude: require `type=result`, `subtype=success`, `is_error=false`, nonempty result and recorded session. Nonempty permission denials, deferred/blocked reasons, nested tool refusal diagnostics, errors and failed subtype override claimed success. Later work requires a new terminal result.
- Codex: recognize `thread.started`, `turn.started`, `item.*`, `turn.completed`, `turn.failed`, `error`. Require a started/completed turn and completed agent message with recorded thread. A failed/declined/denied command or nonzero command exit blocks even when the process subsequently exits zero. A failed turn/protocol error fails. Later item activity requires a new completed turn.
- OpenCode: recognize text, step and tool events. `step_finish` alone is not completion. Require recorded session, captured text and an observed `stop` reason **plus normal process close zero**. Tool failure, permission/question events or diagnostics block; error/length termination fails. Exact installed-version verification of these semantics is mandatory; otherwise manual fallback. Tool-call step boundaries are not final results.

Diagnostic refusal matching is intentionally conservative and can block quoted examples mentioning a refusal. It is safer to request manual review than infer autonomy. Parser bounds are 16 MiB stdout, 1 MiB stderr, 50,000 events and a bounded nested-value walk. Caller limits may be stricter. Output text is **untrusted and potentially sensitive**, not automatically redacted or safe for logging. Log only redacted bounded receipts; never credentials or raw provider stdout to telemetry.

## Skills and packaged resources

Canonical assets, each with only `name` and `description` frontmatter:

1. `factory-requirements`: requirements, decisions, non-goals and criterion IDs.
2. `factory-architecture`: architecture, text diagrams, dependency graph and scoped TaskSpecs.
3. `factory-implement-task`: baseline-aware scoped implementation and regression checks.
4. `factory-test-repair`: actual execution receipts and bounded root-cause repair loop.
5. `factory-review-task`: immutable implemented-code diff/evidence review, human decision.

`resourcesRoot` is the injected absolute resources directory containing `factory-skills/`. The parent packaging integration must copy `resources/factory-skills` into packaged `factory-skills` using extra resources and choose the runtime resources root; this worker did not edit packaging. The resolver allowlists IDs and verifies real paths stay within the resources root, rejecting traversal and symlink escapes. It only reads bundled assets; it never exports into provider homes or writes global instructions.

Always load the canonical skill and call `buildFactoryPrompt` with accepted requirements, plan, TaskSpec, dependency summaries and test receipts. The whole canonical body and JSON context are included even when native skill discovery is unavailable. Maximum prompt size is 256 KiB; provide bounded summaries rather than silently truncating required decisions/evidence. Native skill installation is unnecessary.

The supporting artifact store can be outside the checkout. Serialize authorized bounded content into this prompt; do **not** add its directory with `--add-dir`. For providers such as Codex that flag grants **write access**, not merely reference visibility. A path reference alone does not grant access or guarantee content was read.

The runner/caller must enforce the supplied timeout, output cap, retry cap and Stop; retries are not performed here and each retry needs its own receipt and remaining budget. Only Claude receives a native max-turn flag. Codex/OpenCode turn limits require caller event supervision; timeout/output/retry limits must still bound the process. No shell interpolation, commits, staging, dependency installs, external writes or provider/model switching are implicit.

## Verification

Run scoped synthetic/unit tests:

```text
./node_modules/.bin/tsx --test tests/factory-providers.test.ts tests/factory-skills.test.ts
```

These tests cover plans, capability/consent gates, Windows paths, resource/frontmatter safety, prompt inclusion, synthetic JSONL, zero-exit denials, malformed/truncated capture, missing terminal markers, cancellation, errors and stale completion. **No live provider command/account/model/server execution was performed.** They are not authenticated-provider acceptance or evidence of application integration. No full UI/build was run while other workers owned integration.

## Official documentation reverified

- [Claude CLI reference](https://code.claude.com/docs/en/cli-reference): stream JSON, verbose print, permission mode and `--permission-prompts none` (requires 2.1.259+).
- [Claude programmatic execution](https://code.claude.com/docs/en/headless): print trust bypass, hooks/MCP startup, bare mode skipping OAuth, failure output, background-work limits. This is why factory consent cannot be replaced by a claim that print preserves trust dialogs.
- [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode) (official developers.openai.com redirect): exec JSONL events, stdin `-`, output-schema file, sandbox, project trust/MCP behavior and removal of `--full-auto`.
- [Codex CLI flags](https://learn.chatgpt.com/docs/developer-commands?surface=cli): approval and sandbox flags, additional-directory write grants. Release support still requires exact-version verification.
- [OpenCode CLI intro](https://opencode.ai/docs/cli/): shared background server default and standalone private-server behavior.
- [OpenCode CLI commands](https://opencode.ai/docs/cli/commands/#run): run, JSON output, agent build and standalone CI usage; `--auto` is explicit auto-approval and is deliberately not used. This general page does not prove every installed release's stdin/terminal protocol. Those features remain exact-version-gated. Guessed `/cli/run/` and `/automation/` deep links returned 404; the commands page is the working reference.
