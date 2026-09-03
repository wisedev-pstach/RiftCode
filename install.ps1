[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$scriptRoot = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) { (Get-Location).Path } else { $PSScriptRoot }

if (-not (Test-Path -LiteralPath (Join-Path $scriptRoot "package.json"))) {
    $bootstrapRoot = Join-Path ([IO.Path]::GetTempPath()) "rift-source-$([guid]::NewGuid())"
    $archive = Join-Path $bootstrapRoot "rift.zip"
    $sourceRoot = Join-Path $bootstrapRoot "RiftCode-main"
    New-Item -ItemType Directory -Path $bootstrapRoot | Out-Null
    try {
        Invoke-WebRequest "https://github.com/wisedev-pstach/RiftCode/archive/refs/heads/main.zip" -OutFile $archive
        Expand-Archive -LiteralPath $archive -DestinationPath $bootstrapRoot
        & (Join-Path $sourceRoot "install.ps1")
        return
    }
    finally {
        Remove-Item -LiteralPath $bootstrapRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory)]
        [string] $Command,
        [Parameter(ValueFromRemainingArguments)]
        [string[]] $Arguments
    )

    & $Command @Arguments
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE."
    }
}

function Stop-InstalledRift {
    param(
        [Parameter(Mandatory)]
        [string] $InstallPath
    )

    $installPrefix = $InstallPath.TrimEnd("\") + "\"
    $processes = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        try {
            $_.Path -and
                $_.Path.StartsWith($installPrefix, [StringComparison]::OrdinalIgnoreCase) -and
                [string]::Equals((Split-Path -Leaf $_.Path), "Rift.exe", [StringComparison]::OrdinalIgnoreCase)
        }
        catch {
            $false
        }
    })
    if ($processes.Count -eq 0) {
        return
    }

    Write-Host "Closing the installed Rift instance..."
    foreach ($process in $processes) {
        try {
            if (-not $process.HasExited -and $process.MainWindowHandle -ne 0) {
                $null = $process.CloseMainWindow()
            }
        }
        catch {
            # The process exited between enumeration and the close request.
        }
    }

    Start-Sleep -Milliseconds 800
    foreach ($process in $processes) {
        $remaining = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
        if (-not $remaining) {
            continue
        }
        try {
            if ($remaining.Path -and
                $remaining.Path.StartsWith($installPrefix, [StringComparison]::OrdinalIgnoreCase) -and
                [string]::Equals((Split-Path -Leaf $remaining.Path), "Rift.exe", [StringComparison]::OrdinalIgnoreCase)) {
                Stop-Process -InputObject $remaining -Force -ErrorAction SilentlyContinue
            }
        }
        catch {
            # The process exited while its identity was being revalidated.
        }
    }
}

function Get-LockingProcessDescription {
    param(
        [Parameter(Mandatory)]
        [string] $Path
    )

    if (-not ("RiftRestartManager" -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class RiftRestartManager
{
    [StructLayout(LayoutKind.Sequential)]
    private struct UniqueProcess
    {
        public int ProcessId;
        public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct ProcessInfo
    {
        public UniqueProcess Process;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string AppName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string ServiceShortName;
        public uint ApplicationType;
        public uint AppStatus;
        public uint SessionId;
        [MarshalAs(UnmanagedType.Bool)] public bool Restartable;
    }

    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    private static extern int RmStartSession(out uint handle, int flags, StringBuilder sessionKey);

    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    private static extern int RmRegisterResources(
        uint handle,
        uint fileCount,
        string[] fileNames,
        uint applicationCount,
        UniqueProcess[] applications,
        uint serviceCount,
        string[] serviceNames);

    [DllImport("rstrtmgr.dll")]
    private static extern int RmGetList(
        uint handle,
        out uint processesNeeded,
        ref uint processCount,
        [In, Out] ProcessInfo[] processes,
        ref uint rebootReasons);

    [DllImport("rstrtmgr.dll")]
    private static extern int RmEndSession(uint handle);

    public static int[] GetProcessIds(string path)
    {
        uint handle;
        var sessionKey = new StringBuilder(64);
        var result = RmStartSession(out handle, 0, sessionKey);
        if (result != 0) return new int[0];

        try
        {
            result = RmRegisterResources(handle, 1, new[] { path }, 0, null, 0, null);
            if (result != 0) return new int[0];

            uint needed = 0;
            uint count = 0;
            uint reasons = 0;
            result = RmGetList(handle, out needed, ref count, null, ref reasons);
            if (result == 0) return new int[0];
            if (result != 234) return new int[0];

            var processInfo = new ProcessInfo[needed];
            count = needed;
            result = RmGetList(handle, out needed, ref count, processInfo, ref reasons);
            if (result != 0) return new int[0];

            var ids = new int[count];
            for (var index = 0; index < count; index++)
            {
                ids[index] = processInfo[index].Process.ProcessId;
            }
            return ids;
        }
        finally
        {
            RmEndSession(handle);
        }
    }
}
'@
    }

    $descriptions = @([RiftRestartManager]::GetProcessIds($Path) | ForEach-Object {
        $process = Get-Process -Id $_ -ErrorAction SilentlyContinue
        if ($process) {
            "$($process.ProcessName).exe (PID $($process.Id))"
        }
    })
    return $descriptions -join ", "
}

function Remove-InstallDirectory {
    param(
        [Parameter(Mandatory)]
        [string] $Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    for ($attempt = 1; $attempt -le 5; $attempt++) {
        try {
            Remove-Item -LiteralPath $Path -Recurse -Force
            return
        }
        catch {
            if ($attempt -eq 5) {
                $removeError = $_.Exception.Message
                $lockFile = Join-Path $Path "resources\app.asar"
                $lockingProcesses = ""
                try {
                    if (Test-Path -LiteralPath $lockFile) {
                        $lockingProcesses = Get-LockingProcessDescription -Path $lockFile
                    }
                }
                catch {
                    # Lock diagnostics are best effort; preserve the original installation error.
                }
                $lockMessage = if ($lockingProcesses) {
                    " Locked by $lockingProcesses. Close that application and rerun this installer from a standalone PowerShell window."
                }
                else {
                    " Close any Rift windows and try again."
                }
                throw "Could not replace the existing Rift installation at '$Path'.$lockMessage $removeError"
            }
            Stop-InstalledRift -InstallPath $Path
            Start-Sleep -Milliseconds (300 * $attempt)
        }
    }
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "Node.js 24 or newer is required."
}

$root = $scriptRoot
$destination = Join-Path $env:LOCALAPPDATA "Programs\Rift"
$binDestination = Join-Path $destination "bin"

Push-Location $root
try {
    Invoke-Checked npm.cmd ci
    Invoke-Checked npm.cmd run package:win
}
finally {
    Pop-Location
}

$packagedApp = Get-ChildItem -LiteralPath (Join-Path $root "release") -Directory -Filter "win*unpacked" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $packagedApp -or -not (Test-Path -LiteralPath (Join-Path $packagedApp.FullName "Rift.exe"))) {
    throw "The packaged Rift.exe was not found under $root\release."
}

$destinationParent = Split-Path -Parent $destination
New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
Stop-InstalledRift -InstallPath $destination
Remove-InstallDirectory -Path $destination
Copy-Item -LiteralPath $packagedApp.FullName -Destination $destination -Recurse
New-Item -ItemType Directory -Path $binDestination -Force | Out-Null
$launcher = @'
param([string] $Repository = ".")

$repositoryPath = (Resolve-Path -LiteralPath $Repository -ErrorAction Stop).Path
$executable = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\Rift.exe") -ErrorAction Stop).Path
Start-Process -FilePath $executable -ArgumentList "--repository=`"$repositoryPath`""
'@
Set-Content -LiteralPath (Join-Path $binDestination "rift.ps1") -Value $launcher -Encoding UTF8

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$pathEntries = @($userPath -split ";" | Where-Object { $_ })
$hasBinPath = $pathEntries | Where-Object {
    [string]::Equals($_.TrimEnd("\"), $binDestination.TrimEnd("\"), [StringComparison]::OrdinalIgnoreCase)
}
if (-not $hasBinPath) {
    $newPath = (@($pathEntries) + $binDestination) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
}

Write-Host "Rift was installed at $destination"
Write-Host "Existing Rift data is retained; incompatible saved selections are migrated when Rift starts."
Write-Host "Open a new terminal, then run: rift <repository-path>"
