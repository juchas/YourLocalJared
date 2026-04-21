# YourLocalJared — PowerShell bootstrap for Windows.
#
# One-paste install from a clean Windows 11 VM:
#
#   iex (irm https://raw.githubusercontent.com/juchas/YourLocalJared/main/bootstrap.ps1)
#
# At the top we ask whether you can grant admin rights. Admin is
# recommended for the best experience; the no-admin path still works.
#
#   1) Yes — use winget (recommended)
#   2) No — install everything to your user profile (no UAC needed)
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
    [ValidateSet('system','user','')] [string] $Mode = '',
    # Skip the disclaimer and the countdown. Intended for CI / automation
    # only — the interactive install always shows the disclaimer.
    [switch] $Yes
)

$ErrorActionPreference = 'Stop'

$RepoUrl         = 'https://github.com/juchas/YourLocalJared'
$RepoTarballUrl  = "$RepoUrl/archive/refs/heads/main.zip"
if (-not $env:YLJ_INSTALL_DIR) { $InstallDir = Join-Path $env:USERPROFILE 'YourLocalJared' }
else                           { $InstallDir = $env:YLJ_INSTALL_DIR }

# Per-user install prefix for no-admin mode. Mirrors the fallback path
# that `ylj/server.py::_resolve_ollama` looks in, so the server finds
# our ollama even without a PATH reshuffle.
$UserPrefix    = Join-Path $env:LOCALAPPDATA 'YourLocalJared'
$UserBin       = Join-Path $UserPrefix 'bin'
$UserPythonDir = Join-Path $UserPrefix 'python'

$ModeMarkerDir  = Join-Path $env:USERPROFILE '.YourLocalJared'
$ModeMarkerFile = Join-Path $ModeMarkerDir 'install-mode'

# Pinned Ollama release — `latest` is convenient but the asset-name
# scheme has drifted across versions.
$OllamaTag = 'v0.3.14'

# Pinned python-build-standalone release. Bump by updating both values.
# See https://github.com/astral-sh/python-build-standalone/releases
$PbsDate    = '20241016'
$PbsVersion = '3.12.7'

function Info  { param($m) Write-Host "[INFO]  $m" -ForegroundColor Blue }
function Ok    { param($m) Write-Host "[OK]    $m" -ForegroundColor Green }
function Warn  { param($m) Write-Host "[WARN]  $m" -ForegroundColor Yellow }
function Fail  { param($m) Write-Host "[FAIL]  $m" -ForegroundColor Red; exit 1 }

function Have  { param($cmd) [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# ── SHA256 verification helpers ─────────────────────────────────────
# Hash every downloaded binary against the checksum the upstream
# release published. Mismatch aborts the install — we will not
# silently run an unexpected binary.
function Assert-Sha256 {
    param(
        [Parameter(Mandatory)] [string] $Path,
        [Parameter(Mandatory)] [string] $Expected
    )
    if (-not $Expected) {
        Fail "Missing expected SHA256 for $Path — refusing to run unverified binary."
    }
    $actual = (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToLower()
    $exp = $Expected.ToLower()
    if ($actual -ne $exp) {
        Fail @"
SHA256 mismatch for $Path:
  expected: $exp
  actual:   $actual
Aborting install — the download may be corrupted or tampered with.
"@
    }
    Ok "Verified SHA256 of $(Split-Path -Leaf $Path)"
}

# Look up the expected SHA256 of a specific Ollama release asset from
# the release's sha256sums.txt. Returns the hex digest or fails.
function Get-OllamaExpectedSha256 {
    param([Parameter(Mandatory)] [string] $Asset)
    $sumsUrl = "https://github.com/ollama/ollama/releases/download/$OllamaTag/sha256sums.txt"
    try {
        $resp = Invoke-WebRequest -Uri $sumsUrl -UseBasicParsing
    } catch {
        Fail "Could not fetch Ollama checksums from $sumsUrl — refusing to run unverified binary.`n$_"
    }
    foreach ($line in ($resp.Content -split "`n")) {
        $parts = $line.Trim() -split '\s+', 2
        if ($parts.Count -eq 2) {
            $file = ($parts[1] -replace '^\./', '')
            if ($file -eq $Asset) { return $parts[0].ToLower() }
        }
    }
    Fail "Could not find $Asset in $sumsUrl — refusing to run unverified binary."
}

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

# ── Disclaimer ──────────────────────────────────────────────────────
# Every interactive run shows the disclaimer; we deliberately don't
# persist an "accepted" marker so users re-consent on every install.
# The countdown exists so "spam Enter to dismiss" isn't a viable way
# to skip reading — Accept/Decline only unlock after $ReadDelay seconds.
$ReadDelay = 8

function Show-DisclaimerAndRequireAccept {
    $skip = $Yes.IsPresent -or $env:YLJ_SKIP_DISCLAIMER
    if ($skip) {
        Info "Disclaimer skipped (-Yes / YLJ_SKIP_DISCLAIMER set)."
        return
    }
    $haveConsole = $false
    try { $haveConsole = [Environment]::UserInteractive -and -not [Console]::IsInputRedirected } catch { $haveConsole = $false }
    if (-not $haveConsole) {
        Info "No interactive console; skipping disclaimer. Re-run interactively to review it."
        return
    }

    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor White
    Write-Host "  YourLocalJared — please read before continuing" -ForegroundColor White
    Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor White
    Write-Host ""
    Write-Host "  This installer will:"
    Write-Host ""
    Write-Host "    1. Install git, Python 3.12, and Ollama — via winget (with admin)"
    Write-Host "       or into %LOCALAPPDATA%\YourLocalJared\ (without admin)."
    Write-Host "    2. Clone YourLocalJared to $InstallDir."
    Write-Host "    3. Create a Python venv, install project dependencies, and"
    Write-Host "       pre-download a ~140 MB embedding model from Hugging Face."
    Write-Host "    4. Pull a local LLM via Ollama (~2–15 GB depending on which"
    Write-Host "       one you pick in the onboarding wizard)."
    Write-Host "    5. Start a server at http://localhost:8000. You choose which"
    Write-Host "       folders on this machine the tool will index. Those files"
    Write-Host "       are chunked, embedded, and stored in .\qdrant_data\ next"
    Write-Host "       to the repo."
    Write-Host ""
    Write-Host "  Nothing you index, query, or say in chat leaves this machine." -ForegroundColor White
    Write-Host "  All inference runs against your local Ollama daemon."
    Write-Host ""
    Write-Host "  Typical disk usage: 10–15 GB including the model and index."
    Write-Host ""
    Write-Host "  To uninstall later, delete:"
    Write-Host "    • $InstallDir   (repo + venv + qdrant_data)"
    Write-Host "    • $UserPrefix   (user-mode Ollama + Python, if you picked no-admin)"
    Write-Host "    • %USERPROFILE%\.ollama\models\   (pulled models — shared across tools)"
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor White
    Write-Host ""

    for ($i = $ReadDelay; $i -ge 1; $i--) {
        Write-Host -NoNewline "`r  ⏳  $i s until Accept/Decline unlocks…  "
        Start-Sleep -Seconds 1
    }
    Write-Host -NoNewline ("`r" + (' ' * 60) + "`r")

    while ($true) {
        $reply = Read-Host "  [A] Accept and continue    [D] Decline and exit"
        switch -Regex ($reply) {
            '^(a|y|accept|yes)$' { Ok "Accepted — continuing."; return }
            '^(d|n|decline|no|)$' {
                Info "Declined — no changes made. Exiting."
                exit 0
            }
            default { Write-Host "  Please type 'a' to accept or 'd' to decline." }
        }
    }
}

Show-DisclaimerAndRequireAccept

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
        Write-Host "Admin is recommended for the best experience — faster install, updates via"
        Write-Host "the package manager. The no-admin path still installs everything you need."
        Write-Host ""
        Write-Host "  1) Yes — use winget (recommended)"
        Write-Host "  2) No — install everything to your user profile (no UAC needed)"
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
    $asset = 'ollama-windows-amd64.zip'
    $url = "https://github.com/ollama/ollama/releases/download/$OllamaTag/$asset"
    $expected = Get-OllamaExpectedSha256 -Asset $asset
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
        Assert-Sha256 -Path $zip -Expected $expected
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

function Install-Portable-Python-User {
    # Download a portable CPython via python-build-standalone when the
    # machine doesn't have a usable system Python. Idempotent — existing
    # extracted tree short-circuits the download.
    $portablePy = Join-Path $UserPythonDir 'python.exe'
    if (Test-Path $portablePy) {
        Ok "Portable Python already installed at $portablePy"
        return $portablePy
    }
    # python-build-standalone ships Windows as x86_64 and aarch64 now.
    $arch = $env:PROCESSOR_ARCHITECTURE
    $pbsPlatform = switch ($arch) {
        'AMD64' { 'x86_64-pc-windows-msvc' }
        'ARM64' { 'aarch64-pc-windows-msvc' }
        default { Fail "No portable Python build for Windows $arch. Install Python 3.10+ manually and re-run." }
    }
    $url = "https://github.com/astral-sh/python-build-standalone/releases/download/$PbsDate/cpython-$PbsVersion+$PbsDate-$pbsPlatform-install_only.tar.gz"
    # python-build-standalone publishes a ".sha256" sidecar per asset,
    # formatted as "<hash>  <filename>" — same shape as sha256sum output.
    $shaUrl = "$url.sha256"
    try {
        $shaResp = Invoke-WebRequest -Uri $shaUrl -UseBasicParsing
    } catch {
        Fail "Could not fetch Python checksum from $shaUrl — refusing to run unverified binary.`n$_"
    }
    $expected = ($shaResp.Content.Trim() -split '\s+')[0].ToLower()
    Info "Downloading portable Python $PbsVersion ($pbsPlatform)…"
    New-Item -ItemType Directory -Path $UserPrefix -Force | Out-Null
    $tmp = Join-Path $env:TEMP ("ylj-python-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    try {
        $tarball = Join-Path $tmp 'python.tgz'
        try {
            Invoke-WebRequest -Uri $url -OutFile $tarball -UseBasicParsing
        } catch {
            Fail "Could not download portable Python from $url — check your network and retry.`n$_"
        }
        Assert-Sha256 -Path $tarball -Expected $expected
        # Windows 10 1803+ ships tar.exe; extract the .tar.gz into $UserPrefix.
        # The archive's top-level is `python/`, so we land at $UserPrefix\python\.
        if (-not (Have tar)) {
            Fail "tar.exe not found on PATH. Windows 10 1803+ ships it by default; on older systems install Python 3.10+ manually and re-run with an existing Python."
        }
        & tar.exe -xzf $tarball -C $UserPrefix
        if ($LASTEXITCODE -ne 0) { Fail "tar failed to extract portable Python (exit $LASTEXITCODE)." }
    } finally {
        Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (-not (Test-Path $portablePy)) {
        Fail "Portable Python extraction did not produce $portablePy"
    }
    # Sanity check — must report >= 3.10 before we hand off to install.py.
    & $portablePy -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'
    if ($LASTEXITCODE -ne 0) {
        Fail "Extracted Python at $portablePy doesn't report >= 3.10 — bailing out."
    }
    $ver = & $portablePy --version 2>&1
    Ok "Portable Python ready at $portablePy ($ver)"
    return $portablePy
}

function Setup-User {
    # Prefer an existing system Python (fast path). If none meets the
    # version floor, download a portable build — that's the whole point
    # of the no-admin path on clean machines.
    $pyCmd = Resolve-PythonCmd
    if ($pyCmd) {
        Ok "Using system Python: $pyCmd"
    } else {
        Info "Python 3.10+ not found on PATH — installing portable Python into $UserPythonDir…"
        $pyCmd = Install-Portable-Python-User
    }
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
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# ── Launch the server ──────────────────────────────────────────────
# install.py created / reused a venv at $RepoDir\.venv. Run the server
# under that venv's Python so the current PowerShell session becomes
# the server host — Ctrl-C here stops it. Re-runs (repo already set
# up) take this same path so the bootstrap always ends with a running
# server.
$VenvPy = Join-Path $RepoDir '.venv\Scripts\python.exe'
if (-not (Test-Path $VenvPy)) {
    Fail "Venv Python not found at $VenvPy — install.py did not finish cleanly."
}

Write-Host ""
Ok "Install complete — launching YourLocalJared."
Info "Open http://localhost:8000/setup in your browser (first-time onboarding)."
Info "Ctrl-C here will stop the server."
Write-Host ""
& $VenvPy start.py
exit $LASTEXITCODE
