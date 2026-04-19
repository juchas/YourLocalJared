"""Smoke tests for the hardware probe endpoint."""

from ylj.probe import probe


def test_probe_shape():
    result = probe()

    assert set(result.keys()) >= {
        "os", "chip", "cpu", "python", "ram", "disk", "gpu",
        "cuda_available", "mps_available",
    }

    assert isinstance(result["chip"], str) and result["chip"]

    assert result["cpu"]["cores_logical"] >= 1
    assert result["cpu"]["cores_physical"] >= 0

    assert result["python"]["installed"] is True
    assert result["python"]["version"].count(".") >= 1
    assert result["python"]["executable"]

    assert result["ram"]["total_gb"] > 0
    assert result["ram"]["available_gb"] >= 0

    assert result["disk"]["total_gb"] > 0
    assert result["disk"]["free_gb"] >= 0

    assert isinstance(result["cuda_available"], bool)
    assert isinstance(result["mps_available"], bool)
    assert result["gpu"]["backend"] in {"cuda", "mps", "cpu"}

    assert result["os"]["system"]
    assert result["os"]["machine"]
