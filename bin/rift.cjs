#!/usr/bin/env node

const { existsSync } = require("node:fs");
const { spawn } = require("node:child_process");
const { resolve } = require("node:path");

const repository = resolve(process.argv[2] || process.cwd());
const appCandidates = [
  process.env.RIFT_APP_PATH,
  "/Applications/Rift.app",
  `${process.env.HOME}/Applications/Rift.app`
].filter(Boolean);
const installedApp = appCandidates.find(existsSync);

if (installedApp) {
  const child = spawn("open", ["-a", installedApp, "--args", `--repository=${repository}`], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  process.exit(0);
}

const projectRoot = resolve(__dirname, "..");
const electron = resolve(projectRoot, "node_modules", ".bin", "electron");
if (existsSync(electron)) {
  const child = spawn(electron, [projectRoot, `--repository=${repository}`], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  process.exit(0);
}

console.error("Rift is not installed. Install Rift.app in /Applications, then run this command again.");
process.exit(1);
