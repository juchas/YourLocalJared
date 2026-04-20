@echo off
REM Thin shim so `install.bat` from a cloned repo root Just Works on Windows.
REM The real bootstrap logic lives in bootstrap.ps1 at the repo root.
REM -ExecutionPolicy Bypass applies to this single invocation only — no system-wide change.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap.ps1" %*
