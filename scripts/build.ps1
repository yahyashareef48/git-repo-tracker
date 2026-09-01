<#
.SYNOPSIS
  Builds GitDeck: a portable exe and an NSIS installer.

.DESCRIPTION
  The version lives in wails.json and is read from there, so the number baked
  into the binary, the installer and the update check can never drift apart.

  Go and NSIS are put on PATH for this process only — neither needs to be there
  permanently for the app to build.

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

foreach ($tool in @('go', 'wails')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "$tool is not on PATH. See README.md for the one-time setup."
    }
}

$version = (Get-Content 'wails.json' -Raw | ConvertFrom-Json).info.productVersion
if (-not $version) { throw 'wails.json has no info.productVersion' }

Write-Host "Building GitDeck $version" -ForegroundColor Cyan

# Fail before packaging rather than after, so a broken build never produces an
# installer that looks fine.
go vet ./...
if ($LASTEXITCODE -ne 0) { throw 'go vet failed' }
go test ./internal/...
if ($LASTEXITCODE -ne 0) { throw 'tests failed' }

Push-Location frontend
try {
    npx tsc --noEmit
    if ($LASTEXITCODE -ne 0) { throw 'the frontend does not typecheck' }
} finally { Pop-Location }

$hasNsis = $null -ne (Get-Command makensis -ErrorAction SilentlyContinue)
if ($hasNsis) {
    wails build -clean -nsis -ldflags "-X main.version=$version"
} else {
    Write-Warning 'NSIS not found — building the portable exe only.'
    wails build -clean -ldflags "-X main.version=$version"
}
if ($LASTEXITCODE -ne 0) { throw 'wails build failed' }

Write-Host ''
Get-ChildItem 'build\bin' |
    Select-Object Name, @{ n = 'MB'; e = { [math]::Round($_.Length / 1MB, 2) } } |
    Format-Table -AutoSize
