# Rift

**Rift is a visual, AI-native code review workspace focused on branch diffs.**

It is launched from the terminal inside a Git repository:

```bash
rift
```

Rift opens an Electron desktop app for the current directory and presents the current branch changes in a much more readable, polished, and interactive way than a typical IDE diff viewer.

The core idea:

> **Write code wherever you want. Review it in Rift.**

## Core experience

Rift should:

- detect the current Git repository;
- detect the current branch and likely base branch;
- show all changed files in a clean file tree;
- render high-quality split and unified diffs;
- syntax-highlight code;
- support word-level diff highlighting;
- allow hiding whitespace/generated files;
- allow marking files or hunks as reviewed;
- watch the repository and refresh automatically whenever files change.

The diff is the main product. AI functionality is integrated around it, not the other way around.

## Application layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Rift      feature/orders → main             Claude Code ▼            Settings│
├──────────────────┬────────────────────────────────────────┬──────────────────┤
│ Changes          │ Diff                                   │ AI / Review      │
│                  │                                        │                  │
│ src/             │ OrderService.cs                        │ Critical Review  │
│  OrderService.cs │                                        │                  │
│  Validator.cs    │ - old implementation                   │ Finding #1       │
│                  │ + new implementation                   │ Race condition   │
│ tests/           │                                        │                  │
│  Tests.cs        │                                        │ [Discuss] [Fix]  │
│                  │                                        │                  │
├──────────────────┴────────────────────────────────────────┴──────────────────┤
│ 5 files changed     +130 -15       3 findings          Reviewed 2 / 5        │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Code interaction

The user can select:

- one line;
- a range of lines;
- a diff hunk;
- an entire file;
- multiple files;
- the entire branch diff.

They can then ask the selected AI agent to:

- explain the code;
- explain why something changed;
- review the implementation;
- find possible bugs;
- find edge cases;
- simplify the code;
- compare it with project documentation;
- suggest an alternative;
- modify the implementation.

Example:

```text
Select lines 84–102

Ask AI
─────────────────
Explain
Review
Find bugs
Simplify
Compare with docs
Ask custom question...
```

## Agent integrations

Rift does **not** implement its own coding agent.

Instead, it integrates with existing terminal-based agents such as:

- Claude Code;
- OpenCode;
- Codex;
- potentially Gemini CLI and others later.

The user chooses the active agent inside Rift.

Rift must be able to **launch and communicate with terminal processes directly**.

This is an important architectural requirement.

The Electron main process should have access to a shell/PTY layer and be able to:

- start agent CLI processes;
- run commands in the repository directory;
- keep long-running agent sessions alive;
- send input to an existing process;
- receive stdout/stderr;
- detect process state;
- interrupt/cancel execution;
- restart sessions when necessary.

A PTY-based implementation is preferable to basic `child_process.exec`, because agents behave like interactive terminal applications.

Conceptually:

```text
Rift UI
   │
   ▼
Agent Adapter
   │
   ▼
PTY / Terminal Process
   │
   ├── claude
   ├── opencode
   └── codex
```

## Parsing agent responses

Rift should not treat agent output as plain terminal text only.

Each agent integration should contain an adapter capable of interpreting its output.

Rift should attempt to extract structured information such as:

```text
Text response
Tool invocation
File read
File modification
Command execution
Progress/status
Question to user
Error
Completion
Referenced file
Referenced line
```

For example, if Claude Code outputs that it modified:

```text
src/Orders/OrderService.cs
```

Rift should understand that an edit occurred rather than merely displaying the raw terminal output.

The adapter layer could expose normalized events:

```ts
type AgentEvent =
  | { type: "message"; content: string }
  | { type: "tool"; name: string; input: unknown }
  | { type: "file-read"; path: string }
  | { type: "file-changed"; path: string }
  | { type: "command"; command: string }
  | { type: "status"; status: string }
  | { type: "error"; message: string }
  | { type: "completed" };
```

Each provider can parse its own CLI output into this common Rift format.

```text
Claude Code output
        │
Claude Adapter
        ▼
   AgentEvent[]

OpenCode output
        │
OpenCode Adapter
        ▼
   AgentEvent[]

Codex output
        │
Codex Adapter
        ▼
   AgentEvent[]
```

Where agents provide machine-readable output, JSON streams, hooks, SDKs, or RPC mechanisms, those should be preferred over scraping ANSI terminal output.

Raw terminal parsing should be the fallback.

## Agent sessions

Rift should support existing sessions whenever the selected agent exposes them.

Example:

```text
Claude Code

Sessions
────────────────────────
Current feature       12 min ago
Order refactor        Yesterday
API cleanup           3 days ago
```

The agent adapter should therefore optionally provide capabilities similar to:

```ts
interface AgentAdapter {
    start(): Promise<AgentSession>;
    stop(): Promise<void>;

    send(message: string): Promise<void>;

    listSessions?(): Promise<AgentSessionInfo[]>;
    loadSession?(id: string): Promise<void>;

    onEvent(callback: (event: AgentEvent) => void): void;
}
```

Rift should maintain its own lightweight metadata around these sessions so it can associate agent conversations with repositories and reviewed diffs.

## AI conversations attached to code

AI interactions should be anchored to the code being reviewed.

Example:

```text
OrderService.cs:84-102

User:
Could this create a race condition?

Claude:
Yes. Two workers could pass the state check before either
updates the order.

User:
Fix it using the existing repository locking mechanism.
```

Rift sends the selected code, relevant diff, file path, and repository context to the agent.

If the agent modifies the file, Rift detects the filesystem change and immediately updates the diff.

The intended loop is:

```text
Review code
    ↓
Select suspicious section
    ↓
Ask Claude/OpenCode/Codex
    ↓
Discuss
    ↓
Ask agent to change it
    ↓
Agent edits repository
    ↓
Rift detects filesystem change
    ↓
Diff refreshes
```

## Comments

The user can add comments directly to lines or diff ranges.

Example:

```text
OrderService.cs:91

"This doesn't seem thread-safe."
```

Comments can then be sent to the selected agent individually or as a group.

Example actions:

```text
Fix this comment
Fix selected comments
Discuss
Explain
```

When the agent implements the fixes, Rift updates the diff and keeps enough history to show which comments have been addressed.

## Review actions

Rift should provide dedicated review buttons rather than requiring users to repeatedly type prompts.

### Review

General code review covering correctness, readability, maintainability, and obvious issues.

### Critical Review

Aggressively search for:

- bugs;
- race conditions;
- edge cases;
- breaking behavior;
- security problems;
- incorrect assumptions;
- data-loss scenarios.

The spirit of the prompt should be:

> Try to prove this implementation is wrong.

### Honest Review

Avoid generic AI praise.

Give a concise engineering assessment of the implementation, what is weak, what is unnecessary, and what should be changed before merge.

### Architecture Review

Focus on:

- coupling;
- boundaries;
- abstractions;
- dependencies;
- consistency with the existing codebase.

### Simplification Review

Look specifically for ways to achieve the same result with fewer concepts, abstractions, or lines of code.

Users should also be able to define custom review profiles.

## Review findings

Review results should preferably be structured and attached directly to code.

Example:

```text
Critical

Potential race condition
OrderService.cs:84

Two requests can pass this condition simultaneously.

[Explain] [Discuss] [Fix] [Ignore]
```

Findings should support severity levels such as:

```text
Critical
Warning
Suggestion
```

Clicking a finding navigates directly to the relevant code.

## Documentation context

Rift should allow the project to define additional context sources.

Examples:

```text
./docs
Architecture.md
api-specification.pdf
https://internal-docs.example.com
MCP: Confluence
MCP: GitHub
```

Context may come from:

- local files;
- directories;
- Markdown;
- PDFs;
- URLs;
- documentation sites;
- MCP servers.

When the user chooses:

```text
Compare with docs
```

Rift asks the active agent to inspect relevant project context and compare the implementation against it.

Example result:

```text
Documentation mismatch

The specification states that retry attempts must be limited to 3.

Current implementation uses 5.

RetryService.cs:44
```

The agent itself can retrieve context using its available tools or MCP integrations. Rift's responsibility is to provide the configured sources and clearly communicate which context should be considered.

## Git comparison

Rift should support at least:

```text
Current branch ↔ base branch
Working tree ↔ HEAD
Branch ↔ branch
Commit ↔ commit
```

Typical default:

```text
feature/orders → main
```

The base branch should be detected automatically where possible, but always be manually selectable.

## Repository watching

Rift must continuously watch the working directory.

Any code modification made through:

- Rider;
- VS Code;
- terminal;
- Claude Code;
- OpenCode;
- Codex;
- Rift-triggered agent actions;

should automatically update the displayed diff.

An agent should therefore never need a special Rift-specific API to modify code. It can simply edit files normally.

Rift observes the repository and reacts.

## Suggested architecture

```text
Electron
React
TypeScript
Node.js
Git CLI
PTY integration
SQLite
Monaco / custom diff renderer
```

High-level structure:

```text
/apps
  /desktop

/packages
  /git
  /diff
  /terminal
  /agents
      /core
      /claude
      /opencode
      /codex
  /reviews
  /context
  /shared
```

Electron main process owns:

- filesystem access;
- Git operations;
- file watching;
- PTY processes;
- agent lifecycle;
- agent output parsing;
- local persistence.

Renderer owns:

- file tree;
- diff rendering;
- annotations;
- review findings;
- AI conversations;
- settings.

Communication between renderer and Electron main process should happen through a narrow typed IPC API.

## Agent plugin model

Agent integrations should be modular.

Conceptually:

```text
Rift
 │
 ├── Git Engine
 ├── Diff Engine
 ├── Context Engine
 ├── Terminal Host
 │
 └── Agent Host
       ├── Claude Code Adapter
       ├── OpenCode Adapter
       ├── Codex Adapter
       └── Future adapters
```

Adapters normalize agent-specific behavior behind one API.

They should expose capabilities so Rift knows what each provider supports:

```ts
{
    sessions: true,
    streaming: true,
    fileEditing: true,
    mcp: true,
    structuredOutput: true
}
```

Rift should therefore remain independent from any single AI provider.

## Important product boundary

Rift is **not** intended to become:

- an IDE;
- a code editor;
- another Git desktop client;
- another standalone coding agent;
- a generic AI chat application.

The application has one primary purpose:

> **Make reviewing code changes significantly better.**

The unique combination is:

```text
Beautiful diff
+
Code-anchored conversations
+
Existing coding agents
+
Interactive review findings
+
Agent-driven fixes
+
Live repository refresh
```

The core workflow should feel extremely simple:

```text
cd project
rift

→ inspect branch diff
→ click suspicious code
→ ask Claude / OpenCode / Codex
→ discuss it
→ leave comments
→ ask agent to fix them
→ see the diff update immediately
→ run Critical Review
→ finish review
```

**Write elsewhere. Review in Rift.**