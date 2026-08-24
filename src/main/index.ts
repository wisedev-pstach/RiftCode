import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu } from "electron";
import chokidar, { type FSWatcher } from "chokidar";
import { execFile } from "node:child_process";
import type { ChildProcess, ExecFileException } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadFilePatch, loadRepository } from "./git";
import type { IpcMainInvokeEvent } from "electron";
import type { AgentId, AgentOption, AgentRunResult, RepositorySnapshot } from "../shared/contracts";

const AGENTS: Readonly<Record<AgentId, { label: string; args: (prompt: string) => string[] }>> = {
  opencode: { label: "OpenCode", args: (prompt) => ["run", "--pure", "--agent", "plan", prompt] },
  claude: {
    label: "Claude Code",
    args: (prompt) => ["--print", "--permission-mode", "plan", "--tools", "Read,Grep,Glob", prompt]
  }
};

let mainWindow: BrowserWindow | null = null;
let snapshot: RepositorySnapshot | null = null;
let watcher: FSWatcher | null = null;
let refreshTimer: NodeJS.Timeout | null = null;
let activeComparisonId = "working-tree";
let repositoryLoadQueue = Promise.resolve();
let repositoryGeneration = 0;
let currentRepositoryPath: string | null = null;
let activeAgentProcess: ChildProcess | null = null;
const initialRepository = repositoryArgument(process.argv);

function repositoryArgument(argv: string[]): string | undefined {
  const explicit = argv.find((argument) => argument.startsWith("--repository="));
  if (explicit) return explicit.slice("--repository=".length);
  return undefined;
}

function execute(command: string, args: string[], cwd = process.cwd()): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      command,
      args,
      { cwd, maxBuffer: 10 * 1024 * 1024, timeout: 180_000, windowsHide: true },
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

function executeAgent(command: string, args: string[], cwd: string): Promise<string> {
  if (activeAgentProcess) return Promise.reject(new Error("An agent request is already running."));
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      command,
      args,
      { cwd, maxBuffer: 10 * 1024 * 1024, timeout: 180_000, windowsHide: true },
      (error: ExecFileException | null, stdout, stderr) => {
        activeAgentProcess = null;
        if (error) {
          const message = stderr.trim() || stdout.trim() || (error.killed ? "Agent request was cancelled." : error.message);
          reject(new Error(message));
          return;
        }
        resolvePromise(stdout.trim());
      }
    );
    activeAgentProcess = child;
  });
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
    await resolveCommand(id) ? { id, label: AGENTS[id].label } : null
  )));
  return agents.filter((agent): agent is AgentOption => agent !== null);
}

async function runAgent(id: AgentId, prompt: string): Promise<AgentRunResult> {
  if (!snapshot) throw new Error("No repository is open.");
  const command = await resolveCommand(id);
  if (!command) throw new Error(`${AGENTS[id].label} is not installed or is not on PATH.`);
  return { output: await executeAgent(command, AGENTS[id].args(prompt), snapshot.root) };
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (event.sender !== mainWindow?.webContents) throw new Error("Unauthorized IPC sender.");
}

async function watchRepository(root: string): Promise<void> {
  await watcher?.close();
  watcher = chokidar.watch(root, {
    ignoreInitial: true,
    ignored: (path) => {
      const relative = path.slice(root.length);
      return /[\\/](node_modules|out|dist|\.git[\\/]objects)([\\/]|$)/.test(relative);
    }
  });

  watcher.on("all", () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => mainWindow?.webContents.send("repository:changed"), 180);
  });
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
  activeComparisonId = "working-tree";
  try {
    const loaded = await queueRepositoryLoad(path, activeComparisonId, generation);
    if (repositoryGeneration === generation) {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = null;
      await watchRepository(loaded.root);
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
  ipcMain.handle("repository:open", async (_event, path?: string) => {
    return openRepository(path || initialRepository || process.cwd());
  });

  ipcMain.handle("repository:refresh", async () => {
    if (!currentRepositoryPath) throw new Error("No repository is open.");
    return queueRepositoryLoad(currentRepositoryPath, activeComparisonId, repositoryGeneration);
  });

  ipcMain.handle("repository:compare", async (_event, comparisonId: string) => {
    if (!currentRepositoryPath) throw new Error("No repository is open.");
    activeComparisonId = comparisonId;
    return queueRepositoryLoad(currentRepositoryPath, comparisonId, repositoryGeneration);
  });

  ipcMain.handle("repository:patch", async (_event, path: string) => {
    if (!snapshot) throw new Error("No repository is open.");
    return loadFilePatch(snapshot, path);
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

  ipcMain.handle("agent:run", (event, id: unknown, prompt: unknown) => {
    assertTrustedSender(event);
    if (typeof id !== "string" || !Object.hasOwn(AGENTS, id)) throw new Error(`Unsupported agent: ${String(id)}`);
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 100_000) {
      throw new Error("The agent prompt is empty or too large.");
    }
    return runAgent(id as AgentId, prompt);
  });

  ipcMain.handle("agent:cancel", (event) => {
    assertTrustedSender(event);
    activeAgentProcess?.kill();
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
  void watcher?.close();
});
