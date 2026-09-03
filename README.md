# Rift

Install Rift directly from GitHub. Node.js 24+ is required.

## Windows

Run in PowerShell:

```powershell
irm https://raw.githubusercontent.com/wisedev-pstach/RiftCode/main/install.ps1 | iex
```

Open a new terminal and run `rift <repository-path>`.

## macOS

Run in a shell:

```sh
curl -fsSL https://raw.githubusercontent.com/wisedev-pstach/RiftCode/main/install.sh | sh
```

Ensure `~/.local/bin` is on `PATH`, then run `rift <repository-path>`.

## Releases

The current app version and its release notes live in `version.json`. Update both `version.json` and the `version` fields in `package.json` and `package-lock.json` for each release. Rift checks the repository manifest at startup and offers to run the platform installer when a newer semantic version is available.
