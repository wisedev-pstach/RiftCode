# Rift

Rift is a local desktop workspace for reviewing the complete diff between a Git branch and its base.

## Development

Requirements:

- macOS or Windows
- Node.js 24 or newer
- Git

```bash
npm install
npm run dev
```

To launch the development build for a particular repository:

```bash
npm link
rift /path/to/repository
```

## Install

Rift is installed directly from source. The scripts build an unpacked application and copy it into a per-user application directory; they do not create DMGs, MSIs, or other installer packages.

On macOS:

```bash
sh ./install.sh
```

This installs Rift to `~/Applications/Rift.app` and the CLI to `~/.local/bin/rift`. Ensure `~/.local/bin` is on `PATH`.

On Windows, from PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

This installs Rift to `%LOCALAPPDATA%\Programs\Rift` and adds its script-only CLI directory to the user `PATH`. Open a new PowerShell terminal after installation.

Open any repository with:

```bash
cd /path/to/repository
rift
```

These local builds are not code-signed or notarized.

## Checks

```bash
npm run typecheck
npm run build
npm audit
```
