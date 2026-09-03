# Rift

Install Rift directly from GitHub. The installer downloads the source, builds Rift, and adds the `rift` command to your user profile. Node.js 24+ is required.

## Windows

Run in PowerShell:

```powershell
$d=Join-Path $env:TEMP "rift-install-$([guid]::NewGuid())"; New-Item -ItemType Directory -Path $d | Out-Null; try { Invoke-WebRequest https://github.com/wisedev-pstach/RiftCode/archive/refs/heads/main.zip -OutFile "$d\rift.zip"; Expand-Archive "$d\rift.zip" -DestinationPath $d; & "$d\RiftCode-main\install.ps1" } finally { Remove-Item $d -Recurse -Force -ErrorAction SilentlyContinue }
```

Open a new terminal and run `rift <repository-path>`.

## macOS

Run in a shell:

```sh
d="$(mktemp -d)"; trap 'rm -rf "$d"' EXIT; curl -fsSL https://github.com/wisedev-pstach/RiftCode/archive/refs/heads/main.tar.gz | tar -xz -C "$d" && sh "$d/RiftCode-main/install.sh"
```

Ensure `~/.local/bin` is on `PATH`, then run `rift <repository-path>`.
