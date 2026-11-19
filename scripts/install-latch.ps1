# Install latch for the current user on Windows.
#
# One shim serves both cmd.exe and PowerShell: PATH resolution finds .CMD from
# either, and PowerShell's execution policy blocks .ps1 rather than .cmd, so
# this is the form that actually runs without a policy change.
#
#   bun run latch:build
#   powershell -ExecutionPolicy Bypass -File scripts\install-latch.ps1
#
#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root "dist-latch\latch.mjs"

if (-not (Test-Path $src)) {
  throw "latch: build first - bun run latch:build"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "latch: node not found on PATH (needs node 18 or newer)"
}

$dest = Join-Path $env:LOCALAPPDATA "Latch"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item $src (Join-Path $dest "latch.mjs") -Force

$shim = "@echo off`r`nnode `"%~dp0latch.mjs`" %*`r`n"
Set-Content -Path (Join-Path $dest "latch.cmd") -Value $shim -Encoding ASCII -NoNewline

Write-Host "installed: $dest\latch.cmd"

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -like "*$dest*") {
  Write-Host "on PATH - run: latch help"
} else {
  Write-Host ""
  Write-Host "not on PATH yet. add it for your user (one line):"
  Write-Host ""
  Write-Host "  [Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User') + ';$dest', 'User')"
  Write-Host ""
  Write-Host "then open a new terminal. This script does not edit your PATH itself."
}
