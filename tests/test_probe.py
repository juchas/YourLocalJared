"""Smoke tests for the hardware probe endpoint."""

from ylj.probe import probe, recommend_model


def test_probe_shape():
    result = probe()

    assert set(result.keys()) >= {
        "os", "chip", "cpu", "python", "ram", "disk", "gpu",
        "cuda_available", "mps_available", "recommended_model",
    }

    assert result["recommended_model"] in {"gemma4:e2b", "gemma4:e4b"}

    assert isinstance(result["chip"], str) and result["chip"]

    assert result["cpu"]["cores_logical"] >= 1
    assert result["cpu"]["cores_physical"] >= 0

    assert result["python"]["installed"] is True
    assert result["python"]["version"].count(".") >= 1
    assert "executable" not in result["python"]

    assert result["ram"]["total_gb"] > 0
    assert result["ram"]["available_gb"] >= 0

    assert result["disk"]["total_gb"] > 0
    assert result["disk"]["free_gb"] >= 0
    assert "path" not in result["disk"]

    assert isinstance(result["cuda_available"], bool)
    assert isinstance(result["mps_available"], bool)
    assert result["gpu"]["backend"] in {"cuda", "mps", "cpu"}

    assert result["os"]["system"]
    assert result["os"]["machine"]


def test_recommend_model_uses_ui_breakpoints():
    assert recommend_model(11.9) == "gemma4:e2b"  # limited
    assert recommend_model(12.0) == "gemma4:e4b"  # modest
    assert recommend_model(24.0) == "gemma4:e4b"  # capable
    assert recommend_model(48.0) == "gemma4:e4b"  # high
