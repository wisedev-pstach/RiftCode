import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import chokidar, { type FSWatcher } from "chokidar";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadFilePatch, loadRepository } from "./git";
import type { RepositorySnapshot } from "../shared/contracts";

let mainWindow: BrowserWindow | null = null;
let snapshot: RepositorySnapshot | null = null;
let watcher: FSWatcher | null = null;
let refreshTimer: NodeJS.Timeout | null = null;
let activeComparisonId = "working-tree";
let repositoryLoadQueue = Promise.resolve();
let repositoryGeneration = 0;
let currentRepositoryPath: string | null = null;
const initialRepository = repositoryArgument(process.argv);

function repositoryArgument(argv: string[]): string | undefined {
  const explicit = argv.find((argument) => argument.startsWith("--repository="));
  if (explicit) return explicit.slice("--repository=".length);
  return undefined;
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
