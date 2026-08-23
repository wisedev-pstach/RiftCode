import { app, BrowserWindow, dialog, ipcMain } from "electron";
import chokidar, { type FSWatcher } from "chokidar";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadFilePatch, loadRepository } from "./git";
import type { RepositorySnapshot } from "../shared/contracts";

let mainWindow: BrowserWindow | null = null;
let snapshot: RepositorySnapshot | null = null;
let watcher: FSWatcher | null = null;
let refreshTimer: NodeJS.Timeout | null = null;
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
      return /\/(node_modules|out|dist|\.git\/objects)(\/|$)/.test(relative);
    }
  });

  watcher.on("all", () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => mainWindow?.webContents.send("repository:changed"), 180);
  });
}

async function openRepository(path: string): Promise<RepositorySnapshot> {
  snapshot = await loadRepository(path);
  await watchRepository(snapshot.root);
  return snapshot;
}

function registerIpc(): void {
  ipcMain.handle("repository:open", async (_event, path?: string) => {
    return openRepository(path || initialRepository || process.cwd());
  });

  ipcMain.handle("repository:refresh", async () => {
    if (!snapshot) throw new Error("No repository is open.");
    snapshot = await loadRepository(snapshot.root);
    return snapshot;
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

  ipcMain.handle("app:install-cli", async () => {
    const destination = join(app.getPath("home"), ".local", "bin", "rift");
    const script = app.isPackaged
      ? packagedCliScript()
      : `#!/bin/sh\n# Rift CLI launcher\nexec node '${join(app.getAppPath(), "bin", "rift.cjs").replaceAll("'", "'\\''")}' "$@"\n`;
    if (existsSync(destination)) {
      const existing = await readFile(destination, "utf8");
      if (!existing.includes("# Rift CLI launcher")) {
        throw new Error(`${destination} already exists and was not created by Rift.`);
      }
    }
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, script, "utf8");
    await chmod(destination, 0o755);
    return destination;
  });
}

function packagedCliScript(): string {
  const appBundle = resolve(dirname(process.execPath), "../..").replaceAll("'", "'\\''");
  return `#!/bin/sh\n# Rift CLI launcher\nREPOSITORY="\${1:-$PWD}"\nopen -a '${appBundle}' --args "--repository=$REPOSITORY"\n`;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: "#0b0d10",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
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
