#!/usr/bin/env node

const { existsSync } = require("node:fs");
const { spawn } = require("node:child_process");
const { resolve } = require("node:path");

const repository = resolve(process.argv[2] || process.cwd());
const appCandidates = process.platform === "win32"
  ? [
      process.env.RIFT_APP_PATH,
      process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Programs\\Rift\\Rift.exe`
    ].filter(Boolean)
  : [
      process.env.RIFT_APP_PATH,
      "/Applications/Rift.app",
      `${process.env.HOME}/Applications/Rift.app`
    ].filter(Boolean);
const installedApp = appCandidates.find(existsSync);

if (installedApp) {
  const command = process.platform === "darwin" ? "open" : installedApp;
  const args = process.platform === "darwin"
    ? ["-a", installedApp, "--args", `--repository=${repository}`]
    : [`--repository=${repository}`];
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  process.exit(0);
}

const projectRoot = resolve(__dirname, "..");
let electron;
try {
  electron = require("electron");
} catch {
  electron = undefined;
}
if (typeof electron === "string" && existsSync(electron)) {
  const child = spawn(electron, [projectRoot, `--repository=${repository}`], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  process.exit(0);
}

console.error("Rift is not installed. Run install.sh on macOS or install.ps1 on Windows.");
process.exit(1);
