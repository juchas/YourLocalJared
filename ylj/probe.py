"""Hardware / environment probe used by the onboarding wizard.

Kept in its own module (no heavy imports) so it can be unit-tested
without loading the full RAG stack.
"""

from __future__ import annotations

import platform
import shutil
import subprocess
import sys
from pathlib import Path

import psutil
import torch


def detect_chip() -> str:
    """Best-effort CPU model name across macOS / Linux / Windows."""
    system = platform.system()
    if system == "Darwin":
        try:
            out = subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True, text=True, timeout=2,
            )
            name = out.stdout.strip()
            if name:
                return name
        except (subprocess.SubprocessError, FileNotFoundError, OSError):
            pass
    elif system == "Linux":
        try:
            for line in Path("/proc/cpuinfo").read_text().splitlines():
                if line.lower().startswith("model name"):
                    return line.split(":", 1)[1].strip()
        except OSError:
            pass
    return platform.processor() or platform.machine() or "unknown"


def detect_gpu() -> dict:
    """Return GPU info with a backend tag of cuda/mps/cpu."""
    if torch.cuda.is_available():
        try:
            name = torch.cuda.get_device_name(0)
        except Exception:
            name = "cuda device"
        return {"name": name, "backend": "cuda"}
    if torch.backends.mps.is_available():
        return {"name": "Apple GPU (Metal)", "backend": "mps"}
    return {"name": "none", "backend": "cpu"}


def probe(disk_path: str | Path | None = None) -> dict:
    """Detailed hardware probe for the onboarding wizard."""
    vm = psutil.virtual_memory()
    path = Path(disk_path) if disk_path else Path(__file__).parent.parent
    disk = shutil.disk_usage(str(path))

    return {
        "os": {
            "system": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "machine": platform.machine(),
            "pretty": f"{platform.system()} {platform.release()}",
        },
        "chip": detect_chip(),
        "cpu": {
            "cores_physical": psutil.cpu_count(logical=False) or 0,
            "cores_logical": psutil.cpu_count(logical=True) or 0,
        },
        "python": {
            "installed": True,
            "version": platform.python_version(),
            "executable": sys.executable,
        },
        "ram": {
            "total_gb": round(vm.total / (1024**3), 1),
            "available_gb": round(vm.available / (1024**3), 1),
        },
        "disk": {
            "free_gb": round(disk.free / (1024**3), 1),
            "total_gb": round(disk.total / (1024**3), 1),
            "path": str(path),
        },
        "gpu": detect_gpu(),
        "cuda_available": torch.cuda.is_available(),
        "mps_available": torch.backends.mps.is_available(),
    }
