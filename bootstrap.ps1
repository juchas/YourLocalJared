# YourLocalJared — PowerShell bootstrap for Windows.
#
# One-paste install from a clean Windows 11 VM:
#
#   iex (irm https://raw.githubusercontent.com/juchas/YourLocalJared/main/bootstrap.ps1)
#
# At the top we ask whether you can grant admin rights:
#
#   1) Yes — use winget (faster)
#   2) No — install everything to your user profile (no UAC)
#   3) I'm not sure
#
# Non-interactive overrides (highest wins):
#   $env:YLJ_INSTALL_MODE = 'system' | 'user'
#   -Mode system | user  CLI param
#   No console attached  → default to 'user'
#   %USERPROFILE%\.YourLocalJared\install-mode  remembered from a previous run
#
# Re-runnable: every step is idempotent.

param(
    [ValidateSet('system','user','')] [string] $Mode = ''
)

$ErrorActionPreference = 'Stop'

$RepoUrl         = 'https://github.com/juchas/YourLocalJared'
$RepoTarballUrl  = "$RepoUrl/archive/refs/heads/main.zip"
if (-not $env:YLJ_INSTALL_DIR) { $InstallDir = Join-Path $env:USERPROFILE 'YourLocalJared' }
else                           { $InstallDir = $env:YLJ_INSTALL_DIR }

# Per-user install prefix for no-admin mode. Mirrors the fallback path
# that `ylj/server.py::_resolve_ollama` looks in, so the server finds
# our ollama even without a PATH reshuffle.
$UserPrefix = Join-Path $env:LOCALAPPDATA 'YourLocalJared'
$UserBin    = Join-Path $UserPrefix 'bin'

$ModeMarkerDir  = Join-Path $env:USERPROFILE '.YourLocalJared'
$ModeMarkerFile = Join-Path $ModeMarkerDir 'install-mode'

# Pinned Ollama release — `latest` is convenient but the asset-name
# scheme has drifted across versions.
$OllamaTag = 'v0.3.14'

function Info  { param($m) Write-Host "[INFO]  $m" -ForegroundColor Blue }
function Ok    { param($m) Write-Host "[OK]    $m" -ForegroundColor Green }
function Warn  { param($m) Write-Host "[WARN]  $m" -ForegroundColor Yellow }
function Fail  { param($m) Write-Host "[FAIL]  $m" -ForegroundColor Red; exit 1 }

function Have  { param($cmd) [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

# ── Mode resolution ─────────────────────────────────────────────────
if (-not $Mode -and $env:YLJ_INSTALL_MODE) {
    if ($env:YLJ_INSTALL_MODE -in @('system','user')) { $Mode = $env:YLJ_INSTALL_MODE }
    else { Fail "YLJ_INSTALL_MODE must be 'system' or 'user' (got: $($env:YLJ_INSTALL_MODE))" }
}
if (-not $Mode -and (Test-Path $ModeMarkerFile)) {
    $prev = (Get-Content $ModeMarkerFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
    if ($prev -in @('system','user')) {
        $Mode = $prev
        Info "Reusing install mode '$Mode' from $ModeMarkerFile"
    }
}
if (-not $Mode) {
    $haveConsole = $false
    try { $haveConsole = [Environment]::UserInteractive -and -not [Console]::IsInputRedirected } catch { $haveConsole = $false }
    if ($haveConsole) {
        Write-Host ""
        Write-Host "Can YourLocalJared use admin rights for this install?" -ForegroundColor White
        Write-Host ""
        Write-Host "  1) Yes — use winget (faster, updates via package manager)"
        Write-Host "  2) No — install everything to your user profile (no UAC)"
        Write-Host "  3) I'm not sure"
        Write-Host ""
        $choice = Read-Host "[1/2/3, default 3]"
        switch ($choice) {
            '1'   { $Mode = 'system' }
            'y'   { $Mode = 'system' }
            'yes' { $Mode = 'system' }
            '2'   { $Mode = 'user' }
            'n'   { $Mode = 'user' }
            'no'  { $Mode = 'user' }
            default { $Mode = 'user' }
        }
    } else {
        $Mode = 'user'
        Info "No interactive console; defaulting to -Mode user."
    }
}

Info "Install mode: $Mode"
Info "OS: $([System.Environment]::OSVersion.VersionString)"

# ── Shared: ensure Python 3.10+ is available ────────────────────────
function Resolve-PythonCmd {
    foreach ($cand in 'py -3.13','py -3.12','py -3.11','py -3.10','python','python3') {
        $parts = $cand -split ' '
        $exe = $parts[0]
        if (-not (Have $exe)) { continue }
        try {
            $v = & $exe @($parts[1..($parts.Length-1)]) -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>$null
            if ($LASTEXITCODE -eq 0 -and $v) {
                $parts2 = $v.Trim() -split '\.'
                if ([int]$parts2[0] -gt 3 -or ([int]$parts2[0] -eq 3 -and [int]$parts2[1] -ge 10)) {
                    return $cand
                }
            }
        } catch { continue }
    }
    return $null
}

# ── SYSTEM path (current behavior) ──────────────────────────────────
function Winget-Install {
    param([string]$Id, [string]$Label)
    $null = winget list --id $Id --exact --accept-source-agreements 2>$null
    if ($LASTEXITCODE -eq 0) { Ok "$Label already installed"; return }
    Info "Installing $Label via winget (may prompt for UAC)…"
    winget install --id $Id --exact --silent `
        --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        Fail "winget install $Id failed (exit $LASTEXITCODE). Re-run with -Mode user to avoid UAC."
    }
    Ok "$Label installed"
}

function Setup-System {
    if (-not (Have winget)) {
        Fail @"
winget not found. On Windows 10 21H1+ and Windows 11 it's pre-installed as
'App Installer'. On older builds: install it from the Microsoft Store:
  https://apps.microsoft.com/detail/9nblggh4nns1
Then re-run this bootstrap, or re-run with -Mode user.
"@
    }
    Ok "winget available ($((winget --version) -replace '\s',''))"
    Winget-Install 'Git.Git'             'Git'
    Winget-Install 'Python.Python.3.12'  'Python 3.12'
    Winget-Install 'Ollama.Ollama'       'Ollama'
    Refresh-Path
}

# ── USER path (no admin) ────────────────────────────────────────────
function Install-Ollama-User {
    $ollamaExe = Join-Path $UserBin 'ollama.exe'
    if (Test-Path $ollamaExe) { Ok "ollama already installed at $ollamaExe"; return }
    New-Item -ItemType Directory -Path $UserBin -Force | Out-Null
    $url = "https://github.com/ollama/ollama/releases/download/$OllamaTag/ollama-windows-amd64.zip"
    Info "Downloading Ollama $OllamaTag (windows-amd64, user-local)…"
    $tmp = Join-Path $env:TEMP ("ylj-ollama-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    try {
        $zip = Join-Path $tmp 'ollama.zip'
        try {
            Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
        } catch {
            Fail "Could not download Ollama from $url — check your network and retry.`n$_"
        }
        Expand-Archive -Path $zip -DestinationPath $tmp -Force
        $extractedBin = Get-ChildItem -Path $tmp -Filter 'ollama.exe' -Recurse -File | Select-Object -First 1
        if (-not $extractedBin) { Fail "Could not find ollama.exe inside the downloaded zip." }
        Copy-Item -Path $extractedBin.FullName -Destination $ollamaExe -Force
        # Some Ollama releases ship DLL sidecars next to ollama.exe; copy
        # the whole directory so the daemon can find its runner libraries.
        $sourceDir = Split-Path -Parent $extractedBin.FullName
        Get-ChildItem -Path $sourceDir -File | Where-Object { $_.Name -ne 'ollama.exe' } | ForEach-Object {
            Copy-Item -Path $_.FullName -Destination (Join-Path $UserBin $_.Name) -Force
        }
    } finally {
        Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
    Ok "Installed ollama at $ollamaExe"
}

function Ollama-Running {
    try {
        $null = Invoke-WebRequest -Uri 'http://localhost:11434/api/version' `
            -TimeoutSec 2 -UseBasicParsing
        return $true
    } catch { return $false }
}

function Setup-User {
    # Python must already be present — bootstrapping Python itself without
    # admin is a bigger follow-up (python-build-standalone). 99% of dev
    # Windows installs already have Python via python.org or the MS Store.
    $pyCmd = Resolve-PythonCmd
    if (-not $pyCmd) {
        Fail @"
Python 3.10+ not found on PATH. Install it without admin via:
  • https://www.python.org/downloads/  (choose "Install just for me")
  • or via the Microsoft Store (search "Python 3.12")
Then re-run this bootstrap.
"@
    }
    Ok "Using Python: $pyCmd"
    $script:YljPythonCmd = $pyCmd

    if (Have git) { Ok "git available: $((git --version).Trim())" }
    else { Warn "git not found — will fetch the repo as a zip instead." }

    Install-Ollama-User

    if (-not (Ollama-Running)) {
        Info "Starting Ollama daemon in the background…"
        Start-Process -FilePath (Join-Path $UserBin 'ollama.exe') `
            -ArgumentList 'serve' -WindowStyle Hidden | Out-Null
        $tries = 0
        while (-not (Ollama-Running) -and $tries -lt 10) { Start-Sleep -Seconds 1; $tries++ }
        if (Ollama-Running) { Ok "Ollama daemon started" }
        else { Warn "Ollama didn't come up within 10s — 'install.py' will report status." }
    }
}

# ── Dispatch ────────────────────────────────────────────────────────
if ($Mode -eq 'system')    { Setup-System }
elseif ($Mode -eq 'user')  { Setup-User }

# ── Persist the chosen mode so the next run skips the prompt ────────
New-Item -ItemType Directory -Path $ModeMarkerDir -Force | Out-Null
$Mode | Out-File -FilePath $ModeMarkerFile -Encoding ASCII -Force

# ── Shared: resolve python after system path installed it ───────────
if ($Mode -eq 'system') {
    $python = (Get-Command python -ErrorAction SilentlyContinue).Source
    if (-not $python) { $python = (Get-Command py -ErrorAction SilentlyContinue).Source }
    if (-not $python) { Fail "python not found on PATH even after install. Open a new PowerShell and retry." }
    Ok "Using Python: $python"
    $script:YljPythonCmd = $python
    if (-not (Have git)) {
        Fail "git not found on PATH even after install. Open a new PowerShell and retry."
    }
    # Kick ollama if it's already installed but not running.
    if (-not (Ollama-Running)) {
        Info "Starting Ollama…"
        Start-Process -FilePath 'ollama' -ArgumentList 'serve' -WindowStyle Hidden | Out-Null
        $tries = 0
        while (-not (Ollama-Running) -and $tries -lt 10) { Start-Sleep -Seconds 1; $tries++ }
        if (Ollama-Running) { Ok "Ollama daemon started" }
        else                { Warn "Ollama didn't come up within 10s — continuing." }
    }
}

# ── Clone (or reuse, or zip-fetch) the repo ─────────────────────────
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$inRepo = (Test-Path (Join-Path $scriptDir 'pyproject.toml')) -and (Test-Path (Join-Path $scriptDir 'ylj'))

function Fetch-RepoZip {
    Info "Downloading repo zip (git not available)…"
    $parent = Split-Path $InstallDir -Parent
    if ($parent -and -not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $tmp = Join-Path $env:TEMP ("ylj-repo-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    try {
        $zip = Join-Path $tmp 'repo.zip'
        Invoke-WebRequest -Uri $RepoTarballUrl -OutFile $zip -UseBasicParsing
        Expand-Archive -Path $zip -DestinationPath $tmp -Force
        # GitHub zips extract into `YourLocalJared-main`.
        $extracted = Get-ChildItem -Path $tmp -Directory | Where-Object { $_.Name -like 'YourLocalJared-*' } | Select-Object -First 1
        if (-not $extracted) { Fail "Unexpected zip layout." }
        if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
        Move-Item -Path $extracted.FullName -Destination $InstallDir -Force
    } finally {
        Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
    Ok "Fetched repo zip to $InstallDir"
}

if ($inRepo) {
    $RepoDir = $scriptDir
    Ok "Running from inside the cloned repo at $RepoDir — skipping fetch"
} elseif (Test-Path (Join-Path $InstallDir '.git')) {
    if (Have git) {
        Info "Repo already cloned at $InstallDir — fetching latest main…"
        git -C "$InstallDir" fetch origin main --quiet
        git -C "$InstallDir" checkout main --quiet
        try { git -C "$InstallDir" pull --ff-only origin main --quiet } catch { Warn "git pull reported no fast-forward" }
    } else {
        Warn "Existing .git checkout but no git binary — leaving repo unchanged."
    }
    $RepoDir = $InstallDir
    Ok "Using existing clone at $RepoDir"
} elseif (Have git) {
    Info "Cloning $RepoUrl into $InstallDir…"
    $parent = Split-Path $InstallDir -Parent
    if ($parent -and -not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    git clone --depth=1 $RepoUrl "$InstallDir"
    $RepoDir = $InstallDir
    Ok "Cloned to $RepoDir"
} else {
    Fetch-RepoZip
    $RepoDir = $InstallDir
}

# ── Hand off to install.py ──────────────────────────────────────────
$installArgs = @('install.py', '--mode', $Mode)
if ($Mode -eq 'user') {
    $installArgs += @('--ollama-bin', (Join-Path $UserBin 'ollama.exe'))
}

Info "Running project setup: $($script:YljPythonCmd) $($installArgs -join ' ')  (in $RepoDir)"
Set-Location $RepoDir
# `py -3.12` style invocation needs splitting; the bare `python` case is fine either way.
$pyParts = $script:YljPythonCmd -split ' '
$pyExe   = $pyParts[0]
$pyRest  = @()
if ($pyParts.Length -gt 1) { $pyRest = $pyParts[1..($pyParts.Length-1)] }
& $pyExe @pyRest @installArgs
exit $LASTEXITCODE
