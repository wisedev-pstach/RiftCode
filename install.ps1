[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

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

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "Node.js 24 or newer is required."
}

$root = $PSScriptRoot
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

$packagedApp = Get-ChildItem -LiteralPath (Join-Path $root "dist") -Directory -Filter "win*unpacked" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $packagedApp -or -not (Test-Path -LiteralPath (Join-Path $packagedApp.FullName "Rift.exe"))) {
    throw "The packaged Rift.exe was not found under $root\dist."
}

if (Get-Process -Name "Rift" -ErrorAction SilentlyContinue) {
    throw "Rift is running. Close it before installing or upgrading."
}

$destinationParent = Split-Path -Parent $destination
New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
if (Test-Path -LiteralPath $destination) {
    Remove-Item -LiteralPath $destination -Recurse -Force
}
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
Write-Host "Open a new terminal, then run: rift <repository-path>"
