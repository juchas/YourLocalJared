# YourLocalJared — PowerShell bootstrap for Windows.
#
# One-paste install from a clean Windows 11 VM (pre-installed curl.exe and
# PowerShell 5.1+ are all you need):
#
#   iex (irm https://raw.githubusercontent.com/juchas/YourLocalJared/main/bootstrap.ps1)
#
# Installs Git + Python 3.12 + Ollama via winget, clones the repo to
# $env:YLJ_INSTALL_DIR (default: $env:USERPROFILE\YourLocalJared), then
# hands off to `python install.py`.
#
# Re-runnable: every step is idempotent. If you're already inside a
# cloned repo (pyproject.toml + ylj\ present), the clone step is skipped.

$ErrorActionPreference = 'Stop'

$RepoUrl = 'https://github.com/juchas/YourLocalJared'
if (-not $env:YLJ_INSTALL_DIR) { $InstallDir = Join-Path $env:USERPROFILE 'YourLocalJared' }
else                           { $InstallDir = $env:YLJ_INSTALL_DIR }

function Info  { param($m) Write-Host "[INFO]  $m" -ForegroundColor Blue }
function Ok    { param($m) Write-Host "[OK]    $m" -ForegroundColor Green }
function Warn  { param($m) Write-Host "[WARN]  $m" -ForegroundColor Yellow }
function Fail  { param($m) Write-Host "[FAIL]  $m" -ForegroundColor Red; exit 1 }

function Have  { param($cmd) [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Refresh-Path {
    # After winget installs something the new exes aren't on PATH for this
    # session; re-read machine + user PATH so subsequent `Have` / `&` calls
    # find them without a shell restart.
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

Info "OS: $([System.Environment]::OSVersion.VersionString)"

# ── winget check ────────────────────────────────────────────────────
if (-not (Have winget)) {
    Fail @"
winget not found. On Windows 10 21H1+ and Windows 11 it's pre-installed as
'App Installer'. On older builds: install it from the Microsoft Store:
  https://apps.microsoft.com/detail/9nblggh4nns1
Then re-run this bootstrap.
"@
}
Ok "winget available ($((winget --version) -replace '\s',''))"

function Winget-Install {
    param([string]$Id, [string]$Label)
    # `winget list` is the cheap presence check; it exits 0 if found.
    $null = winget list --id $Id --exact --accept-source-agreements 2>$null
    if ($LASTEXITCODE -eq 0) {
        Ok "$Label already installed"
        return
    }
    Info "Installing $Label via winget (may prompt for UAC)…"
    winget install --id $Id --exact --silent `
        --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        Fail "winget install $Id failed (exit $LASTEXITCODE). Run this script from an elevated PowerShell."
    }
    Ok "$Label installed"
}

Winget-Install 'Git.Git'             'Git'
Winget-Install 'Python.Python.3.12'  'Python 3.12'
Winget-Install 'Ollama.Ollama'       'Ollama'

Refresh-Path

# Resolve python / git — they should be on PATH now after Refresh-Path.
$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $python) { $python = (Get-Command py -ErrorAction SilentlyContinue).Source }
if (-not $python) { Fail "python not found on PATH even after install. Open a new PowerShell and retry." }
Ok "Using Python: $python"

if (-not (Have git)) {
    Fail "git not found on PATH even after install. Open a new PowerShell and retry."
}

# ── Start Ollama if not already running ─────────────────────────────
function Ollama-Running {
    try {
        $null = Invoke-WebRequest -Uri 'http://localhost:11434/api/version' `
            -TimeoutSec 2 -UseBasicParsing
        return $true
    } catch { return $false }
}

if (Ollama-Running) {
    Ok "Ollama daemon is running"
} else {
    Info "Starting Ollama…"
    # The Ollama Windows installer registers a Start-menu shortcut; running
    # `ollama serve` in the background is the reliable way to bring the
    # daemon up inside our session.
    Start-Process -FilePath 'ollama' -ArgumentList 'serve' -WindowStyle Hidden
    # Give it a moment to bind :11434.
    $tries = 0
    while (-not (Ollama-Running) -and $tries -lt 10) {
        Start-Sleep -Seconds 1
        $tries++
    }
    if (Ollama-Running) { Ok "Ollama daemon started" }
    else                { Warn "Ollama didn't come up within 10s — continuing; 'install.py' will report status." }
}

# ── Clone (or reuse) the repo ───────────────────────────────────────
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$inRepo = (Test-Path (Join-Path $scriptDir 'pyproject.toml')) -and (Test-Path (Join-Path $scriptDir 'ylj'))

if ($inRepo) {
    $RepoDir = $scriptDir
    Ok "Running from inside the cloned repo at $RepoDir — skipping git clone"
} elseif (Test-Path (Join-Path $InstallDir '.git')) {
    Info "Repo already cloned at $InstallDir — fetching latest main…"
    git -C $InstallDir fetch origin main --quiet
    git -C $InstallDir checkout main --quiet
    try { git -C $InstallDir pull --ff-only origin main --quiet } catch { Warn "git pull reported no fast-forward" }
    $RepoDir = $InstallDir
    Ok "Updated existing clone at $RepoDir"
} else {
    Info "Cloning $RepoUrl into $InstallDir…"
    $parent = Split-Path $InstallDir -Parent
    if ($parent -and -not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    git clone --depth=1 $RepoUrl $InstallDir
    $RepoDir = $InstallDir
    Ok "Cloned to $RepoDir"
}

# ── Hand off to install.py ──────────────────────────────────────────
Info "Running project setup: $python install.py (in $RepoDir)…"
Set-Location $RepoDir
& $python install.py
$exit = $LASTEXITCODE
exit $exit
