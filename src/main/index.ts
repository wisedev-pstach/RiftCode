import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu } from "electron";
import { execFile, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync, watch, type FSWatcher } from "node:fs";
import { open, readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { loadFilePatch, loadRepository } from "./git";
import type { IpcMainInvokeEvent } from "electron";
import type { AgentConversationHistory, AgentConversationMessage, AgentId, AgentOption, AgentRunResult, AgentSession, AgentStreamEvent, AgentToolEvent, RepositorySnapshot } from "../shared/contracts";

const AGENTS: Readonly<Record<AgentId, { label: string; args: (prompt: string, model: string | null, sessionId?: string) => string[]; promptViaStdin?: boolean }>> = {
  opencode: { label: "OpenCode", args: (prompt, model, sessionId) => ["run", "--pure", "--agent", "plan", "--format", "json", "--auto", ...(model ? ["--model", model] : []), ...(sessionId ? ["--session", sessionId] : []), prompt] },
  claude: {
    label: "Claude Code",
    args: (_prompt, model, sessionId) => ["--print", "--verbose", "--output-format", "stream-json", "--include-partial-messages", "--permission-mode", "plan", "--tools", "Read,Grep,Glob,Bash", ...(model ? ["--model", model] : []), ...(sessionId ? ["--resume", sessionId] : [])],
    promptViaStdin: true
  }
};

let mainWindow: BrowserWindow | null = null;
let snapshot: RepositorySnapshot | null = null;
let watcher: FSWatcher | null = null;
let watchedRoot: string | null = null;
let refreshTimer: NodeJS.Timeout | null = null;
let activeComparisonId = "auto";
let repositoryLoadQueue = Promise.resolve();
let repositoryGeneration = 0;
let currentRepositoryPath: string | null = null;
let activeAgentProcess: ChildProcess | null = null;
let agentCancellationRequested = false;
let activePatchController: AbortController | null = null;
const initialRepository = repositoryArgument(process.argv);

function repositoryArgument(argv: string[]): string | undefined {
  const explicit = argv.find((argument) => argument.startsWith("--repository="));
  if (explicit) return explicit.slice("--repository=".length);
  return undefined;
}

function execute(command: string, args: string[], cwd = process.cwd(), maxBuffer = 10 * 1024 * 1024): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      command,
      args,
      { cwd, maxBuffer, timeout: 180_000, killSignal: "SIGKILL", windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || stdout.trim() || error.message));
          return;
        }
        resolvePromise(stdout.trim());
      }
    );
  });
}

function executeAgent(command: string, args: string[], cwd: string, onOutput: (chunk: string) => void, input?: string): Promise<string> {
  if (activeAgentProcess) return Promise.reject(new Error("An agent request is already running."));
  agentCancellationRequested = false;
  return new Promise((resolvePromise, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(command, args, { cwd, windowsHide: true, shell: false, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGKILL");
    }, 120_000);
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeAgentProcess = null;
      if (error) reject(error);
      else resolvePromise(stdout.trim());
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      onOutput(text);
      if (stdout.length > 10 * 1024 * 1024) {
        child.kill("SIGKILL");
        finish(new Error("Agent output exceeded the 10 MB limit."));
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
    child.once("error", (error) => finish(error));
    child.once("close", (code, signal) => {
      if (agentCancellationRequested) {
        finish(new Error("Agent request was cancelled."));
      } else if (signal) {
        finish(new Error("Agent request timed out after 120 seconds."));
      } else if (code !== 0) {
        finish(new Error(stderr.trim() || stdout.trim() || `Agent exited with code ${code}.`));
      } else {
        finish();
      }
    });
    activeAgentProcess = child;
  });
}

function normalizeAgentError(id: AgentId, reason: unknown): Error {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (/authentication_failed|failed to authenticate|oauth session expired|authentication (?:session )?expired|unauthorized|not (?:logged|signed) in|login required|invalid (?:api key|token)|\b401\b/i.test(message)) {
    const command = id === "claude" ? "claude auth login" : "opencode auth login";
    return new Error(`Authentication required. Sign in to ${AGENTS[id].label} again by running "${command}" in a terminal, then retry.`);
  }
  return reason instanceof Error ? reason : new Error(message);
}

async function resolveCommand(command: AgentId): Promise<string | null> {
  try {
    const locator = process.platform === "win32" ? "where.exe" : "which";
    const result = await execute(locator, [command]);
    const candidates = result.split(/\r?\n/).filter(Boolean);
    return process.platform === "win32"
      ? candidates.find((candidate) => candidate.toLowerCase().endsWith(".exe")) ?? null
      : candidates[0] ?? null;
  } catch {
    return null;
  }
}

async function listAgents(): Promise<AgentOption[]> {
  const agents = await Promise.all((Object.keys(AGENTS) as AgentId[]).map(async (id) => (
    await resolveAgentCommand(id) ? { id, label: AGENTS[id].label } : null
  )));
  return agents.filter((agent): agent is AgentOption => agent !== null);
}

async function resolveAgentCommand(id: AgentId): Promise<string | null> {
  const command = await resolveCommand(id);
  if (!command) return null;
  if (id !== "claude") return command;
  try {
    const version = await execute(command, ["--version"]);
    return /claude code/i.test(version) ? command : null;
  } catch {
    return null;
  }
}

async function listAgentModels(id: AgentId): Promise<string[]> {
  if (id === "claude") return ["sonnet", "opus", "haiku"];
  const command = await resolveAgentCommand(id);
  if (!command) return [];
  return (await execute(command, ["models"])).split(/\r?\n/).map((model) => model.trim()).filter(Boolean);
}

async function listAgentSessions(id: AgentId): Promise<AgentSession[]> {
  if (!snapshot) throw new Error("No repository is open.");
  const command = await resolveAgentCommand(id);
  if (!command) return [];
  if (id === "opencode") {
    const output = await execute(command, ["session", "list", "--format", "json", "--max-count", "30"], snapshot.root);
    const sessions: unknown = JSON.parse(output || "[]");
    if (!Array.isArray(sessions)) return [];
    return sessions.flatMap((value): AgentSession[] => {
      const session = record(value);
      return typeof session?.id === "string"
        && typeof session.title === "string"
        && typeof session.updated === "number"
        && typeof session.directory === "string"
        && samePath(session.directory, snapshot!.root)
        ? [{ id: session.id, title: session.title, updatedAt: session.updated }]
        : [];
    }).slice(0, 20);
  }

  const projectName = resolve(snapshot.root).replace(/[^a-zA-Z0-9]/g, "-");
  const directory = join(homedir(), ".claude", "projects", projectName);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const candidates = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map(async (entry) => ({ entry, details: await stat(join(directory, entry.name)) })));
  candidates.sort((left, right) => right.details.mtimeMs - left.details.mtimeMs);
  const sessions = await Promise.all(candidates.slice(0, 20).map(async ({ entry, details }): Promise<AgentSession | null> => {
    const title = await readClaudeSessionTitle(join(directory, entry.name), snapshot!.root);
    return title ? {
      id: entry.name.slice(0, -".jsonl".length),
      title,
      updatedAt: details.mtimeMs
    } : null;
  }));
  return sessions.filter((session): session is AgentSession => session !== null);
}

function samePath(left: string, right: string): boolean {
  const leftPath = resolve(left);
  const rightPath = resolve(right);
  return process.platform === "win32" ? leftPath.toLowerCase() === rightPath.toLowerCase() : leftPath === rightPath;
}

async function readClaudeSessionTitle(path: string, repositoryRoot: string): Promise<string | null> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(512 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    let title: string | null = null;
    let matchesRepository = false;
    for (const line of buffer.toString("utf8", 0, bytesRead).split(/\r?\n/)) {
      let event: Record<string, unknown> | null = null;
      try { event = record(JSON.parse(line)); } catch { continue; }
      if (!event) continue;
      if (typeof event.cwd === "string" && samePath(event.cwd, repositoryRoot)) matchesRepository = true;
      if (event.type === "summary" && typeof event.summary === "string" && event.summary.trim()) {
        title ??= event.summary.trim().slice(0, 120);
      }
      if (event.type !== "user" || event.isMeta === true) continue;
      const message = record(event.message);
      if (typeof message?.content !== "string" || message.content.startsWith("<")) continue;
      const firstLine = message.content.trim().split(/\r?\n/, 1)[0];
      if (firstLine) title ??= firstLine.slice(0, 120);
    }
    return matchesRepository ? title ?? "Claude conversation" : null;
  } finally {
    await handle.close();
  }
}

function appendConversationMessage(messages: AgentConversationMessage[], role: "user" | "assistant", content: string): void {
  const text = content.trim();
  if (!text) return;
  const previous = messages.at(-1);
  if (previous?.role === role) previous.content = `${previous.content}\n\n${text}`;
  else messages.push({ role, content: text });
}

async function getAgentSession(id: AgentId, sessionId: string): Promise<AgentConversationHistory> {
  if (!snapshot) throw new Error("No repository is open.");
  if (id === "opencode") {
    const command = await resolveAgentCommand(id);
    if (!command) throw new Error("OpenCode is not installed or is not on PATH.");
    const output = await execute(command, ["export", sessionId], snapshot.root, 50 * 1024 * 1024);
    const jsonStart = output.indexOf("{");
    if (jsonStart < 0) throw new Error("OpenCode returned an invalid conversation export.");
    const exported = record(JSON.parse(output.slice(jsonStart)));
    const info = record(exported?.info);
    if (typeof info?.directory !== "string" || !samePath(info.directory, snapshot.root)) {
      throw new Error("This conversation belongs to a different repository.");
    }
    const messages: AgentConversationMessage[] = [];
    for (const value of Array.isArray(exported?.messages) ? exported.messages : []) {
      const message = record(value);
      const messageInfo = record(message?.info);
      const role = messageInfo?.role;
      if (role !== "user" && role !== "assistant") continue;
      const text = (Array.isArray(message?.parts) ? message.parts : []).flatMap((partValue): string[] => {
        const part = record(partValue);
        return part?.type === "text" && typeof part.text === "string" ? [part.text] : [];
      }).join("\n\n");
      appendConversationMessage(messages, role, text);
    }
    const model = record(info.model);
    const modelId = typeof model?.id === "string" ? model.id : null;
    const providerId = typeof model?.providerID === "string" ? model.providerID : null;
    return {
      id: sessionId,
      title: typeof info.title === "string" ? info.title : "OpenCode conversation",
      model: modelId && providerId ? `${providerId}/${modelId}` : modelId,
      messages
    };
  }

  const projectName = resolve(snapshot.root).replace(/[^a-zA-Z0-9]/g, "-");
  const path = join(homedir(), ".claude", "projects", projectName, `${sessionId}.jsonl`);
  const details = await stat(path);
  if (details.size > 50 * 1024 * 1024) throw new Error("Claude conversation is too large to display.");
  const messages: AgentConversationMessage[] = [];
  let title = "Claude conversation";
  let model: string | null = null;
  let matchesRepository = false;
  const events = new Map<string, Record<string, unknown>>();
  let leafId: string | null = null;
  for (const line of (await readFile(path, "utf8")).split(/\r?\n/)) {
    let event: Record<string, unknown> | null = null;
    try { event = record(JSON.parse(line)); } catch { continue; }
    if (!event) continue;
    if (typeof event.cwd === "string" && samePath(event.cwd, snapshot.root)) matchesRepository = true;
    if (event.type === "ai-title" && typeof event.aiTitle === "string") title = event.aiTitle;
    if (event.isSidechain !== true && typeof event.uuid === "string") {
      events.set(event.uuid, event);
      leafId = event.uuid;
    }
  }
  if (!matchesRepository) throw new Error("This conversation belongs to a different repository.");
  const activeEvents: Record<string, unknown>[] = [];
  const visited = new Set<string>();
  while (leafId && !visited.has(leafId)) {
    visited.add(leafId);
    const event = events.get(leafId);
    if (!event) break;
    activeEvents.push(event);
    leafId = typeof event.parentUuid === "string" ? event.parentUuid : null;
  }
  activeEvents.reverse();
  for (const event of activeEvents) {
    const message = record(event.message);
    if (event.type === "user" && event.isMeta !== true) {
      const content = typeof message?.content === "string"
        ? message.content
        : (Array.isArray(message?.content) ? message.content : []).flatMap((partValue): string[] => {
            const part = record(partValue);
            return part?.type === "text" && typeof part.text === "string" ? [part.text] : [];
          }).join("\n\n");
      appendConversationMessage(messages, "user", content);
      continue;
    }
    if (event.type !== "assistant") continue;
    if (typeof message?.model === "string") model = message.model;
    const text = (Array.isArray(message?.content) ? message.content : []).flatMap((partValue): string[] => {
      const part = record(partValue);
      return part?.type === "text" && typeof part.text === "string" ? [part.text] : [];
    }).join("\n\n");
    appendConversationMessage(messages, "assistant", text);
  }
  return { id: sessionId, title, model, messages };
}

async function assertAgentSessionRepository(id: AgentId, sessionId: string, repositoryRoot: string): Promise<void> {
  if (id === "opencode") {
    const command = await resolveAgentCommand(id);
    if (!command) throw new Error("OpenCode is not installed or is not on PATH.");
    const output = await execute(command, ["session", "list", "--format", "json"], repositoryRoot);
    const sessions: unknown = JSON.parse(output || "[]");
    const match = Array.isArray(sessions) && sessions.some((value) => {
      const session = record(value);
      return session?.id === sessionId && typeof session.directory === "string" && samePath(session.directory, repositoryRoot);
    });
    if (!match) throw new Error("This conversation does not belong to the open repository.");
    return;
  }
  const projectName = resolve(repositoryRoot).replace(/[^a-zA-Z0-9]/g, "-");
  const path = join(homedir(), ".claude", "projects", projectName, `${sessionId}.jsonl`);
  if (!await readClaudeSessionTitle(path, repositoryRoot)) {
    throw new Error("This conversation does not belong to the open repository.");
  }
}

async function runAgent(runId: string, id: AgentId, model: string | null, prompt: string, sessionId?: string): Promise<AgentRunResult> {
  const repositoryRoot = snapshot?.root;
  if (!repositoryRoot) throw new Error("No repository is open.");
  if (sessionId) await assertAgentSessionRepository(id, sessionId, repositoryRoot);
  const command = await resolveAgentCommand(id);
  if (!command) {
    throw new Error(id === "claude"
      ? "Claude Code is unavailable. The claude executable is missing or invalid; if 'claude --version' reports Bun, reinstall Claude Code."
      : `${AGENTS[id].label} is not installed or is not on PATH.`);
  }
  let lineBuffer = "";
  let pendingResult: AgentRunResult = { tools: [], explanation: "" };
  let streamTimer: NodeJS.Timeout | null = null;
  const emit = (): void => {
    streamTimer = null;
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
    const event: AgentStreamEvent = { runId, result: pendingResult };
    pendingResult = { tools: [], explanation: "" };
    mainWindow.webContents.send("agent:event", event);
  };
  const agent = AGENTS[id];
  let output: string;
  try {
    output = await executeAgent(command, agent.args(prompt, model, sessionId), repositoryRoot, (chunk) => {
      lineBuffer += chunk;
      const lastNewline = Math.max(lineBuffer.lastIndexOf("\n"), lineBuffer.lastIndexOf("\r"));
      if (lastNewline < 0) return;
      const completeLines = lineBuffer.slice(0, lastNewline + 1);
      lineBuffer = lineBuffer.slice(lastNewline + 1);
      pendingResult = mergeAgentResults(pendingResult, parseAgentOutput(id, completeLines, false));
      if (!streamTimer) streamTimer = setTimeout(emit, 80);
    }, agent.promptViaStdin ? prompt : undefined);
  } catch (reason) {
    if (streamTimer) clearTimeout(streamTimer);
    throw normalizeAgentError(id, reason);
  }
  if (streamTimer) clearTimeout(streamTimer);
  return parseAgentOutput(id, output);
}

function mergeAgentResults(current: AgentRunResult, update: AgentRunResult): AgentRunResult {
  const tools = new Map(current.tools.map((tool) => [tool.id, tool]));
  for (const tool of update.tools) {
    const existing = tools.get(tool.id);
    tools.set(tool.id, {
      ...existing,
      ...tool,
      name: tool.name || existing?.name || "Tool",
      detail: tool.detail ?? existing?.detail
    });
  }
  return {
    tools: [...tools.values()],
    explanation: [current.explanation, update.explanation].filter(Boolean).join(""),
    sessionId: update.sessionId ?? current.sessionId
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function toolDetail(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  try {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    return serialized.length > 180 ? `${serialized.slice(0, 177)}...` : serialized;
  } catch {
    return undefined;
  }
}

function parseAgentOutput(id: AgentId, output: string, complete = true): AgentRunResult {
  const events = output.split(/\r?\n/).flatMap((line) => {
    try {
      const parsed = JSON.parse(line);
      return Array.isArray(parsed)
        ? parsed.map(record).filter((event): event is Record<string, unknown> => event !== null)
        : [record(parsed)].filter((event): event is Record<string, unknown> => event !== null);
    } catch {
      return [];
    }
  });

  const tools = new Map<string, AgentToolEvent>();
  const text: string[] = [];
  let streamedText = "";
  let explanation = "";
  let sessionId: string | undefined;

  for (const event of events) {
    const data = record(event.data);
    const eventSessionId = event.sessionID ?? event.session_id ?? data?.sessionID ?? data?.session_id;
    if (typeof eventSessionId === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(eventSessionId)) sessionId = eventSessionId;
    if (id === "opencode") {
      const part = record(event.part) ?? record(data?.part);
      if (part?.type === "tool") {
        const state = record(part.state) ?? record(data?.state) ?? record(event.state);
        const toolId = String(part.callID ?? part.id ?? tools.size);
        tools.set(toolId, {
          id: toolId,
          name: String(part.tool ?? data?.tool ?? event.tool ?? "Tool"),
          status: state?.status === "error" ? "failed" : state?.status === "completed" ? "completed" : "running",
          detail: toolDetail(state?.input)
        });
      }
      const eventText = part?.text ?? event.text ?? data?.text;
      if ((part?.type === "text" || event.type === "text") && typeof eventText === "string" && eventText.trim()) {
        text.push(eventText.trim());
      }
      continue;
    }

    if (event.type === "result" && typeof event.result === "string") explanation = event.result.trim();
    const streamEvent = record(event.event);
    const delta = record(streamEvent?.delta);
    if (streamEvent?.type === "content_block_delta" && delta?.type === "text_delta" && typeof delta.text === "string") {
      streamedText += delta.text;
    }
    const message = record(event.message);
    const content = Array.isArray(message?.content) ? message.content : [];
    for (const itemValue of content) {
      const item = record(itemValue);
      if (!item) continue;
      if (item.type === "tool_use") {
        const toolId = String(item.id ?? tools.size);
        tools.set(toolId, {
          id: toolId,
          name: String(item.name ?? "Tool"),
          status: "running",
          detail: toolDetail(item.input)
        });
      }
      if (item.type === "tool_result") {
        const toolId = String(item.tool_use_id ?? "");
        const existing = tools.get(toolId);
        tools.set(toolId, {
          id: toolId,
          name: existing?.name ?? "",
          status: item.is_error ? "failed" : "completed",
          detail: existing?.detail
        });
      }
    }
  }

  if (!explanation) explanation = streamedText || text.filter(Boolean).join("\n\n").trim();
  if (!explanation && events.length === 0) explanation = output.trim();
  return {
    tools: [...tools.values()],
    explanation: explanation || (complete ? "The agent completed without a text explanation." : ""),
    sessionId
  };
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (event.sender !== mainWindow?.webContents) throw new Error("Unauthorized IPC sender.");
}

function watchRepository(root: string): void {
  if (watcher && watchedRoot === root) return;
  watcher?.close();
  watchedRoot = root;

  const onChange = (_event: string, filename: string | Buffer | null): void => {
    const relative = filename?.toString() ?? "";
    if (/(^|[\\/])(node_modules|out|app-out|dist|release|\.git[\\/]objects)([\\/]|$)/.test(relative)) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => mainWindow?.webContents.send("repository:changed"), 180);
  };

  try {
    watcher = watch(root, { recursive: true }, onChange);
  } catch {
    watcher = watch(root, onChange);
  }
}

function queueRepositoryLoad(path: string, comparisonId: string, generation: number): Promise<RepositorySnapshot> {
  const load = repositoryLoadQueue.then(() => loadRepository(path, comparisonId));
  repositoryLoadQueue = load.then(() => undefined, () => undefined);
  return load.then((loaded) => {
    if (repositoryGeneration === generation) {
      snapshot = loaded;
      currentRepositoryPath = loaded.root;
      if (activeComparisonId === comparisonId) activeComparisonId = loaded.comparisonId;
    }
    return loaded;
  });
}

async function openRepository(path: string): Promise<RepositorySnapshot> {
  const previousPath = currentRepositoryPath;
  const previousComparisonId = activeComparisonId;
  const generation = ++repositoryGeneration;
  currentRepositoryPath = path;
  activeComparisonId = "auto";
  try {
    const loaded = await queueRepositoryLoad(path, activeComparisonId, generation);
    if (repositoryGeneration === generation) {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = null;
      watchRepository(loaded.root);
    }
    return loaded;
  } catch (error) {
    if (repositoryGeneration === generation) {
      currentRepositoryPath = previousPath;
      activeComparisonId = previousComparisonId;
    }
    throw error;
  }
}

function registerIpc(): void {
  ipcMain.handle("window:set-theme", (event, theme: unknown) => {
    assertTrustedSender(event);
    if (theme !== "dark" && theme !== "light") throw new Error("Invalid window theme.");
    if (process.platform !== "win32" || !mainWindow) return;
    mainWindow.setTitleBarOverlay(theme === "dark"
      ? { color: "#0f1216", symbolColor: "#d9dde5", height: 44 }
      : { color: "#f7f9fb", symbolColor: "#20262d", height: 44 });
  });

  ipcMain.handle("repository:open", async (_event, path?: string) => {
    return openRepository(path || initialRepository || process.cwd());
  });

  ipcMain.handle("repository:refresh", async () => {
    if (!currentRepositoryPath) throw new Error("No repository is open.");
    return queueRepositoryLoad(currentRepositoryPath, activeComparisonId, repositoryGeneration);
  });

  ipcMain.handle("repository:compare", async (_event, comparisonId: string) => {
    if (!currentRepositoryPath) throw new Error("No repository is open.");
    if (!snapshot?.comparisons.some((option) => option.id === comparisonId)) {
      throw new Error(`Unknown comparison: ${comparisonId}`);
    }
    const previousComparisonId = activeComparisonId;
    activeComparisonId = comparisonId;
    try {
      return await queueRepositoryLoad(currentRepositoryPath, comparisonId, repositoryGeneration);
    } catch (error) {
      activeComparisonId = previousComparisonId;
      throw error;
    }
  });

  ipcMain.handle("repository:patch", async (_event, path: string) => {
    if (!snapshot) throw new Error("No repository is open.");
    activePatchController?.abort();
    const controller = new AbortController();
    activePatchController = controller;
    const patchSnapshot = snapshot;
    try {
      return await loadFilePatch(patchSnapshot, path, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return { path, patch: "", binary: false };
      throw error;
    } finally {
      if (activePatchController === controller) activePatchController = null;
    }
  });

  ipcMain.handle("repository:choose", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "Open Git repository",
      properties: ["openDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return openRepository(result.filePaths[0]);
  });

  ipcMain.handle("agent:list", (event) => {
    assertTrustedSender(event);
    return listAgents();
  });

  ipcMain.handle("agent:models", (event, id: unknown) => {
    assertTrustedSender(event);
    if (typeof id !== "string" || !Object.hasOwn(AGENTS, id)) throw new Error(`Unsupported agent: ${String(id)}`);
    return listAgentModels(id as AgentId);
  });

  ipcMain.handle("agent:sessions", (event, id: unknown) => {
    assertTrustedSender(event);
    if (typeof id !== "string" || !Object.hasOwn(AGENTS, id)) throw new Error(`Unsupported agent: ${String(id)}`);
    return listAgentSessions(id as AgentId);
  });

  ipcMain.handle("agent:session", (event, id: unknown, sessionId: unknown) => {
    assertTrustedSender(event);
    if (typeof id !== "string" || !Object.hasOwn(AGENTS, id)) throw new Error(`Unsupported agent: ${String(id)}`);
    if (typeof sessionId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(sessionId)) throw new Error("Invalid agent session identifier.");
    return getAgentSession(id as AgentId, sessionId);
  });

  ipcMain.handle("agent:run", (event, runId: unknown, id: unknown, model: unknown, prompt: unknown, sessionId: unknown) => {
    assertTrustedSender(event);
    if (typeof runId !== "string" || !runId || runId.length > 100) throw new Error("Invalid agent run identifier.");
    if (typeof id !== "string" || !Object.hasOwn(AGENTS, id)) throw new Error(`Unsupported agent: ${String(id)}`);
    if (model !== null && (typeof model !== "string" || model.length > 200)) throw new Error("Invalid agent model.");
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 100_000) {
      throw new Error("The agent prompt is empty or too large.");
    }
    if (sessionId !== undefined && (typeof sessionId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(sessionId))) {
      throw new Error("Invalid agent session identifier.");
    }
    return runAgent(runId, id as AgentId, model as string | null, prompt, sessionId as string | undefined);
  });

  ipcMain.handle("agent:cancel", (event) => {
    assertTrustedSender(event);
    if (activeAgentProcess) {
      agentCancellationRequested = true;
      activeAgentProcess.kill("SIGKILL");
    }
  });

  ipcMain.handle("clipboard:write", (event, text: string) => {
    assertTrustedSender(event);
    if (typeof text !== "string" || text.length > 1_000_000) throw new Error("Clipboard content is too large.");
    clipboard.writeText(text);
  });

}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: "#0b0d10",
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    titleBarOverlay: process.platform === "win32"
      ? { color: "#0f1216", symbolColor: "#d9dde5", height: 44 }
      : false,
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (process.platform === "darwin") app.focus({ steal: true });
    mainWindow?.focus();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const requested = repositoryArgument(argv);
    if (requested && existsSync(requested)) {
      void openRepository(resolve(requested)).then(() => mainWindow?.webContents.send("repository:changed"));
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(process.platform === "darwin"
      ? Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }])
      : null);
    registerIpc();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  watcher?.close();
});
