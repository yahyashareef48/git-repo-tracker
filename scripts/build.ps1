<#
.SYNOPSIS
  Builds GitDeck: the tray companion, the full window, and an NSIS installer.

.DESCRIPTION
  GitDeck ships as two binaries. GitDeckTray.exe is the half that runs all day:
  a tray icon, a repository poller and a compact panel drawn without a browser.
  GitDeck.exe is the full window and is launched on demand, so its WebView2
  engine is only resident while someone is actually reading a diff.

  The tray is built first, because the installer packages it alongside the
  window out of build\bin.

  The version lives in wails.json and is read from there, so the number baked
  into both binaries, the installer and the update check cannot drift apart.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\build.ps1
#>

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Tooling, scoped to this process.
$go = 'C:\Program Files\Go\bin'
$nsis = 'C:\Program Files (x86)\NSIS'
$gobin = Join-Path $env:USERPROFILE 'go\bin'
$env:Path = "$go;$nsis;$env:Path;$gobin"

# Neither binary needs cgo. Saying so keeps a stray gcc on PATH from quietly
# changing how they are built.
$env:CGO_ENABLED = '0'

foreach ($tool in @('go', 'wails')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "$tool is not on PATH. See README.md for the one-time setup."
    }
}

$version = (Get-Content 'wails.json' -Raw | ConvertFrom-Json).info.productVersion
if (-not $version) { throw 'wails.json has no info.productVersion' }

Write-Host "Building GitDeck $version" -ForegroundColor Cyan

# main.go embeds frontend/dist, which does not exist in a fresh clone, so
# anything that compiles the root package fails before Wails ever builds the
# frontend. A placeholder keeps vet and test honest; Wails overwrites it.
if (-not (Test-Path 'frontend\dist\index.html')) {
    New-Item -ItemType Directory -Force 'frontend\dist' | Out-Null
    Set-Content 'frontend\dist\index.html' '<!doctype html>' -Encoding utf8
}

# Fail before packaging rather than after, so a broken build never produces an
# installer that looks fine.
go vet ./...
if ($LASTEXITCODE -ne 0) { throw 'go vet failed' }
go test ./internal/...
if ($LASTEXITCODE -ne 0) { throw 'tests failed' }

Push-Location frontend
try {
    # A fresh clone has no node_modules, and npx would then try to fetch
    # TypeScript on the fly instead of typechecking.
    if (-not (Test-Path 'node_modules')) {
        npm install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
    }
    npx tsc --noEmit
    if ($LASTEXITCODE -ne 0) { throw 'the frontend does not typecheck' }
} finally { Pop-Location }

# Anything still running holds its own file open and fails the build.
Get-Process GitDeck, GitDeckTray -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

New-Item -ItemType Directory -Force 'build\bin' | Out-Null

# -H windowsgui keeps a console window from flashing behind the tray icon.
Write-Host 'Building the tray companion' -ForegroundColor DarkGray
go build -trimpath -ldflags "-H windowsgui -s -w -X main.version=$version" `
    -o 'build\bin\GitDeckTray.exe' ./cmd/traydeck
if ($LASTEXITCODE -ne 0) { throw 'the tray build failed' }

Write-Host 'Building the window' -ForegroundColor DarkGray
$hasNsis = $null -ne (Get-Command makensis -ErrorAction SilentlyContinue)
if ($hasNsis) {
    wails build -nsis -ldflags "-X main.version=$version"
} else {
    Write-Warning 'NSIS not found — building the portable exes only.'
    wails build -ldflags "-X main.version=$version"
}
if ($LASTEXITCODE -ne 0) { throw 'wails build failed' }

Write-Host ''
Get-ChildItem 'build\bin' |
    Select-Object Name, @{ n = 'MB'; e = { [math]::Round($_.Length / 1MB, 2) } } |
    Format-Table -AutoSize
