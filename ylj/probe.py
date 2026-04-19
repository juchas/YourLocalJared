"""Hardware / environment probe used by the onboarding wizard.

Kept in its own module, with torch imported lazily inside detect_gpu(),
so `import ylj.probe` stays cheap and can be unit-tested without loading
the full RAG stack.
"""

from __future__ import annotations

import platform
import shutil
import subprocess
from pathlib import Path

import psutil


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


def detect_gpu() -> tuple[dict, bool, bool]:
    """Return (gpu_info, cuda_available, mps_available).

    Torch is imported lazily so `import ylj.probe` stays cheap.
    """
    import torch

    cuda = torch.cuda.is_available()
    mps = torch.backends.mps.is_available()

    if cuda:
        try:
            name = torch.cuda.get_device_name(0)
        except Exception:
            name = "cuda device"
        return {"name": name, "backend": "cuda"}, cuda, mps
    if mps:
        return {"name": "Apple GPU (Metal)", "backend": "mps"}, cuda, mps
    return {"name": "none", "backend": "cpu"}, cuda, mps


def recommend_model(ram_total_gb: float, has_accelerator: bool) -> str:
    """Pick a sensible default LLM from the hardware tier.

    Mirrors the tier buckets rendered in screens-hardware.jsx so the
    backend default and the UI's suggested chip can't disagree.
    """
    if ram_total_gb < 12:
        return "phi3.5:mini"
    if ram_total_gb < 24 and not has_accelerator:
        return "phi3.5:mini"
    return "qwen2.5:7b"


def probe(disk_path: str | Path | None = None) -> dict:
    """Detailed hardware probe for the onboarding wizard.

    `disk_path` is used for the free-space check; it is never returned.
    `python.executable` and `disk.path` are intentionally omitted so the
    endpoint can't leak host filesystem layout over a LAN bind.
    """
    vm = psutil.virtual_memory()
    path = Path(disk_path) if disk_path else Path(__file__).parent.parent
    disk = shutil.disk_usage(str(path))
    gpu_info, cuda_available, mps_available = detect_gpu()
    ram_total_gb = round(vm.total / (1024**3), 1)

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
        },
        "ram": {
            "total_gb": ram_total_gb,
            "available_gb": round(vm.available / (1024**3), 1),
        },
        "disk": {
            "free_gb": round(disk.free / (1024**3), 1),
            "total_gb": round(disk.total / (1024**3), 1),
        },
        "gpu": gpu_info,
        "cuda_available": cuda_available,
        "mps_available": mps_available,
        "recommended_model": recommend_model(ram_total_gb, cuda_available or mps_available),
    }
