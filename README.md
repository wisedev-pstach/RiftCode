# Rift

Rift is a local desktop workspace for reviewing the complete diff between a Git branch and its base.

## Development

Requirements:

- macOS
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

Build the macOS installer:

```bash
npm run dist:mac
```

Open `dist/Rift-0.1.0-arm64.dmg` and drag Rift into Applications. Launch Rift once, then use **Install CLI** in its title bar to install `rift` into `~/.local/bin`.

Ensure `~/.local/bin` is on `PATH`, then open any repository with:

```bash
cd /path/to/repository
rift
```

The local development build is not code-signed or notarized. Public distribution will require an Apple Developer ID certificate and notarization credentials.

## Checks

```bash
npm run typecheck
npm run build
npm audit
```
